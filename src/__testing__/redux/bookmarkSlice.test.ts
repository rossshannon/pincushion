import { vi } from 'vitest';
import axios from 'axios';
import bookmarkReducer, {
  setFormData,
  applyTrackingStrip,
  removeUrlFragment,
  toggleTrackingStrip,
  resetStatus,
  submitBookmark,
  fetchBookmarkDetails,
  checkTrackedBookmark,
} from '../../redux/bookmarkSlice';
import { configureStore } from '@reduxjs/toolkit'; // Needed for thunk testing

// Mock axios
vi.mock('axios');
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
  existingBookmarkTags: [],
  trackingStrip: null,
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

      it('sends the lookup with a timeout and tells the user they can still save on timeout', async () => {
        const timeoutError = Object.assign(new Error('timeout of 20000ms exceeded'), {
          code: 'ECONNABORTED',
        });
        mockedAxios.get.mockRejectedValueOnce(timeoutError);
        await store.dispatch(fetchBookmarkDetails());
        const state = store.getState().bookmark;
        expect(state.initialLoading).toBe(false);
        expect(state.errors.generic).toMatch(/You can still save/);
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ timeout: 20000 })
        );
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

      it('folds the saved tags into the tag cache and store on success', async () => {
        window.localStorage.setItem('tags', JSON.stringify({ submit: 1 }));
        window.localStorage.setItem('tagTimestamp', `${Date.now()}`);
        window.localStorage.setItem('tagCacheUser', 'testUser');
        mockedAxios.get.mockResolvedValueOnce({ data: { result_code: 'done' } });

        // Record every tags/* action the thunk dispatches.
        const recordingStore = configureStore({
          reducer: {
            auth: (state = { user: 'testUser', token: 'testToken' }) => state,
            bookmark: bookmarkReducer,
            tags: (state = [], action) =>
              action.type.startsWith('tags/') ? [...state, action] : state,
          },
          preloadedState: {
            bookmark: { ...initialState, formData: validFormData },
            auth: { user: 'testUser', token: 'testToken' },
            tags: [],
          },
        });
        await recordingStore.dispatch(submitBookmark());

        expect(recordingStore.getState().tags).toEqual([
          expect.objectContaining({
            type: 'tags/recordSavedTags',
            payload: { added: ['submit', 'tag'], removed: [] },
          }),
        ]);
        expect(JSON.parse(window.localStorage.getItem('tags'))).toEqual({
          submit: 2,
          tag: 1,
        });
        expect(recordingStore.getState().bookmark.existingBookmarkTags).toEqual([
          'submit',
          'tag',
        ]);
        window.localStorage.clear();
      });

      it('applies only the tag delta when updating an existing bookmark', async () => {
        window.localStorage.setItem('tags', JSON.stringify({ submit: 4, old: 1 }));
        window.localStorage.setItem('tagTimestamp', `${Date.now()}`);
        window.localStorage.setItem('tagCacheUser', 'testUser');
        mockedAxios.get.mockResolvedValueOnce({ data: { result_code: 'done' } });

        const recordingStore = configureStore({
          reducer: {
            auth: (state = { user: 'testUser', token: 'testToken' }) => state,
            bookmark: bookmarkReducer,
            tags: (state = [], action) =>
              action.type.startsWith('tags/') ? [...state, action] : state,
          },
          preloadedState: {
            // The bookmark was loaded with tags ['submit', 'old']; the user
            // removed 'old' and added 'tag', keeping 'submit'.
            bookmark: {
              ...initialState,
              formData: validFormData,
              hasExistingBookmark: true,
              existingBookmarkTags: ['submit', 'old'],
            },
            auth: { user: 'testUser', token: 'testToken' },
            tags: [],
          },
        });
        await recordingStore.dispatch(submitBookmark());

        expect(recordingStore.getState().tags).toEqual([
          expect.objectContaining({
            type: 'tags/recordSavedTags',
            payload: { added: ['tag'], removed: ['old'] },
          }),
        ]);
        // 'submit' is unchanged, 'old' hit zero and vanished, 'tag' is new.
        expect(JSON.parse(window.localStorage.getItem('tags'))).toEqual({
          submit: 4,
          tag: 1,
        });
        window.localStorage.clear();
      });

      it('leaves the tag counts alone when re-saving an unchanged bookmark', async () => {
        window.localStorage.setItem('tags', JSON.stringify({ submit: 4, tag: 2 }));
        window.localStorage.setItem('tagTimestamp', `${Date.now()}`);
        window.localStorage.setItem('tagCacheUser', 'testUser');
        mockedAxios.get.mockResolvedValueOnce({ data: { result_code: 'done' } });

        const recordingStore = configureStore({
          reducer: {
            auth: (state = { user: 'testUser', token: 'testToken' }) => state,
            bookmark: bookmarkReducer,
            tags: (state = [], action) =>
              action.type.startsWith('tags/') ? [...state, action] : state,
          },
          preloadedState: {
            bookmark: {
              ...initialState,
              formData: validFormData,
              hasExistingBookmark: true,
              existingBookmarkTags: ['tag', 'submit'],
            },
            auth: { user: 'testUser', token: 'testToken' },
            tags: [],
          },
        });
        await recordingStore.dispatch(submitBookmark());

        expect(recordingStore.getState().tags).toEqual([]);
        expect(JSON.parse(window.localStorage.getItem('tags'))).toEqual({
          submit: 4,
          tag: 2,
        });
        window.localStorage.clear();
      });

      it('sends the save with a timeout and explains a timeout in plain words', async () => {
        const timeoutError = Object.assign(new Error('timeout of 30000ms exceeded'), {
          code: 'ECONNABORTED',
        });
        mockedAxios.get.mockRejectedValueOnce(timeoutError);
        await store.dispatch(submitBookmark());
        const state = store.getState().bookmark;
        expect(state.status).toEqual('error');
        expect(state.errors.generic).toMatch(/didn’t respond in time/);
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ timeout: 30000 })
        );
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

