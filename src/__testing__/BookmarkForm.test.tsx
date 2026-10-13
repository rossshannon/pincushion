import { vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';

import BookmarkForm from '../components/BookmarkForm';
import { setFormData, removeUrlFragment } from '../redux/bookmarkSlice';

const mockStore = configureStore([]);

// jsdom has no AnimationEvent, so React listens for the webkit-prefixed name;
// fireEvent.animationEnd would go unheard.
const endAnimation = (element, animationName) => {
  const event = new Event('webkitAnimationEnd', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: animationName });
  fireEvent(element, event);
};

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
        hasExistingBookmark: false,
        displayOriginalTimestamp: false,
      },
      tags: {
        tagCounts: {},
        suggested: [],
        suggestedLoading: false,
        gptSuggestions: [],
        gptStatus: 'idle',
        gptError: null,
        gptContextKey: null,
        recentTags: [],
        filteredRecentTags: [],
      },
      auth: {
        user: '',
        token: '',
        openAiToken: '',
      },
    };
    store = mockStore(initialState);
    store.dispatch = vi.fn();
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
    store.dispatch = vi.fn(); // Re-assign mock dispatch for the new store instance

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
    expect(store.dispatch).toHaveBeenCalledWith(removeUrlFragment());

    // --- Simulate state update after clicking ---
    initialState.bookmark.formData.url = testUrlWithoutHash;
    store = mockStore(initialState); // Create another new store instance

    // Rerender with the latest store instance
    rerender(
      <Provider store={store}>
        <BookmarkForm />
      </Provider>
    );

    // The button stays to animate out, then unmounts when its exit ends
    const leavingButton = screen.getByTitle(/Remove hash from URL/i);
    expect(leavingButton).toHaveClass('is-leaving');
    expect(leavingButton).toHaveAttribute('aria-hidden', 'true');
    endAnimation(leavingButton, 'bounce-in'); // can end mid-exit; ignored
    expect(leavingButton).toBeInTheDocument();
    endAnimation(leavingButton, 'hash-leave');
    expect(
      screen.queryByTitle(/Remove hash from URL/i)
    ).not.toBeInTheDocument();

    // Assert value/class are updated - re-query elements
    urlInput = screen.getByLabelText(/URL/i);
    expect(urlInput).toHaveValue(testUrlWithoutHash);
    expect(urlInput).not.toHaveClass('hash-detected');
  });

  const storeWithUrl = (url) =>
    mockStore({
      ...initialState,
      bookmark: {
        ...initialState.bookmark,
        formData: { ...initialState.bookmark.formData, url },
      },
    });

  test('unmounts a leaving # button on a timer if animationend never fires', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <Provider store={storeWithUrl('https://example.com/page#a')}>
          <BookmarkForm />
        </Provider>
      );

      rerender(
        <Provider store={storeWithUrl('https://example.com/page')}>
          <BookmarkForm />
        </Provider>
      );
      expect(screen.getByTitle(/Remove hash from URL/i)).toHaveClass(
        'is-leaving'
      );

      // Typing a # again mid-exit brings the button back.
      rerender(
        <Provider store={storeWithUrl('https://example.com/page#b')}>
          <BookmarkForm />
        </Provider>
      );
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByTitle(/Remove hash from URL/i)).not.toHaveClass(
        'is-leaving'
      );

      rerender(
        <Provider store={storeWithUrl('https://example.com/page')}>
          <BookmarkForm />
        </Provider>
      );
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(
        screen.queryByTitle(/Remove hash from URL/i)
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('times the fallback from the exit animation, not bounce-in', () => {
    vi.useFakeTimers();
    const realGetComputedStyle = window.getComputedStyle;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element, pseudo) => {
        const style = realGetComputedStyle(element, pseudo);
        if (!element.classList?.contains('remove-hash')) return style;
        return {
          ...style,
          animationName: 'bounce-in, hash-leave',
          animationDuration: '0.8s, 0.3s',
        };
      });
    try {
      const { rerender } = render(
        <Provider store={storeWithUrl('https://example.com/page#a')}>
          <BookmarkForm />
        </Provider>
      );
      rerender(
        <Provider store={storeWithUrl('https://example.com/page')}>
          <BookmarkForm />
        </Provider>
      );
      // 0.3s exit + 0.3s margin; bounce-in's 0.8s would push this to 1.1s.
      act(() => {
        vi.advanceTimersByTime(650);
      });
      expect(
        screen.queryByTitle(/Remove hash from URL/i)
      ).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  test('hands focus to the URL field when # is pressed', () => {
    render(
      <Provider store={storeWithUrl('https://example.com/page#a')}>
        <BookmarkForm />
      </Provider>
    );
    const button = screen.getByTitle(/Remove hash from URL/i);
    button.focus();
    fireEvent.click(button);
    expect(screen.getByLabelText(/URL/i)).toHaveFocus();
  });

  // Add more tests for other functionalities (submit, errors, checkboxes, tags, etc.)
});
