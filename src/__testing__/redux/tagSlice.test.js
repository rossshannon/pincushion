import axios from 'axios';
import tagReducer, {
  addSuggestedTag,
  setTagCounts,
  fetchTags,
  fetchSuggestedTags,
} from '../../redux/tagSlice';
import { configureStore } from '@reduxjs/toolkit';
import { cleanUrl } from '../../utils/url';

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

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
  bookmarkUrl = 'http://example.com/suggest'
) => {
  return configureStore({
    reducer: {
      auth: (state = { user: 'testUser', token: 'testToken' }) => state,
      tags: tagReducer,
      bookmark: (state = { formData: { url: bookmarkUrl } }) => state, // Mock bookmark state for fetchSuggestedTags
    },
    preloadedState: {
      tags: tagState,
      auth: { user: 'testUser', token: 'testToken' },
      bookmark: { formData: { url: bookmarkUrl } },
    },
  });
};

describe('tag slice', () => {
  const initialState = {
    tagCounts: {},
    suggested: [],
    suggestedLoading: false,
    error: null,
  };

  beforeEach(() => {
    // Clear mocks before each test
    localStorageMock.clear();
    mockedAxios.get.mockClear();
    jest.clearAllMocks(); // Clears all mocks including cleanUrl
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
      };
      const state = tagReducer(stateWithSuggestions, addSuggestedTag('b'));
      expect(state.suggested).toEqual(['a', 'c']);
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
      const store = createMockStore(initialState, bookmarkUrl);
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
  });
});
