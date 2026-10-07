/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { vi } from 'vitest';

vi.mock('./redux/tagSlice', async () => {
  const actual = await vi.importActual('./redux/tagSlice');
  const defaultSuggestedThunk = () => (dispatch) => {
    dispatch({ type: 'tags/fetchSuggested/pending' });
    dispatch({
      type: 'tags/fetchSuggested/fulfilled',
      payload: {
        suggestions: [],
        preview: null,
        previewError: null,
        targetUrl: null,
      },
    });
  };
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    fetchTags: vi.fn(() => () => undefined),
    fetchSuggestedTags: vi.fn(defaultSuggestedThunk),
    fetchGptSuggestions: vi.fn((payload) => (dispatch) => {
      dispatch({
        type: 'tags/fetchGptSuggestions/fulfilled',
        payload: { suggestions: [], contextKey: payload.contextKey },
      });
    }),
  };
});

vi.mock('./redux/bookmarkSlice', async () => {
  const actual = await vi.importActual('./redux/bookmarkSlice');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    fetchBookmarkDetails: vi.fn(() => () => undefined),
  };
});

import React from 'react';
import { render, waitFor, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import App from './App';
import authReducer from './redux/authSlice';
import bookmarkReducer, { setFormData, fetchBookmarkDetails } from './redux/bookmarkSlice';
import tagReducer from './redux/tagSlice';
import twitterCardReducer from './redux/twitterCardSlice';
import { fetchGptSuggestions, fetchSuggestedTags } from './redux/tagSlice';
import { setAuth } from './redux/authSlice';
import { persistStoredCredentials } from './utils/credentialStorage';

const fetchGptSuggestionsMock = fetchGptSuggestions as vi.MockedFunction<
  typeof fetchGptSuggestions
>;
const fetchSuggestedTagsMock = fetchSuggestedTags as vi.MockedFunction<
  typeof fetchSuggestedTags
>;
const fetchBookmarkDetailsMock = fetchBookmarkDetails as vi.MockedFunction<
  typeof fetchBookmarkDetails
>;

const renderWithStore = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      bookmark: bookmarkReducer,
      tags: tagReducer,
      twitterCard: twitterCardReducer,
    },
  });

  const view = render(
    <Provider store={store}>
      <App />
    </Provider>
  );

  return { store, ...view };
};

const pushSearch = (query) => {
  window.history.pushState({}, '', query);
};

const seedCredentials = ({
  pinboardUser = 'test',
  pinboardToken = 'abc',
  openAiToken = 'sk-123',
} = {}) => {
  persistStoredCredentials({ pinboardUser, pinboardToken, openAiToken });
};

const waitForStableCalls = async () => {
  let previousCount = fetchGptSuggestionsMock.mock.calls.length;
  // Wait for two animation frames until the call count stops changing.
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const current = fetchGptSuggestionsMock.mock.calls.length;
    if (current === previousCount) {
      return;
    }
    previousCount = current;
  }
};

const resolvePinboardSuggestions = (store, payload = []) => {
  act(() => {
    store.dispatch({
      type: 'tags/fetchSuggested/fulfilled',
      payload: {
        suggestions: payload,
        preview: null,
        previewError: null,
        targetUrl: null,
      },
    });
  });
};

