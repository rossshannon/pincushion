import type { TwitterCardData } from '../types/twitterCard';

/**
 * Query-string keys the bookmarklet uses to pass the page's own preview
 * metadata (read from the live DOM) so the preview can render before, or
 * without, the bridge's server-side fetch.
 */
export const PAGE_METADATA_PARAMS = {
  title: 'meta_title',
  description: 'meta_description',
  imageUrl: 'meta_image',
  siteName: 'meta_site_name',
  siteHandle: 'meta_site_handle',
  cardType: 'meta_card',
  themeColor: 'meta_theme_color',
  faviconUrl: 'meta_favicon',
} as const;

const read = (params: URLSearchParams, key: string): string | null => {
  const value = params.get(key);
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

const absoluteHttpUrl = (value: string | null, base: string): string | null => {
  if (!value) return null;
  try {
    const resolved = new URL(value, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
};

// Only hex colours: TwitterCardPreview derives its shadow with hexToRgba.
const hexColour = (value: string | null): string | null =>
  value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : null;

// twitter:site is meant to be "@handle", but some sites put a URL or prose there.
const twitterHandle = (value: string | null): string | null => {
  const handle = value ? value.replace(/^@/, '').trim() : '';
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
};

const domainOf = (pageUrl: string): string | null => {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
};

/**
 * Build a preview card from the metadata the bookmarklet read off the page,
 * or null when it sent none (an older bookmarklet only sends the document
 * title). Even a partial card is kept, so its values beat the bridge's.
 */
export const readPageMetadata = (
  params: URLSearchParams,
  pageUrl: string
): TwitterCardData | null => {
  if (!pageUrl) return null;
  if (!Object.values(PAGE_METADATA_PARAMS).some((key) => read(params, key))) return null;
  const imageUrl = absoluteHttpUrl(read(params, PAGE_METADATA_PARAMS.imageUrl), pageUrl);
  const description = read(params, PAGE_METADATA_PARAMS.description);

  const siteHandle = read(params, PAGE_METADATA_PARAMS.siteHandle);
  const handle = twitterHandle(siteHandle);

  return {
    url: pageUrl,
    // Only the page's og/twitter title. The document <title> is a fallback
    // the caller applies last, so it never hides the bridge's og:title.
    title: read(params, PAGE_METADATA_PARAMS.title),
    description,
    imageUrl,
    siteName: read(params, PAGE_METADATA_PARAMS.siteName),
    siteHandle,
    siteHandleUrl: handle ? `https://twitter.com/${handle}` : null,
    siteDomain: domainOf(pageUrl),
    cardType: read(params, PAGE_METADATA_PARAMS.cardType),
    themeColor: hexColour(read(params, PAGE_METADATA_PARAMS.themeColor)),
    faviconUrl: absoluteHttpUrl(read(params, PAGE_METADATA_PARAMS.faviconUrl), pageUrl),
    fetchedAt: null,
  };
};

/**
 * True when the page's card has enough to show before the bridge answers:
 * a bare title would just flash up and then change.
 */
export const isShowablePageCard = (card: TwitterCardData | null): boolean =>
  Boolean(card && (card.imageUrl || card.description));

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/**
 * Normalise the bridge's `preview` object into a TwitterCardData, or null.
 */
export const parsePreviewPayload = (
  previewRaw: unknown,
  fallbackUrl: string
): TwitterCardData | null => {
  if (!previewRaw || typeof previewRaw !== 'object') return null;
  const raw = previewRaw as Record<string, unknown>;
  // Held to the same rules as the page's own metadata: http(s) links only.
  const url = absoluteHttpUrl(stringOrNull(raw.url), fallbackUrl) ?? fallbackUrl;
  return {
    url,
    title: stringOrNull(raw.title),
    description: stringOrNull(raw.description),
    imageUrl: absoluteHttpUrl(stringOrNull(raw.imageUrl), url),
    siteName: stringOrNull(raw.siteName),
    siteHandle: stringOrNull(raw.siteHandle),
    // Only link a handle that is one (twitter:site sometimes holds a URL or prose).
    siteHandleUrl: twitterHandle(stringOrNull(raw.siteHandle))
      ? absoluteHttpUrl(stringOrNull(raw.siteHandleUrl), url)
      : null,
    siteDomain: stringOrNull(raw.siteDomain),
    cardType: stringOrNull(raw.cardType),
    fetchedAt: stringOrNull(raw.fetchedAt),
    themeColor: hexColour(stringOrNull(raw.themeColor)),
    faviconUrl: absoluteHttpUrl(stringOrNull(raw.faviconUrl), url),
  };
};

/**
 * Combine the page's own metadata with the bridge's. The page wins field by
 * field (it is what the user is looking at, logged-in state and all); the
 * bridge fills the gaps and supplies the canonical URL.
 */
export const mergePreviewCards = (
  page: TwitterCardData | null,
  fetched: TwitterCardData | null
): TwitterCardData | null => {
  if (!page) return fetched;
  if (!fetched) return page;
  const pick = <K extends keyof TwitterCardData>(key: K): TwitterCardData[K] =>
    (page[key] ?? fetched[key]) as TwitterCardData[K];
  // The bookmarklet cuts long text and marks the cut with "…"; the bridge's
  // full text is better then, as long as it carries on from the cut.
  const uncut = (key: 'title' | 'description'): string | null => {
    const mine = page[key];
    const theirs = fetched[key];
    return mine?.endsWith('…') && theirs?.startsWith(mine.slice(0, -1)) ? theirs : pick(key);
  };
  return {
    url: fetched.url || page.url,
    title: uncut('title'),
    description: uncut('description'),
    imageUrl: pick('imageUrl'),
    siteName: pick('siteName'),
    siteHandle: pick('siteHandle'),
    siteHandleUrl: pick('siteHandleUrl'),
    siteDomain: fetched.siteDomain ?? page.siteDomain,
    cardType: pick('cardType'),
    fetchedAt: fetched.fetchedAt ?? null,
    themeColor: pick('themeColor'),
    faviconUrl: pick('faviconUrl'),
  };
};
