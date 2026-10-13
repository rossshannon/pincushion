import {
  isShowablePageCard,
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

  it('leaves the document title to the caller and drops non-http image URLs', () => {
    const params = new URLSearchParams(
      'title=Doc%20title&meta_description=Desc&meta_image=javascript%3Aalert(1)'
    );
    const card = readPageMetadata(params, PAGE);
    expect(card?.title).toBeNull();
    expect(card?.imageUrl).toBeNull();
  });

  it('keeps only hex theme colours, which the preview can tint with', () => {
    const colour = (value: string) =>
      readPageMetadata(
        new URLSearchParams(`meta_description=D&meta_theme_color=${encodeURIComponent(value)}`),
        PAGE
      )?.themeColor;
    expect(colour('#0a84ff')).toBe('#0a84ff');
    expect(colour('#fff')).toBe('#fff');
    expect(colour('rgb(20,20,20)')).toBeNull();
    expect(colour('white')).toBeNull();
  });
});

describe('isShowablePageCard', () => {
  it('shows a page card straight away only if it has an image or a description', () => {
    const titleOnly = readPageMetadata(new URLSearchParams('meta_title=T&meta_site_name=S'), PAGE);
    expect(titleOnly?.title).toBe('T');
    expect(isShowablePageCard(titleOnly)).toBe(false);
    expect(isShowablePageCard(titleOnly && { ...titleOnly, description: 'D' })).toBe(true);
    expect(isShowablePageCard(titleOnly && { ...titleOnly, imageUrl: 'https://example.com/i.png' })).toBe(true);
    expect(isShowablePageCard(null)).toBe(false);
  });

  it("keeps a partial card's values over the bridge's", () => {
    const titleOnly = readPageMetadata(new URLSearchParams('meta_title=Page%20title'), PAGE);
    const fetched = parsePreviewPayload({ title: 'Bridge title', description: 'From the bridge' }, PAGE);
    const merged = mergePreviewCards(titleOnly, fetched);
    expect(merged?.title).toBe('Page title');
    expect(merged?.description).toBe('From the bridge');
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

  it('keeps a handle and its link together', () => {
    const server = parsePreviewPayload(
      { url: PAGE, siteHandle: '@real_site', siteHandleUrl: 'https://twitter.com/real_site' },
      PAGE
    );
    // The page's handle isn't a real one, so it has no link of its own.
    const prose = readPageMetadata(new URLSearchParams('meta_title=T&meta_site_handle=Our%20team'), PAGE);
    const mergedProse = mergePreviewCards(prose, server);
    expect(mergedProse?.siteHandle).toBe('Our team');
    expect(mergedProse?.siteHandleUrl).toBeNull();
    // With no handle on the page, both come from the bridge.
    const mergedNone = mergePreviewCards(page, server);
    expect(mergedNone?.siteHandle).toBe('@real_site');
    expect(mergedNone?.siteHandleUrl).toBe('https://twitter.com/real_site');
  });

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

describe('parsePreviewPayload', () => {
  it('holds the bridge to the same link and colour rules as the page', () => {
    const card = parsePreviewPayload(
      {
        url: 'javascript:alert(1)',
        imageUrl: 'javascript:alert(1)',
        faviconUrl: '/icon.png',
        siteHandleUrl: 'data:text/html,x',
        themeColor: 'red; background: url(x)',
      },
      PAGE
    );
    expect(card?.url).toBe(PAGE);
    expect(card?.imageUrl).toBeNull();
    expect(card?.faviconUrl).toBe(new URL('/icon.png', PAGE).toString());
    expect(card?.siteHandleUrl).toBeNull();
    expect(card?.themeColor).toBeNull();
  });
});

describe('page metadata edge cases', () => {
  it('only links a twitter:site value that is a real handle', () => {
    const good = readPageMetadata(new URLSearchParams('meta_description=x&meta_site_handle=%40foo_1'), PAGE);
    expect(good?.siteHandleUrl).toBe('https://twitter.com/foo_1');
    const bad = readPageMetadata(
      new URLSearchParams('meta_description=x&meta_site_handle=https%3A%2F%2Ftwitter.com%2Ffoo'),
      PAGE
    );
    expect(bad?.siteHandleUrl).toBeNull();
  });

  it("prefers the bridge's description when the bookmarklet cut the page's short", () => {
    const page = readPageMetadata(new URLSearchParams('meta_description=Long%20text%20cut%E2%80%A6'), PAGE);
    const fetched = parsePreviewPayload({ description: 'Long text cut here in full.' }, PAGE);
    expect(mergePreviewCards(page, fetched)?.description).toBe('Long text cut here in full.');
    const whole = readPageMetadata(new URLSearchParams('meta_description=Whole'), PAGE);
    expect(mergePreviewCards(whole, fetched)?.description).toBe('Whole');
    // A page whose own text just ends in an ellipsis keeps it over unrelated bridge text.
    const ownEllipsis = readPageMetadata(new URLSearchParams('meta_description=Read%20more%E2%80%A6'), PAGE);
    expect(mergePreviewCards(ownEllipsis, fetched)?.description).toBe('Read more…');
  });

  it("prefers the bridge's title when the bookmarklet cut the page's", () => {
    const page = readPageMetadata(new URLSearchParams('meta_title=A%20very%20long%20ti%E2%80%A6'), PAGE);
    const fetched = parsePreviewPayload({ title: 'A very long title indeed' }, PAGE);
    expect(mergePreviewCards(page, fetched)?.title).toBe('A very long title indeed');
  });

  it("doesn't link a bridge twitter:site value that isn't a handle", () => {
    const linked = parsePreviewPayload(
      { siteHandle: '@foo', siteHandleUrl: 'https://twitter.com/foo' },
      PAGE
    );
    expect(linked?.siteHandleUrl).toBe('https://twitter.com/foo');
    const prose = parsePreviewPayload(
      { siteHandle: 'https://twitter.com/foo', siteHandleUrl: 'https://twitter.com/https://twitter.com/foo' },
      PAGE
    );
    expect(prose?.siteHandleUrl).toBeNull();
  });
});
