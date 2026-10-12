import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';
import {
  bridgeRequestConfig,
  bridgeUrl,
  isTimeoutError,
  REQUEST_TIMEOUTS_MS,
} from '../services/pinboardApi';
import { bumpTagCache, diffTagLists, isEmptyDelta } from '../utils/tagCache';
import { recordSavedTags } from './tagSlice';
import type { AuthState } from './authSlice';

export type BookmarkFormData = {
  title: string;
  url: string;
  description: string;
  tags: string[];
  private: boolean;
  toread: boolean;
};

type BookmarkErrors = {
  url: string | null;
  title: string | null;
  description: string | null;
  generic: string | null;
};

export type BookmarkState = {
  formData: BookmarkFormData;
  status: 'idle' | 'saving' | 'success' | 'error';
  data: PinboardAddResponse | null;
  errors: BookmarkErrors;
  lastFetchRequestId: string | null;
  lastFetchTargetUrl: string | null;
  initialLoading: boolean;
  existingBookmarkTime: string | null;
  hasExistingBookmark: boolean;
  displayOriginalTimestamp: boolean;
  /** Tags the bookmark had on Pinboard when it was loaded; [] if new. */
  existingBookmarkTags: string[];
  /**
   * Set when tracking parameters were stripped from the URL, so the form can
   * say what went and offer to put it back. Cleared once the user edits the
   * URL by hand.
   */
  trackingStrip: TrackingStrip | null;
};

export type TrackingStrip = {
  original: string;
  stripped: string;
  removed: string[];
  /** True while the original URL is in the form. */
  restored: boolean;
  /** Whether the original URL has been looked up on Pinboard yet. */
  checkedOriginal: boolean;
  /** True while checkTrackedBookmark is waiting on Pinboard. */
  checkingOriginal: boolean;
  /** True when that lookup found a bookmark saved under the original URL. */
  savedWithTracking: boolean;
  /**
   * The form's other fields as the bookmarklet filled them in. Toggling away
   * from a URL whose saved bookmark is loaded goes back to these, so that
   * bookmark's title, notes and tags don't become a second bookmark under
   * the other URL.
   */
  pageFields: Omit<BookmarkFormData, 'url'>;
};

type BookmarkThunkState = {
  auth: AuthState;
  bookmark: BookmarkState;
};

type PinboardAddResponse = {
  result_code: string;
  [key: string]: unknown;
};

type PinboardPost = {
  href?: string;
  description?: string;
  extended?: string;
  tags?: string | string[];
  shared?: 'yes' | 'no';
  toread?: 'yes' | 'no';
  time?: string;
  dt?: string;
};

type SubmitRejectValue = {
  validationErrors?: BookmarkErrors;
  apiError?: string;
  urlTooLongError?: boolean;
  genericError?: string;
};

const DESCRIPTION_CHAR_LIMIT = 65535;
const BOOKMARK_ERROR_KEYS = ['url', 'title', 'description', 'generic'] as const;
type BookmarkErrorKey = (typeof BOOKMARK_ERROR_KEYS)[number];
const isBookmarkErrorKey = (value: string): value is BookmarkErrorKey =>
  (BOOKMARK_ERROR_KEYS as readonly string[]).includes(value);

type ErrorWithStatus = {
  response?: {
    status?: number;
  };
};

const hasHttpStatus = (error: unknown, statusCode: number): boolean => {
  if (axios.isAxiosError(error)) {
    return error.response?.status === statusCode;
  }
  if (typeof error === 'object' && error && 'response' in error) {
    const resp = (error as ErrorWithStatus).response;
    return resp?.status === statusCode;
  }
  return false;
};

const isUrlTooLongError = (error: unknown): boolean => {
  if (hasHttpStatus(error, 414)) return true;
  const message =
    (axios.isAxiosError(error)
      ? error.message
      : error instanceof Error
      ? error.message
      : '') || '';
  const normalized = message.toLowerCase();
  return (
    normalized.includes('status code 414') ||
    normalized.includes('uri too long')
  );
};

const toTagArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value
      .split(' ')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
};

