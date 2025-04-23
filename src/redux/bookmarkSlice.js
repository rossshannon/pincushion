import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';

// Async thunk to submit bookmark via Pinboard API
export const submitBookmark = createAsyncThunk(
  'bookmark/submit',
  async (_, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: { formData },
    } = getState();
    const params = new URLSearchParams();
    params.append('format', 'json');
    params.append('auth_token', `${user}:${token}`);
    // Directly append raw URL; URLSearchParams handles encoding
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
        return rejectWithValue(response.data.result_code);
      }
    } catch (err) {
      return rejectWithValue(err.message);
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
        `https://pinboard-api.herokuapp.com/posts/get?format=json&auth_token=${user}:${token}&url=${cleanUrl(url)}`
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
  error: null,
  initialLoading: false,
};

const bookmarkSlice = createSlice({
  name: 'bookmark',
  initialState,
  reducers: {
    setFormData(state, action) {
      state.formData = { ...state.formData, ...action.payload };
    },
    /**
     * Clear status (e.g., after success animation) and any errors
     */
    resetStatus(state) {
      state.status = '';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBookmarkDetails.pending, (state) => {
        state.initialLoading = true;
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
        }
      })
      .addCase(fetchBookmarkDetails.rejected, (state) => {
        state.initialLoading = false;
      })
      .addCase(submitBookmark.pending, (state) => {
        state.status = 'saving';
        state.error = null;
      })
      .addCase(submitBookmark.fulfilled, (state, action) => {
        state.status = 'success';
        state.data = action.payload;
      })
      .addCase(submitBookmark.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload;
      });
  },
});

export const { setFormData, resetStatus } = bookmarkSlice.actions;
export default bookmarkSlice.reducer;
