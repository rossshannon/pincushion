import { vi } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';

import App from '../App';

vi.mock('../redux/bookmarkSlice', async () => {
  const actual = await vi.importActual('../redux/bookmarkSlice');
  return {
    ...actual,
    fetchBookmarkDetails: vi.fn(() => ({ type: 'bookmark/fetchDetails' })),
  };
});

vi.mock('../redux/tagSlice', async () => {
  const actual = await vi.importActual('../redux/tagSlice');
  return {
    ...actual,
    fetchTags: vi.fn(() => ({ type: 'tags/fetchTags' })),
    fetchSuggestedTags: vi.fn(() => ({ type: 'tags/fetchSuggested' })),
  };
});

// Mock the Redux store
const mockStore = configureStore([]);

const seedCredentials = ({
  user = 'testUser',
  token = 'testToken',
  openAiToken = '',
} = {}) => {
  window.localStorage.setItem(
    'pincushion.credentials',
    JSON.stringify({ pinboardUser: user, pinboardToken: token, openAiToken })
  );
};

// Basic test suite for the App component
describe('App Component', () => {
  let store;

  beforeEach(() => {
    // Initialize a fresh store for each test to avoid state leakage
    store = mockStore({
      // Provide initial mock state that App might depend on
      auth: { user: 'testUser', token: 'testToken', openAiToken: '' },
      bookmark: {
        formData: {
          title: '',
          url: '',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: { url: null, title: null, generic: null },
        initialLoading: false,
        existingBookmarkTime: null,
        hasExistingBookmark: false,
        displayOriginalTimestamp: false,
      },
      tags: {
        tagCounts: {},
        suggested: [],
        tagsLoading: false,
        suggestedLoading: false,
        tagTimestamp: null,
        gptSuggestions: [],
        gptStatus: 'idle',
        gptError: null,
        gptContextKey: null,
      },
      twitterCard: {
        card: null,
        status: 'idle',
        error: null,
        lastUrl: null,
      },
      // Add other slices and their initial states if App depends on them
    });
  });

  test('renders main application container without crashing', () => {
    window.history.replaceState({}, '', '/');
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );
    // Check if a known element, like the main div, is present
    const appElement = screen.getByTestId('app-container'); // Changed from getByRole('main')
    expect(appElement).toBeInTheDocument();
  });

  describe('tag cache hydration', () => {
    const baseState = {
      auth: { user: 'testUser', token: 'testToken', openAiToken: '' },
      bookmark: {
        formData: {
          title: '',
          url: '',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: { url: null, title: null, generic: null },
        initialLoading: false,
        existingBookmarkTime: null,
        hasExistingBookmark: false,
        displayOriginalTimestamp: false,
      },
      tags: {
        tagCounts: {},
        suggested: [],
        tagsLoading: false,
        suggestedLoading: false,
        tagTimestamp: null,
        gptSuggestions: [],
        gptStatus: 'idle',
        gptError: null,
        gptContextKey: null,
      },
      twitterCard: {
        card: null,
        status: 'idle',
        error: null,
        lastUrl: null,
      },
    };

    beforeEach(() => {
      vi.useFakeTimers();
      window.localStorage.clear();
    });

    const renderWithSearch = () => {
      const hydratedStore = mockStore(baseState);
      render(
        <Provider store={hydratedStore}>
          <App />
        </Provider>
      );
      return hydratedStore;
    };

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      window.localStorage.clear();
      window.history.replaceState({}, '', '/');
    });

    const seedTagCache = ({ ageMs = 0, user = 'testUser' } = {}) => {
      window.localStorage.setItem('tags', JSON.stringify({ react: 5 }));
      window.localStorage.setItem('tagTimestamp', `${Date.now() - ageMs}`);
      window.localStorage.setItem('tagCacheUser', user);
    };

    const fetchTagActions = (hydratedStore) =>
      hydratedStore
        .getActions()
        .filter((action) => action.type === 'tags/fetchTags');

    test('rehydrates cached tags immediately and does not refetch while the cache is fresh', () => {
      seedCredentials();
      window.history.replaceState({}, '', '/?url=https%3A%2F%2Fexample.com');
      seedTagCache({ ageMs: 5 * 60 * 1000 });

      const hydratedStore = renderWithSearch();

      expect(hydratedStore.getActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'tags/setTagCounts',
            payload: { react: 5 },
          }),
        ])
      );
      expect(fetchTagActions(hydratedStore)).toHaveLength(0);

      act(() => {
        vi.advanceTimersByTime(60 * 1000);
      });
      expect(fetchTagActions(hydratedStore)).toHaveLength(0);
    });

    test('fetches tags immediately when there is no cache at all', () => {
      seedCredentials();
      window.history.replaceState({}, '', '/?url=https%3A%2F%2Fexample.com');

      const hydratedStore = renderWithSearch();
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(fetchTagActions(hydratedStore)).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(60 * 1000);
      });
      expect(fetchTagActions(hydratedStore)).toHaveLength(1);
    });

    test('ignores a cache that belongs to a different Pinboard user', () => {
      seedCredentials();
      window.history.replaceState({}, '', '/?url=https%3A%2F%2Fexample.com');
      seedTagCache({ user: 'someoneElse' });

      const hydratedStore = renderWithSearch();
      expect(
        hydratedStore
          .getActions()
          .filter((action) => action.type === 'tags/setTagCounts')
      ).toHaveLength(0);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(fetchTagActions(hydratedStore)).toHaveLength(1);
    });

    test('refreshes a stale cache in the background, only after the lookups have settled', () => {
      seedCredentials();
      window.history.replaceState({}, '', '/?url=https%3A%2F%2Fexample.com');
      seedTagCache({ ageMs: 2 * 60 * 60 * 1000 });

      // Simulate the bookmark lookup being in flight when the popup opens.
      const loadingStore = mockStore({
        ...baseState,
        bookmark: { ...baseState.bookmark, initialLoading: true },
      });
      render(
        <Provider store={loadingStore}>
          <App />
        </Provider>
      );

      // The cached tags are available straight away...
      expect(loadingStore.getActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tags/setTagCounts' }),
        ])
      );
      // ...but nothing is refetched while the lookup is still running.
      act(() => {
        vi.advanceTimersByTime(30 * 1000);
      });
      expect(fetchTagActions(loadingStore)).toHaveLength(0);
    });

    test('refreshes a stale cache a few seconds after the popup settles', () => {
      seedCredentials();
      window.history.replaceState({}, '', '/?url=https%3A%2F%2Fexample.com');
      seedTagCache({ ageMs: 2 * 60 * 60 * 1000 });

      const hydratedStore = renderWithSearch();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchTagActions(hydratedStore)).toHaveLength(0);

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(fetchTagActions(hydratedStore)).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(60 * 1000);
      });
      expect(fetchTagActions(hydratedStore)).toHaveLength(1);
    });
  });
});