// Define specific error messages
const ERROR_MESSAGES: Record<string, string> = {
  MISSING_URL: 'URL is required.',
  MISSING_TITLE: 'Title is required.',
  URL_TOO_LONG: 'URL is too long.',
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.',
  LOOKUP_TIMEOUT:
    'Pinboard didn’t respond in time, so we couldn’t check for an existing bookmark. You can still save.',
  SAVE_TIMEOUT: 'Pinboard didn’t respond in time. Please try saving again.',
  // Add more specific API error codes if needed, e.g.:
  // 'item already exists': 'This bookmark already exists.'
};

// Async thunk to submit bookmark via Pinboard API
export const submitBookmark = createAsyncThunk<
  PinboardAddResponse,
  void,
  { state: BookmarkThunkState; rejectValue: SubmitRejectValue }
>('bookmark/submit', async (_, { getState, dispatch, rejectWithValue }) => {
  const {
    auth: { user, token },
    bookmark: { formData, existingBookmarkTags },
  } = getState();

  // --- Client-side validation ---
  const errors: BookmarkErrors = {
    url: null,
    title: null,
    description: null,
    generic: null,
  };
  let hasError = false;
  if (!formData.url) {
    errors.url = ERROR_MESSAGES.MISSING_URL;
    hasError = true;
  }
  if (!formData.title) {
    errors.title = ERROR_MESSAGES.MISSING_TITLE;
    hasError = true;
  }
  if (
    formData.description &&
    formData.description.length > DESCRIPTION_CHAR_LIMIT
  ) {
    errors.description = `Description must be under ${DESCRIPTION_CHAR_LIMIT.toLocaleString()} characters.`;
    hasError = true;
  }

  if (hasError) {
    // Reject immediately with the validation errors object
    return rejectWithValue({ validationErrors: errors });
  }
  // --- End client-side validation ---

  const params = new URLSearchParams();
  params.append('format', 'json');
  params.append('url', formData.url);
  params.append('description', formData.title);
  params.append('extended', formData.description);
  if (formData.private) params.append('shared', 'no');
  if (formData.toread) params.append('toread', 'yes');
  params.append('tags', (formData.tags || []).join(' '));

  try {
    const response = await axios.get(
      bridgeUrl(`/v1/posts/add?${params.toString()}`),
      bridgeRequestConfig(user, token, REQUEST_TIMEOUTS_MS.save)
    );
    if (response.data.result_code === 'done') {
      // Fold the change in tags into the local tag counts so the next
      // popup's autocomplete already reflects it without refetching
      // /tags/get. Only the delta counts: re-saving an existing bookmark
      // with the same tags must not inflate them, and a tag removed from
      // its last bookmark must drop out.
      const delta = diffTagLists(existingBookmarkTags || [], formData.tags || []);
      if (!isEmptyDelta(delta)) {
        dispatch(recordSavedTags(delta));
        bumpTagCache(user, delta);
      }
      return response.data;
    } else {
      // Reject with API error message (e.g., 'item already exists')
      return rejectWithValue({ apiError: response.data.result_code });
    }
  } catch (err) {
    if (isUrlTooLongError(err)) {
      return rejectWithValue({ urlTooLongError: true });
    }
    if (isTimeoutError(err)) {
      return rejectWithValue({ genericError: ERROR_MESSAGES.SAVE_TIMEOUT });
    }
    if (axios.isAxiosError(err)) {
      return rejectWithValue({
        genericError: err.message || ERROR_MESSAGES.GENERIC_ERROR,
      });
    }

    const message =
      err instanceof Error ? err.message : ERROR_MESSAGES.GENERIC_ERROR;
    return rejectWithValue({ genericError: message });
  }
});

const lookupPost = async (
  url: string,
  user: string,
  token: string
): Promise<PinboardPost | null> => {
  // Fetch details: strip fragment and encode URL parameter
  const response = await axios.get(
    bridgeUrl(`/v1/posts/get?format=json&url=${cleanUrl(url)}`),
    bridgeRequestConfig(user, token, REQUEST_TIMEOUTS_MS.lookup)
  );
  if (response.data.posts && response.data.posts.length === 1) {
    return response.data.posts[0];
  }
  return null;
};

