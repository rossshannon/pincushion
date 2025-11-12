import React from 'react';
import PropTypes from 'prop-types';

const TagSuggestions = ({
  suggestions,
  isLoading,
  isEmpty,
  onSuggestionClick,
}) => {
  const handleClick = (tag) => {
    if (tag === '$separator') return;
    if (onSuggestionClick) {
      onSuggestionClick(tag);
    }
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
          <button type="button" key={tag} onClick={() => handleClick(tag)}>
            {tag}
          </button>
        )
      )}
    </div>
  );
};
TagSuggestions.propTypes = {
  suggestions: PropTypes.arrayOf(PropTypes.string).isRequired,
  isLoading: PropTypes.bool,
  isEmpty: PropTypes.bool,
  onSuggestionClick: PropTypes.func,
};

TagSuggestions.defaultProps = {
  isLoading: false,
  isEmpty: false,
  onSuggestionClick: undefined,
};

export default TagSuggestions;
