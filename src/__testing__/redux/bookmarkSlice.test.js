import axios from 'axios';
import bookmarkReducer, {
  setFormData,
  resetStatus,
  submitBookmark,
  fetchBookmarkDetails,
} from '../../redux/bookmarkSlice';
import { configureStore } from '@reduxjs/toolkit'; // Needed for thunk testing

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Define initialState BEFORE createMockStore uses it
const initialState = {
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
  lastFetchRequestId: null,
  lastFetchTargetUrl: null,
  initialLoading: false,
  existingBookmarkTime: null,
  hasExistingBookmark: false,
  displayOriginalTimestamp: false,
};

// Helper to create a mock store
const createMockStore = (bookmarkState = initialState) => {
  return configureStore({
    reducer: {
      auth: (state = { user: 'testUser', token: 'testToken' }) => state,
      bookmark: bookmarkReducer,
    },
    preloadedState: {
      bookmark: { ...initialState, ...bookmarkState },
      auth: { user: 'testUser', token: 'testToken' },
    },
  });
};

describe('bookmark slice', () => {
  it('should handle initial state', () => {
    expect(bookmarkReducer(undefined, { type: 'unknown' })).toEqual(
      initialState
    );
  });

  // --- Regular Reducers ---
  describe('reducers', () => {
    it('should handle setFormData', () => {
      const state = bookmarkReducer(
        initialState,
        setFormData({ title: 'Test Title' })
      );
      expect(state.formData.title).toEqual('Test Title');
      // Test error clearing
      const errorState = {
        ...initialState,
        errors: { ...initialState.errors, title: 'Error!' },
      };
      const clearedState = bookmarkReducer(
        errorState,
        setFormData({ title: 'New Title' })
      );
      expect(clearedState.errors.title).toBeNull();
    });

    it('clears multiple field errors when payload updates several fields', () => {
      const errorState = {
        ...initialState,
        errors: {
          ...initialState.errors,
          title: 'Title missing',
          url: 'URL missing',
        },
      };
      const clearedState = bookmarkReducer(
        errorState,
        setFormData({ title: 'Provided', url: 'https://example.com' })
      );
      expect(clearedState.errors.title).toBeNull();
      expect(clearedState.errors.url).toBeNull();
    });

    it('should handle resetStatus', () => {
      const errorState = {
        ...initialState,
        status: 'error',
        errors: { generic: 'Some error' },
      };
      const state = bookmarkReducer(errorState, resetStatus());
      expect(state.status).toEqual('idle');
      expect(state.errors).toEqual({
        url: null,
        title: null,
        generic: null,
        description: null, // Ensure this matches the expected reset state
      });
    });
  });

  // --- Async Thunks ---
  describe('async thunks', () => {
    let store;
    beforeEach(() => {
      store = createMockStore(); // Now defaults to using full initialState
      mockedAxios.get.mockClear();
    });

    // --- fetchBookmarkDetails ---
    describe('fetchBookmarkDetails', () => {
      const urlToFetch = 'http://example.com/fetch';
      const expectedApiUrl = `https://pinboard-api.herokuapp.com/v1/posts/get?format=json&url=${encodeURIComponent(
        urlToFetch
      )}`;

      beforeEach(() => {
        // Store is already created with initialState, just set the specific URL
        store.dispatch(setFormData({ url: urlToFetch }));
      });

      it('should handle pending state', () => {
        // <--- FIX: Remove async, check immediately
        mockedAxios.get.mockResolvedValueOnce({ data: { posts: [] } });
        store.dispatch(fetchBookmarkDetails()); // Dispatch without await
        const state = store.getState().bookmark; // Check immediately
        expect(state.initialLoading).toBe(true);
        expect(state.existingBookmarkTime).toBeNull();
        expect(state.hasExistingBookmark).toBe(false);
      });

      it('should handle fulfilled state (bookmark found)', async () => {
        const mockPost = {
          href: 'http://example.com/fetch',
          description: 'Fetched Title',
          extended: 'Fetched Desc',
          tags: 'fetched tag1 tag2',
          shared: 'no',
          toread: 'yes',
          time: '2023-01-01T12:00:00Z',
        };
        mockedAxios.get.mockResolvedValueOnce({ data: { posts: [mockPost] } });
        await store.dispatch(fetchBookmarkDetails());
        const state = store.getState().bookmark;
        expect(state.initialLoading).toBe(false);
        expect(state.formData.title).toEqual(mockPost.description);
        expect(state.formData.description).toEqual(mockPost.extended);
        expect(state.formData.tags).toEqual(['fetched', 'tag1', 'tag2']);
        expect(state.formData.private).toBe(true);
        expect(state.formData.toread).toBe(true);
        expect(state.existingBookmarkTime).toEqual(mockPost.time);
        expect(state.hasExistingBookmark).toBe(true);
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expectedApiUrl,
          expect.objectContaining({
            headers: { Authorization: 'Bearer testUser:testToken' },
          })
        );
      });

      it('should handle fulfilled state (bookmark not found)', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: { posts: [] } });
        await store.dispatch(fetchBookmarkDetails());
        const state = store.getState().bookmark;
        expect(state.initialLoading).toBe(false);
        expect(state.formData.title).toEqual('');
        expect(state.existingBookmarkTime).toBeNull();
        expect(state.hasExistingBookmark).toBe(false);
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expectedApiUrl,
          expect.objectContaining({
            headers: { Authorization: 'Bearer testUser:testToken' },
          })
        );
      });

      it('allows overriding the lookup URL', async () => {
        const overrideUrl = 'http://override.test';
        mockedAxios.get.mockResolvedValueOnce({ data: { posts: [] } });
        await store.dispatch(fetchBookmarkDetails(overrideUrl));
        expect(mockedAxios.get).toHaveBeenCalledWith(
          `https://pinboard-api.herokuapp.com/v1/posts/get?format=json&url=${encodeURIComponent(
            overrideUrl
          )}`,
          expect.objectContaining({
            headers: { Authorization: 'Bearer testUser:testToken' },
          })
        );
      });

      it('should handle rejected state', async () => {
        const errorMessage = 'Network Error';
        mockedAxios.get.mockRejectedValueOnce(new Error(errorMessage));
        await store.dispatch(fetchBookmarkDetails());
        const state = store.getState().bookmark;
        expect(state.initialLoading).toBe(false);
        expect(state.hasExistingBookmark).toBe(false);
        expect(state.errors.generic).toEqual(errorMessage);
      });

      it('surfaces friendly message for HTTP 414 errors', async () => {
        const error = new Error('Request failed with status code 414');
        error.response = { status: 414 };
        mockedAxios.get.mockRejectedValueOnce(error);
        await store.dispatch(fetchBookmarkDetails());
        const state = store.getState().bookmark;
        expect(state.errors.generic).toContain('URL is too long');
      });
    });

    // --- submitBookmark ---
    describe('submitBookmark', () => {
      const validFormData = {
        url: 'http://example.com/submit',
        title: 'Submit Title',
        description: 'Submit Desc',
        tags: ['submit', 'tag'],
        private: true,
        toread: false,
      };
      const expectedParams =
        'format=json&url=http%3A%2F%2Fexample.com%2Fsubmit&description=Submit+Title&extended=Submit+Desc&shared=no&tags=submit+tag';

      beforeEach(() => {
        store.dispatch(setFormData(validFormData));
      });

      it('should handle pending state', () => {
        // <--- FIX: Remove async, check immediately
        mockedAxios.get.mockResolvedValueOnce({
          data: { result_code: 'done' },
        });
        store.dispatch(submitBookmark()); // Dispatch without await
        const state = store.getState().bookmark; // Check immediately
        expect(state.status).toEqual('saving');
        expect(state.errors).toEqual({
          url: null,
          title: null,
          description: null,
          generic: null,
        });
      });

      it('should handle fulfilled state', async () => {
        const successData = { result_code: 'done' };
        mockedAxios.get.mockResolvedValueOnce({ data: successData });
        await store.dispatch(submitBookmark());
        const state = store.getState().bookmark;
        expect(state.status).toEqual('success');
        expect(state.data).toEqual(successData);
        expect(state.hasExistingBookmark).toBe(true);
        expect(state.errors).toEqual({
          url: null,
          title: null,
          description: null,
          generic: null,
        });
        expect(mockedAxios.get).toHaveBeenCalledWith(
          `https://pinboard-api.herokuapp.com/v1/posts/add?${expectedParams}`,
          expect.objectContaining({
            headers: { Authorization: 'Bearer testUser:testToken' },
          })
        );
      });

      it('should handle rejected state (client validation error - missing URL)', async () => {
        const invalidData = { ...validFormData, url: '' };
        const testStore = createMockStore({
          ...initialState,
          formData: invalidData,
        });
        await testStore.dispatch(submitBookmark());
        const state = testStore.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.url).toEqual('URL is required.');
        expect(state.errors.title).toBeNull();
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });

      it('should handle rejected state (client validation error - missing Title)', async () => {
        const invalidData = { ...validFormData, title: '' };
        const testStore = createMockStore({
          ...initialState,
          formData: invalidData,
        });
        await testStore.dispatch(submitBookmark());
        const state = testStore.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.title).toEqual('Title is required.');
        expect(state.errors.url).toBeNull();
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });

      it('should handle rejected state (API error - specific code)', async () => {
        const apiErrorData = { result_code: 'item already exists' };
        mockedAxios.get.mockResolvedValueOnce({ data: apiErrorData });
        await store.dispatch(submitBookmark());
        const state = store.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.generic).toEqual('item already exists');
      });

      it('validates description length client-side', async () => {
        const overlyLong = 'a'.repeat(70000);
        const longFormState = createMockStore({
          ...initialState,
          formData: { ...validFormData, description: overlyLong },
        });
        await longFormState.dispatch(submitBookmark());
        const state = longFormState.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.description).toMatch(/65,535/);
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });

      it('should handle rejected state (API error - missing url code)', async () => {
        const apiErrorData = { result_code: 'missing url' };
        mockedAxios.get.mockResolvedValueOnce({ data: apiErrorData });
        await store.dispatch(submitBookmark());
        const state = store.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.url).toEqual('URL is required.');
      });

      it('should handle rejected state (API error - must provide title code)', async () => {
        const apiErrorData = { result_code: 'must provide title' };
        mockedAxios.get.mockResolvedValueOnce({ data: apiErrorData });
        await store.dispatch(submitBookmark());
        const state = store.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.title).toEqual('Title is required.');
      });

      it('should handle rejected state (HTTP 414 error)', async () => {
        const error = new Error('Request failed with status code 414');
        error.response = { status: 414 };
        mockedAxios.get.mockRejectedValueOnce(error);
        await store.dispatch(submitBookmark());
        const state = store.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.url).toEqual('URL is too long.');
        expect(state.errors.generic).toContain('URL is too long');
      });

      it('should handle rejected state (generic network error)', async () => {
        const errorMessage = 'Network Error';
        mockedAxios.get.mockRejectedValueOnce(new Error(errorMessage));
        await store.dispatch(submitBookmark());
        const state = store.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.generic).toEqual(errorMessage);
      });
    });
  });
});