describe('App GPT integration', () => {
  beforeEach(() => {
    fetchGptSuggestionsMock.mockClear();
    fetchBookmarkDetailsMock.mockClear();
    fetchSuggestedTagsMock.mockClear();
    if (window.localStorage) {
      window.localStorage.clear();
    }
    fetchSuggestedTagsMock.mockImplementation(() => (dispatch) => {
      dispatch({ type: 'tags/fetchSuggested/pending' });
      dispatch({
        type: 'tags/fetchSuggested/fulfilled',
        payload: [],
      });
    });
  });

  it('dispatches GPT suggestions only once despite tag edits', async () => {
    seedCredentials();
    pushSearch(
      '?url=https%3A%2F%2Fexample.com&title=Example&description=Desc'
    );

    const { store } = renderWithStore();
    resolvePinboardSuggestions(store);
    await waitFor(() => {
      expect(store.getState().auth.openAiToken).toBe('sk-123');
      expect(store.getState().tags.suggestedStatus).toBe('succeeded');
    });

    await waitFor(() => {
      expect(fetchGptSuggestionsMock).toHaveBeenCalled();
    });
    await waitForStableCalls();
    const initialCalls = fetchGptSuggestionsMock.mock.calls.length;

    act(() => {
      store.dispatch(setFormData({ tags: ['foo'] }));
    });

    await waitForStableCalls();
    expect(fetchGptSuggestionsMock.mock.calls.length).toBe(initialCalls);
  });

  it('skips GPT dispatch when no token provided', async () => {
    seedCredentials({ openAiToken: '' });
    pushSearch('?url=https%3A%2F%2Fexample.com');
    const { store } = renderWithStore();
    resolvePinboardSuggestions(store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchGptSuggestionsMock).not.toHaveBeenCalled();
  });

  it('still dispatches GPT when Pinboard suggestions are plentiful', async () => {
    fetchSuggestedTagsMock.mockImplementationOnce(() => (dispatch) => {
      dispatch({ type: 'tags/fetchSuggested/pending' });
      dispatch({
        type: 'tags/fetchSuggested/fulfilled',
        payload: ['one', 'two', 'three', 'four'],
      });
    });
    seedCredentials();
    pushSearch('?url=https%3A%2F%2Fexample.com');
    const { store } = renderWithStore();
    await waitFor(() => {
      expect(store.getState().tags.suggestedStatus).toBe('succeeded');
    });
    await waitFor(() => {
      expect(fetchGptSuggestionsMock).toHaveBeenCalled();
    });
  });

  it('fetches bookmark details for the provided URL parameter', async () => {
    seedCredentials();
    pushSearch('?url=https%3A%2F%2Fexample.com');
    renderWithStore();
    await waitFor(() => {
      expect(fetchBookmarkDetailsMock).toHaveBeenCalledWith('https://example.com');
    });
  });

  it('hydrates auth from storage and form data from query params', async () => {
    seedCredentials({ pinboardUser: 'ross', pinboardToken: 'xyz', openAiToken: 'sk-123' });
    pushSearch(
      '?url=https%3A%2F%2Fexample.com%2Fpage&title=Hello&description=Snippet&private=true&toread=true'
    );
    const { store } = renderWithStore();
    await waitFor(() => {
      expect(store.getState().auth).toEqual({
        user: 'ross',
        token: 'xyz',
        openAiToken: 'sk-123',
      });
    });
    expect(store.getState().bookmark.formData).toEqual(
      expect.objectContaining({
        url: 'https://example.com/page',
        title: 'Hello',
        description: 'Snippet',
        private: true,
        toread: true,
      })
    );
  });

  it('looks up the bookmarklet URL immediately, without the typing debounce', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      pushSearch('?url=https%3A%2F%2Fexample.com%2Fimmediate');
      renderWithStore();
      // No timers advanced: the lookup for the opening URL must already be out.
      expect(fetchBookmarkDetailsMock).toHaveBeenCalledWith(
        'https://example.com/immediate'
      );
      expect(fetchSuggestedTagsMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still debounces URLs the user types after opening', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      pushSearch('?url=https%3A%2F%2Fexample.com%2Ffirst');
      const { store } = renderWithStore();
      expect(fetchBookmarkDetailsMock).toHaveBeenCalledTimes(1);

      act(() => {
        store.dispatch(setFormData({ url: 'https://example.com/second' }));
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(fetchBookmarkDetailsMock).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(fetchBookmarkDetailsMock).toHaveBeenCalledTimes(2);
      expect(fetchBookmarkDetailsMock).toHaveBeenLastCalledWith(
        'https://example.com/second'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispatches GPT once the bookmark lookup settles, without waiting for Pinboard suggestions', async () => {
    // Pinboard suggestions never resolve in this test.
    fetchSuggestedTagsMock.mockImplementation(() => (dispatch) => {
      dispatch({ type: 'tags/fetchSuggested/pending' });
    });
    // The lookup starts but does not finish until we say so.
    fetchBookmarkDetailsMock.mockImplementationOnce(() => (dispatch) => {
      dispatch({
        type: 'bookmark/fetchDetails/pending',
        meta: { requestId: 'req-1', arg: 'https://example.com' },
      });
    });
    seedCredentials();
    pushSearch('?url=https%3A%2F%2Fexample.com');
    const { store } = renderWithStore();

    await waitFor(() => {
      expect(store.getState().bookmark.initialLoading).toBe(true);
    });
    await waitForStableCalls();
    expect(fetchGptSuggestionsMock).not.toHaveBeenCalled();

    act(() => {
      store.dispatch({
        type: 'bookmark/fetchDetails/fulfilled',
        payload: null,
        meta: { requestId: 'req-1', arg: 'https://example.com' },
      });
    });
    await waitFor(() => {
      expect(fetchGptSuggestionsMock).toHaveBeenCalledTimes(1);
    });
    expect(store.getState().tags.suggestedStatus).toBe('loading');
  });

  it('keeps the user’s edits when credentials change after opening', async () => {
    seedCredentials();
    pushSearch('?url=https%3A%2F%2Fexample.com&title=Original');
    const { store } = renderWithStore();
    await waitFor(() => {
      expect(store.getState().bookmark.formData.title).toBe('Original');
    });

    act(() => {
      store.dispatch(setFormData({ title: 'Edited by hand' }));
    });
    act(() => {
      store.dispatch(setAuth({ user: 'other', token: 'zzz', openAiToken: '' }));
    });
    await waitForStableCalls();
    expect(store.getState().bookmark.formData.title).toBe('Edited by hand');
  });

  it('binds Escape key to window.close', async () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    seedCredentials();
    pushSearch('');
    renderWithStore();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });

  it('passes the existing tags snapshot into GPT context', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials({ openAiToken: '' });
      pushSearch('?url=https%3A%2F%2Fexample.com');
      const { store } = renderWithStore();
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      act(() => {
        store.dispatch(
          setFormData({
            tags: ['Alpha Tag', 'beta-tag'],
            title: 'Example',
            description: 'Desc',
          })
        );
      });
      expect(fetchGptSuggestionsMock).not.toHaveBeenCalled();
      act(() => {
        store.dispatch(setAuth({ user: 'test', token: 'abc', openAiToken: 'sk-123' }));
      });
      resolvePinboardSuggestions(store);
      await waitFor(() => {
        expect(fetchGptSuggestionsMock).toHaveBeenCalled();
      });
      const context = fetchGptSuggestionsMock.mock.calls[0][0].context;
      expect(context.existingTags).toBe('Alpha Tag beta-tag');
    } finally {
      vi.useRealTimers();
    }
  });
});
