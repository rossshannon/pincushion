import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';
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
  initialLoading: boolean;
  existingBookmarkTime: string | null;
  hasExistingBookmark: boolean;
  displayOriginalTimestamp: boolean;
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
  // Add more specific API error codes if needed, e.g.:
  // 'item already exists': 'This bookmark already exists.'
};

// Async thunk to submit bookmark via Pinboard API
export const submitBookmark = createAsyncThunk<
  PinboardAddResponse,
  void,
  { state: BookmarkThunkState; rejectValue: SubmitRejectValue }
>(
  'bookmark/submit',
  async (_, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: { formData },
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
        `https://pinboard-api.herokuapp.com/v1/posts/add?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${user}:${token}`,
          },
        }
      );
      if (response.data.result_code === 'done') {
        return response.data;
      } else {
        // Reject with API error message (e.g., 'item already exists')
        return rejectWithValue({ apiError: response.data.result_code });
      }
    } catch (err) {
      if (hasHttpStatus(err, 414)) {
        return rejectWithValue({ urlTooLongError: true });
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
      // Fetch details: strip fragment and encode URL parameter
      const response = await axios.get(
        `https://pinboard-api.herokuapp.com/v1/posts/get?format=json&url=${cleanUrl(
          targetUrl
        )}`,
        {
          headers: {
            Authorization: `Bearer ${user}:${token}`,
          },
        }
      );
      if (response.data.posts && response.data.posts.length === 1) {
        return response.data.posts[0];
      }
      return null;
    } catch (err) {
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
  initialLoading: false,
  existingBookmarkTime: null,
  hasExistingBookmark: false,
  displayOriginalTimestamp: false,
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
      .addCase(fetchBookmarkDetails.pending, (state) => {
        state.initialLoading = true;
        state.existingBookmarkTime = null;
        state.hasExistingBookmark = false;
        state.displayOriginalTimestamp = false;
        // Reset errors to the full initial structure
        state.errors = { ...initialState.errors };
      })
      .addCase(fetchBookmarkDetails.fulfilled, (state, action) => {
        state.initialLoading = false;
        // Reset errors on success
        state.errors = { ...initialState.errors };
        const post = action.payload;
        if (post) {
          // Populate formData from existing bookmark
          state.formData.title = post.description || state.formData.title;
          state.formData.url = post.href || state.formData.url;
          state.formData.description =
            post.extended || state.formData.description;
          state.formData.tags = toTagArray(post.tags);
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
        }
      })
      .addCase(fetchBookmarkDetails.rejected, (state, action) => {
        state.initialLoading = false;
        state.hasExistingBookmark = false;
        state.displayOriginalTimestamp = false;
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
