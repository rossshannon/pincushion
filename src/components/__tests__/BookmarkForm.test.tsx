import { vi } from 'vitest';
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import thunk from 'redux-thunk';

vi.mock('../../utils/popupAffordances', () => ({
  isLikelyTouchDevice: vi.fn(() => false),
}));
import BookmarkForm, { __TEST_MIN_SPINNER_DURATION } from '../BookmarkForm';
import * as Ladda from 'ladda';
import { isLikelyTouchDevice } from '../../utils/popupAffordances';

vi.mock('react-transition-group', () => {
  const Noop = ({ children }) => (typeof children === 'function' ? children(null) : children);
  return {
    CSSTransition: Noop,
    TransitionGroup: ({ children }) => <div>{children}</div>,
  };
});

vi.mock('ladda');

const mockStore = configureStore([thunk]);
const baseTagsState = {
  tagCounts: {},
  suggested: [],
  suggestedLoading: false,
  gptSuggestions: [],
  gptStatus: 'idle',
  gptError: null,
  gptContextKey: null,
  recentTags: [],
  filteredRecentTags: [],
};

const baseAuthState = {
  user: '',
  token: '',
  openAiToken: '',
};

describe('BookmarkForm Component', () => {
  let store;

  beforeEach(() => {
    isLikelyTouchDevice.mockReset();
    isLikelyTouchDevice.mockReturnValue(false);
    Ladda.create.mockClear();
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
        hasExistingBookmark: false,
        displayOriginalTimestamp: false,
        displayOriginalTimestamp: false,
        displayOriginalTimestamp: false,
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
      auth: baseAuthState,
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
    expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument();

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

  test('scrolls to top when a field loses focus', async () => {
    const originalScrollTo = window.scrollTo || (() => undefined);
    if (!window.scrollTo) {
      window.scrollTo = () => undefined;
    }
    const scrollSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.blur(titleInput);
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
    window.scrollTo = originalScrollTo;
  });

  test('auto-focuses tag input on non-touch devices', async () => {
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    const combobox = await screen.findByRole('combobox');
    await waitFor(() => {
      expect(combobox).toHaveFocus();
    });
  });

  test('avoids tag auto-focus on touch devices', async () => {
    isLikelyTouchDevice.mockReturnValueOnce(true);
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    const combobox = await screen.findByRole('combobox');
    expect(combobox).not.toHaveFocus();
  });

  test('spinner remains visible for minimum duration', async () => {
    vi.useFakeTimers();
    const spinnerMock = { start: vi.fn(), stop: vi.fn() };
    Ladda.create.mockReturnValue(spinnerMock);

    const baseBookmarkState = {
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
    hasExistingBookmark: false,
    displayOriginalTimestamp: false,
  };

    store = mockStore({
      bookmark: { ...baseBookmarkState, status: 'saving' },
      tags: { ...baseTagsState },
      auth: baseAuthState,
    });

    const { rerender } = render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    expect(spinnerMock.start).toHaveBeenCalledTimes(1);
    expect(spinnerMock.stop).not.toHaveBeenCalled();

    const successStore = mockStore({
      bookmark: { ...baseBookmarkState, status: 'success' },
      tags: { ...baseTagsState },
      auth: baseAuthState,
    });

    rerender(
      <Provider store={successStore}>
        <BookmarkForm />
      </Provider>
    );
    expect(spinnerMock.stop).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(__TEST_MIN_SPINNER_DURATION);
    });
    expect(spinnerMock.stop).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('shows update button text when bookmark already exists', async () => {
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Existing Title',
          url: 'https://example.com',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: null,
        hasExistingBookmark: true,
        displayOriginalTimestamp: true,
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update bookmark/i })).toBeInTheDocument();
    });
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
        hasExistingBookmark: false,
        displayOriginalTimestamp: false,
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
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

    // The reducer drops the fragment (from the tracking toggle's URLs too)
    expect(store.getActions()).toContainEqual(
      expect.objectContaining({ type: 'bookmark/removeUrlFragment' })
    );
  });

  const renderWithTrackingStrip = (
    restored: boolean,
    savedWithTracking = false
  ) => {
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Tracked',
          url: restored
            ? 'https://example.com/?id=1&utm_source=x&fbclid=y'
            : 'https://example.com/?id=1',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: null,
        hasExistingBookmark: false,
        displayOriginalTimestamp: false,
        trackingStrip: {
          original: 'https://example.com/?id=1&utm_source=x&fbclid=y',
          stripped: 'https://example.com/?id=1',
          removed: ['utm_source', 'fbclid'],
          restored,
          savedWithTracking,
        },
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
    });
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );
  };

  test('says which tracking parameters were removed and offers to undo', () => {
    renderWithTrackingStrip(false);
    expect(screen.getByText(/removed tracking/i)).toBeInTheDocument();
    expect(screen.getByText('utm_source, fbclid')).toBeInTheDocument();

    // Tabs straight from the URL field, not after Save.
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'tabindex',
      '2'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(store.getActions()).toContainEqual({
      type: 'bookmark/toggleTrackingStrip',
      payload: undefined,
    });
  });

  test('offers to strip again after the original URL was restored', () => {
    renderWithTrackingStrip(true);
    expect(screen.getByText(/kept tracking parameters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  test('offers the tracked URL when it was bookmarked before', () => {
    renderWithTrackingStrip(false, true);
    expect(
      screen.getByText(/you bookmarked this before with tracking parameters/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use that bookmark' }));
    expect(store.getActions()).toContainEqual({
      type: 'bookmark/toggleTrackingStrip',
      payload: undefined,
    });
  });

  test('keeps an empty status region when nothing was stripped', () => {
    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );
    expect(screen.queryByText(/tracking/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
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
        hasExistingBookmark: false,
      },
      tags: {
        ...baseTagsState,
        suggested: ['foo'],
        gptSuggestions: ['ai_tag'],
      },
      auth: baseAuthState,
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

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

  test('removing a selected tag reinjects it into suggestions', async () => {
    store = mockStore({
      bookmark: {
        formData: {
          title: 'Test Title',
          url: 'https://example.com',
          description: '',
          tags: ['testing', 'ux'],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: null,
        hasExistingBookmark: false,
      },
      tags: {
        ...baseTagsState,
        suggested: ['quality_assurance'],
      },
      auth: baseAuthState,
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    const removeButton = await screen.findByLabelText('Remove testing');
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(store.getActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'tags/restoreSuggestedTag',
            payload: 'testing',
          }),
        ])
      );
    });
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
        hasExistingBookmark: false,
        displayOriginalTimestamp: false,
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
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
        hasExistingBookmark: true,
        displayOriginalTimestamp: true,
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
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

  test('hides timestamp for newly created bookmarks', async () => {
    const savedTime = new Date().toISOString();
    store = mockStore({
      bookmark: {
        formData: {
          title: 'New Bookmark',
          url: 'https://example.com/new',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'success',
        errors: {},
        initialLoading: false,
        existingBookmarkTime: savedTime,
        hasExistingBookmark: true,
        displayOriginalTimestamp: false,
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    expect(screen.queryByText(/originally saved/i)).not.toBeInTheDocument();
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
          hasExistingBookmark: false,
          displayOriginalTimestamp: false,
          displayOriginalTimestamp: false,
        },
      tags: { ...baseTagsState },
      auth: baseAuthState,
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
          hasExistingBookmark: false,
          displayOriginalTimestamp: false,
          displayOriginalTimestamp: false,
        },
        tags: { ...baseTagsState },
      auth: baseAuthState,
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
          hasExistingBookmark: false,
        },
        tags: { ...baseTagsState },
      auth: baseAuthState,
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
          hasExistingBookmark: false,
        },
        tags: { ...baseTagsState },
      auth: baseAuthState,
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
      await waitFor(() => {
        expect(screen.getByRole('form')).toHaveClass('fail');
      });
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
          hasExistingBookmark: false,
        },
        tags: { ...baseTagsState },
      auth: baseAuthState,
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

  test('focuses first invalid field when submission fails', async () => {
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
          title: null,
          description: null,
          generic: null,
        },
        initialLoading: false,
        existingBookmarkTime: null,
        hasExistingBookmark: false,
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    const urlInput = screen.getByLabelText(/url/i);
    await waitFor(() => {
      expect(document.activeElement).toBe(urlInput);
    });
  });

  test('soft clears status after error animation completes', async () => {
    vi.useFakeTimers();
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
          title: null,
          description: null,
          generic: null,
        },
        initialLoading: false,
        existingBookmarkTime: null,
        hasExistingBookmark: false,
      },
      tags: { ...baseTagsState },
      auth: baseAuthState,
    });

    render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });
    const actions = store.getActions();
    expect(actions).toContainEqual({ type: 'bookmark/clearStatus' });
    vi.useRealTimers();
  });
});
