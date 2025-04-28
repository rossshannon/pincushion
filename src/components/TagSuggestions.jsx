import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectDisplayableSuggestions,
  selectSuggestedLoading,
  selectIsSuggestionsEmpty,
} from '../redux/selectors';
import { setFormData } from '../redux/bookmarkSlice';

const TagSuggestions = () => {
  const dispatch = useDispatch();
  const suggestions = useSelector(selectDisplayableSuggestions);
  const isLoading = useSelector(selectSuggestedLoading);
  const isEmpty = useSelector(selectIsSuggestionsEmpty);
  const currentTags = useSelector((state) => state.bookmark.formData.tags);

  const handleClick = (tag) => {
    if (tag === '$separator') return;

    const updatedTags = currentTags ? `${currentTags} ${tag}` : tag;
    dispatch(setFormData({ tags: updatedTags }));
  };

  if (isLoading) {
    return (
      <div className="tag-suggestions">
        <span className="spinner" id="tagspinner"></span>
        finding suggested tags&hellip;
      </div>
    );
  }

  if (isEmpty) {
    return null;
  }

  return (
    <div className="suggestions-list">
      {suggestions.map((tag, index) =>
        tag === '$separator' ? (
          <span key={`separator-${index}`} className="separator">
            •
          </span>
        ) : (
          <button key={tag} onClick={() => handleClick(tag)}>
            {tag}
          </button>
        )
      )}
    </div>
  );
};

export default TagSuggestions;
