import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import axios from 'axios';
jest.mock('axios');
import App from '../App';
import authReducer from '../redux/authSlice';
import bookmarkReducer from '../redux/bookmarkSlice';
import tagReducer from '../redux/tagSlice';

jest.mock('openai', () =>
  jest.fn(() => ({
    chat: {
      completions: {
        create: jest.fn(() =>
          Promise.resolve({
            choices: [
              {
                message: { content: 'ai_tools, ai_reference' },
              },
            ],
          })
        ),
      },
    },
  }))
);

jest.mock('ladda');

const mockedAxios = axios;

const createStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      bookmark: bookmarkReducer,
      tags: tagReducer,
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

const originalError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((message, ...rest) => {
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
    if (url.includes('posts/suggest')) {
      return Promise.resolve({
        data: [{ popular: ['coding'] }, { recommended: ['server_tag'] }],
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

    window.history.pushState(
      {},
      '',
      '?user=ross&token=abc&openai_token=sk-test&url=https%3A%2F%2Ftesting.com%2F&title=Client%20Title&description=Snippet&private=false&toread=true'
    );

    const store = await renderAppWithStore();

    await waitFor(() => expect(screen.getByDisplayValue('Server Title')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
    expect(screen.getByText('server_tag')).toBeInTheDocument();
    expect(store.getState().tags.tagCounts).toEqual({ coding: 5 });
  });

  it('submits bookmark successfully and closes the window', async () => {
    jest.useFakeTimers();
    const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
    mockPinboardApi();
    window.history.pushState({}, '', '?user=ross&token=abc&openai_token=sk-test&url=https%3A%2F%2Ftesting.com%2F');
    const store = await renderAppWithStore();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update bookmark/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /update bookmark/i }));

    await waitFor(() => expect(store.getState().bookmark.status).toBe('success'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(closeSpy).toHaveBeenCalled();
    jest.useRealTimers();
    closeSpy.mockRestore();
  });

  it('shows an error when submission fails', async () => {
    mockPinboardApi({ submitError: 'submit failed' });
    window.history.pushState({}, '', '?user=ross&token=abc&openai_token=sk-test&url=https%3A%2F%2Ftesting.com%2F');
    const store = await renderAppWithStore();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update bookmark/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /update bookmark/i }));

    await waitFor(() => expect(store.getState().bookmark.status).toBe('error'));
    expect(screen.getByRole('alert')).toHaveTextContent('submit failed');
  });
});
