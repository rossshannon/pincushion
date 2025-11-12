import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';
import { fetchGptTagSuggestions } from '../services/gptSuggestions.ts';

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
      const data = response.data || {};
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('tags', JSON.stringify(data));
          localStorage.setItem('tagTimestamp', Date.now().toString());
        } catch (_) {
          // If localStorage is unavailable (SSR/tests), ignore persistence errors.
        }
      }
      return data;
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

export const fetchGptSuggestions = createAsyncThunk(
  'tags/fetchGptSuggestions',
  async (payload, { getState, rejectWithValue }) => {
    const {
      auth: { openAiToken },
      tags: { suggested },
      bookmark: { formData },
    } = getState();

    if (!openAiToken) {
      return { suggestions: [], contextKey: payload?.contextKey || null };
    }

    const context = payload?.context || {
      url: formData.url,
      title: formData.title,
      description: formData.description,
      existingTags: formData.tags.join(' '),
    };

    if (!context.url) {
      return { suggestions: [], contextKey: payload?.contextKey || null };
    }

    try {
      const aiSuggestions = await fetchGptTagSuggestions({
        token: openAiToken,
        context,
      });

      const existingSet = new Set([
        ...(formData.tags || []).map((tag) => tag.toLowerCase()),
        ...suggested.map((tag) => tag.toLowerCase()),
      ]);

      const suggestions = aiSuggestions.filter((tag) => !existingSet.has(tag));

      return { suggestions, contextKey: payload?.contextKey || null };
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
    gptSuggestions: [],
    gptStatus: 'idle',
    gptError: null,
    gptContextKey: null,
    error: null,
  },
  reducers: {
    addSuggestedTag(state, action) {
      state.suggested = state.suggested.filter((tag) => tag !== action.payload);
      state.gptSuggestions = state.gptSuggestions.filter(
        (tag) => tag !== action.payload
      );
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
      .addCase(fetchTags.pending, (state) => {
        // Add error reset on pending if desired, though fulfilled/rejected handle it here
        state.error = null; // Explicitly reset error on new fetch attempt
      })
      .addCase(fetchTags.fulfilled, (state, action) => {
        state.tagCounts = action.payload || {};
        state.error = null;
      })
      .addCase(fetchTags.rejected, (state, action) => {
        state.error = action.payload;
      })
      // Suggested tags
      .addCase(fetchSuggestedTags.pending, (state) => {
        state.suggestedLoading = true; // Ensure this is set
        state.error = null;
      })
      .addCase(fetchSuggestedTags.fulfilled, (state, action) => {
        state.suggestedLoading = false;
        state.suggested = action.payload;
        state.error = null; // Reset error on success
      })
      .addCase(fetchSuggestedTags.rejected, (state, action) => {
        state.suggestedLoading = false;
        state.error = action.payload;
      })
      .addCase(fetchGptSuggestions.pending, (state) => {
        state.gptStatus = 'loading';
        state.gptError = null;
      })
      .addCase(fetchGptSuggestions.fulfilled, (state, action) => {
        state.gptStatus = 'succeeded';
        state.gptSuggestions = action.payload.suggestions || [];
        state.gptContextKey = action.payload.contextKey;
      })
      .addCase(fetchGptSuggestions.rejected, (state, action) => {
        state.gptStatus = 'failed';
        state.gptError = action.payload || action.error.message;
      });
  },
});

export const { addSuggestedTag, setTagCounts } = tagSlice.actions; // Updated export
export default tagSlice.reducer;
