import React, { useRef } from 'react';
import { TransitionGroup, CSSTransition } from 'react-transition-group';

interface TagSuggestionsProps {
  suggestions: string[];
  isLoading?: boolean;
  isEmpty?: boolean;
  onSuggestionClick?: (tag: string) => void;
}

const TagSuggestions: React.FC<TagSuggestionsProps> = ({
  suggestions,
  isLoading = false,
  isEmpty = false,
  onSuggestionClick,
}) => {
  const spinnerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(
    new Map<string, React.RefObject<HTMLSpanElement | HTMLButtonElement>>()
  );

  const handleClick = (tag: string) => {
    if (tag === '$separator') return;
    onSuggestionClick?.(tag);
  };

  const getNodeRef = (
    key: string
  ): React.RefObject<HTMLSpanElement | HTMLButtonElement> => {
    let ref = nodeRefs.current.get(key);
    if (!ref) {
      ref = React.createRef<HTMLSpanElement | HTMLButtonElement>();
      nodeRefs.current.set(key, ref);
    }
    return ref;
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
                classNames=
                  {tag === '$separator' ? 'suggestion-separator' : 'suggestion-chip'}
              >
                {tag === '$separator' ? (
                  <span
                    ref={nodeRef as React.RefObject<HTMLSpanElement>}
                    className="separator"
                    aria-label="AI tag suggestions"
                  >
                    &bull;
                  </span>
                ) : (
                  <button
                    ref={nodeRef as React.RefObject<HTMLButtonElement>}
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

export default TagSuggestions;
