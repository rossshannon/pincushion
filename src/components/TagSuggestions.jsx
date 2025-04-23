import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { addSuggestedTag } from '../redux/tagSlice';
import { setFormData } from '../redux/bookmarkSlice';

function TagSuggestions() {
  const dispatch = useDispatch();
  const suggestions = useSelector(state => state.tags.suggested);
  const suggestedLoading = useSelector(state => state.tags.suggestedLoading);
  const currentTagsArray = useSelector(state =>
    state.bookmark.formData.tags.split(' ').filter(Boolean)
  );
  const currentTags = new Set(currentTagsArray);
  const handleClick = tag => {
    const updated = Array.from(currentTags).concat(tag);
    dispatch(setFormData({ tags: updated.join(' ') }));
    dispatch(addSuggestedTag(tag));
  };
  // While loading, show spinner
  if (suggestedLoading) {
    return (
      <div className="tag-suggestions">
        <h4>Suggested Tags</h4>
        <i id="tagspinner" className="fa fa-spinner fa-spin" />
      </div>
    );
  }
  // No suggestions available
  if (!suggestions || suggestions.length === 0) {
    return null;
  }
  return (
    <div className="tag-suggestions">
      <h4>Suggested Tags</h4>
      <TransitionGroup component="div" className="suggestions-list">
        {suggestions.map(tag => (
          <CSSTransition
            key={tag}
            timeout={300}
            classNames="suggestion"
            unmountOnExit
            onExit={node => {
              // Before exit transition, snapshot width, height, and margin to allow numeric collapse
              const style = window.getComputedStyle(node);
              node.style.maxWidth = node.offsetWidth + 'px';
              node.style.maxHeight = node.offsetHeight + 'px';
              node.style.marginRight = style.marginRight;
              node.style.opacity = '1';
            }}
            onExited={node => {
              // Clean up inline styles after transition
              node.style.maxWidth = '';
              node.style.maxHeight = '';
              node.style.marginRight = '';
              node.style.opacity = '';
            }}
          >
            <div className="suggestion-item">
              <button
                type="button"
                onClick={() => handleClick(tag)}
              >
                {tag}
              </button>
            </div>
          </CSSTransition>
        ))}
      </TransitionGroup>
    </div>
  );
}

export default TagSuggestions;