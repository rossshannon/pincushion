import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectDisplayableSuggestions,
  selectSuggestedLoading,
  selectIsSuggestionsEmpty,
} from '../redux/selectors';
import { updateFormData } from '../redux/bookmarkSlice';

const TagSuggestions = () => {
  const dispatch = useDispatch();
  const suggestions = useSelector(selectDisplayableSuggestions);
  const isLoading = useSelector(selectSuggestedLoading);
  const isEmpty = useSelector(selectIsSuggestionsEmpty);

  const handleClick = (tag) => {
    if (tag === '$separator') return;

    const currentTags = useSelector((state) => state.bookmark.formData.tags);
    const updatedTags = currentTags ? `${currentTags} ${tag}` : tag;
    dispatch(updateFormData({ tags: updatedTags }));
  };

  if (isLoading) {
    return <div className="tag-suggestions">Loading suggestions...</div>;
  }

  if (isEmpty) {
    return null;
  }

  return (
    <div className="tag-suggestions">
      {suggestions.map((tag, index) =>
        tag === '$separator' ? (
          <span key={`separator-${index}`} className="separator">
            •
          </span>
        ) : (
          <button
            key={tag}
            onClick={() => handleClick(tag)}
            className="tag-suggestion"
          >
            {tag}
          </button>
        )
      )}
    </div>
  );
};

export default TagSuggestions;
