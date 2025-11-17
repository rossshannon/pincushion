import React, { useEffect, useRef, useState } from 'react';
import * as Ladda from 'ladda';
import { useSelector, useDispatch } from 'react-redux';
import { getTimestampFormats } from '../utils/date';
import { isLikelyTouchDevice } from '../utils/popupAffordances';
import {
  setFormData,
  submitBookmark,
  resetStatus,
  clearStatus,
  type BookmarkFormData,
} from '../redux/bookmarkSlice';
import { addSuggestedTag, restoreSuggestedTag } from '../redux/tagSlice';
import TagInput from './TagInput';
import TagSuggestions from './TagSuggestions';
import {
  selectDisplayableSuggestions,
  selectIsSuggestionsEmpty,
  selectSuggestionsSpinnerVisible,
} from '../redux/selectors';
import type { RootState, AppDispatch } from '../redux/store';

const MIN_SPINNER_DURATION_MS = 400;
export const __TEST_MIN_SPINNER_DURATION = MIN_SPINNER_DURATION_MS;

type ErrorField = keyof Pick<BookmarkFormData, 'url' | 'title' | 'description'>;

type LaddaInstance = ReturnType<typeof Ladda.create> | null;

function BookmarkForm() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    formData,
    status,
    errors,
    initialLoading,
    existingBookmarkTime,
    hasExistingBookmark,
    displayOriginalTimestamp,
  } = useSelector((state: RootState) => state.bookmark);
  const userTags = useSelector((state: RootState) => state.tags.tagCounts);
  const suggestions = useSelector((state: RootState) =>
    selectDisplayableSuggestions(state)
  );
  const spinnerVisible = useSelector((state: RootState) =>
    selectSuggestionsSpinnerVisible(state)
  );
  const suggestionsEmpty = useSelector((state: RootState) =>
    selectIsSuggestionsEmpty(state)
  );

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  const laddaRef = useRef<LaddaInstance>(null);
  const spinnerStartRef = useRef<number | null>(null);
  const spinnerStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const spinnerActiveRef = useRef(false);
  const [shouldAutoFocusTags] = useState(() => !isLikelyTouchDevice());

  useEffect(() => {
    if (btnRef.current) {
      laddaRef.current = Ladda.create(btnRef.current);
    }
  }, []);

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
      if (!spinnerActiveRef.current) {
        clearPendingStop();
        spinnerStartRef.current = Date.now();
        spinner.start();
        spinnerActiveRef.current = true;
      }
      return () => {
        clearPendingStop();
      };
    }

    const stopSpinner = () => {
      spinner.stop();
      spinnerStartRef.current = null;
      spinnerStopTimerRef.current = null;
      spinnerActiveRef.current = false;
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

  useEffect(() => {
    if (status === 'success') {
      const btn = btnRef.current;
      btn?.classList.add('success');
      const closeTimer = setTimeout(() => {
        window.close();
      }, 900);
      const clearTimer = setTimeout(() => {
        btn?.classList.remove('success');
        dispatch(resetStatus());
      }, 1200);
      return () => {
        clearTimeout(closeTimer);
        clearTimeout(clearTimer);
        btn?.classList.remove('success');
      };
    }
  }, [status, dispatch]);

  useEffect(() => {
    if (status !== 'error') {
      return undefined;
    }
    const formEl = formRef.current;
    const btn = btnRef.current;
    formEl?.classList.add('fail');
    btn?.classList.add('fail');

    const fieldOrder: ErrorField[] = ['url', 'title', 'description'];
    const refMap: Record<ErrorField, React.RefObject<HTMLInputElement | HTMLTextAreaElement>> = {
      url: urlRef,
      title: titleRef,
      description: descRef,
    };
    const firstError = fieldOrder.find((field) => errors?.[field]);
    const targetRef = firstError ? refMap[firstError] : null;
    if (targetRef?.current) {
      targetRef.current.focus();
      targetRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }

    const timer = setTimeout(() => {
      formEl?.classList.remove('fail');
      btn?.classList.remove('fail');
      dispatch(clearStatus());
    }, 1600);

    return () => {
      clearTimeout(timer);
      formEl?.classList.remove('fail');
      btn?.classList.remove('fail');
    };
  }, [status, errors, dispatch]);

  useEffect(() => {
    if (formData.private) {
      document.body.classList.add('private');
    } else {
      document.body.classList.remove('private');
    }
    return () => {
      document.body.classList.remove('private');
    };
  }, [formData.private]);

  useEffect(() => {
    const formEl = formRef.current;
    if (!formEl) return undefined;

    const handleBlur = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        typeof window !== 'undefined' &&
        typeof window.scrollTo === 'function'
      ) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    formEl.addEventListener('blur', handleBlur, true);
    return () => formEl.removeEventListener('blur', handleBlur, true);
  }, []);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const target = event.target;
    const field = target.name as keyof BookmarkFormData;
    let nextValue: string | boolean = target.value;
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      nextValue = target.checked;
    }
    dispatch(setFormData({ [field]: nextValue } as Partial<BookmarkFormData>));
  };

  const handleTagsChange = (newTagsArray: string[]) => {
    const removedTags = formData.tags.filter(
      (tag) => !newTagsArray.includes(tag)
    );
    removedTags.forEach((tag) => dispatch(restoreSuggestedTag(tag)));
    dispatch(setFormData({ tags: newTagsArray }));
  };

  const handleAddSuggestion = (tagToAdd: string) => {
    if (!formData.tags.includes(tagToAdd)) {
      dispatch(setFormData({ tags: [...formData.tags, tagToAdd] }));
    }
    dispatch(addSuggestedTag(tagToAdd));
  };

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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch(submitBookmark());
  };

  const { relative: relativeTimeStr, absolute: absoluteTimeStr } =
    getTimestampFormats(existingBookmarkTime);

  const buttonText = () => {
    if (initialLoading) return 'Loading…';
    if (status === 'saving') return 'Saving…';
    if (status === 'success') return 'Bookmark saved!';
    if (status === 'error') return 'Save failed';
    return hasExistingBookmark ? 'Update bookmark' : 'Add bookmark';
  };

  const shouldShowOriginalTimestamp =
    Boolean(existingBookmarkTime) &&
    displayOriginalTimestamp &&
    status !== 'saving';

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
          tabIndex={7}
        >
          <span className="ladda-label text">{buttonText()}</span>
        </button>
      </div>

      {errors?.generic && (
        <div className="error-message" role="alert">
          {errors.generic}
        </div>
      )}

      {shouldShowOriginalTimestamp && (
        <div className="timestamp-info" title={absoluteTimeStr}>
          Originally saved {relativeTimeStr}
        </div>
      )}

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
        tabIndex={1}
      />
      {errors?.title && <span className="helptext">{errors.title}</span>}

      <div className={`url-field ${errors?.url ? 'error' : ''}`}>
        <label htmlFor="url" className={errors?.url ? 'error' : ''}>
          URL
        </label>
        <input
          type="url"
          id="url"
          name="url"
          value={formData.url}
          onChange={handleChange}
          className={formData.url?.includes('#') ? 'hash-detected' : ''}
          aria-invalid={!!errors?.url}
          ref={urlRef}
          tabIndex={2}
        />
        {formData.url?.includes('#') && (
          <button
            type="button"
            className="remove-hash"
            onClick={() => {
              const cleanUrl = formData.url.replace(/#.*$/, '');
              dispatch(setFormData({ url: cleanUrl }));
            }}
            title="Remove hash from URL"
            tabIndex={-1}
          >
            &#35;
          </button>
        )}
        {errors?.url && <span className="helptext">{errors.url}</span>}
      </div>

      <label htmlFor="description" className={errors?.description ? 'error' : ''}>
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
        tabIndex={3}
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
            tabIndex={4}
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
            tabIndex={5}
            accessKey="l"
          />
          read later
        </label>
      </div>

      <label htmlFor="tag-input-field">tags</label>
      <TagInput
        id="tags"
        inputId="tag-input-field"
        userTags={userTags}
        value={formData.tags}
        onChange={handleTagsChange}
        tabIndex={6}
        autoFocus={shouldAutoFocusTags}
      />
      <TagSuggestions
        suggestions={suggestions}
        isLoading={spinnerVisible}
        isEmpty={suggestionsEmpty}
        onSuggestionClick={handleAddSuggestion}
      />
    </form>
  );
}

export default BookmarkForm;
