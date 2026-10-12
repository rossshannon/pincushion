import {
  mergePreviewCards,
  parsePreviewPayload,
  readPageMetadata,
} from '../../utils/pageMetadata';

const PAGE = 'https://example.com/articles/post';

describe('readPageMetadata', () => {
  it('returns null for an older bookmarklet that only sends url and title', () => {
    const params = new URLSearchParams('url=x&title=Doc%20title&description=selection');
    expect(readPageMetadata(params, PAGE)).toBeNull();
  });

  it('builds a card, resolving relative image and favicon URLs against the page', () => {
    const params = new URLSearchParams(
      'title=Doc&meta_title=OG%20Title&meta_description=Desc&meta_image=%2Fimg%2Fcard.png' +
        '&meta_favicon=..%2Ficon.png&meta_site_name=Example&meta_site_handle=%40example' +
        '&meta_card=summary_large_image&meta_theme_color=%23123456'
    );
    expect(readPageMetadata(params, PAGE)).toEqual({
      url: PAGE,
      title: 'OG Title',
      description: 'Desc',
      imageUrl: 'https://example.com/img/card.png',
      siteName: 'Example',
      siteHandle: '@example',
      siteHandleUrl: 'https://twitter.com/example',
      siteDomain: 'example.com',
      cardType: 'summary_large_image',
      themeColor: '#123456',
      faviconUrl: 'https://example.com/icon.png',
      fetchedAt: null,
    });
  });

  it('falls back to the document title and drops non-http image URLs', () => {
    const params = new URLSearchParams(
      'title=Doc%20title&meta_description=Desc&meta_image=javascript%3Aalert(1)'
    );
    const card = readPageMetadata(params, PAGE);
    expect(card?.title).toBe('Doc title');
    expect(card?.imageUrl).toBeNull();
  });
});

describe('mergePreviewCards', () => {
  const page = readPageMetadata(
    new URLSearchParams('meta_title=Page&meta_description=From%20page'),
    PAGE
  );
  const fetched = parsePreviewPayload(
    {
      url: 'https://example.com/canonical',
      title: 'Server',
      description: 'From server',
      imageUrl: 'https://example.com/server.png',
      siteDomain: 'example.com',
      fetchedAt: '2026-10-12T00:00:00Z',
    },
    PAGE
  );

  it('prefers the page, fills gaps from the bridge and takes its canonical URL', () => {
    const merged = mergePreviewCards(page, fetched);
    expect(merged?.title).toBe('Page');
    expect(merged?.description).toBe('From page');
    expect(merged?.imageUrl).toBe('https://example.com/server.png');
    expect(merged?.url).toBe('https://example.com/canonical');
    expect(merged?.fetchedAt).toBe('2026-10-12T00:00:00Z');
  });

  it('returns whichever side exists when the other is missing', () => {
    expect(mergePreviewCards(null, fetched)).toBe(fetched);
    expect(mergePreviewCards(page, null)).toBe(page);
    expect(mergePreviewCards(null, null)).toBeNull();
  });
});
