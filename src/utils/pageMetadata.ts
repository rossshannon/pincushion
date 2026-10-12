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

const domainOf = (pageUrl: string): string | null => {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
};

/**
 * Build a preview card from the metadata the bookmarklet read off the page.
 * Returns null when the bookmarklet sent no image or description (an older
 * bookmarklet only sends the document title), so the caller waits for the
 * bridge instead of showing a bare title.
 */
export const readPageMetadata = (
  params: URLSearchParams,
  pageUrl: string
): TwitterCardData | null => {
  if (!pageUrl) return null;
  const imageUrl = absoluteHttpUrl(read(params, PAGE_METADATA_PARAMS.imageUrl), pageUrl);
  const description = read(params, PAGE_METADATA_PARAMS.description);
  if (!imageUrl && !description) return null;

  const siteHandle = read(params, PAGE_METADATA_PARAMS.siteHandle);
  const handle = siteHandle ? siteHandle.replace(/^@/, '').trim() : '';

  return {
    url: pageUrl,
    title: read(params, PAGE_METADATA_PARAMS.title) || read(params, 'title'),
    description,
    imageUrl,
    siteName: read(params, PAGE_METADATA_PARAMS.siteName),
    siteHandle,
    siteHandleUrl: handle ? `https://twitter.com/${handle}` : null,
    siteDomain: domainOf(pageUrl),
    cardType: read(params, PAGE_METADATA_PARAMS.cardType),
    themeColor: read(params, PAGE_METADATA_PARAMS.themeColor),
    faviconUrl: absoluteHttpUrl(read(params, PAGE_METADATA_PARAMS.faviconUrl), pageUrl),
    fetchedAt: null,
  };
};

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
  return {
    url: stringOrNull(raw.url) ?? fallbackUrl,
    title: stringOrNull(raw.title),
    description: stringOrNull(raw.description),
    imageUrl: stringOrNull(raw.imageUrl),
    siteName: stringOrNull(raw.siteName),
    siteHandle: stringOrNull(raw.siteHandle),
    siteHandleUrl: stringOrNull(raw.siteHandleUrl),
    siteDomain: stringOrNull(raw.siteDomain),
    cardType: stringOrNull(raw.cardType),
    fetchedAt: stringOrNull(raw.fetchedAt),
    themeColor: stringOrNull(raw.themeColor),
    faviconUrl: stringOrNull(raw.faviconUrl),
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
  return {
    url: fetched.url || page.url,
    title: pick('title'),
    description: pick('description'),
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
