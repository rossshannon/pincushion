import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import thunk from 'redux-thunk';
jest.mock('openai', () => jest.fn(() => ({
  chat: { completions: { create: jest.fn() } },
})));

import BookmarkForm from '../BookmarkForm';

jest.mock('react-transition-group', () => {
  const Noop = ({ children }) => (typeof children === 'function' ? children(null) : children);
  return {
    CSSTransition: Noop,
    TransitionGroup: ({ children }) => <div>{children}</div>,
  };
});

// Mock Ladda - Replaced with inline mock
jest.mock('ladda', () => ({
  // The factory function returns the mock implementation
  create: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

const mockStore = configureStore([thunk]);
const baseTagsState = {
  tagCounts: {},
  suggested: [],
  suggestedLoading: false,
  gptSuggestions: [],
  gptStatus: 'idle',
  gptError: null,
  gptContextKey: null,
};

describe('BookmarkForm Component', () => {
  let store;

  beforeEach(() => {
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Test Title',
          url: 'https://example.com',
          description: '',
          tags: ['test', 'tag1'],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: null,
      },
      tags: {
        ...baseTagsState,
        tagCounts: {
          test: 5,
          tag1: 3,
          suggestion1: 1,
        },
        suggested: ['suggestion1', 'suggestion2'],
      },
    });
  });

  test('renders form with nested TagInput and TagSuggestions', async () => {
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Wait for form to be rendered
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Check form structure
    const form = screen.getByRole('form');
    expect(form).toBeInTheDocument();

    // Check input fields
    expect(screen.getByLabelText(/title/i)).toHaveValue('Test Title');
    expect(screen.getByLabelText(/url/i)).toHaveValue('https://example.com');

    // Check for tag input field
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('handles form submission', async () => {
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Wait for form to be rendered
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /add bookmark/i });
    fireEvent.click(submitButton);

    // Verify store actions
    const actions = store.getActions();
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/submit/pending',
      })
    );
  });

  test('updates form fields correctly', async () => {
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Wait for form to be rendered
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Update title
    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'New Title' } });

    // Update URL
    const urlInput = screen.getByLabelText(/url/i);
    fireEvent.change(urlInput, { target: { value: 'https://newexample.com' } });

    // Update description
    const descriptionInput = screen.getByLabelText(/description/i);
    fireEvent.change(descriptionInput, {
      target: { value: 'Test description' },
    });

    // Toggle checkboxes
    const privateCheckbox = screen.getByLabelText(/private/i);
    const readLaterCheckbox = screen.getByLabelText(/read later/i);

    fireEvent.click(privateCheckbox);
    fireEvent.click(readLaterCheckbox);

    // Verify store actions for form updates
    const actions = store.getActions();
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/setFormData',
        payload: { title: 'New Title' },
      })
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/setFormData',
        payload: { url: 'https://newexample.com' },
      })
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/setFormData',
        payload: { description: 'Test description' },
      })
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/setFormData',
        payload: { private: true },
      })
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/setFormData',
        payload: { toread: true },
      })
    );
  });

  test('handles URL hash removal', async () => {
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Test Title',
          url: 'https://example.com#section1',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: null,
      },
      tags: { ...baseTagsState },
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Wait for form to be rendered
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Find and click the remove hash button
    const removeHashButton = screen.getByTitle('Remove hash from URL');
    fireEvent.click(removeHashButton);

    // Verify the action was dispatched with the cleaned URL
    const actions = store.getActions();
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/setFormData',
        payload: { url: 'https://example.com' },
      })
    );
  });

  test('clicking a suggested tag updates tags and removes chip', async () => {
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Test Title',
          url: 'https://example.com',
          description: '',
          tags: ['base'],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: null,
      },
      tags: {
        ...baseTagsState,
        suggested: ['foo'],
        gptSuggestions: ['ai_tag'],
      },
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    expect(screen.queryByText(/finding suggested tags/i)).not.toBeInTheDocument();

    const suggestionButton = screen.getByText('foo');
    fireEvent.click(suggestionButton);

    const actions = store.getActions();
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'bookmark/setFormData',
        payload: { tags: ['base', 'foo'] },
      })
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'tags/addSuggestedTag',
        payload: 'foo',
      })
    );
  });

  test('displays loading state correctly', async () => {
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Test Title',
          url: 'https://example.com',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'saving',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: null,
      },
      tags: { ...baseTagsState },
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Wait for form to be rendered
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Check that the submit button shows loading state
    const submitButton = screen.getByRole('button');
    expect(submitButton).toHaveTextContent(/saving/i);
    expect(submitButton).toBeDisabled();
  });

  test('displays existing bookmark time when available', async () => {
    const existingTime = '2024-04-24T13:30:00Z';
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Test Title',
          url: 'https://example.com',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: existingTime,
      },
      tags: { ...baseTagsState },
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Wait for form to be rendered
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Check that the timestamp info is displayed
    const timestampInfo = screen.getByText(/originally saved/i);
    expect(timestampInfo).toBeInTheDocument();
  });

  describe('Error Handling', () => {
    test('displays validation errors for missing URL', async () => {
      store = mockStore({
        bookmark: {
          formData: {
            title: 'Test Title',
            url: '', // Empty URL
            description: '',
            tags: [],
            private: false,
            toread: false,
          },
          status: 'error',
          errors: {
            url: 'URL is required.',
            title: null,
            generic: null,
          },
          initialLoading: false,
          existingBookmarkTime: null,
        },
      tags: { ...baseTagsState },
      });

      render(
        <Provider store={store}>
          <BookmarkForm />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });

      // Check that error message is displayed
      expect(screen.getByText('URL is required.')).toBeInTheDocument();

      // Check that URL field has error styling
      const urlFieldWrapper = screen
        .getByLabelText(/url/i)
        .closest('.url-field');
      expect(urlFieldWrapper).toHaveClass('error');
    });

    test('displays validation errors for missing title', async () => {
      store = mockStore({
        bookmark: {
          formData: {
            title: '', // Empty title
            url: 'https://example.com',
            description: '',
            tags: [],
            private: false,
            toread: false,
          },
          status: 'error',
          errors: {
            url: null,
            title: 'Title is required.',
            generic: null,
          },
          initialLoading: false,
          existingBookmarkTime: null,
        },
        tags: { ...baseTagsState },
      });

      render(
        <Provider store={store}>
          <BookmarkForm />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });

      // Check that error message is displayed
      expect(screen.getByText('Title is required.')).toBeInTheDocument();

      // Check that title field has error styling
      const titleLabel = screen.getByText(/^title$/i);
      expect(titleLabel).toHaveClass('error');
    });

    test('displays error for description too long', async () => {
      store = mockStore({
        bookmark: {
          formData: {
            title: 'Test Title',
            url: 'https://example.com',
            description: 'A'.repeat(1000), // Very long description
            tags: [],
            private: false,
            toread: false,
          },
          status: 'error',
          errors: {
            url: null,
            title: null,
            description: 'Description is too long.',
            generic: null,
          },
          initialLoading: false,
          existingBookmarkTime: null,
        },
        tags: { ...baseTagsState },
      });

      render(
        <Provider store={store}>
          <BookmarkForm />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });

      // Check that error message is displayed
      expect(screen.getByText('Description is too long.')).toBeInTheDocument();

      // Check that description field has error styling
      const descriptionLabel = screen.getByText(/^description$/i);
      expect(descriptionLabel).toHaveClass('error');
    });

    test('displays generic API error', async () => {
      store = mockStore({
        bookmark: {
          formData: {
            title: 'Test Title',
            url: 'https://example.com',
            description: '',
            tags: [],
            private: false,
            toread: false,
          },
          status: 'error',
          errors: {
            url: null,
            title: null,
            generic: 'An unexpected error occurred. Please try again.',
          },
          initialLoading: false,
          existingBookmarkTime: null,
        },
        tags: { ...baseTagsState },
      });

      render(
        <Provider store={store}>
          <BookmarkForm />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });

      // Check that error message is displayed
      expect(
        screen.getByText('An unexpected error occurred. Please try again.')
      ).toBeInTheDocument();

      // Check that form has error styling
      expect(screen.getByRole('form')).toHaveClass('fail');
    });

    test('clears field errors when user types', async () => {
      store = mockStore({
        bookmark: {
          formData: {
            title: '',
            url: '',
            description: '',
            tags: [],
            private: false,
            toread: false,
          },
          status: 'error',
          errors: {
            url: 'URL is required.',
            title: 'Title is required.',
            generic: null,
          },
          initialLoading: false,
          existingBookmarkTime: null,
        },
        tags: { ...baseTagsState },
      });

      render(
        <Provider store={store}>
          <BookmarkForm />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByRole('form')).toBeInTheDocument();
      });

      // Type in URL field
      const urlInput = screen.getByLabelText(/url/i);
      fireEvent.change(urlInput, { target: { value: 'https://test.com' } });

      // Verify the action was dispatched
      const actions = store.getActions();
      expect(actions).toContainEqual(
        expect.objectContaining({
          type: 'bookmark/setFormData',
          payload: { url: 'https://test.com' },
        })
      );
    });
  });
});
