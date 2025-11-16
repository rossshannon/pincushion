import twitterCardReducer, {
  initialTwitterCardState,
  clearTwitterCard,
  setTwitterCardPreview,
} from '../../redux/twitterCardSlice';
import type { TwitterCardData } from '../../types/twitterCard';

const sampleCard: TwitterCardData = {
  url: 'https://example.com/post',
  title: 'Sample Title',
  description: 'Sample description',
  imageUrl: 'https://example.com/img.png',
  siteName: 'Example',
  siteHandle: '@example',
  siteDomain: 'example.com',
  cardType: 'summary',
  fetchedAt: '2025-01-01T00:00:00Z',
  themeColor: '#3366ff',
  faviconUrl: 'https://example.com/favicon.ico',
};

describe('twitterCardSlice', () => {
  it('returns the initial state by default', () => {
    expect(
      twitterCardReducer(undefined, { type: 'unknown' })
    ).toEqual(initialTwitterCardState);
  });

  it('clears the preview via clearTwitterCard', () => {
    const populated = {
      ...initialTwitterCardState,
      card: sampleCard,
      status: 'succeeded' as const,
      error: 'nope',
    };
    const cleared = twitterCardReducer(populated, clearTwitterCard());
    expect(cleared).toEqual(initialTwitterCardState);
  });

  it('stores preview data when setTwitterCardPreview is dispatched', () => {
    const action = setTwitterCardPreview({
      card: sampleCard,
      error: null,
      url: sampleCard.url,
      previewStatus: 'fresh',
    });
    const state = twitterCardReducer(initialTwitterCardState, action);
    expect(state.card).toEqual(sampleCard);
    expect(state.status).toBe('succeeded');
    expect(state.error).toBeNull();
    expect(state.previewStatus).toBe('fresh');
  });

  it('stores preview errors when provided without card', () => {
    const action = setTwitterCardPreview({
      card: null,
      error: 'blocked',
      url: sampleCard.url,
      previewStatus: 'error',
    });
    const state = twitterCardReducer(initialTwitterCardState, action);
    expect(state.card).toBeNull();
    expect(state.status).toBe('failed');
    expect(state.error).toBe('blocked');
    expect(state.previewStatus).toBe('error');
  });

  it('can set loading status explicitly', () => {
    const action = setTwitterCardPreview({
      card: null,
      error: null,
      url: sampleCard.url,
      status: 'loading',
    });
    const state = twitterCardReducer(initialTwitterCardState, action);
    expect(state.status).toBe('loading');
  });

  it('stores previewError separately when no UI error should be shown', () => {
    const action = setTwitterCardPreview({
      card: null,
      error: null,
      url: sampleCard.url,
      previewStatus: 'no_data',
      previewError: 'blocked by robots.txt',
    });
    const state = twitterCardReducer(initialTwitterCardState, action);
    expect(state.error).toBeNull();
    expect(state.previewError).toBe('blocked by robots.txt');
    expect(state.previewStatus).toBe('no_data');
  });
});
