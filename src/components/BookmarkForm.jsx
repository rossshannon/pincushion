import React, { useEffect, useRef } from 'react';
import Ladda from 'ladda';
import { useSelector, useDispatch } from 'react-redux';
import { setFormData, submitBookmark, resetStatus } from '../redux/bookmarkSlice';

function BookmarkForm() {
  const dispatch = useDispatch();
  const { formData, status, error, initialLoading } = useSelector(state => state.bookmark);
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

  const handleChange = e => {
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

  const handleSubmit = e => {
    e.preventDefault();
    dispatch(submitBookmark());
  };

  return (
    <form onSubmit={handleSubmit} className="bookmark-form">
      <div id="bookmark-save" className="bookmark-save">
        {initialLoading && <i id="mainspinner" className="fa fa-spinner fa-spin" />}
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
                  : 'Add bookmark'}
          </span>
        </button>
      </div>
      <label>
        Title:
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
        />
      </label>
      <label className="url-field">
        URL:
        <input
          type="url"
          name="url"
          value={formData.url}
          onChange={handleChange}
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
      </label>
      <label>
        Description:
      <textarea
        name="description"
        ref={descRef}
        value={formData.description}
        onChange={handleChange}
        onInput={resizeTextarea}
        style={{ overflow: 'hidden', resize: 'none' }}
      />
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
      {error && <div className="error">Error: {error}</div>}
    </form>
  );
}

export default BookmarkForm;