jest.mock('openai', () => jest.fn(() => ({
  chat: { completions: { create: jest.fn() } },
})));

jest.mock('./redux/tagSlice', () => {
  const actual = jest.requireActual('./redux/tagSlice');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    fetchTags: jest.fn(() => () => {}),
    fetchSuggestedTags: jest.fn(() => () => {}),
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
import { render, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import App from './App';
import authReducer from './redux/authSlice';
import bookmarkReducer, { setFormData } from './redux/bookmarkSlice';
import tagReducer from './redux/tagSlice';
import { fetchGptSuggestions } from './redux/tagSlice';

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

describe('App GPT integration', () => {
  beforeEach(() => {
    fetchGptSuggestions.mockClear();
  });

  it('dispatches GPT suggestions only once despite tag edits', async () => {
    pushSearch(
      '?user=test&token=abc&openai_token=sk-123&url=https%3A%2F%2Fexample.com&title=Example&description=Desc'
    );

    const { store } = renderWithStore();

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
    renderWithStore();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchGptSuggestions).not.toHaveBeenCalled();
  });
});
