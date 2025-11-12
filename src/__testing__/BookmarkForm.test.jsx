import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import BookmarkForm from '../components/BookmarkForm.jsx';
import { setFormData } from '../redux/bookmarkSlice';

const mockStore = configureStore([]);

describe('BookmarkForm Component', () => {
  let store;
  let initialState;

  beforeEach(() => {
    initialState = {
      bookmark: {
        formData: {
          url: '',
          title: '',
          description: '',
          tags: [],
          private: false,
          toread: false,
        },
        status: 'idle',
        errors: null,
        initialLoading: false,
        existingBookmarkTime: null,
      },
      tags: {
        tagCounts: {},
        suggested: [],
        status: 'idle',
      },
    };
    store = mockStore(initialState);
    store.dispatch = jest.fn();
  });

  test('handles URL hash removal correctly', () => {
    // Initial render - Use the store from beforeEach
    const { rerender } = render(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    let urlInput = screen.getByLabelText(/URL/i);
    const testUrlWithHash = 'https://example.com/page#section-1';
    const testUrlWithoutHash = 'https://example.com/page';

    // Simulate typing URL with hash
    fireEvent.change(urlInput, { target: { value: testUrlWithHash } });

    // Check dispatch on the store instance
    expect(store.dispatch).toHaveBeenCalledWith(
      setFormData({ url: testUrlWithHash })
    );

    // --- Simulate state update by modifying initialState and creating a new store for rerender ---
    // NOTE: We modify initialState directly here for simplicity in this test scenario.
    // A more robust approach might involve creating a new state object based on the old one.
    initialState.bookmark.formData.url = testUrlWithHash;
    store = mockStore(initialState); // Create a *new* store instance with the updated state
    store.dispatch = jest.fn(); // Re-assign mock dispatch for the new store instance

    // Rerender with the new store instance
    rerender(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Now check for the button and class - re-query elements after rerender
    const removeHashButton = screen.getByTitle(/Remove hash from URL/i);
    urlInput = screen.getByLabelText(/URL/i);
    expect(removeHashButton).toBeInTheDocument();
    expect(urlInput).toHaveValue(testUrlWithHash);
    expect(urlInput).toHaveClass('hash-detected');

    // Simulate clicking the remove hash button
    fireEvent.click(removeHashButton);

    // Check dispatch on the current store instance
    expect(store.dispatch).toHaveBeenCalledWith(
      setFormData({ url: testUrlWithoutHash })
    );

    // --- Simulate state update after clicking ---
    initialState.bookmark.formData.url = testUrlWithoutHash;
    store = mockStore(initialState); // Create another new store instance

    // Rerender with the latest store instance
    rerender(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // Assert button is gone and value/class are updated - re-query elements
    expect(
      screen.queryByTitle(/Remove hash from URL/i)
    ).not.toBeInTheDocument();
    urlInput = screen.getByLabelText(/URL/i);
    expect(urlInput).toHaveValue(testUrlWithoutHash);
    expect(urlInput).not.toHaveClass('hash-detected');
  });

  // Add more tests for other functionalities (submit, errors, checkboxes, tags, etc.)
});
