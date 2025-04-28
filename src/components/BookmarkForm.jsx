import React, { useEffect, useRef } from 'react';
import Ladda from 'ladda';
import { useSelector, useDispatch } from 'react-redux';
import { getTimestampFormats } from '../utils/date'; // Import the utility function
import {
  setFormData,
  submitBookmark,
  resetStatus,
} from '../redux/bookmarkSlice';
import { addSuggestedTag } from '../redux/tagSlice'; // Import action needed for suggestion removal
import TagInput from './TagInput.jsx';
import TagSuggestions from './TagSuggestions.jsx'; // <-- Import TagSuggestions

function BookmarkForm() {
  const dispatch = useDispatch();
  const { formData, status, errors, initialLoading, existingBookmarkTime } =
    useSelector((state) => state.bookmark);
  const userTags = useSelector((state) => state.tags.tagCounts);
  const btnRef = useRef(null);
  const descRef = useRef(null);
  const laddaRef = useRef(null);

  useEffect(() => {
    if (btnRef.current) {
      laddaRef.current = Ladda.create(btnRef.current);
    }
  }, []);

  // Control Ladda spinner
  useEffect(() => {
    if (laddaRef.current) {
      if (status === 'saving') laddaRef.current.start();
      else laddaRef.current.stop();
    }
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

  // Add useEffect to handle error shake animation (similar to original)
  useEffect(() => {
    const form = btnRef.current?.closest('form'); // Find the parent form
    if (status === 'error' && form) {
      form.classList.add('fail'); // Add shake class
      const timer = setTimeout(() => form.classList.remove('fail'), 820); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [status]);

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

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    dispatch(setFormData({ [name]: type === 'checkbox' ? checked : value }));
  };

  // Handler for the TagInput component
  const handleTagsChange = (newTagsArray) => {
    // Convert the array back to a space-separated string for Redux state
    const tagsString = newTagsArray.join(' ');
    dispatch(setFormData({ tags: tagsString }));
  };

  // --- Handler for clicking a suggested tag ---
  const handleAddSuggestion = (tagToAdd) => {
    const currentTags = formData.tags
      ? formData.tags.split(' ').filter(Boolean)
      : [];
    // Add the tag only if it's not already present
    if (!currentTags.includes(tagToAdd)) {
      const updatedTagsString = [...currentTags, tagToAdd].join(' ');
      dispatch(setFormData({ tags: updatedTagsString }));
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
  const initialTagsArray = formData.tags
    ? formData.tags.split(' ').filter(Boolean)
    : [];

  // Determine button text based on state
  const buttonText = () => {
    if (initialLoading) return 'Loading…';
    if (status === 'saving') return 'Saving…';
    if (status === 'success') return 'Bookmark saved!';
    if (status === 'error') return 'Save failed';
    return existingBookmarkTime ? 'Update bookmark' : 'Add bookmark';
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`bookmark-form ${status === 'error' ? 'fail' : ''}`}
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

      <label className={errors?.title ? 'error' : ''}>
        title
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          aria-invalid={!!errors?.title}
          tabIndex="1"
        />
        {errors?.title && <span className="helptext">{errors.title}</span>}
      </label>
      <label className={`url-field ${errors?.url ? 'error' : ''}`}>
        URL
        <input
          type="url"
          name="url"
          value={formData.url}
          onChange={handleChange}
          aria-invalid={!!errors?.url}
          tabIndex="2"
        />
        {formData.url && formData.url.includes('#') && (
          <button
            type="button"
            className="remove-hash"
            onClick={() => {
              const clean = formData.url.replace(/#.*$/, '');
              dispatch(setFormData({ url: clean }));
            }}
            title="Remove hash from URL"
          >
            &#35;
          </button>
        )}
        {errors?.url && <span className="helptext">{errors.url}</span>}
      </label>
      <label className={errors?.description ? 'error' : ''}>
        description
        <textarea
          name="description"
          ref={descRef}
          value={formData.description}
          onChange={handleChange}
          onInput={resizeTextarea}
          style={{ overflow: 'hidden', resize: 'none' }}
          tabIndex="3"
        />
        {errors?.description && (
          <span className="helptext">{errors.description}</span>
        )}
      </label>

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

      <label>
        tags
        <TagInput
          userTags={userTags}
          value={initialTagsArray}
          onChange={handleTagsChange}
          tabIndex="6"
        />
        {errors?.tags && <span className="helptext">{errors.tags}</span>}
      </label>

      <TagSuggestions onSuggestionClick={handleAddSuggestion} />
    </form>
  );
}

export default BookmarkForm;
