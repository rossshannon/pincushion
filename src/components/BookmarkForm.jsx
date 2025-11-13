import React, { useEffect, useRef, useState } from 'react';
import Ladda from 'ladda';
import { useSelector, useDispatch } from 'react-redux';
import { getTimestampFormats } from '../utils/date'; // Import the utility function
import { isLikelyTouchDevice } from '../utils/popupAffordances';
import {
  setFormData,
  submitBookmark,
  resetStatus,
  clearStatus,
} from '../redux/bookmarkSlice';
import { addSuggestedTag, restoreSuggestedTag } from '../redux/tagSlice'; // Import actions
import TagInput from './TagInput.jsx';
import TagSuggestions from './TagSuggestions.jsx';
import {
  selectDisplayableSuggestions,
  selectSuggestedLoading,
  selectIsSuggestionsEmpty,
} from '../redux/selectors';

const MIN_SPINNER_DURATION_MS = 400;
export const __TEST_MIN_SPINNER_DURATION = MIN_SPINNER_DURATION_MS;

function BookmarkForm() {
  const dispatch = useDispatch();
  const {
    formData,
    status,
    errors,
    initialLoading,
    existingBookmarkTime,
    hasExistingBookmark,
  } =
    useSelector((state) => state.bookmark);
  const userTags = useSelector((state) => state.tags.tagCounts);
  const suggestions = useSelector(selectDisplayableSuggestions);
  const suggestionsLoading = useSelector(selectSuggestedLoading);
  const suggestionsEmpty = useSelector(selectIsSuggestionsEmpty);
  const btnRef = useRef(null);
  const formRef = useRef(null);
  const titleRef = useRef(null);
  const urlRef = useRef(null);
  const descRef = useRef(null);
  const laddaRef = useRef(null);
  const spinnerStartRef = useRef(null);
  const spinnerStopTimerRef = useRef(null);
  const [shouldAutoFocusTags] = useState(() => !isLikelyTouchDevice());

  useEffect(() => {
    if (btnRef.current) {
      laddaRef.current = Ladda.create(btnRef.current);
    }
  }, []);

  // Control Ladda spinner
  useEffect(() => {
    const spinner = laddaRef.current;
    if (!spinner) return undefined;

    const clearPendingStop = () => {
      if (spinnerStopTimerRef.current) {
        clearTimeout(spinnerStopTimerRef.current);
        spinnerStopTimerRef.current = null;
      }
    };

    if (status === 'saving') {
      clearPendingStop();
      spinnerStartRef.current = Date.now();
      spinner.start();
      return;
    }

    const stopSpinner = () => {
      spinner.stop();
      spinnerStartRef.current = null;
      spinnerStopTimerRef.current = null;
    };

    const elapsed =
      spinnerStartRef.current !== null
        ? Date.now() - spinnerStartRef.current
        : MIN_SPINNER_DURATION_MS;
    const remaining = Math.max(MIN_SPINNER_DURATION_MS - elapsed, 0);
    if (remaining === 0) {
      stopSpinner();
    } else {
      clearPendingStop();
      spinnerStopTimerRef.current = setTimeout(stopSpinner, remaining);
    }

    return () => {
      clearPendingStop();
    };
  }, [status]);

  // Success animation: pulse button, close window, then reset status and text
  useEffect(() => {
    if (status === 'success') {
      const btn = btnRef.current;
      if (btn) btn.classList.add('success');
      // Close window shortly after success, then reset status and button class
      const closeTimer = setTimeout(() => {
        window.close();
      }, 900);
      const clearTimer = setTimeout(() => {
        if (btn) btn.classList.remove('success');
        dispatch(resetStatus());
      }, 1200);
      return () => {
        clearTimeout(closeTimer);
        clearTimeout(clearTimer);
        if (btn) btn.classList.remove('success');
      };
    }
  }, [status, dispatch]);

  // Error feedback: shake form, pulse button, focus first invalid field, then soften status.
  useEffect(() => {
    if (status !== 'error') {
      return;
    }
    const formEl = formRef.current;
    const btn = btnRef.current;
    if (formEl) {
      formEl.classList.add('fail');
    }
    if (btn) {
      btn.classList.add('fail');
    }

    const fieldOrder = ['url', 'title', 'description'];
    const refMap = {
      url: urlRef,
      title: titleRef,
      description: descRef,
    };
    const firstError = fieldOrder.find(
      (field) => errors?.[field]
    );
    const targetRef = firstError ? refMap[firstError] : null;
    if (targetRef?.current) {
      targetRef.current.focus();
      if (typeof targetRef.current.scrollIntoView === 'function') {
        targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    const timer = setTimeout(() => {
      if (formEl) {
        formEl.classList.remove('fail');
      }
      if (btn) {
        btn.classList.remove('fail');
      }
      dispatch(clearStatus());
    }, 1600);

    return () => {
      clearTimeout(timer);
      if (formEl) {
        formEl.classList.remove('fail');
      }
      if (btn) {
        btn.classList.remove('fail');
      }
    };
  }, [status, errors, dispatch]);

  // Add useEffect to toggle body class based on 'private' state
  useEffect(() => {
    if (formData.private) {
      document.body.classList.add('private');
    } else {
      document.body.classList.remove('private');
    }
    // Cleanup function to remove the class when the component unmounts
    return () => {
      document.body.classList.remove('private');
    };
  }, [formData.private]); // Dependency array ensures this runs only when 'private' changes

  useEffect(() => {
    const formEl = formRef.current;
    if (!formEl) return undefined;
    const handleBlur = (event) => {
      if (
        event.target &&
        (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')
      ) {
        if (
          typeof window !== 'undefined' &&
          typeof window.scrollTo === 'function'
        ) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    };
    formEl.addEventListener('blur', handleBlur, true);
    return () => formEl.removeEventListener('blur', handleBlur, true);
  }, []);

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    dispatch(setFormData({ [name]: type === 'checkbox' ? checked : value }));
  };

  // Handler for the TagInput component
  const handleTagsChange = (newTagsArray) => {
    const currentTags = Array.isArray(formData.tags) ? formData.tags : [];
    const removedTags = currentTags.filter(
      (tag) => !newTagsArray.includes(tag)
    );
    removedTags.forEach((tag) => dispatch(restoreSuggestedTag(tag)));
    dispatch(setFormData({ tags: newTagsArray }));
  };

  // --- Handler for clicking a suggested tag ---
  const handleAddSuggestion = (tagToAdd) => {
    const currentTags = Array.isArray(formData.tags) ? formData.tags : [];
    if (!currentTags.includes(tagToAdd)) {
      dispatch(setFormData({ tags: [...currentTags, tagToAdd] }));
    }
    // Also dispatch action to remove the tag from the suggested list in UI
    dispatch(addSuggestedTag(tagToAdd));
  };

  // Auto-resize textarea height
  const resizeTextarea = () => {
    const el = descRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useEffect(() => {
    resizeTextarea();
  }, [formData.description]);

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(submitBookmark());
  };

  // Get formatted timestamp strings
  const { relative: relativeTimeStr, absolute: absoluteTimeStr } =
    getTimestampFormats(existingBookmarkTime);

  // Convert tags string from formData to array for TagInput component
  const initialTagsArray = Array.isArray(formData.tags)
    ? formData.tags
    : [];

  // Determine button text based on state
  const buttonText = () => {
    if (initialLoading) return 'Loading…';
    if (status === 'saving') return 'Saving…';
    if (status === 'success') return 'Bookmark saved!';
    if (status === 'error') return 'Save failed';
    return hasExistingBookmark ? 'Update bookmark' : 'Add bookmark';
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="bookmark-form"
      role="form"
    >
      <div id="bookmark-save" className="bookmark-save">
        {initialLoading && (
          <i id="mainspinner" className="fa fa-spinner fa-spin" />
        )}
        <button
          ref={btnRef}
          id="submit"
          className="ladda-button"
          data-style="expand-left"
          data-size="m"
          data-spinner-size="30"
          data-color="blue"
          type="submit"
          disabled={initialLoading || status === 'saving'}
          tabIndex="7"
        >
          <span className="ladda-label text">{buttonText()}</span>
        </button>
      </div>

      {errors?.generic && (
        <div className="error-message" role="alert">
          {errors.generic}
        </div>
      )}

      {existingBookmarkTime && ( // Only render if timestamp exists
        <div className="timestamp-info" title={absoluteTimeStr}>
          Originally saved {relativeTimeStr}
        </div>
      )}

      {/* Title Field */}
      <label htmlFor="title" className={errors?.title ? 'error' : ''}>
        title
      </label>
      <input
        type="text"
        id="title"
        name="title"
        value={formData.title}
        onChange={handleChange}
        aria-invalid={!!errors?.title}
        ref={titleRef}
        tabIndex="1"
      />
      {errors?.title && <span className="helptext">{errors.title}</span>}

      {/* URL Field - Keep wrapper for positioning button */}
      <div className={`url-field ${errors?.url ? 'error' : ''}`}>
        <label htmlFor="url">URL</label>
        <input
          type="url"
          id="url"
          name="url"
          value={formData.url}
          onChange={handleChange}
          className={formData.url?.includes('#') ? 'hash-detected' : ''}
          aria-invalid={!!errors?.url}
          ref={urlRef}
          tabIndex="2"
        />
        {/* Remove hash button remains sibling to input inside the wrapper */}
        {formData.url?.includes('#') && (
          <button
            type="button"
            className="remove-hash"
            onClick={() => {
              const cleanUrl = formData.url.replace(/#.*$/, '');
              dispatch(setFormData({ url: cleanUrl }));
            }}
            title="Remove hash from URL"
            tabIndex="-1"
          >
            &#35;
          </button>
        )}
        {errors?.url && <span className="helptext">{errors.url}</span>}
      </div>

      {/* Description Field */}
      <label
        htmlFor="description"
        className={errors?.description ? 'error' : ''}
      >
        description
      </label>
      <textarea
        id="description"
        name="description"
        ref={descRef}
        value={formData.description}
        onChange={handleChange}
        onInput={resizeTextarea}
        style={{ overflow: 'hidden', resize: 'vertical' }}
        tabIndex="3"
      />
      {errors?.description && (
        <span className="helptext">{errors.description}</span>
      )}

      <div id="modifiers">
        <label>
          <input
            type="checkbox"
            name="private"
            checked={formData.private}
            onChange={handleChange}
            tabIndex="4"
            accessKey="p"
          />
          private
        </label>
        <label>
          <input
            type="checkbox"
            name="toread"
            checked={formData.toread}
            onChange={handleChange}
            tabIndex="5"
            accessKey="l"
          />
          read later
        </label>
      </div>

      {/* Tags Field */}
      <label htmlFor="tags">tags</label>
      <TagInput
        id="tags"
        userTags={userTags}
        value={initialTagsArray}
        onChange={handleTagsChange}
        tabIndex="6"
        autoFocus={shouldAutoFocusTags}
      />
      {errors?.tags && <span className="helptext">{errors.tags}</span>}

      <TagSuggestions
        suggestions={suggestions}
        isLoading={suggestionsLoading}
        isEmpty={suggestionsEmpty}
        onSuggestionClick={handleAddSuggestion}
      />
    </form>
  );
}

export default BookmarkForm;
