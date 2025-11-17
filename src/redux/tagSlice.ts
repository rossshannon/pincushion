import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from '@reduxjs/toolkit';
import axios from 'axios';
import { cleanUrl } from '../utils/url';
import { fetchGptTagSuggestions } from '../services/gptSuggestions';
import { postProcessPinboardSuggestions } from '../utils/tagSuggestionFilters';
import type { TwitterCardData } from '../types/twitterCard';
import { setTwitterCardPreview } from './twitterCardSlice';
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
        `https://pinboard-api.herokuapp.com/v1/tags/get?format=json`,
        {
          headers: {
            Authorization: `Bearer ${user}:${token}`,
          },
        }
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
      const message =
        err instanceof Error ? err.message : 'Unable to fetch tags';
      return rejectWithValue(message);
    }
  }
);

type SuggestPreviewPayload = {
  suggestions: string[];
  preview: TwitterCardData | null;
  previewError: string | null;
  targetUrl: string | null;
  previewStatus: string | null;
};

// Fetch suggested tags for current URL
export const fetchSuggestedTags = createAsyncThunk<
  SuggestPreviewPayload,
  void,
  { state: TagThunkState; rejectValue: string }
>(
  'tags/fetchSuggested',
  async (_, { getState, rejectWithValue, dispatch }) => {
    const {
      auth: { user, token },
      bookmark: {
        formData: { url },
      },
      tags: { tagCounts },
    } = getState();
    try {
      const trimmedUrl = typeof url === 'string' ? url.trim() : '';
      if (trimmedUrl) {
        dispatch(
          setTwitterCardPreview({
            card: null,
            error: null,
            url: trimmedUrl,
            status: 'loading',
            previewError: null,
            previewStatus: null,
          })
        );
      }
      const response = await axios.get(
        `https://pinboard-api.herokuapp.com/posts/suggest-with-preview?format=json&url=${cleanUrl(
          url
        )}`,
        {
          headers: {
            Authorization: `Bearer ${user}:${token}`,
          },
        }
      );
      const suggestionPayload = response.data?.suggestions || {};
      const rec = Array.isArray(suggestionPayload.recommended)
        ? suggestionPayload.recommended
        : [];
      const pop = Array.isArray(suggestionPayload.popular)
        ? suggestionPayload.popular
        : [];
      const combined = [...rec, ...pop]
        .map((tag: string) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean);
      const processed = postProcessPinboardSuggestions(combined, tagCounts);
      const previewRaw = response.data?.preview;
      const preview: TwitterCardData | null =
        previewRaw && typeof previewRaw === 'object'
          ? {
              url: previewRaw.url ?? trimmedUrl,
              title:
                typeof previewRaw.title === 'string'
                  ? previewRaw.title
                  : null,
              description:
                typeof previewRaw.description === 'string'
                  ? previewRaw.description
                  : null,
              imageUrl:
                typeof previewRaw.imageUrl === 'string'
                  ? previewRaw.imageUrl
                  : null,
              siteName:
                typeof previewRaw.siteName === 'string'
                  ? previewRaw.siteName
                  : null,
              siteHandle:
                typeof previewRaw.siteHandle === 'string'
                  ? previewRaw.siteHandle
                  : null,
              siteHandleUrl:
                typeof previewRaw.siteHandleUrl === 'string'
                  ? previewRaw.siteHandleUrl
                  : null,
              siteDomain:
                typeof previewRaw.siteDomain === 'string'
                  ? previewRaw.siteDomain
                  : null,
              cardType:
                typeof previewRaw.cardType === 'string'
                  ? previewRaw.cardType
                  : null,
              fetchedAt:
                typeof previewRaw.fetchedAt === 'string'
                  ? previewRaw.fetchedAt
                  : null,
              themeColor:
                typeof previewRaw.themeColor === 'string'
                  ? previewRaw.themeColor
                  : null,
              faviconUrl:
                typeof previewRaw.faviconUrl === 'string'
                  ? previewRaw.faviconUrl
                  : null,
            }
          : null;
      const previewError =
        typeof response.data?.previewError === 'string'
          ? response.data.previewError
          : null;
      const previewStatusRaw =
        typeof response.data?.previewStatus === 'string'
          ? response.data.previewStatus
          : null;
      const previewStatus = previewStatusRaw;
      dispatch(
        setTwitterCardPreview({
          card: preview,
          error: null,
          url: trimmedUrl || null,
          previewStatus,
          previewError,
        })
      );
      return {
        suggestions: processed,
        preview,
        previewError,
        targetUrl: trimmedUrl || null,
        previewStatus,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch suggested tags';
      dispatch(
        setTwitterCardPreview({
          card: null,
          error: message,
          url: null,
          previewStatus: 'error',
          previewError: message,
        })
      );
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
        .filter((tag) => tag && tag !== '[]')
        .filter((tag) => !selectedTags.has(tag.toLowerCase()));

      return { suggestions: deduped, contextKey: payload?.contextKey ?? null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch GPT suggestions';
      return rejectWithValue(message);
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

      const normalizeMatch = (tag: string) =>
        typeof tag === 'string' && tag.toLowerCase() === normalized;

      state.suggested = state.suggested.filter(
        (tag) => tag === '$separator' || !normalizeMatch(tag)
      );
      state.gptSuggestions = state.gptSuggestions.filter(
        (tag) => !normalizeMatch(tag)
      );

      const alreadyPresent = state.suggested.some((tag) =>
        normalizeMatch(tag)
      );
      if (!alreadyPresent) {
        state.suggested.unshift(trimmed);
      }

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
        state.suggested = action.payload.suggestions;
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