describe('tracking parameter stripping', () => {
  const tracked = 'https://example.com/post?id=7&utm_source=news#top';
  const clean = 'https://example.com/post?id=7#top';
  const strip = { original: tracked, stripped: clean, removed: ['utm_source'] };

  const loaded = () =>
    bookmarkReducer(
      bookmarkReducer(initialState, setFormData({ url: tracked })),
      applyTrackingStrip(strip)
    );

  it('strips the URL and remembers what it removed', () => {
    const state = loaded();
    expect(state.formData.url).toBe(clean);
    expect(state.trackingStrip).toEqual({
      ...strip,
      restored: false,
      checkedOriginal: false,
      savedWithTracking: false,
    });
  });

  it('does nothing when nothing was removed', () => {
    const url = 'https://example.com/?id=7';
    const before = bookmarkReducer(initialState, setFormData({ url }));
    const after = bookmarkReducer(
      before,
      applyTrackingStrip({ original: url, stripped: url, removed: [] })
    );
    expect(after.formData.url).toBe(url);
    expect(after.trackingStrip).toBeNull();
  });

  it('toggles between the original and stripped URL', () => {
    const restored = bookmarkReducer(loaded(), toggleTrackingStrip());
    expect(restored.formData.url).toBe(tracked);
    expect(restored.trackingStrip?.restored).toBe(true);

    const reStripped = bookmarkReducer(restored, toggleTrackingStrip());
    expect(reStripped.formData.url).toBe(clean);
    expect(reStripped.trackingStrip?.restored).toBe(false);
  });

  it('forgets the strip once the user edits the URL', () => {
    const edited = bookmarkReducer(
      loaded(),
      setFormData({ url: 'https://example.com/other' })
    );
    expect(edited.trackingStrip).toBeNull();
  });

  it('keeps the strip when other fields change', () => {
    const edited = bookmarkReducer(loaded(), setFormData({ title: 'New' }));
    expect(edited.trackingStrip?.removed).toEqual(['utm_source']);
  });

  it('drops the fragment from both URLs when # is pressed, keeping undo', () => {
    const state = bookmarkReducer(loaded(), removeUrlFragment());
    expect(state.formData.url).toBe('https://example.com/post?id=7');
    const restored = bookmarkReducer(state, toggleTrackingStrip());
    expect(restored.formData.url).toBe(
      'https://example.com/post?id=7&utm_source=news'
    );
  });

  it('drops the fragment when nothing was stripped', () => {
    const state = bookmarkReducer(
      bookmarkReducer(initialState, setFormData({ url: 'https://a.com/#x' })),
      removeUrlFragment()
    );
    expect(state.formData.url).toBe('https://a.com/');
    expect(state.trackingStrip).toBeNull();
  });

  describe('checking for a bookmark under the tracked URL', () => {
    beforeEach(() => {
      mockedAxios.get.mockReset();
    });

    const storeWithStrip = () => {
      const store = createMockStore();
      store.dispatch(setFormData({ url: tracked }));
      store.dispatch(applyTrackingStrip(strip));
      return store;
    };

    it('flags the strip when the tracked URL was bookmarked', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { posts: [{ href: tracked, description: 'Old' }] },
      });
      const store = storeWithStrip();
      await store.dispatch(checkTrackedBookmark());

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get.mock.calls[0][0]).toContain('utm_source');
      const state = store.getState().bookmark;
      // The form doesn't change on its own: the user picks.
      expect(state.formData.url).toBe(clean);
      expect(state.trackingStrip).toMatchObject({
        checkedOriginal: true,
        savedWithTracking: true,
        restored: false,
      });

      // "Use that" puts the tracked URL back.
      store.dispatch(toggleTrackingStrip());
      expect(store.getState().bookmark.formData.url).toBe(tracked);
    });

    it('leaves the flag off when it was not', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { posts: [] } });
      const store = storeWithStrip();
      await store.dispatch(checkTrackedBookmark());
      expect(store.getState().bookmark.trackingStrip).toMatchObject({
        checkedOriginal: true,
        savedWithTracking: false,
      });
    });

    it('treats a failed check as "not bookmarked", with no error shown', async () => {
      mockedAxios.get.mockRejectedValueOnce(
        Object.assign(new Error('Too long'), { response: { status: 414 } })
      );
      const store = storeWithStrip();
      await store.dispatch(checkTrackedBookmark());
      const state = store.getState().bookmark;
      expect(state.errors).toEqual(initialState.errors);
      expect(state.trackingStrip?.savedWithTracking).toBe(false);
    });

    it('drops the result if the user edited the URL meanwhile', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { posts: [{ href: tracked }] },
      });
      const store = storeWithStrip();
      const check = store.dispatch(checkTrackedBookmark());
      store.dispatch(setFormData({ url: 'https://typed.com/' }));
      await check;
      expect(store.getState().bookmark.trackingStrip).toBeNull();
    });

    it("keeps the toggle in step with Pinboard's stored href", async () => {
      const storedHref = 'https://example.com/post?id=7';
      mockedAxios.get.mockResolvedValueOnce({
        data: { posts: [{ href: storedHref, description: 'Clean' }] },
      });
      const store = storeWithStrip();
      await store.dispatch(fetchBookmarkDetails(clean));
      store.dispatch(toggleTrackingStrip());
      store.dispatch(toggleTrackingStrip());
      expect(store.getState().bookmark.formData.url).toBe(storedHref);
    });
  });

  it('ignores a strip computed for a URL the form no longer has', () => {
    const state = bookmarkReducer(
      bookmarkReducer(initialState, setFormData({ url: 'https://typed.com/' })),
      applyTrackingStrip(strip)
    );
    expect(state.formData.url).toBe('https://typed.com/');
    expect(state.trackingStrip).toBeNull();
  });
});
