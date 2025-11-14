import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
jest.mock('openai', () => jest.fn(() => ({
  chat: { completions: { create: jest.fn() } },
})));

import App from '../App';

jest.mock('../redux/bookmarkSlice', () => {
  const actual = jest.requireActual('../redux/bookmarkSlice');
  return {
    ...actual,
    fetchBookmarkDetails: jest.fn(() => ({ type: 'bookmark/fetchDetails' })),
  };
});

jest.mock('../redux/tagSlice', () => {
  const actual = jest.requireActual('../redux/tagSlice');
  return {
    ...actual,
    fetchTags: jest.fn(() => ({ type: 'tags/fetchTags' })),
    fetchSuggestedTags: jest.fn(() => ({ type: 'tags/fetchSuggested' })),
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
    };

    beforeEach(() => {
      jest.useFakeTimers();
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
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      window.localStorage.clear();
      window.history.replaceState({}, '', '/');
    });

    test('rehydrates cached tags immediately when cache is fresh', () => {
      seedCredentials();
      window.history.replaceState(
        {},
        '',
        '/?url=https%3A%2F%2Fexample.com'
      );
      window.localStorage.setItem('tags', JSON.stringify({ react: 5 }));
      window.localStorage.setItem('tagTimestamp', `${Date.now()}`);

      const hydratedStore = renderWithSearch();

      const actions = hydratedStore.getActions();
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'tags/setTagCounts',
            payload: { react: 5 },
          }),
        ])
      );
      expect(
        actions.filter((action) => action.type === 'tags/fetchTags')
      ).toHaveLength(0);

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(
        hydratedStore
          .getActions()
          .filter((action) => action.type === 'tags/fetchTags')
      ).toHaveLength(1);
    });

    test('fetches tags immediately when cache is stale or missing', () => {
      seedCredentials();
      window.history.replaceState(
        {},
        '',
        '/?url=https%3A%2F%2Fexample.com'
      );
      window.localStorage.setItem('tags', JSON.stringify({ react: 2 }));
      window.localStorage.setItem(
        'tagTimestamp',
        `${Date.now() - 30000}`
      );

      const hydratedStore = renderWithSearch();
      const immediateFetches = hydratedStore
        .getActions()
        .filter((action) => action.type === 'tags/fetchTags');
      expect(immediateFetches).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(
        hydratedStore
          .getActions()
          .filter((action) => action.type === 'tags/fetchTags')
      ).toHaveLength(2);
    });
  });
});
