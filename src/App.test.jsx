jest.mock('openai', () => jest.fn(() => ({
  chat: { completions: { create: jest.fn() } },
})));

jest.mock('./redux/tagSlice', () => {
  const actual = jest.requireActual('./redux/tagSlice');
  const defaultSuggestedThunk = () => (dispatch) => {
    dispatch({ type: 'tags/fetchSuggested/pending' });
    dispatch({
      type: 'tags/fetchSuggested/fulfilled',
      payload: [],
    });
  };
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    fetchTags: jest.fn(() => () => {}),
    fetchSuggestedTags: jest.fn(defaultSuggestedThunk),
    fetchGptSuggestions: jest.fn((payload) => (dispatch) => {
      dispatch({
        type: 'tags/fetchGptSuggestions/fulfilled',
        payload: { suggestions: [], contextKey: payload.contextKey },
      });
    }),
  };
});

jest.mock('./redux/bookmarkSlice', () => {
  const actual = jest.requireActual('./redux/bookmarkSlice');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    fetchBookmarkDetails: jest.fn(() => () => {}),
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
import { fetchGptSuggestions, fetchSuggestedTags } from './redux/tagSlice';

const renderWithStore = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      bookmark: bookmarkReducer,
      tags: tagReducer,
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

const waitForStableCalls = async () => {
  let previousCount = fetchGptSuggestions.mock.calls.length;
  // Wait for two animation frames until the call count stops changing.
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const current = fetchGptSuggestions.mock.calls.length;
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
      payload,
    });
  });
};

describe('App GPT integration', () => {
  beforeEach(() => {
    fetchGptSuggestions.mockClear();
    fetchBookmarkDetails.mockClear();
    fetchSuggestedTags.mockClear();
    fetchSuggestedTags.mockImplementation(() => (dispatch) => {
      dispatch({ type: 'tags/fetchSuggested/pending' });
      dispatch({
        type: 'tags/fetchSuggested/fulfilled',
        payload: [],
      });
    });
  });

  it('dispatches GPT suggestions only once despite tag edits', async () => {
    pushSearch(
      '?user=test&token=abc&openai_token=sk-123&url=https%3A%2F%2Fexample.com&title=Example&description=Desc'
    );

    const { store } = renderWithStore();
    resolvePinboardSuggestions(store);
    await waitFor(() => {
      expect(store.getState().auth.openAiToken).toBe('sk-123');
      expect(store.getState().tags.suggestedStatus).toBe('succeeded');
    });

    await waitFor(() => {
      expect(fetchGptSuggestions).toHaveBeenCalled();
    });
    await waitForStableCalls();
    const initialCalls = fetchGptSuggestions.mock.calls.length;

    act(() => {
      store.dispatch(setFormData({ tags: ['foo'] }));
    });

    await waitForStableCalls();
    expect(fetchGptSuggestions.mock.calls.length).toBe(initialCalls);
  });

  it('skips GPT dispatch when no token provided', async () => {
    pushSearch('?user=test&token=abc&url=https%3A%2F%2Fexample.com');
    const { store } = renderWithStore();
    resolvePinboardSuggestions(store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchGptSuggestions).not.toHaveBeenCalled();
  });

  it('still dispatches GPT when Pinboard suggestions are plentiful', async () => {
    fetchSuggestedTags.mockImplementationOnce(() => (dispatch) => {
      dispatch({ type: 'tags/fetchSuggested/pending' });
      dispatch({
        type: 'tags/fetchSuggested/fulfilled',
        payload: ['one', 'two', 'three', 'four'],
      });
    });
    pushSearch(
      '?user=test&token=abc&openai_token=sk-123&url=https%3A%2F%2Fexample.com'
    );
    const { store } = renderWithStore();
    await waitFor(() => {
      expect(store.getState().tags.suggestedStatus).toBe('succeeded');
    });
    await waitFor(() => {
      expect(fetchGptSuggestions).toHaveBeenCalled();
    });
  });

  it('fetches bookmark details for the provided URL parameter', async () => {
    pushSearch('?user=test&token=abc&url=https%3A%2F%2Fexample.com');
    renderWithStore();
    await waitFor(() => {
      expect(fetchBookmarkDetails).toHaveBeenCalledWith('https://example.com');
    });
  });

  it('parses auth and form data from query params', async () => {
    pushSearch(
      '?user=ross&token=xyz&openai_token=sk-123&url=https%3A%2F%2Fexample.com%2Fpage&title=Hello&description=Snippet&private=true&toread=true'
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

  it('binds Escape key to window.close', async () => {
    const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
    pushSearch('?user=test&token=abc');
    renderWithStore();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });
});
