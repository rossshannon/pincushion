import axios from 'axios';
import tagReducer, {
  addSuggestedTag,
  setTagCounts,
  fetchTags,
  fetchSuggestedTags,
  fetchGptSuggestions,
} from '../../redux/tagSlice';
import { configureStore } from '@reduxjs/toolkit';
import { cleanUrl } from '../../utils/url';
import { fetchGptTagSuggestions } from '../../services/gptSuggestions';

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

jest.mock('../../services/gptSuggestions', () => ({
  fetchGptTagSuggestions: jest.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = value.toString();
    },
    clear() {
      store = {};
    },
    removeItem(key) {
      delete store[key];
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock cleanUrl
jest.mock('../../utils/url', () => ({
  cleanUrl: jest.fn((url) => url),
}));

// Helper to create a mock store
const createMockStore = (
  tagState = {},
  bookmarkFormData = { url: 'http://example.com/suggest' },
  authState = { user: 'testUser', token: 'testToken', openAiToken: 'ai-token' }
) => {
  return configureStore({
    reducer: {
      auth: (state = authState) => state,
      tags: tagReducer,
      bookmark: (state = { formData: bookmarkFormData }) => state, // Mock bookmark state for fetchSuggestedTags
    },
    preloadedState: {
      tags: tagState,
      auth: authState,
      bookmark: { formData: bookmarkFormData },
    },
  });
};

describe('tag slice', () => {
  const initialState = {
    tagCounts: {},
    suggested: [],
    suggestedLoading: false,
    gptSuggestions: [],
    gptStatus: 'idle',
    gptError: null,
    gptContextKey: null,
    error: null,
  };

  beforeEach(() => {
    // Clear mocks before each test
    localStorageMock.clear();
    mockedAxios.get.mockClear();
    jest.clearAllMocks(); // Clears all mocks including cleanUrl
    fetchGptTagSuggestions.mockReset();
  });

  it('should handle initial state', () => {
    expect(tagReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  // --- Regular Reducers ---\
  describe('reducers', () => {
    it('should handle addSuggestedTag', () => {
      const stateWithSuggestions = {
        ...initialState,
        suggested: ['a', 'b', 'c'],
        gptSuggestions: ['ai_a', 'ai_b'],
      };
      const state = tagReducer(stateWithSuggestions, addSuggestedTag('b'));
      expect(state.suggested).toEqual(['a', 'c']);
      expect(state.gptSuggestions).toEqual(['ai_a', 'ai_b']);

      const stateAfterAi = tagReducer(state, addSuggestedTag('ai_a'));
      expect(stateAfterAi.gptSuggestions).toEqual(['ai_b']);
    });

    it('should handle setTagCounts', () => {
      const tagsData = { tag1: 10, tag2: 5 };
      const state = tagReducer(initialState, setTagCounts(tagsData));
      expect(state.tagCounts).toEqual(tagsData);
    });

    it('should handle setTagCounts with non-object payload', () => {
      const state = tagReducer(initialState, setTagCounts(null));
      expect(state.tagCounts).toEqual({});
      const state2 = tagReducer(initialState, setTagCounts(undefined));
      expect(state2.tagCounts).toEqual({});
      const state3 = tagReducer(initialState, setTagCounts('string'));
      expect(state3.tagCounts).toEqual({});
    });
  });

  // --- Async Thunks ---\
  describe('async thunks', () => {
    // --- fetchTags ---\
    describe('fetchTags', () => {
      const store = createMockStore();
      const expectedApiUrl =
        'https://pinboard-api.herokuapp.com/tags/get?format=json&auth_token=testUser:testToken';

      it('should handle fulfilled state and update localStorage', async () => {
        const mockTagData = { tagA: 5, tagB: 2 };
        mockedAxios.get.mockResolvedValueOnce({ data: mockTagData });

        await store.dispatch(fetchTags());
        const state = store.getState().tags;

        expect(state.tagCounts).toEqual(mockTagData);
        expect(state.error).toBeNull();
        expect(mockedAxios.get).toHaveBeenCalledWith(expectedApiUrl);

        // Check localStorage
        expect(localStorageMock.getItem('tags')).toEqual(
          JSON.stringify(mockTagData)
        );
        expect(localStorageMock.getItem('tagTimestamp')).not.toBeNull();
      });

      it('should handle fulfilled state with empty data', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: null }); // API returns null
        await store.dispatch(fetchTags());
        const state = store.getState().tags;
        expect(state.tagCounts).toEqual({}); // Should default to empty object
        expect(state.error).toBeNull();
        expect(localStorageMock.getItem('tags')).toEqual('{}');
      });

      it('should handle rejected state', async () => {
        const errorMessage = 'Failed to fetch tags';
        mockedAxios.get.mockRejectedValueOnce(new Error(errorMessage));

        await store.dispatch(fetchTags());
        const state = store.getState().tags;

        expect(state.tagCounts).toEqual({}); // Should not change tagCounts on error
        expect(state.error).toEqual(errorMessage);
        expect(localStorageMock.getItem('tags')).toBeNull(); // Should not update localStorage on error
      });
    });

    // --- fetchSuggestedTags ---\
    describe('fetchSuggestedTags', () => {
      const bookmarkUrl = 'http://suggest.me';
      const store = createMockStore(initialState, { url: bookmarkUrl });
      const expectedApiUrl = `https://pinboard-api.herokuapp.com/posts/suggest?format=json&auth_token=testUser:testToken&url=${bookmarkUrl}`;

      it('should handle pending state', () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [] }); // Mock response needed

        // Dispatch the thunk but DON'T await it yet
        const thunkPromise = store.dispatch(fetchSuggestedTags());

        // Check the state immediately after dispatch for pending status
        const pendingState = store.getState().tags;
        expect(pendingState.suggestedLoading).toBe(true);
        expect(pendingState.error).toBeNull();

        // Now we can optionally await the promise if we need to ensure it finishes
        // for cleanup or subsequent checks, though not strictly needed for this test.
        // return thunkPromise;
      });

      it('should handle fulfilled state with recommended and popular tags', async () => {
        const mockResponse = [
          { popular: ['Pop1', 'Common'] },
          { recommended: ['Rec1', 'COMMON'] }, // Test deduplication and lowercasing
        ];
        mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

        await store.dispatch(fetchSuggestedTags());
        const state = store.getState().tags;

        expect(state.suggestedLoading).toBe(false);
        expect(state.suggested).toEqual(['rec1', 'common', 'pop1']); // Order might vary based on slice logic, adjust if needed
        expect(state.error).toBeNull();
        expect(mockedAxios.get).toHaveBeenCalledWith(expectedApiUrl);
        expect(cleanUrl).toHaveBeenCalledWith(bookmarkUrl);
      });

      it('should handle fulfilled state with only one type of tag', async () => {
        const mockResponse = [{ popular: ['PopOnly'] }];
        mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

        await store.dispatch(fetchSuggestedTags());
        const state = store.getState().tags;

        expect(state.suggestedLoading).toBe(false);
        expect(state.suggested).toEqual(['poponly']);
      });

      it('should handle fulfilled state with empty/no tags', async () => {
        const mockResponse = []; // Empty array
        mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

        await store.dispatch(fetchSuggestedTags());
        const state = store.getState().tags;

        expect(state.suggestedLoading).toBe(false);
        expect(state.suggested).toEqual([]);
      });

      it('should handle rejected state', async () => {
        const errorMessage = 'Failed to fetch suggestions';
        mockedAxios.get.mockRejectedValueOnce(new Error(errorMessage));

        await store.dispatch(fetchSuggestedTags());
        const state = store.getState().tags;

        expect(state.suggestedLoading).toBe(false);
        expect(state.suggested).toEqual([]); // Should reset or keep previous suggestions?\ Slice resets.
        expect(state.error).toEqual(errorMessage);
      });
    });

    describe('fetchGptSuggestions', () => {
      it('stores GPT tags and context key while skipping duplicates', async () => {
        fetchGptTagSuggestions.mockResolvedValueOnce(['foo', 'bar', 'baz']);

        const bookmarkFormData = {
          url: 'https://example.com',
          title: 'Example',
          description: 'A description',
          tags: ['foo'],
        };

        const store = createMockStore(
          { ...initialState, suggested: ['baz'] },
          bookmarkFormData
        );

        await store.dispatch(fetchGptSuggestions({ contextKey: 'ctx-1' }));
        const state = store.getState().tags;

        expect(state.gptStatus).toEqual('succeeded');
        expect(state.gptSuggestions).toEqual(['bar']);
        expect(state.gptContextKey).toEqual('ctx-1');
        expect(fetchGptTagSuggestions).toHaveBeenCalledTimes(1);
      });

      it('skips calling OpenAI when no token available', async () => {
        const store = createMockStore(
          initialState,
          { url: 'https://example.com' },
          { user: 'testUser', token: 'testToken', openAiToken: '' }
        );

        await store.dispatch(fetchGptSuggestions({ contextKey: 'ctx-2' }));
        const state = store.getState().tags;
        expect(state.gptSuggestions).toEqual([]);
        expect(state.gptContextKey).toEqual('ctx-2');
        expect(fetchGptTagSuggestions).not.toHaveBeenCalled();
      });

      it('sets error state when GPT request fails', async () => {
        fetchGptTagSuggestions.mockRejectedValueOnce(new Error('boom'));
        const store = createMockStore(initialState, {
          url: 'https://example.com',
          title: 'Title',
          description: 'Desc',
          tags: [],
        });

        await store.dispatch(fetchGptSuggestions({ contextKey: 'ctx-err' }));
        const state = store.getState().tags;
        expect(state.gptStatus).toEqual('failed');
        expect(state.gptError).toEqual('boom');
        expect(state.gptSuggestions).toEqual([]);
        expect(state.gptContextKey).toBeNull();
      });

      it('handles empty GPT responses gracefully', async () => {
        fetchGptTagSuggestions.mockResolvedValueOnce([]);
        const store = createMockStore(initialState, {
          url: 'https://example.com',
          title: 'Title',
          description: 'Desc',
          tags: ['foo'],
        });

        await store.dispatch(fetchGptSuggestions({ contextKey: 'ctx-empty' }));
        const state = store.getState().tags;
        expect(state.gptStatus).toEqual('succeeded');
        expect(state.gptSuggestions).toEqual([]);
        expect(state.gptContextKey).toEqual('ctx-empty');
      });
    });
  });
});
