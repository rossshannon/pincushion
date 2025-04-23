import React, { Fragment } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { addSuggestedTag } from '../redux/tagSlice';
import { setFormData } from '../redux/bookmarkSlice';

// A common container div for all states of this component
const SuggestionsContainer = ({ children, id, className }) => (
  <div id={id} className={`tag-suggestions-container ${className || ''}`}>
    {children}
  </div>
);

function TagSuggestions() {
  const dispatch = useDispatch();
  const suggestions = useSelector((state) => state.tags.suggested);
  const suggestedLoading = useSelector((state) => state.tags.suggestedLoading);
  const currentTagsArray = useSelector((state) =>
    state.bookmark.formData.tags.split(' ').filter(Boolean)
  );
  const currentTags = new Set(currentTagsArray);

  const handleClick = (tag) => {
    const updatedTags = [...currentTagsArray, tag].join(' ');
    dispatch(setFormData({ tags: updatedTags }));
    dispatch(addSuggestedTag(tag));
  };

  const displayableSuggestions = suggestions.filter(
    (tag) => tag === '$separator' || !currentTags.has(tag)
  );

  const isEmpty =
    displayableSuggestions.length === 0 ||
    (displayableSuggestions.length === 1 &&
      displayableSuggestions[0] === '$separator');

  if (suggestedLoading) {
    return (
      <SuggestionsContainer id="suggested-loading">
        <div className="loading-indicator">
          <span className="spinner" id="tagspinner"></span>finding suggested
          tags&hellip;
        </div>
      </SuggestionsContainer>
    );
  }

  if (isEmpty) {
    return (
      <SuggestionsContainer id="suggested" className="none">
        No suggested tags for this page.
      </SuggestionsContainer>
    );
  } else {
    return (
      <SuggestionsContainer id="suggested">
        <TransitionGroup component="div" className="suggestions-list">
          {displayableSuggestions.map((tag, index) => {
            if (tag === '$separator') {
              return <hr key={`separator-${index}`} />;
            }
            return (
              <CSSTransition
                key={tag}
                timeout={300}
                classNames="suggestion"
                unmountOnExit
                onExit={(node) => {
                  const style = window.getComputedStyle(node);
                  node.style.maxWidth = node.offsetWidth + 'px';
                  node.style.maxHeight = node.offsetHeight + 'px';
                  node.style.marginRight = style.marginRight;
                  node.style.opacity = '1';
                }}
                onExited={(node) => {
                  node.style.maxWidth = '';
                  node.style.maxHeight = '';
                  node.style.marginRight = '';
                  node.style.opacity = '';
                }}
              >
                <button
                  type="button"
                  className="suggested_tag"
                  onClick={() => handleClick(tag)}
                >
                  {tag}
                </button>
              </CSSTransition>
            );
          })}
        </TransitionGroup>
      </SuggestionsContainer>
    );
  }
}

export default TagSuggestions;
