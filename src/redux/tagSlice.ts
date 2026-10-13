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
  REQUEST_TIMEOUTS_MS,
} from '../services/pinboardApi';
import {
  applyTagDelta,
  normalizeTagCounts,
  writeTagCache,
  type TagDelta,
} from '../utils/tagCache';
import {
  fetchGptTagSuggestions,
  filterRecentTagsForRelevance,
} from '../services/gptSuggestions';
import { postProcessPinboardSuggestions } from '../utils/tagSuggestionFilters';
import type { AuthState } from './authSlice';
import type { BookmarkState } from './bookmarkSlice';

export type TagState = {
  tagCounts: Record<string, number>;
  suggested: string[];
  suggestedLoading: boolean;
  suggestedStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** The in-flight suggest request; responses from older ones are dropped. */
  suggestedRequestId: string | null;
  gptSuggestions: string[];
  gptStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  gptError: string | null;
  gptContextKey: string | null;
  error: string | null;
  recentTags: string[];
  filteredRecentTags: string[];
  /**
   * Tag deltas saved while any fetchTags is in flight. Each fetch replays
   * only those saved after it started (its entry in tagFetchStarts), so
   * overlapping fetches don't count a save twice.
   */
  savedDuringTagFetch: TagDelta[];
  /** Absolute position of savedDuringTagFetch[0] in the stream of saves. */
  savedDuringTagFetchBase: number;
  /** For each in-flight fetchTags request, the save position it started at. */
  tagFetchStarts: Record<string, number>;
};

/** Fill in the replay bookkeeping if a preloaded state left it out. */
const ensureTagFetchState = (state: TagState) => {
  state.savedDuringTagFetch ??= [];
  state.savedDuringTagFetchBase ??= 0;
  state.tagFetchStarts ??= {};
};

/** The saves a given fetchTags must replay: those made after it started. */
const deltasSince = (state: TagState, requestId: string): TagDelta[] => {
  const start = state.tagFetchStarts?.[requestId];
  if (start === undefined) return [];
  return state.savedDuringTagFetch.slice(
    Math.max(start - state.savedDuringTagFetchBase, 0)
  );
};

/** Forget a finished fetch, and any saves no remaining fetch still needs. */
const finishTagFetch = (state: TagState, requestId: string) => {
  ensureTagFetchState(state);
  delete state.tagFetchStarts[requestId];
  const starts = Object.values(state.tagFetchStarts);
  const keepFrom = starts.length
    ? Math.min(...starts)
    : state.savedDuringTagFetchBase + state.savedDuringTagFetch.length;
  const drop = keepFrom - state.savedDuringTagFetchBase;
  if (drop > 0) {
    state.savedDuringTagFetch = state.savedDuringTagFetch.slice(drop);
    state.savedDuringTagFetchBase = keepFrom;
  }
};

type TagThunkState = {
  auth: AuthState;
  bookmark: BookmarkState;
  tags: TagState;
};

// Rejection for a refresh that outlived an account switch: not an error.
const ACCOUNT_CHANGED = 'Account changed during tag refresh';

// Fetch user's tags from Pinboard
export const fetchTags = createAsyncThunk<
  Record<string, number>,
  void,
  { state: TagThunkState; rejectValue: string }
>(
  'tags/fetchTags',
  async (_, { getState, rejectWithValue, requestId }) => {
    const {
      auth: { user, token },
    } = getState();
    try {
      const response = await axios.get(
        bridgeUrl('/v1/tags/get?format=json'),
        bridgeRequestConfig(user, token, REQUEST_TIMEOUTS_MS.tags)
      );
      // The account changed in Settings while this was downloading: these
      // are someone else's tags now, so drop them.
      if (getState().auth.user !== user) {
        return rejectWithValue(ACCOUNT_CHANGED);
      }
      // Bookmarks saved while this download was in flight patched the old
      // counts; fold their deltas into the snapshot so it doesn't drop them.
      // Pinboard may already have counted them, though, so if there were
      // any, store the result as stale and let the next popup refetch.
      // The reducer replays them again for the in-memory copy, so a save
      // that lands between here and `fulfilled` isn't lost either (its
      // bumpTagCache patches the cache written here).
      const snapshot = normalizeTagCounts(response.data);
      const savedMeanwhile = deltasSince(getState().tags, requestId);
      writeTagCache(user, savedMeanwhile.reduce(applyTagDelta, snapshot), {
        stale: savedMeanwhile.length > 0,
      });
      return snapshot;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch tags';
      return rejectWithValue(message);
    }
  }
);

type SuggestPayload = {
  suggestions: string[];
};