// Fetch existing bookmark details if any
export const fetchBookmarkDetails = createAsyncThunk<
  PinboardPost | null,
  string | undefined,
  { state: BookmarkThunkState; rejectValue: string }
>(
  'bookmark/fetchDetails',
  async (overrideUrl, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: {
        formData: { url },
      },
    } = getState();
    const targetUrl = overrideUrl || url;
    if (!user || !token || !targetUrl) return null;
    try {
      return await lookupPost(targetUrl, user, token);
    } catch (err) {
      if (isUrlTooLongError(err)) {
        return rejectWithValue(`${ERROR_MESSAGES.URL_TOO_LONG} (HTTP 414).`);
      }
      if (isTimeoutError(err)) {
        return rejectWithValue(ERROR_MESSAGES.LOOKUP_TIMEOUT);
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load existing bookmark details.';
      return rejectWithValue(message);
    }
  }
);

// Was the URL bookmarked before with the tracking parameters we stripped?
// Best-effort: any failure counts as "no".
export const checkTrackedBookmark = createAsyncThunk<
  boolean,
  void,
  { state: BookmarkThunkState }
>(
  'bookmark/checkTrackedBookmark',
  async (_, { getState }) => {
    const {
      auth: { user, token },
      bookmark: { trackingStrip },
    } = getState();
    if (!user || !token || !trackingStrip) return false;
    try {
      return (await lookupPost(trackingStrip.original, user, token)) !== null;
    } catch {
      return false;
    }
  },
  {
    condition: (_, { getState }) => {
      const strip = getState().bookmark.trackingStrip;
      return !!strip && !strip.checkedOriginal && !strip.checkingOriginal;
    },
  }
);

const initialState: BookmarkState = {
  formData: {
    title: '',
    url: '',
    description: '',
    tags: [],
    private: false,
    toread: false,
  },
  status: 'idle',
  data: null,
  errors: {
    url: null,
    title: null,
    description: null,
    generic: null,
  },
  lastFetchRequestId: null,
  lastFetchTargetUrl: null,
  initialLoading: false,
  existingBookmarkTime: null,
  hasExistingBookmark: false,
  displayOriginalTimestamp: false,
  existingBookmarkTags: [],
  trackingStrip: null,
};

