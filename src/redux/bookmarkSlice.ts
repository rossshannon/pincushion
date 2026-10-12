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
  /**
   * Tags the bookmark had on Pinboard when it was loaded; [] if new, null
   * if unknown because the lookup is pending or failed.
   */
  existingBookmarkTags: string[] | null;
  /** The URL existingBookmarkTags describes; a save for any other URL has no baseline. */
  existingBookmarkUrl: string | null;
  /** Tags not typed by the user when the lookup started, to spot ones typed meanwhile. */
  tagsAtLookupStart: string[];
  /** Tags a previous lookup loaded, dropped if this lookup finds no bookmark. */
  loadedTagsAtLookupStart: string[];
  /** The URL and tags sent by the save in flight: the next baseline. */
  savingUrl: string;
  savingTags: string[];
  // The lookup that was current when the save started; a save that ends
  // after a newer lookup (a new URL or account) must not set the baseline.
  savingLookupId: string | null;
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
    'Pinboard didn’t respond in time, so we couldn’t check for an existing bookmark. New bookmarks still save; to edit an existing one, reopen the popup.',
  SAVE_TIMEOUT: 'Pinboard didn’t respond in time. Please try saving again.',
  // Only reachable when the lookup failed and the save went out with
  // replace=no, which stops it overwriting a bookmark we never loaded.
  'item already exists':
    'This page is already in Pinboard, but we couldn’t load it, so we didn’t overwrite it. Reopen the popup to edit it.',
};

// Async thunk to submit bookmark via Pinboard API
export const submitBookmark = createAsyncThunk<
  PinboardAddResponse,
  void,
  {
    state: BookmarkThunkState;
    rejectValue: SubmitRejectValue;
    fulfilledMeta: { sameAccount: boolean };
  }
>(
  'bookmark/submit',
  async (_, { getState, dispatch, rejectWithValue, fulfillWithValue }) => {
    const {
      auth: { user, token },
      bookmark: { formData, existingBookmarkTags, existingBookmarkUrl },
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
    // posts/add replaces an existing bookmark wholesale. If the lookup failed
    // we don't know whether one exists, so refuse to overwrite it.
    const baselineKnown =
      existingBookmarkTags !== null &&
      existingBookmarkUrl === formData.url.trim();
    if (!baselineKnown) params.append('replace', 'no');

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
        // With replace=no, success means the bookmark was new, so every tag
        // counts as added.
        const delta = diffTagLists(
          baselineKnown ? existingBookmarkTags || [] : [],
          formData.tags || []
        );
        // In-memory state is whoever is signed in now; skip it if the
        // account changed in Settings while this save was in flight.
        const sameAccount = getState().auth.user === user;
        if (!isEmptyDelta(delta)) {
          if (sameAccount) dispatch(recordSavedTags(delta));
          bumpTagCache(user, delta);
        }
        return fulfillWithValue(response.data, { sameAccount });
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
  }
);

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
      const lookup = async (encodedUrl: string) => {
        const response = await axios.get(
          bridgeUrl(`/v1/posts/get?format=json&url=${encodedUrl}`),
          bridgeRequestConfig(user, token, REQUEST_TIMEOUTS_MS.lookup)
        );
        const posts = response.data.posts;
        return posts && posts.length === 1 ? (posts[0] as PinboardPost) : null;
      };
      // Look the page up without its #fragment first. Pinboard keeps the
      // href exactly as saved, though, so a miss for a URL with a fragment
      // doesn't rule out a bookmark saved with that fragment: check that too
      // before reporting "not found", which lets the save overwrite.
      const post = await lookup(cleanUrl(targetUrl));
      if (post || !targetUrl.includes('#')) return post;
      return await lookup(encodeURIComponent(targetUrl));
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
  existingBookmarkUrl: null,
  tagsAtLookupStart: [],
  loadedTagsAtLookupStart: [],
  savingUrl: '',
  savingTags: [],
  savingLookupId: null,
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
      state.formData = { ...state.formData, ...updates };
      Object.keys(updates).forEach((fieldName) => {
        if (isBookmarkErrorKey(fieldName)) {
          state.errors[fieldName] = null;
        }
      });
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
        // Tags already on the form that the user typed, as opposed to ones
        // a previous lookup loaded. When Pinboard's href differs (no
        // fragment, say) a second lookup follows the first; measuring
        // against the loaded tags keeps what was typed during the first.
        // A lookup still in flight already took both readings; taking them
        // again would see its cleared baseline and forget what it loaded.
        if (!state.initialLoading) {
          state.tagsAtLookupStart = state.existingBookmarkTags
            ? [...state.existingBookmarkTags]
            : [...state.formData.tags];
        }
        // Only a finished lookup knows which tags it loaded; after a failed
        // one, keep the last known set so a later miss can still drop them.
        if (state.existingBookmarkTags !== null) {
          state.loadedTagsAtLookupStart = [...state.existingBookmarkTags];
        }
        state.existingBookmarkTags = null;
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
        if (post) {
          // Populate formData from existing bookmark
          state.formData.title = post.description || state.formData.title;
          state.formData.url = post.href || state.formData.url;
          state.formData.description =
            post.extended || state.formData.description;
          const savedTags = toTagArray(post.tags);
          // Autocomplete is live while the lookup runs; keep any tags the
          // user added meanwhile rather than replacing them.
          const typedMeanwhile = state.formData.tags.filter(
            (tag) => !state.tagsAtLookupStart.includes(tag)
          );
          state.formData.tags = [
            ...savedTags,
            ...typedMeanwhile.filter((tag) => !savedTags.includes(tag)),
          ];
          state.existingBookmarkTags = savedTags;
          state.existingBookmarkUrl = state.formData.url.trim();
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
          // The lookup checked the URL both with and without any #fragment.
          state.existingBookmarkUrl = currentUrl;
          // Tags loaded from the previous URL's (or account's) bookmark
          // don't belong to this new one; keep only what the user typed.
          state.formData.tags = state.formData.tags.filter(
            (tag) => !state.loadedTagsAtLookupStart.includes(tag)
          );
        }
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
        state.existingBookmarkTags = null;

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
        state.savingUrl = state.formData.url.trim();
        state.savingTags = [...state.formData.tags];
        state.savingLookupId = state.lastFetchRequestId;
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
        // Whatever was just saved (not anything typed since) is now the
        // bookmark's baseline for the next delta, unless the account or the
        // lookup changed while it was in flight: then it describes some
        // other bookmark, and the current baseline stays as it is.
        if (
          action.meta.sameAccount &&
          state.savingLookupId === state.lastFetchRequestId
        ) {
          state.existingBookmarkTags = [...state.savingTags];
          state.existingBookmarkUrl = state.savingUrl;
        }
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

export const { setFormData, resetStatus, clearStatus } = bookmarkSlice.actions;
export default bookmarkSlice.reducer;
