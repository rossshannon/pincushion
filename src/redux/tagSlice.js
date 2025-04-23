import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';

// Fetch user's tags from Pinboard
export const fetchTags = createAsyncThunk(
  'tags/fetchTags',
  async (_, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
    } = getState();
    try {
      const response = await axios.get(
        `https://pinboard-api.herokuapp.com/tags/get?format=json&auth_token=${user}:${token}`
      );
      // response.data is object mapping tag->count
      // Return the full object instead of just keys
      return response.data || {};
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// Fetch suggested tags for current URL
export const fetchSuggestedTags = createAsyncThunk(
  'tags/fetchSuggested',
  async (_, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: {
        formData: { url },
      },
    } = getState();
    try {
      // Use cleanUrl to strip fragment and encode URL
      const response = await axios.get(
        `https://pinboard-api.herokuapp.com/posts/suggest?format=json&auth_token=${user}:${token}&url=${cleanUrl(
          url
        )}`
      );
      const rec = response.data[1]?.recommended || [];
      const pop = response.data[0]?.popular || [];
      const tags = [...rec, ...pop]
        .map((tag) => tag.toLowerCase())
        .filter((tag, idx, arr) => arr.indexOf(tag) === idx);
      return tags;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const tagSlice = createSlice({
  name: 'tags',
  initialState: {
    tagCounts: {}, // Renamed from allTags, initialized as object
    suggested: [],
    suggestedLoading: false,
    error: null,
  },
  reducers: {
    addSuggestedTag(state, action) {
      state.suggested = state.suggested.filter((tag) => tag !== action.payload);
    },
    /**
     * Initialize tagCounts from cached storage
     */
    setTagCounts(state, action) {
      // Renamed from setAllTags
      state.tagCounts =
        typeof action.payload === 'object' && action.payload !== null
          ? action.payload
          : {};
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTags.fulfilled, (state, action) => {
        state.tagCounts = action.payload; // Store the tag->count object
        try {
          // Cache tag->count object and timestamp in localStorage
          localStorage.setItem('tags', JSON.stringify(action.payload));
          localStorage.setItem('tagTimestamp', Date.now().toString());
        } catch (_) {}
      })
      .addCase(fetchTags.rejected, (state, action) => {
        state.error = action.payload;
      })
      // Suggested tags
      .addCase(fetchSuggestedTags.pending, (state) => {
        state.suggestedLoading = true;
        state.error = null;
      })
      .addCase(fetchSuggestedTags.fulfilled, (state, action) => {
        state.suggestedLoading = false;
        state.suggested = action.payload;
      })
      .addCase(fetchSuggestedTags.rejected, (state, action) => {
        state.suggestedLoading = false;
        state.error = action.payload;
      });
  },
});

export const { addSuggestedTag, setTagCounts } = tagSlice.actions; // Updated export
export default tagSlice.reducer;
