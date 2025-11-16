import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import TwitterCardPreview from '../TwitterCardPreview';

const renderWithState = (state: any) => {
  const store = configureStore({
    reducer: {
      twitterCard: (s = state) => s,
    },
    preloadedState: {
      twitterCard: state,
    },
  });
  return render(
    <Provider store={store}>
      <TwitterCardPreview />
    </Provider>
  );
};

const sampleCard = {
  url: 'https://example.com',
  title: 'Example Title',
  description: 'Example description',
  imageUrl: 'https://example.com/image.jpg',
  siteName: 'Example',
  siteHandle: '@example',
  siteDomain: 'example.com',
  cardType: 'summary_large_image',
  fetchedAt: '2025-11-15T20:05:00.000Z',
  themeColor: '#0a84ff',
  faviconUrl: 'https://example.com/favicon.ico',
};

describe('TwitterCardPreview', () => {
  it('renders preview content with favicon and domain pill', () => {
    renderWithState({
      card: sampleCard,
      status: 'succeeded',
      error: null,
      lastUrl: sampleCard.url,
      previewError: null,
      previewStatus: 'fresh',
    });

    expect(screen.getByText('Example Title')).toBeInTheDocument();
    expect(screen.getByText('Example description')).toBeInTheDocument();
    expect(screen.getByText('@example')).toBeInTheDocument();
    expect(screen.getAllByText('example.com').length).toBeGreaterThanOrEqual(1);
    const card = screen.getByLabelText('Detected page preview');
    expect(card).toHaveStyle({ borderColor: sampleCard.themeColor });
  });

  it('renders nothing when idle and no card data', () => {
    const { container } = renderWithState({
      card: null,
      status: 'idle',
      error: null,
      lastUrl: null,
      previewError: null,
      previewStatus: 'no_data',
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a spinner while loading preview data', () => {
    renderWithState({
      card: null,
      status: 'loading',
      error: null,
      lastUrl: null,
      previewError: null,
      previewStatus: null,
    });

    const indicator = screen.getByText(/getting page preview/i);
    expect(indicator).toBeInTheDocument();
    const spinner = indicator.closest('p')?.querySelector('.twitter-card-panel__spinner');
    expect(spinner).toBeInTheDocument();
    expect(document.querySelector('.twitter-card-panel__label')).toBeNull();
  });
});
