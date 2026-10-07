import { vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import axios from 'axios';
vi.mock('axios');
import App from '../App';
import authReducer from '../redux/authSlice';
import bookmarkReducer from '../redux/bookmarkSlice';
import tagReducer from '../redux/tagSlice';
import twitterCardReducer from '../redux/twitterCardSlice';

vi.mock('ladda');

const mockedAxios = axios;
const originalFetch = globalThis.fetch;
const mockGptResponse = {
  choices: [
    {
      message: { content: 'ai_tools, ai_reference' },
    },
  ],
};

beforeAll(() => {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(mockGptResponse),
    })
  ) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

const createStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      bookmark: bookmarkReducer,
      tags: tagReducer,
      twitterCard: twitterCardReducer,
    },
  });

const renderAppWithStore = async () => {
  const store = createStore();
  await act(async () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );
  });
  return store;
};

const localStorageStub = (() => {
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
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageStub,
});

const seedCredentials = ({
  pinboardUser = 'ross',
  pinboardToken = 'abc',
  openAiToken = 'sk-test',
} = {}) => {
  window.localStorage.setItem(
    'pincushion.credentials',
    JSON.stringify({ pinboardUser, pinboardToken, openAiToken })
  );
};

const originalError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((message, ...rest) => {
    if (
      typeof message === 'string' &&
      message.includes('not wrapped in act')
    ) {
      return;
    }
    originalError(message, ...rest);
  });
});

afterAll(() => {
  console.error.mockRestore();
});

const mockPinboardApi = ({ submitResultCode = 'done', submitError } = {}) => {
  mockedAxios.get.mockImplementation((url) => {
    if (url.includes('posts/get')) {
      return Promise.resolve({
        data: {
          posts: [
            {
              href: 'https://testing.com/',
              description: 'Server Title',
              extended: 'Existing description',
              tags: 'pinboard_tag',
              shared: 'no',
              toread: 'yes',
              time: '2024-01-01T00:00:00Z',
            },
          ],
        },
      });
    }
    if (url.includes('posts/suggest-with-preview')) {
      return Promise.resolve({
        data: {
          suggestions: {
            popular: ['coding'],
            recommended: ['server_tag'],
          },
          preview: {
            url: 'https://testing.com/',
            title: 'Testing Preview',
            description: 'Preview text',
            imageUrl: 'https://testing.com/preview.jpg',
            siteName: 'Testing',
          },
        },
      });
    }
    if (url.includes('tags/get')) {
      return Promise.resolve({ data: { coding: 5 } });
    }
    if (url.includes('posts/add')) {
      if (submitError) {
        return Promise.reject(new Error(submitError));
      }
      return Promise.resolve({ data: { result_code: submitResultCode } });
    }
    return Promise.reject(new Error(`Unhandled url ${url}`));
  });
};

describe('App integration', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    window.localStorage.clear();
  });

  it('hydrates bookmark details and suggestions end-to-end', async () => {
    mockPinboardApi();
    seedCredentials();

    window.history.pushState(
      {},
      '',
      '?url=https%3A%2F%2Ftesting.com%2F&title=Client%20Title&description=Snippet&private=false&toread=true'
    );

    const store = await renderAppWithStore();

    await waitFor(() => expect(screen.getByDisplayValue('Server Title')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
    expect(screen.getByText('server_tag')).toBeInTheDocument();
    expect(store.getState().tags.tagCounts).toEqual({ coding: 5 });
  });

  it('submits bookmark successfully and closes the window', async () => {
    vi.useFakeTimers();
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    mockPinboardApi();
    seedCredentials();
    window.history.pushState({}, '', '?url=https%3A%2F%2Ftesting.com%2F');
    const store = await renderAppWithStore();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update bookmark/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /update bookmark/i }));

    await waitFor(() => expect(store.getState().bookmark.status).toBe('success'));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(closeSpy).toHaveBeenCalled();
    vi.useRealTimers();
    closeSpy.mockRestore();
  });

  it('shows an error when submission fails', async () => {
    mockPinboardApi({ submitError: 'submit failed' });
    seedCredentials();
    window.history.pushState({}, '', '?url=https%3A%2F%2Ftesting.com%2F');
    const store = await renderAppWithStore();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update bookmark/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /update bookmark/i }));

    await waitFor(() => expect(store.getState().bookmark.status).toBe('error'));
    expect(screen.getByRole('alert')).toHaveTextContent('submit failed');
  });

  it('fires the lookup and suggestions immediately, and refreshes a stale tag cache only after they settle', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      // A tag cache that is older than the TTL: usable right away, but due a refresh.
      window.localStorage.setItem('tags', JSON.stringify({ cached_tag: 7 }));
      window.localStorage.setItem('tagTimestamp', `${Date.now() - 2 * 60 * 60 * 1000}`);
      window.localStorage.setItem('tagCacheUser', 'ross');

      const calls = [];
      const deferred = {};
      const defer = (key) =>
        new Promise((resolve) => {
          deferred[key] = resolve;
        });
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('posts/get')) {
          calls.push('lookup');
          return defer('lookup');
        }
        if (url.includes('posts/suggest-with-preview')) {
          calls.push('suggest');
          return defer('suggest');
        }
        if (url.includes('tags/get')) {
          calls.push('tags');
          return Promise.resolve({ data: { cached_tag: 8, fresh_tag: 1 } });
        }
        return Promise.reject(new Error(`Unhandled url ${url}`));
      });

      window.history.pushState({}, '', '?url=https%3A%2F%2Ftesting.com%2F&title=T');
      const store = await renderAppWithStore();

      // No timers have been advanced: the two user-facing requests are already
      // out, the big tag download is not, and autocomplete has the cached tags.
      expect(calls).toEqual(['lookup', 'suggest']);
      expect(store.getState().tags.tagCounts).toEqual({ cached_tag: 7 });
      expect(store.getState().bookmark.initialLoading).toBe(true);

      // Suggestions come back first; the lookup is still pending, so still no tags/get.
      await act(async () => {
        deferred.suggest({
          data: { suggestions: { popular: [], recommended: ['server_tag'] }, preview: null },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      expect(calls).toEqual(['lookup', 'suggest']);

      // The lookup settles. The refresh waits out the courtesy gap, then fires once.
      await act(async () => {
        deferred.lookup({ data: { posts: [] } });
      });
      await waitFor(() => expect(store.getState().bookmark.initialLoading).toBe(false));
      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });
      expect(calls).toEqual(['lookup', 'suggest']);

      await act(async () => {
        vi.advanceTimersByTime(1_500);
      });
      expect(calls).toEqual(['lookup', 'suggest', 'tags']);
      await waitFor(() =>
        expect(store.getState().tags.tagCounts).toEqual({ cached_tag: 8, fresh_tag: 1 })
      );

      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(calls).toEqual(['lookup', 'suggest', 'tags']);
    } finally {
      vi.useRealTimers();
    }
  });
});
