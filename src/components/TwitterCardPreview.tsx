import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { CSSTransition } from 'react-transition-group';

const hexToRgba = (hex: string, alpha: number): string => {
  const sanitized = hex.replace('#', '');
  const normalized = sanitized.length === 3
    ? sanitized.split('').map((char) => char + char).join('')
    : sanitized.padEnd(6, '0');
  const int = parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const TwitterCardPreview = () => {
  const { card, status } = useSelector(
    (state: RootState) => state.twitterCard
  );
  const panelRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const displayCard = card;
  const [showImage, setShowImage] = useState(true);
  const [showFavicon, setShowFavicon] = useState(true);

  useEffect(() => {
    setShowImage(true);
  }, [displayCard?.imageUrl]);

  useEffect(() => {
    setShowFavicon(true);
  }, [displayCard?.faviconUrl]);

  const showPanel = status === 'loading' || !!displayCard;

  if (!showPanel) {
    return null;
  }

  const message = status === 'loading' ? 'Getting page preview…' : null;

  const imageAlt = displayCard?.title ? '' : 'Preview image';
  const imageAriaHidden = displayCard?.title ? true : false;
  const accentStyle = displayCard?.themeColor
    ? {
        borderColor: displayCard.themeColor,
        boxShadow: `0 12px 24px ${hexToRgba(displayCard.themeColor, 0.14)}`,
      }
    : undefined;
  return (
    <CSSTransition
      in={showPanel}
      timeout={{ enter: 200, exit: 160 }}
      classNames="twitter-card-panel-fade"
      unmountOnExit
      nodeRef={panelRef}
    >
      <section
        className="twitter-card-panel"
        aria-live="polite"
        ref={panelRef}
      >
        {displayCard && (
          <div className="twitter-card-panel__label">Page preview</div>
        )}

        {message && (
          <p className="twitter-card-panel__message">
            <span className="twitter-card-panel__spinner" aria-hidden="true" />
            {message}
          </p>
        )}

        <CSSTransition
          in={!!card}
          timeout={220}
          classNames="twitter-card-fade"
          unmountOnExit
          nodeRef={cardRef}
        >
          <article
            ref={cardRef}
            className="twitter-card"
            aria-label="Detected page preview"
            style={accentStyle}
          >
            {displayCard?.imageUrl && showImage && (
              <div className="twitter-card__image-wrapper">
                <img
                  src={displayCard.imageUrl}
                  alt={imageAlt}
                  aria-hidden={imageAriaHidden}
                  loading="lazy"
                  onError={() => setShowImage(false)}
                />
              </div>
            )}
            <div className="twitter-card__body">
              <div className="twitter-card__domain">
                {displayCard?.faviconUrl && showFavicon && (
                  <img
                    src={displayCard.faviconUrl}
                    alt=""
                    aria-hidden="true"
                    className="twitter-card__favicon"
                    onError={() => setShowFavicon(false)}
                  />
                )}
                <span>{displayCard?.siteName || displayCard?.siteDomain || 'Preview'}</span>
                {displayCard?.siteDomain && (
                  <span className="twitter-card__domain-pill">
                    {displayCard.siteDomain}
                  </span>
                )}
                {displayCard?.siteHandle && (
                  <span className="twitter-card__handle">{displayCard.siteHandle}</span>
                )}
              </div>
              {displayCard?.title && <h3 className="twitter-card__title">{displayCard.title}</h3>}
              {displayCard?.description && (
                <p className="twitter-card__description">{displayCard.description}</p>
              )}
            </div>
          </article>
        </CSSTransition>
      </section>
    </CSSTransition>
  );
};

export default TwitterCardPreview;
