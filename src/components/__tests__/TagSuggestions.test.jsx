import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import userEvent from '@testing-library/user-event';
import TagSuggestions from '../TagSuggestions';

const mockStore = configureStore([]);

describe('TagSuggestions Component', () => {
  let store;

  beforeEach(() => {
    store = mockStore({
      bookmark: {
        formData: {
          tags: 'existing-tag',
        },
      },
      tags: {
        suggested: ['tag1', '$separator', 'tag2', 'tag3'],
        suggestedLoading: false,
      },
    });
    store.dispatch = jest.fn();
  });

  test('renders suggestions correctly', () => {
    render(
      <Provider store={store}>
        <TagSuggestions />
      </Provider>
    );

    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
    expect(screen.getByText('tag3')).toBeInTheDocument();
    expect(screen.getByText('•')).toBeInTheDocument();
  });

  test('displays loading state', () => {
    store = mockStore({
      bookmark: {
        formData: {
          tags: '',
        },
      },
      tags: {
        suggested: [],
        suggestedLoading: true,
      },
    });

    render(
      <Provider store={store}>
        <TagSuggestions />
      </Provider>
    );

    expect(screen.getByText('Loading suggestions...')).toBeInTheDocument();
  });

  test('renders nothing when suggestions are empty', () => {
    store = mockStore({
      bookmark: {
        formData: {
          tags: '',
        },
      },
      tags: {
        suggested: [],
        suggestedLoading: false,
      },
    });

    const { container } = render(
      <Provider store={store}>
        <TagSuggestions />
      </Provider>
    );

    expect(container.firstChild).toBeNull();
  });

  test('handles tag click correctly', async () => {
    render(
      <Provider store={store}>
        <TagSuggestions />
      </Provider>
    );

    const tagButton = screen.getByText('tag1');
    await userEvent.click(tagButton);

    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'bookmark/setFormData',
      payload: { tags: 'existing-tag tag1' },
    });
  });

  test('ignores separator click', async () => {
    render(
      <Provider store={store}>
        <TagSuggestions />
      </Provider>
    );

    const separator = screen.getByText('•');
    await userEvent.click(separator);

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  test('adds tag to empty tags string', async () => {
    store = mockStore({
      bookmark: {
        formData: {
          tags: '',
        },
      },
      tags: {
        suggested: ['tag1', '$separator', 'tag2'],
        suggestedLoading: false,
      },
    });
    store.dispatch = jest.fn();

    render(
      <Provider store={store}>
        <TagSuggestions />
      </Provider>
    );

    const tagButton = screen.getByText('tag1');
    await userEvent.click(tagButton);

    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'bookmark/setFormData',
      payload: { tags: 'tag1' },
    });
  });
});
