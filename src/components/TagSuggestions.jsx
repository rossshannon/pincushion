import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { TransitionGroup, CSSTransition } from 'react-transition-group';

const TagSuggestions = ({
  suggestions,
  isLoading = false,
  isEmpty = false,
  onSuggestionClick,
}) => {
  const spinnerRef = useRef(null);

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

  const showSuggestions = !isEmpty;

  return (
    <>
      <CSSTransition
        in={isLoading}
        timeout={250}
        classNames="tag-spinner"
        unmountOnExit
        nodeRef={spinnerRef}
      >
        <div className="tag-suggestions" ref={spinnerRef}>
          <span className="spinner" id="tagspinner"></span>
          <span className="tag-suggestions__text">
            finding suggested tags&hellip;
          </span>
        </div>
      </CSSTransition>
      {showSuggestions && (
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
                    &bull;
                  </span>
                ) : (
                  <button
                    ref={nodeRef}
                    type="button"
                    onClick={() => handleClick(tag)}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    {tag}
                  </button>
                )}
              </CSSTransition>
            );
          })}
        </TransitionGroup>
      )}
    </>
  );
};
TagSuggestions.propTypes = {
  suggestions: PropTypes.arrayOf(PropTypes.string).isRequired,
  isLoading: PropTypes.bool,
  isEmpty: PropTypes.bool,
  onSuggestionClick: PropTypes.func,
};

export default TagSuggestions;