const bookmarkSlice = createSlice({
  name: 'bookmark',
  initialState,
  reducers: {
    setFormData(state, action: PayloadAction<Partial<BookmarkFormData>>) {
      const updates = { ...action.payload };
      if (Object.prototype.hasOwnProperty.call(updates, 'tags')) {
        updates.tags = toTagArray(updates.tags);
      }
      if (
        typeof updates.url === 'string' &&
        updates.url !== state.formData.url
      ) {
        state.trackingStrip = null;
      }
      state.formData = { ...state.formData, ...updates };
      Object.keys(updates).forEach((fieldName) => {
        if (isBookmarkErrorKey(fieldName)) {
          state.errors[fieldName] = null;
        }
      });
    },
    // Put the URL with its tracking parameters stripped into the form,
    // remembering the original so it can be restored.
    applyTrackingStrip(
      state,
      action: PayloadAction<{
        original: string;
        stripped: string;
        removed: string[];
      }>
    ) {
      const { original, stripped, removed } = action.payload;
      if (removed.length === 0 || state.formData.url !== original) return;
      const { title, description, tags, toread } = state.formData;
      state.formData.url = stripped;
      state.errors.url = null;
      state.trackingStrip = {
        pageFields: {
          title,
          description,
          tags: [...tags],
          private: state.formData.private,
          toread,
        },
        original,
        stripped,
        removed,
        restored: false,
        checkedOriginal: false,
        checkingOriginal: false,
        savedWithTracking: false,
      };
    },
    // The "#" button. Drops the fragment from both versions of a stripped
    // URL too, so the tracking note and its toggle survive.
    removeUrlFragment(state) {
      const dropFragment = (value: string) => value.replace(/#.*$/, '');
      state.formData.url = dropFragment(state.formData.url);
      state.errors.url = null;
      const strip = state.trackingStrip;
      if (strip) {
        strip.original = dropFragment(strip.original);
        strip.stripped = dropFragment(strip.stripped);
      }
    },
    toggleTrackingStrip(state) {
      const strip = state.trackingStrip;
      if (!strip) return;
      strip.restored = !strip.restored;
      if (state.hasExistingBookmark) {
        // The form shows the bookmark saved under the URL we're leaving.
        // Start the other URL from the page's own details instead.
        state.formData = {
          ...state.formData,
          ...strip.pageFields,
          tags: [...strip.pageFields.tags],
        };
        state.hasExistingBookmark = false;
        state.existingBookmarkTime = null;
        state.displayOriginalTimestamp = false;
        state.existingBookmarkTags = [];
      }
      state.formData.url = strip.restored ? strip.original : strip.stripped;
      state.errors.url = null;
    },
    resetStatus(state) {
      state.status = 'idle';
      // Reset errors to the full initial structure
      state.errors = { ...initialState.errors };
    },
    clearStatus(state) {
      state.status = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBookmarkDetails.pending, (state, action) => {
        state.initialLoading = true;
        state.existingBookmarkTime = null;
        state.hasExistingBookmark = false;
        state.displayOriginalTimestamp = false;
        state.existingBookmarkTags = [];
        // Reset errors to the full initial structure
        state.errors = { ...initialState.errors };
        state.lastFetchRequestId = action.meta.requestId;
        const requestedUrl =
          typeof action.meta.arg === 'string'
            ? action.meta.arg.trim()
            : state.formData.url.trim();
        state.lastFetchTargetUrl = requestedUrl || null;
      })
      .addCase(fetchBookmarkDetails.fulfilled, (state, action) => {
        if (
          state.lastFetchRequestId &&
          action.meta.requestId !== state.lastFetchRequestId
        ) {
          return;
        }

        state.initialLoading = false;

        const requestedUrl =
          typeof action.meta.arg === 'string'
            ? action.meta.arg.trim()
            : state.lastFetchTargetUrl || '';
        const normalizedUrl = requestedUrl.trim();
        const currentUrl = state.formData.url.trim();

        if (normalizedUrl && normalizedUrl !== currentUrl) {
          state.lastFetchTargetUrl = null;
          return;
        }

        state.lastFetchTargetUrl = null;
        // Reset errors on success
        state.errors = { ...initialState.errors };
        const post = action.payload;
        const strip = state.trackingStrip;
        if (strip && normalizedUrl === strip.original.trim()) {
          // The user put the tracked URL back, so this answers the check.
          strip.checkedOriginal = true;
          strip.savedWithTracking = !!post;
        }
        if (post) {
          // Populate formData from existing bookmark
          state.formData.title = post.description || state.formData.title;
          state.formData.url = post.href || state.formData.url;
          if (strip) {
            // Keep the toggle in step with the URL Pinboard has on file.
            if (strip.restored) {
              strip.original = state.formData.url;
            } else {
              strip.stripped = state.formData.url;
            }
          }
          state.formData.description =
            post.extended || state.formData.description;
          state.formData.tags = toTagArray(post.tags);
          state.existingBookmarkTags = [...state.formData.tags];
          state.formData.private = post.shared === 'no';
          state.formData.toread = post.toread === 'yes';
          state.existingBookmarkTime =
            (post.time as string) || (post.dt as string) || null;
          state.hasExistingBookmark = true;
          state.displayOriginalTimestamp = true;
        } else {
          state.hasExistingBookmark = false;
          state.existingBookmarkTime = null;
          state.displayOriginalTimestamp = false;
          state.existingBookmarkTags = [];
        }
      })
      .addCase(checkTrackedBookmark.pending, (state) => {
        if (state.trackingStrip) state.trackingStrip.checkingOriginal = true;
      })
      .addCase(checkTrackedBookmark.fulfilled, (state, action) => {
        const strip = state.trackingStrip;
        if (!strip) return;
        strip.checkingOriginal = false;
        if (strip.checkedOriginal) return; // A lookup of it answered first.
        strip.checkedOriginal = true;
        strip.savedWithTracking = action.payload;
      })
      .addCase(checkTrackedBookmark.rejected, (state) => {
        if (!state.trackingStrip) return;
        state.trackingStrip.checkingOriginal = false;
        state.trackingStrip.checkedOriginal = true;
      })
      .addCase(fetchBookmarkDetails.rejected, (state, action) => {
        if (
          state.lastFetchRequestId &&
          action.meta.requestId !== state.lastFetchRequestId
        ) {
          return;
        }

        const requestedUrl =
          typeof action.meta.arg === 'string'
            ? action.meta.arg.trim()
            : state.lastFetchTargetUrl || '';
        const normalizedUrl = requestedUrl.trim();
        const currentUrl = state.formData.url.trim();

        state.initialLoading = false;
        state.hasExistingBookmark = false;
        state.displayOriginalTimestamp = false;
        state.lastFetchTargetUrl = null;

        if (normalizedUrl && normalizedUrl !== currentUrl) {
          return;
        }

        // Set generic error, ensure full errors object exists
        state.errors = {
          ...initialState.errors,
          generic:
            (action.payload as string) ||
            'Failed to load existing bookmark details.',
        };
      })
      .addCase(submitBookmark.pending, (state) => {
        state.status = 'saving';
        if (state.trackingStrip) {
          // Once the user saves, don't offer the tracked URL's bookmark.
          state.trackingStrip.checkedOriginal = true;
          if (!state.trackingStrip.restored) {
            state.trackingStrip.savedWithTracking = false;
          }
        }
        // Reset errors to the full initial structure
        state.errors = { ...initialState.errors };
      })
      .addCase(submitBookmark.fulfilled, (state, action) => {
        const alreadyHadBookmark = state.displayOriginalTimestamp;
        state.status = 'success';
        state.data = action.payload;
        state.hasExistingBookmark = true;
        if (!state.existingBookmarkTime) {
          state.existingBookmarkTime = new Date().toISOString();
        }
        state.displayOriginalTimestamp = alreadyHadBookmark;
        // Whatever was just saved is now the bookmark's baseline for the
        // next delta.
        state.existingBookmarkTags = [...state.formData.tags];
        // Reset errors to the full initial structure
        state.errors = { ...initialState.errors };
      })
      .addCase(submitBookmark.rejected, (state, action) => {
        state.status = 'error';
        const payload = action.payload as SubmitRejectValue | undefined;
        // Start with a clean error structure before applying specific errors
        const newErrors = { ...initialState.errors };

        if (payload?.validationErrors) {
          Object.assign(newErrors, payload.validationErrors);
        } else if (payload?.apiError) {
          const apiErrorCode = payload.apiError;
          if (apiErrorCode === 'missing url') {
            newErrors.url = ERROR_MESSAGES.MISSING_URL;
          } else if (apiErrorCode === 'must provide title') {
            newErrors.title = ERROR_MESSAGES.MISSING_TITLE;
          } else {
            newErrors.generic = ERROR_MESSAGES[apiErrorCode] || apiErrorCode;
          }
        } else if (payload?.urlTooLongError) {
          newErrors.url = ERROR_MESSAGES.URL_TOO_LONG;
          newErrors.generic = `${ERROR_MESSAGES.URL_TOO_LONG} (HTTP 414).`;
        } else if (payload?.genericError) {
          newErrors.generic = payload.genericError;
        } else {
          newErrors.generic = ERROR_MESSAGES.GENERIC_ERROR;
        }
        state.errors = newErrors; // Assign the fully constructed errors object
      });
  },
});

export const {
  setFormData,
  applyTrackingStrip,
  removeUrlFragment,
  toggleTrackingStrip,
  resetStatus,
  clearStatus,
} = bookmarkSlice.actions;
export default bookmarkSlice.reducer;
