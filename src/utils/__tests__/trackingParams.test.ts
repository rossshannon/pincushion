import { isTrackingParam, stripTrackingParams } from '../trackingParams';

describe('stripTrackingParams', () => {
  it('removes utm_* parameters and keeps the rest in order', () => {
    expect(
      stripTrackingParams(
        'https://example.com/post?id=7&utm_source=news&page=2&utm_medium=email'
      )
    ).toEqual({
      url: 'https://example.com/post?id=7&page=2',
      removed: ['utm_source', 'utm_medium'],
    });
  });

  it('drops the ? when every parameter was tracking', () => {
    expect(
      stripTrackingParams('https://example.com/a?fbclid=abc&gclid=def').url
    ).toBe('https://example.com/a');
  });

  it('keeps the fragment', () => {
    expect(
      stripTrackingParams('https://example.com/a?utm_campaign=x#section-2').url
    ).toBe('https://example.com/a#section-2');
  });

  it('leaves a ?-lookalike in the fragment alone', () => {
    const url = 'https://example.com/app#/route?utm_source=x';
    expect(stripTrackingParams(url)).toEqual({ url, removed: [] });
  });

  it('returns URLs without tracking parameters unchanged, byte for byte', () => {
    const url = 'https://example.com/s?q=a+b%20c&ref=main&&x=%E2%9C%93';
    expect(stripTrackingParams(url)).toEqual({ url, removed: [] });
  });

  it('keeps empty query segments it was not asked to remove', () => {
    expect(
      stripTrackingParams('https://example.com/p?a=1&&b=2&utm_source=x').url
    ).toBe('https://example.com/p?a=1&&b=2');
    expect(stripTrackingParams('https://example.com/p?&utm_source=x').url).toBe(
      'https://example.com/p'
    );
  });

  it('lists a repeated parameter once', () => {
    expect(
      stripTrackingParams(
        'https://example.com/?utm_source=a&utm_source=b&fbclid=c'
      ).removed
    ).toEqual(['utm_source', 'fbclid']);
  });

  it('preserves the encoding of the parameters it keeps', () => {
    expect(
      stripTrackingParams('https://example.com/s?q=a+b%2Fc&utm_term=foo').url
    ).toBe('https://example.com/s?q=a+b%2Fc');
  });

  it('matches names case-insensitively and when percent-encoded', () => {
    expect(
      stripTrackingParams('https://example.com/?UTM_Source=x&%66bclid=y&k=v')
    ).toEqual({
      url: 'https://example.com/?k=v',
      removed: ['UTM_Source', 'fbclid'],
    });
  });

  it('strips email-platform and click-ID parameters', () => {
    const url =
      'https://example.com/?mc_cid=1&mc_eid=2&_hsenc=3&_hsmi=4&msclkid=5&dclid=6&igshid=7&yclid=8&ref_src=twsrc';
    expect(stripTrackingParams(url).url).toBe('https://example.com/');
  });

  it('keeps functional parameters that look a bit like tracking', () => {
    const urls = [
      'https://github.com/owner/repo/blob/file.md?ref=feature-branch',
      'https://example.com/?source=rss',
      'https://example.com/?s=search+term',
      'https://example.com/?t=30',
      'https://example.com/?si=1',
      'https://example.com/?pk_id=42',
    ];
    urls.forEach((url) => {
      expect(stripTrackingParams(url).url).toBe(url);
    });
  });

  it('strips site-specific share parameters only on that site', () => {
    expect(
      stripTrackingParams('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc')
        .url
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(stripTrackingParams('https://youtu.be/dQw4w9WgXcQ?si=abc&t=42').url).toBe(
      'https://youtu.be/dQw4w9WgXcQ?t=42'
    );
    expect(
      stripTrackingParams('https://x.com/user/status/123?s=20&t=abc').url
    ).toBe('https://x.com/user/status/123');
    expect(
      stripTrackingParams('https://open.spotify.com/track/1?si=xyz').url
    ).toBe('https://open.spotify.com/track/1');
    // A lookalike domain doesn't count.
    expect(stripTrackingParams('https://notx.com/?s=20').url).toBe(
      'https://notx.com/?s=20'
    );
  });

  it('ignores input that is not an http(s) URL', () => {
    ['', 'not a url?utm_source=x', 'ftp://example.com/?utm_source=x'].forEach(
      (url) => {
        expect(stripTrackingParams(url)).toEqual({ url, removed: [] });
      }
    );
  });
});

describe('isTrackingParam', () => {
  it('knows the common names', () => {
    expect(isTrackingParam('utm_content')).toBe(true);
    expect(isTrackingParam('gclid')).toBe(true);
    expect(isTrackingParam('ref')).toBe(false);
    expect(isTrackingParam('si')).toBe(false);
    expect(isTrackingParam('si', 'music.youtube.com')).toBe(true);
  });
});
