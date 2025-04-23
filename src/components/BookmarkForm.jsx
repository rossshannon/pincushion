import React, { useEffect, useRef } from 'react';
import Ladda from 'ladda';
import { useSelector, useDispatch } from 'react-redux';
import {
  setFormData,
  submitBookmark,
  resetStatus,
} from '../redux/bookmarkSlice';

// Helper to format timestamp
const formatTimestamp = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    // Use British English locale and common date/time format
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    console.error('Error formatting timestamp:', e);
    return 'Invalid Date';
  }
};

function BookmarkForm() {
  const dispatch = useDispatch();
  const { formData, status, errors, initialLoading, existingBookmarkTime } =
    useSelector((state) => state.bookmark);
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

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    dispatch(setFormData({ [name]: type === 'checkbox' ? checked : value }));
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

  const formattedTime = formatTimestamp(existingBookmarkTime);

  return (
    <form
      onSubmit={handleSubmit}
      className={`bookmark-form ${status === 'error' ? 'fail' : ''}`}
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
        >
          <span className="ladda-label text">
            {initialLoading
              ? 'Loading…'
              : status === 'saving'
              ? 'Saving…'
              : status === 'success'
              ? 'Bookmark saved!'
              : status === 'error'
              ? 'Save failed'
              : 'Add bookmark'}
          </span>
        </button>
      </div>

      {formattedTime && (
        <div className="timestamp-info">Originally saved: {formattedTime}</div>
      )}

      <label className={errors?.title ? 'error' : ''}>
        Title:
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          aria-invalid={!!errors?.title}
        />
        {errors?.title && <span className="helptext">{errors.title}</span>}
      </label>
      <label className={`url-field ${errors?.url ? 'error' : ''}`}>
        URL:
        <input
          type="url"
          name="url"
          value={formData.url}
          onChange={handleChange}
          aria-invalid={!!errors?.url}
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
        Description:
        <textarea
          name="description"
          ref={descRef}
          value={formData.description}
          onChange={handleChange}
          onInput={resizeTextarea}
          style={{ overflow: 'hidden', resize: 'none' }}
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
          />
          private
        </label>
        <label>
          <input
            type="checkbox"
            name="toread"
            checked={formData.toread}
            onChange={handleChange}
          />
          read later
        </label>
      </div>
    </form>
  );
}

export default BookmarkForm;