/**
 * Pinboard's posts/suggest JSON is documented as
 * `[{"popular": [...]}, {"recommended": [...]}]`; accept a plain
 * `{popular, recommended}` object too.
 */
const readSuggestionLists = (
  payload: unknown
): { recommended: string[]; popular: string[] } => {
  const parts = Array.isArray(payload) ? payload : [payload];
  const lists = { recommended: [] as string[], popular: [] as string[] };
  parts.forEach((part) => {
    if (!part || typeof part !== 'object') return;
    const { recommended, popular } = part as Record<string, unknown>;
    if (Array.isArray(recommended)) lists.recommended.push(...recommended);
    if (Array.isArray(popular)) lists.popular.push(...popular);
  });
  return lists;
};

// Fetch Pinboard's suggested tags for the current URL. The page preview is a
// separate request (fetchPagePreview), so a slow Pinboard never holds it up.
export const fetchSuggestedTags = createAsyncThunk<
  SuggestPayload,
  string | undefined,
  { state: TagThunkState; rejectValue: string }
>(
  'tags/fetchSuggested',
  async (targetUrl, { getState, rejectWithValue }) => {
    const {
      auth: { user, token },
      bookmark: {
        formData: { url: formUrl },
      },
      tags: { tagCounts },
    } = getState();
    const url = targetUrl ?? formUrl;
    try {
      const response = await axios.get(
        bridgeUrl(`/v1/posts/suggest?format=json&url=${cleanUrl(url)}`),
        bridgeRequestConfig(user, token, REQUEST_TIMEOUTS_MS.suggest)
      );
      const { recommended, popular } = readSuggestionLists(response.data);
      const combined = [...recommended, ...popular]
        .map((tag: unknown) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean);
      return { suggestions: postProcessPinboardSuggestions(combined, tagCounts) };
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
  recentTags?: string[];
};

export const fetchGptSuggestions = createAsyncThunk<
  {
    suggestions: string[];
    contextKey: string | null;
    filteredRecentTags: string[];
  },
  GptPayload | undefined,
  { state: TagThunkState; rejectValue: string }
>(
  'tags/fetchGptSuggestions',
  async (payload, { getState, rejectWithValue }) => {
    const {
      auth: { openAiToken },
      bookmark: { formData },
      tags: { recentTags },
    } = getState();

    if (!openAiToken) {
      return {
        suggestions: [],
        contextKey: payload?.contextKey || null,
        filteredRecentTags: [],
      };
    }

    const context = payload?.context || {
      url: formData.url,
      title: formData.title,
      description: formData.description,
      existingTags: formData.tags.join(' '),
    };

    if (!context.url) {
      return {
        suggestions: [],
        contextKey: payload?.contextKey || null,
        filteredRecentTags: [],
      };
    }

    const tagsToFilter = payload?.recentTags || recentTags;

    try {
      // Fetch both new suggestions and filter recent tags in parallel
      const [aiSuggestions, filteredRecent] = await Promise.all([
        fetchGptTagSuggestions({
          token: openAiToken,
          context,
        }),
        tagsToFilter.length > 0
          ? filterRecentTagsForRelevance({
              token: openAiToken,
              recentTags: tagsToFilter,
              context,
            })
          : Promise.resolve([]),
      ]);

      const selectedTags = new Set(
        (formData.tags || []).map((tag) => tag.toLowerCase())
      );
      const deduped = aiSuggestions
        .map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
        .filter((tag) => tag && tag !== '[]')
        .filter((tag) => !selectedTags.has(tag.toLowerCase()));

      // Also deduplicate filtered recent tags against selected tags
      const dedupedRecent = filteredRecent.filter(
        (tag) => !selectedTags.has(tag.toLowerCase())
      );

      return {
        suggestions: deduped,
        contextKey: payload?.contextKey ?? null,
        filteredRecentTags: dedupedRecent,
      };
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
  suggestedRequestId: null,
  gptSuggestions: [],
  gptStatus: 'idle',
  gptError: null,
  gptContextKey: null,
  error: null,
  recentTags: [],
  filteredRecentTags: [],
  savedDuringTagFetch: [],
  savedDuringTagFetchBase: 0,
  tagFetchStarts: {},
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
    /**
     * A new URL's lookup has started and its suggestions will follow it:
     * drop the previous URL's suggestions and show the spinner now.
     */
    markSuggestionsPending(state) {
      state.suggested = [];
      state.suggestedLoading = true;
      state.suggestedStatus = 'loading';
      state.suggestedRequestId = null;
    },
    /** The pending suggestions were for a URL the user has since left. */
    cancelSuggestionsPending(state) {
      if (state.suggestedRequestId !== null) return;
      state.suggestedLoading = false;
      state.suggestedStatus = 'idle';
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
    /**
     * Apply the tag delta of a bookmark that was just saved (tags it gained
     * and tags it lost) to the in-memory counts, so autocomplete ranks them
     * correctly without waiting for a refetch.
     */
    recordSavedTags(state, action: PayloadAction<TagDelta>) {
      const delta = action.payload;
      if (!delta || !Array.isArray(delta.added) || !Array.isArray(delta.removed)) return;
      state.tagCounts = applyTagDelta(state.tagCounts, delta);
      ensureTagFetchState(state);
      if (Object.keys(state.tagFetchStarts).length > 0) {
        state.savedDuringTagFetch.push(delta);
      }
    },
    /**
     * Load recent tags from localStorage
     */
    setRecentTags(state, action: PayloadAction<string[]>) {
      state.recentTags = Array.isArray(action.payload) ? action.payload : [];
    },
    /**
     * Set GPT-filtered recent tags (relevant to current page)
     */
    setFilteredRecentTags(state, action: PayloadAction<string[]>) {
      state.filteredRecentTags = Array.isArray(action.payload) ? action.payload : [];
    },
    /**
     * Remove a recent tag when it's selected
     */
    removeRecentTag(state, action: PayloadAction<string>) {
      const tag = action.payload;
      state.recentTags = state.recentTags.filter((t) => t !== tag);
      state.filteredRecentTags = state.filteredRecentTags.filter((t) => t !== tag);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTags.pending, (state, action) => {
        // Add error reset on pending if desired, though fulfilled/rejected handle it here
        state.error = null; // Explicitly reset error on new fetch attempt
        ensureTagFetchState(state);
        state.tagFetchStarts[action.meta.requestId] =
          state.savedDuringTagFetchBase + state.savedDuringTagFetch.length;
      })
      .addCase(fetchTags.fulfilled, (state, action) => {
        state.tagCounts = deltasSince(state, action.meta.requestId).reduce(
          applyTagDelta,
          action.payload || {}
        );
        state.error = null;
        finishTagFetch(state, action.meta.requestId);
      })
      .addCase(fetchTags.rejected, (state, action) => {
        if (action.payload !== ACCOUNT_CHANGED) {
          state.error = (action.payload as string) || action.error.message || null;
        }
        finishTagFetch(state, action.meta.requestId);
      })
      // Suggested tags
      .addCase(fetchSuggestedTags.pending, (state, action) => {
        state.suggestedLoading = true; // Ensure this is set
        state.suggestedStatus = 'loading';
        state.suggestedRequestId = action.meta.requestId;
        state.error = null;
      })
      .addCase(fetchSuggestedTags.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.suggestedRequestId) return;
        state.suggestedRequestId = null;
        state.suggestedLoading = false;
        state.suggested = action.payload.suggestions;
        state.suggestedStatus = 'succeeded';
        state.error = null; // Reset error on success
      })
      .addCase(fetchSuggestedTags.rejected, (state, action) => {
        if (action.meta.requestId !== state.suggestedRequestId) return;
        state.suggestedRequestId = null;
        state.suggestedLoading = false;
        state.suggestedStatus = 'failed';
        state.error = (action.payload as string) || action.error.message || null;
      })
      .addCase(fetchGptSuggestions.pending, (state, action) => {
        state.gptStatus = 'loading';
        state.gptError = null;
        if (action.meta.arg?.contextKey) {
          state.gptContextKey = action.meta.arg.contextKey;
        }
      })
      .addCase(fetchGptSuggestions.fulfilled, (state, action) => {
        state.gptStatus = 'succeeded';
        state.gptSuggestions = action.payload?.suggestions || [];
        state.gptContextKey = action.payload?.contextKey || null;
        state.filteredRecentTags = action.payload?.filteredRecentTags || [];
      })
      .addCase(fetchGptSuggestions.rejected, (state, action) => {
        state.gptStatus = 'failed';
        state.gptError = (action.payload as string) || action.error.message || null;
        if (action.meta.arg?.contextKey) {
          state.gptContextKey = action.meta.arg.contextKey;
        }
      });
  },
});

export const {
  addSuggestedTag,
  markSuggestionsPending,
  cancelSuggestionsPending,
  restoreSuggestedTag,
  setTagCounts,
  recordSavedTags,
  resetGptSuggestions,
  setRecentTags,
  setFilteredRecentTags,
  removeRecentTag,
} = tagSlice.actions;
export default tagSlice.reducer;
