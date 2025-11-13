import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';
import { fetchGptTagSuggestions } from '../services/gptSuggestions';
import { postProcessPinboardSuggestions } from '../utils/tagSuggestionFilters';
import type { AuthState } from './authSlice';
import type { BookmarkState } from './bookmarkSlice';

export type TagState = {
  tagCounts: Record<string, number>;
  suggested: string[];
  suggestedLoading: boolean;
  suggestedStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  gptSuggestions: string[];
  gptStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  gptError: string | null;
  gptContextKey: string | null;
  error: string | null;
};

type TagThunkState = {
  auth: AuthState;
  bookmark: BookmarkState;
  tags: TagState;
};

// Fetch user's tags from Pinboard
export const fetchTags = createAsyncThunk<
  Record<string, number>,
  void,
  { state: TagThunkState; rejectValue: string }
>(
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
export const fetchSuggestedTags = createAsyncThunk<
  string[],
  void,
  { state: TagThunkState; rejectValue: string }
>(
  'tags/fetchSuggested',
  async (_, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: {
        formData: { url },
      },
      tags: { tagCounts },
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
      const combined = [...rec, ...pop]
        .map((tag: string) => tag.toLowerCase())
        .filter(Boolean);
      return postProcessPinboardSuggestions(combined, tagCounts);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch suggested tags';
      return rejectWithValue(message);
    }
  }
);

type GptPayload = {
  contextKey?: string;
  context?: {
    url?: string;
    title?: string;
    description?: string;
    existingTags?: string;
  };
};

export const fetchGptSuggestions = createAsyncThunk<
  { suggestions: string[]; contextKey: string | null },
  GptPayload | undefined,
  { state: TagThunkState; rejectValue: string }
>(
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

      const selectedTags = new Set(
        (formData.tags || []).map((tag) => tag.toLowerCase())
      );
      const deduped = aiSuggestions
        .map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
        .filter((tag) => tag)
        .filter((tag) => !selectedTags.has(tag.toLowerCase()));

      return { suggestions: deduped, contextKey: payload?.contextKey ?? null };
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

const initialState: TagState = {
  tagCounts: {},
  suggested: [],
  suggestedLoading: false,
  suggestedStatus: 'idle',
  gptSuggestions: [],
  gptStatus: 'idle',
  gptError: null,
  gptContextKey: null,
  error: null,
};

const tagSlice = createSlice({
  name: 'tags',
  initialState,
  reducers: {
    addSuggestedTag(state, action: PayloadAction<string>) {
      state.suggested = state.suggested.filter((tag) => tag !== action.payload);
      state.gptSuggestions = state.gptSuggestions.filter(
        (tag) => tag !== action.payload
      );
    },
    restoreSuggestedTag(state, action: PayloadAction<string>) {
      if (typeof action.payload !== 'string') return;
      const trimmed = action.payload.trim();
      if (!trimmed) return;
      const normalized = trimmed.toLowerCase();

      state.suggested = state.suggested.filter((tag) => tag !== normalized);
      state.gptSuggestions = state.gptSuggestions.filter(
        (tag) => tag !== normalized
      );
      state.suggested.unshift(normalized);
      if (state.gptSuggestions.length === 0) {
        state.suggested = state.suggested.filter((tag) => tag !== '$separator');
      }
    },
    resetGptSuggestions(state) {
      state.gptSuggestions = [];
      state.gptStatus = 'idle';
      state.gptError = null;
      state.gptContextKey = null;
    },
    /**
     * Initialize tagCounts from cached storage
     */
    setTagCounts(state, action: PayloadAction<Record<string, number> | null | undefined>) {
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
        state.error = (action.payload as string) || action.error.message || null;
      })
      // Suggested tags
      .addCase(fetchSuggestedTags.pending, (state) => {
        state.suggestedLoading = true; // Ensure this is set
        state.suggestedStatus = 'loading';
        state.error = null;
      })
      .addCase(fetchSuggestedTags.fulfilled, (state, action) => {
        state.suggestedLoading = false;
        state.suggested = action.payload;
        state.suggestedStatus = 'succeeded';
        state.error = null; // Reset error on success
      })
      .addCase(fetchSuggestedTags.rejected, (state, action) => {
        state.suggestedLoading = false;
        state.suggestedStatus = 'failed';
        state.error = (action.payload as string) || action.error.message || null;
      })
      .addCase(fetchGptSuggestions.pending, (state) => {
        state.gptStatus = 'loading';
        state.gptError = null;
      })
      .addCase(fetchGptSuggestions.fulfilled, (state, action) => {
        state.gptStatus = 'succeeded';
        state.gptSuggestions = action.payload?.suggestions || [];
        state.gptContextKey = action.payload?.contextKey || null;
      })
      .addCase(fetchGptSuggestions.rejected, (state, action) => {
        state.gptStatus = 'failed';
        state.gptError = (action.payload as string) || action.error.message || null;
      });
  },
});

export const {
  addSuggestedTag,
  restoreSuggestedTag,
  setTagCounts,
  resetGptSuggestions,
} = tagSlice.actions; // Updated export
export default tagSlice.reducer;
