import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';

// Define specific error messages
const ERROR_MESSAGES = {
  MISSING_URL: 'URL is required.',
  MISSING_TITLE: 'Title is required.',
  DESCRIPTION_TOO_LONG: 'Description is too long.', // Added for 414 errors
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.',
  // Add more specific API error codes if needed, e.g.:
  // 'item already exists': 'This bookmark already exists.'
};

// Async thunk to submit bookmark via Pinboard API
export const submitBookmark = createAsyncThunk(
  'bookmark/submit',
  async (_, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: { formData },
    } = getState();

    // --- Client-side validation ---
    const errors = { url: null, title: null, generic: null };
    let hasError = false;
    if (!formData.url) {
      errors.url = ERROR_MESSAGES.MISSING_URL;
      hasError = true;
    }
    if (!formData.title) {
      errors.title = ERROR_MESSAGES.MISSING_TITLE;
      hasError = true;
    }

    if (hasError) {
      // Reject immediately with the validation errors object
      return rejectWithValue({ validationErrors: errors });
    }
    // --- End client-side validation ---

    const params = new URLSearchParams();
    params.append('format', 'json');
    params.append('auth_token', `${user}:${token}`);
    params.append('url', formData.url);
    params.append('description', formData.title);
    params.append('extended', formData.description);
    if (formData.private) params.append('shared', 'no');
    if (formData.toread) params.append('toread', 'yes');
    params.append('tags', formData.tags);

    try {
      const response = await axios.get(
        `https://pinboard-api.herokuapp.com/posts/add?${params.toString()}`
      );
      if (response.data.result_code === 'done') {
        return response.data;
      } else {
        // Reject with API error message (e.g., 'item already exists')
        return rejectWithValue({ apiError: response.data.result_code });
      }
    } catch (err) {
      // Check for specific HTTP status errors like 414
      if (err.response && err.response.status === 414) {
        return rejectWithValue({ descriptionTooLongError: true });
      }
      // Reject with generic network/request error
      return rejectWithValue({
        genericError: err.message || ERROR_MESSAGES.GENERIC_ERROR,
      });
    }
  }
);

// Fetch existing bookmark details if any
export const fetchBookmarkDetails = createAsyncThunk(
  'bookmark/fetchDetails',
  async (_, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: {
        formData: { url },
      },
    } = getState();
    if (!user || !token || !url) return null;
    try {
      // Fetch details: strip fragment and encode URL parameter
      const response = await axios.get(
        `https://pinboard-api.herokuapp.com/posts/get?format=json&auth_token=${user}:${token}&url=${cleanUrl(
          url
        )}`
      );
      if (response.data.posts && response.data.posts.length === 1) {
        return response.data.posts[0];
      }
      return null;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const initialState = {
  formData: {
    title: '',
    url: '',
    description: '',
    tags: '',
    private: false,
    toread: false,
  },
  status: '',
  data: null,
  errors: {
    url: null,
    title: null,
    generic: null,
  },
  initialLoading: false,
  existingBookmarkTime: null,
};

const bookmarkSlice = createSlice({
  name: 'bookmark',
  initialState,
  reducers: {
    setFormData(state, action) {
      const fieldName = Object.keys(action.payload)[0];
      state.formData = { ...state.formData, ...action.payload };
      // Clear specific field error when user types in that field
      if (fieldName === 'url' && state.errors.url) {
        state.errors.url = null;
      }
      if (fieldName === 'title' && state.errors.title) {
        state.errors.title = null;
      }
      // Clear generic error on any field change? Maybe too aggressive.
      // Let's clear generic only on submit attempt or success/reset.
    },
    resetStatus(state) {
      state.status = 'idle'; // Use 'idle' for consistency
      state.errors = { url: null, title: null, generic: null }; // Clear all errors
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBookmarkDetails.pending, (state) => {
        state.initialLoading = true;
        state.existingBookmarkTime = null; // Clear timestamp on new fetch
        state.errors = { url: null, title: null, generic: null }; // Clear errors
      })
      .addCase(fetchBookmarkDetails.fulfilled, (state, action) => {
        state.initialLoading = false;
        const post = action.payload;
        if (post) {
          // Populate formData from existing bookmark
          state.formData.title = post.description || state.formData.title;
          state.formData.url = post.href || state.formData.url;
          state.formData.description =
            post.extended || state.formData.description;
          state.formData.tags = post.tags || state.formData.tags;
          state.formData.private = post.shared === 'no';
          state.formData.toread = post.toread === 'yes';
          state.existingBookmarkTime = post.time || null;
        }
      })
      .addCase(fetchBookmarkDetails.rejected, (state) => {
        state.initialLoading = false;
        // Potentially set a generic error here?
        // state.errors.generic = "Failed to load existing bookmark details.";
      })
      .addCase(submitBookmark.pending, (state) => {
        state.status = 'saving';
        // Clear previous errors on new attempt
        state.errors = { url: null, title: null, generic: null };
      })
      .addCase(submitBookmark.fulfilled, (state, action) => {
        state.status = 'success';
        state.data = action.payload;
        state.errors = { url: null, title: null, generic: null }; // Clear errors on success
      })
      .addCase(submitBookmark.rejected, (state, action) => {
        state.status = 'error';
        state.errors = {
          url: null,
          title: null,
          description: null,
          generic: null,
        }; // Reset errors initially

        // Distinguish between validation, API, description length, and generic errors
        if (action.payload?.validationErrors) {
          state.errors = {
            ...state.errors,
            ...action.payload.validationErrors,
          };
        } else if (action.payload?.apiError) {
          // Map known API errors like 'missing url' or 'must provide title'
          const apiErrorCode = action.payload.apiError;
          if (apiErrorCode === 'missing url') {
            state.errors.url = ERROR_MESSAGES.MISSING_URL;
          } else if (apiErrorCode === 'must provide title') {
            state.errors.title = ERROR_MESSAGES.MISSING_TITLE;
          } else {
            // Use the code directly or map to a generic message if unknown
            state.errors.generic = ERROR_MESSAGES[apiErrorCode] || apiErrorCode;
          }
        } else if (action.payload?.descriptionTooLongError) {
          state.errors.description = ERROR_MESSAGES.DESCRIPTION_TOO_LONG;
        } else if (action.payload?.genericError) {
          state.errors.generic = action.payload.genericError;
        } else {
          // Fallback generic error
          state.errors.generic = ERROR_MESSAGES.GENERIC_ERROR;
        }
      });
  },
});

export const { setFormData, resetStatus } = bookmarkSlice.actions;
export default bookmarkSlice.reducer;
