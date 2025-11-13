import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

jest.mock('ladda', () => ({
  create: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
  stopAll: jest.fn(),
}));

const mockedAxios = axios;

const createStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      bookmark: bookmarkReducer,
      tags: tagReducer,
    },
  });

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

describe('App integration', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    window.localStorage.clear();
  });

  it('hydrates bookmark details and suggestions end-to-end', async () => {
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
          data: [
            { popular: ['coding'] },
            { recommended: ['server_tag'] },
          ],
        });
      }
      if (url.includes('tags/get')) {
        return Promise.resolve({ data: { coding: 5 } });
      }
      return Promise.reject(new Error(`Unhandled url ${url}`));
    });

    window.history.pushState(
      {},
      '',
      '?user=ross&token=abc&openai_token=sk-test&url=https%3A%2F%2Ftesting.com%2F&title=Client%20Title&description=Snippet&private=false&toread=true'
    );

    const store = createStore();
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );

    await waitFor(() => expect(screen.getByDisplayValue('Server Title')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
    expect(screen.getByText('server_tag')).toBeInTheDocument();
    expect(store.getState().tags.tagCounts).toEqual({ coding: 5 });
  });
});
