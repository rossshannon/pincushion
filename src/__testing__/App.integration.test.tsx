import { vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import axios from 'axios';
vi.mock('axios');
import App from '../App';
import authReducer from '../redux/authSlice';
import bookmarkReducer, { setFormData } from '../redux/bookmarkSlice';
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
    if (url.includes('/v1/posts/suggest')) {
      // Pinboard's own JSON shape: an array of single-key objects.
      return Promise.resolve({
        data: [{ popular: ['coding'] }, { recommended: ['server_tag'] }],
      });
    }
    if (url.includes('/preview?')) {
      return Promise.resolve({
        data: {
          preview: {
            url: 'https://testing.com/',
            title: 'Testing Preview',
            description: 'Preview text',
            imageUrl: 'https://testing.com/preview.jpg',
            siteName: 'Testing',
          },
          previewStatus: 'fresh',
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
    expect(screen.getByText('Testing Preview')).toBeInTheDocument();
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

  it('fires the lookup and preview immediately, suggestions once the lookup settles, and refreshes a stale tag cache last', async () => {
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
        if (url.includes('/preview?')) {
          calls.push('preview');
          return defer('preview');
        }
        if (url.includes('/v1/posts/suggest')) {
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

      // No timers have been advanced: the lookup and the preview are already
      // out; suggestions wait for the lookup, so Pinboard sees the lookup first.
      expect(calls).toEqual(['lookup', 'preview']);
      // The suggestions spinner shows from the start, not only once the lookup is back.
      expect(store.getState().tags.suggestedLoading).toBe(true);
      expect(store.getState().tags.tagCounts).toEqual({ cached_tag: 7 });
      expect(store.getState().bookmark.initialLoading).toBe(true);

      // The preview lands on its own, whatever Pinboard is doing.
      await act(async () => {
        deferred.preview({ data: { preview: { url: 'https://testing.com/', title: 'Card' } } });
      });
      expect(store.getState().twitterCard.card?.title).toBe('Card');
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      expect(calls).toEqual(['lookup', 'preview']);

      // The lookup settles and suggestions go out; the tag refresh still waits.
      await act(async () => {
        deferred.lookup({ data: { posts: [] } });
      });
      await waitFor(() => expect(store.getState().bookmark.initialLoading).toBe(false));
      expect(calls).toEqual(['lookup', 'preview', 'suggest']);
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      expect(calls).toEqual(['lookup', 'preview', 'suggest']);

      // Suggestions settle. The refresh waits out the courtesy gap, then fires once.
      await act(async () => {
        deferred.suggest({ data: [{ popular: [] }, { recommended: ['server_tag'] }] });
      });
      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });
      expect(calls).toEqual(['lookup', 'preview', 'suggest']);

      await act(async () => {
        vi.advanceTimersByTime(1_500);
      });
      expect(calls).toEqual(['lookup', 'preview', 'suggest', 'tags']);
      await waitFor(() =>
        expect(store.getState().tags.tagCounts).toEqual({ cached_tag: 8, fresh_tag: 1 })
      );

      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(calls).toEqual(['lookup', 'preview', 'suggest', 'tags']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the preview the bookmarklet read off the page before the bridge answers', async () => {
    const calls = [];
    let resolvePreview;
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('posts/get')) return Promise.resolve({ data: { posts: [] } });
      if (url.includes('/v1/posts/suggest')) return Promise.resolve({ data: [] });
      if (url.includes('/preview?')) {
        calls.push('preview');
        return new Promise((resolve) => {
          resolvePreview = resolve;
        });
      }
      if (url.includes('tags/get')) return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`Unhandled url ${url}`));
    });
    seedCredentials();
    window.history.pushState(
      {},
      '',
      '?url=https%3A%2F%2Ftesting.com%2Fpost&title=Doc%20Title' +
        '&meta_title=Page%20Card&meta_description=From%20the%20page&meta_image=%2Fcard.png'
    );
    const store = await renderAppWithStore();

    expect(screen.getByText('Page Card')).toBeInTheDocument();
    expect(store.getState().twitterCard.card?.imageUrl).toBe('https://testing.com/card.png');
    // The bridge is still asked, to fill in what the page didn't say.
    expect(calls).toEqual(['preview']);

    await act(async () => {
      resolvePreview({
        data: {
          preview: {
            url: 'https://testing.com/canonical',
            title: 'Server Card',
            description: null,
            siteName: 'Testing Site',
            faviconUrl: 'https://testing.com/icon.png',
          },
        },
      });
    });
    const card = store.getState().twitterCard.card;
    expect(card?.title).toBe('Page Card');
    expect(card?.siteName).toBe('Testing Site');
    expect(card?.faviconUrl).toBe('https://testing.com/icon.png');
    expect(card?.url).toBe('https://testing.com/canonical');
  });

  it('fills a missing preview title from the document title when the page sent no card', async () => {
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('posts/get')) return Promise.resolve({ data: { posts: [] } });
      if (url.includes('/v1/posts/suggest')) return Promise.resolve({ data: [] });
      if (url.includes('/preview?')) {
        return Promise.resolve({
          data: { preview: { url: 'https://testing.com/post', title: null, description: 'Bridge text' } },
        });
      }
      if (url.includes('tags/get')) return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`Unhandled url ${url}`));
    });
    seedCredentials();
    // An older bookmarklet: a title, but no meta_* parameters.
    window.history.pushState({}, '', '?url=https%3A%2F%2Ftesting.com%2Fpost&title=Doc%20Title');
    const store = await renderAppWithStore();

    await waitFor(() => expect(store.getState().twitterCard.card?.description).toBe('Bridge text'));
    expect(store.getState().twitterCard.card?.title).toBe('Doc Title');
  });

  it('keeps the suggestions spinner for a new URL while a stale lookup settles', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      const calls = [];
      const lookups = {};
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('posts/get')) {
          const target = decodeURIComponent(url.split('url=')[1] ?? '');
          calls.push(`lookup ${target}`);
          return new Promise((resolve) => {
            lookups[target] = resolve;
          });
        }
        if (url.includes('/preview?')) return Promise.resolve({ data: { preview: null } });
        if (url.includes('/v1/posts/suggest')) {
          calls.push('suggest');
          return new Promise(() => {});
        }
        if (url.includes('tags/get')) return Promise.resolve({ data: {} });
        return Promise.reject(new Error(`Unhandled url ${url}`));
      });
      window.history.pushState({}, '', '?url=https%3A%2F%2Fa.example.com%2F&title=T');
      const store = await renderAppWithStore();

      await act(async () => {
        store.dispatch(setFormData({ url: 'https://b.example.com/' }));
      });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(calls.filter((c) => c.startsWith('lookup'))).toHaveLength(2);

      // A's lookup comes back after the user has moved on to B.
      await act(async () => {
        lookups['https://a.example.com/']({ data: { posts: [] } });
      });
      expect(store.getState().tags.suggestedLoading).toBe(true);
      expect(calls).not.toContain('suggest');

      await act(async () => {
        lookups['https://b.example.com/']({ data: { posts: [] } });
      });
      expect(calls.filter((c) => c === 'suggest')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches the preview again when the URL is cleared and the same one re-entered', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      let previews = 0;
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('posts/get')) return Promise.resolve({ data: { posts: [] } });
        if (url.includes('/preview?')) {
          previews += 1;
          return Promise.resolve({ data: { preview: { url: 'https://a.example.com/', title: 'Card' } } });
        }
        if (url.includes('/v1/posts/suggest')) return Promise.resolve({ data: [] });
        if (url.includes('tags/get')) return Promise.resolve({ data: {} });
        return Promise.reject(new Error(`Unhandled url ${url}`));
      });
      window.history.pushState({}, '', '?url=https%3A%2F%2Fa.example.com%2F&title=T');
      const store = await renderAppWithStore();
      await act(async () => {
        vi.advanceTimersByTime(10);
      });
      expect(store.getState().twitterCard.card?.title).toBe('Card');

      await act(async () => {
        store.dispatch(setFormData({ url: '' }));
      });
      expect(store.getState().twitterCard.card).toBeNull();
      expect(store.getState().tags.suggestedLoading).toBe(false);

      await act(async () => {
        store.dispatch(setFormData({ url: 'https://a.example.com/' }));
      });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(previews).toBe(2);
      expect(store.getState().twitterCard.card?.title).toBe('Card');
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds back suggestions while the user is editing the URL, and sends them if they come back', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      const calls = [];
      const lookups = {};
      mockedAxios.get.mockImplementation((url) => {
        const target = decodeURIComponent(url.split('url=')[1] ?? '');
        if (url.includes('posts/get')) {
          calls.push(`lookup ${target}`);
          return new Promise((resolve) => {
            lookups[target] = resolve;
          });
        }
        if (url.includes('/preview?')) return Promise.resolve({ data: { preview: null } });
        if (url.includes('/v1/posts/suggest')) {
          calls.push(`suggest ${target.split('&')[0]}`);
          return new Promise(() => {});
        }
        if (url.includes('tags/get')) return Promise.resolve({ data: {} });
        return Promise.reject(new Error(`Unhandled url ${url}`));
      });
      window.history.pushState({}, '', '?url=https%3A%2F%2Fa.example.com%2F&title=T');
      const store = await renderAppWithStore();

      // The user starts typing B; A's lookup lands inside B's debounce.
      await act(async () => {
        store.dispatch(setFormData({ url: 'https://b.example.com/' }));
      });
      await act(async () => {
        lookups['https://a.example.com/']({ data: { posts: [] } });
      });
      expect(calls.some((c) => c.startsWith('suggest'))).toBe(false);
      expect(store.getState().tags.suggestedLoading).toBe(true);

      // They change their mind and go back to A: its suggestions go out once.
      await act(async () => {
        store.dispatch(setFormData({ url: 'https://a.example.com/' }));
      });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(calls.filter((c) => c.startsWith('suggest'))).toEqual(['suggest https://a.example.com/']);
      expect(calls.filter((c) => c.startsWith('lookup'))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't send a stale URL's suggestions when the user moves on during the debounce", async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      const calls = [];
      const lookups = {};
      mockedAxios.get.mockImplementation((url) => {
        const target = decodeURIComponent(url.split('url=')[1] ?? '');
        if (url.includes('posts/get')) {
          calls.push(`lookup ${target}`);
          return new Promise((resolve) => {
            lookups[target] = resolve;
          });
        }
        if (url.includes('/preview?')) return Promise.resolve({ data: { preview: null } });
        if (url.includes('/v1/posts/suggest')) {
          calls.push(`suggest ${target.split('&')[0]}`);
          return new Promise(() => {});
        }
        if (url.includes('tags/get')) return Promise.resolve({ data: {} });
        return Promise.reject(new Error(`Unhandled url ${url}`));
      });
      window.history.pushState({}, '', '?url=https%3A%2F%2Fa.example.com%2F&title=T');
      const store = await renderAppWithStore();

      await act(async () => {
        store.dispatch(setFormData({ url: 'https://b.example.com/' }));
      });
      await act(async () => {
        lookups['https://a.example.com/']({ data: { posts: [] } });
      });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      await act(async () => {
        lookups['https://b.example.com/']({ data: { posts: [] } });
      });
      expect(calls).toEqual([
        'lookup https://a.example.com/',
        'lookup https://b.example.com/',
        'suggest https://b.example.com/',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops an in-flight suggest call when the URL is cleared', async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      let resolveSuggest;
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('posts/get')) return Promise.resolve({ data: { posts: [] } });
        if (url.includes('/preview?')) return Promise.resolve({ data: { preview: null } });
        if (url.includes('/v1/posts/suggest')) {
          return new Promise((resolve) => {
            resolveSuggest = resolve;
          });
        }
        if (url.includes('tags/get')) return Promise.resolve({ data: {} });
        return Promise.reject(new Error(`Unhandled url ${url}`));
      });
      window.history.pushState({}, '', '?url=https%3A%2F%2Fa.example.com%2F&title=T');
      const store = await renderAppWithStore();
      await act(async () => {
        vi.advanceTimersByTime(10);
      });
      expect(resolveSuggest).toBeDefined();
      expect(store.getState().tags.suggestedLoading).toBe(true);

      await act(async () => {
        store.dispatch(setFormData({ url: '' }));
      });
      expect(store.getState().tags.suggestedLoading).toBe(false);
      await act(async () => {
        resolveSuggest({ data: [{ popular: ['stale'] }, { recommended: [] }] });
      });
      expect(store.getState().tags.suggested).not.toContain('stale');
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't ask GPT again until a re-entered URL's lookup is back", async () => {
    vi.useFakeTimers();
    try {
      seedCredentials();
      const lookups = [];
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('posts/get')) {
          return new Promise((resolve) => {
            lookups.push(resolve);
          });
        }
        if (url.includes('/preview?')) return Promise.resolve({ data: { preview: null } });
        if (url.includes('/v1/posts/suggest')) return Promise.resolve({ data: [] });
        if (url.includes('tags/get')) return Promise.resolve({ data: {} });
        return Promise.reject(new Error(`Unhandled url ${url}`));
      });
      const gptCalls = () => globalThis.fetch.mock.calls.length;
      window.history.pushState({}, '', '?url=https%3A%2F%2Fa.example.com%2F&title=T');
      const store = await renderAppWithStore();
      await act(async () => {
        lookups[0]({ data: { posts: [] } });
      });
      await act(async () => {
        vi.advanceTimersByTime(10);
      });
      const afterFirst = gptCalls();
      expect(afterFirst).toBeGreaterThan(0);

      await act(async () => {
        store.dispatch(setFormData({ url: '' }));
      });
      await act(async () => {
        store.dispatch(setFormData({ url: 'https://a.example.com/' }));
      });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      // The lookup for the re-entered URL is still out, so GPT waits for it.
      expect(lookups).toHaveLength(2);
      expect(gptCalls()).toBe(afterFirst);

      await act(async () => {
        lookups[1]({ data: { posts: [] } });
      });
      await act(async () => {
        vi.advanceTimersByTime(10);
      });
      expect(gptCalls()).toBe(afterFirst + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips suggestions for a URL Pinboard refused as too long', async () => {
    seedCredentials();
    const calls = [];
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('posts/get')) {
        calls.push('lookup');
        return Promise.reject(
          Object.assign(new Error('Request failed with status code 414'), { response: { status: 414 } })
        );
      }
      if (url.includes('/preview?')) return Promise.resolve({ data: { preview: null } });
      if (url.includes('/v1/posts/suggest')) {
        calls.push('suggest');
        return Promise.resolve({ data: [] });
      }
      if (url.includes('tags/get')) return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`Unhandled url ${url}`));
    });
    window.history.pushState({}, '', '?url=https%3A%2F%2Fa.example.com%2F&title=T');
    const store = await renderAppWithStore();
    await waitFor(() => expect(store.getState().bookmark.initialLoading).toBe(false));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls).toEqual(['lookup']);
    expect(store.getState().tags.suggestedLoading).toBe(false);
  });
});
