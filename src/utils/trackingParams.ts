// Query parameters that only exist to attribute a click to a campaign, ad,
// newsletter or share. They never change what the page shows, so a bookmark
// is better off without them. Deliberately conservative: anything that is
// sometimes functional (GitHub's `ref`, a site's own `source`) stays.

// Matched case-insensitively against the parameter name.
const TRACKING_PARAM_PREFIXES = ['utm_', 'mtm_', 'hsa_'];

const TRACKING_PARAMS = new Set([
  // Ad click IDs
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'yclid',
  'ymclid',
  'rb_clickid',
  'srsltid',
  // Google Analytics cross-domain linker
  '_ga',
  '_gl',
  // Email platforms (Mailchimp, HubSpot, Marketo, Vero, Omeda, Wicked Reports)
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  '__hssc',
  '__hstc',
  '__hsfp',
  'hsctatracking',
  'mkt_tok',
  'vero_id',
  'vero_conv',
  'oly_anon_id',
  'oly_enc_id',
  'wickedid',
  // Social shares
  'igshid',
  'igsh',
  'ref_src',
  'ref_url',
  // Matomo/Piwik (its newer mtm_ names are covered by the prefix)
  'pk_campaign',
  'pk_kwd',
  'pk_source',
  'pk_medium',
  'pk_content',
  // Misc
  '_openstat',
]);

// Parameters that are tracking on particular sites but could mean something
// elsewhere. Keys are hostnames; subdomains match too.
const SITE_TRACKING_PARAMS: Record<string, string[]> = {
  'youtube.com': ['si', 'pp'],
  'youtu.be': ['si'],
  'spotify.com': ['si'],
  'twitter.com': ['s', 't'],
  'x.com': ['s', 't'],
  'threads.net': ['xmt'],
  'linkedin.com': ['trk', 'trackingid', 'lipi'],
};

const siteParamsFor = (hostname: string): string[] => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return Object.entries(SITE_TRACKING_PARAMS)
    .filter(([site]) => host === site || host.endsWith(`.${site}`))
    .flatMap(([, params]) => params);
};

const decodeName = (raw: string): string => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
};

export const isTrackingParam = (name: string, hostname = ''): boolean => {
  const key = name.toLowerCase();
  if (TRACKING_PARAMS.has(key)) return true;
  if (TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return true;
  }
  return siteParamsFor(hostname).includes(key);
};

export type TrackingStripResult = {
  url: string;
  /** Names of the parameters that were removed, in URL order, once each. */
  removed: string[];
};

/**
 * Remove tracking parameters from a URL's query string. Everything else is
 * left byte-for-byte as it was (parameter order, encoding, the fragment), so
 * a URL with nothing to strip comes back unchanged.
 */
export function stripTrackingParams(input: string): TrackingStripResult {
  const unchanged = { url: input, removed: [] };
  if (typeof input !== 'string' || !input.includes('?')) return unchanged;

  let hostname: string;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return unchanged;
    }
    hostname = parsed.hostname;
  } catch {
    return unchanged;
  }

  const hashIndex = input.indexOf('#');
  const beforeHash = hashIndex === -1 ? input : input.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : input.slice(hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex === -1) return unchanged;

  const base = beforeHash.slice(0, queryIndex);
  const pairs = beforeHash.slice(queryIndex + 1).split('&');
  const removed: string[] = [];
  const kept = pairs.filter((pair) => {
    if (pair === '') return true;
    const name = decodeName(pair.split('=')[0]);
    if (isTrackingParam(name, hostname)) {
      if (!removed.includes(name)) removed.push(name);
      return false;
    }
    return true;
  });

  if (removed.length === 0) return unchanged;

  const query = kept.some((pair) => pair !== '') ? kept.join('&') : '';
  return {
    url: `${base}${query ? `?${query}` : ''}${fragment}`,
    removed,
  };
}
