import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { TransitionGroup, CSSTransition } from 'react-transition-group';

const TagSuggestions = ({
  suggestions,
  isLoading = false,
  isEmpty = false,
  onSuggestionClick,
}) => {
  const handleClick = (tag) => {
    if (tag === '$separator') return;
    if (onSuggestionClick) {
      onSuggestionClick(tag);
    }
  };

  const nodeRefs = useRef(new Map());
  const getNodeRef = (key) => {
    if (!nodeRefs.current.has(key)) {
      nodeRefs.current.set(key, React.createRef());
    }
    return nodeRefs.current.get(key);
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
    <TransitionGroup className="suggestions-list" component="div">
      {suggestions.map((tag, index) => {
        const key = tag === '$separator' ? `separator-${index}` : tag;
        const nodeRef = getNodeRef(key);
        return (
          <CSSTransition
            key={key}
            nodeRef={nodeRef}
            timeout={{ enter: 160, exit: 240 }}
            classNames={
              tag === '$separator'
                ? 'suggestion-separator'
                : 'suggestion-chip'
            }
          >
            {tag === '$separator' ? (
              <span
                ref={nodeRef}
                className="separator"
                aria-label="AI tag suggestions"
              >
                ai tag ideas
              </span>
            ) : (
              <button
                ref={nodeRef}
                type="button"
                onClick={() => handleClick(tag)}
              >
                {tag}
              </button>
            )}
          </CSSTransition>
        );
      })}
    </TransitionGroup>
  );
};
TagSuggestions.propTypes = {
  suggestions: PropTypes.arrayOf(PropTypes.string).isRequired,
  isLoading: PropTypes.bool,
  isEmpty: PropTypes.bool,
  onSuggestionClick: PropTypes.func,
};

export default TagSuggestions;
