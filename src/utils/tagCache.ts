/**
 * localStorage cache of the user's tag counts (the /v1/tags/get payload).
 *
 * The cache is what makes autocomplete usable the instant the popup opens;
 * the network copy is only a background refresh. It is keyed by the Pinboard
 * username so switching accounts in Settings never shows another account's
 * tags.
 */
const TAGS_KEY = 'tags';
const TIMESTAMP_KEY = 'tagTimestamp';
const USER_KEY = 'tagCacheUser';

export type TagCounts = Record<string, number>;

export type TagCacheEntry = {
  counts: TagCounts;
  ageMs: number;
};

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
};

const isTagCounts = (value: unknown): value is TagCounts =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readTagCache = (user: string): TagCacheEntry | null => {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(TAGS_KEY);
    if (!raw) return null;
    const cachedUser = storage.getItem(USER_KEY);
    // Entries written before the cache was keyed by user have no owner
    // recorded; treat them as belonging to the current user rather than
    // throwing away a perfectly good cache on upgrade.
    if (cachedUser && cachedUser !== user) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isTagCounts(parsed)) return null;
    const timestampRaw = storage.getItem(TIMESTAMP_KEY);
    const timestamp = timestampRaw ? parseInt(timestampRaw, 10) : NaN;
    const ageMs = Number.isFinite(timestamp)
      ? Math.max(Date.now() - timestamp, 0)
      : Number.POSITIVE_INFINITY;
    return { counts: parsed, ageMs };
  } catch {
    return null;
  }
};

export const writeTagCache = (user: string, counts: TagCounts): boolean => {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(TAGS_KEY, JSON.stringify(counts));
    storage.setItem(TIMESTAMP_KEY, Date.now().toString());
    storage.setItem(USER_KEY, user);
    return true;
  } catch {
    return false;
  }
};

/**
 * Apply a just-saved bookmark's tags to the cached counts so the next popup
 * sees them in autocomplete without another /v1/tags/get round trip.
 * Leaves the timestamp alone: this is a local patch, not a refresh.
 */
export const bumpTagCache = (user: string, tags: string[]): boolean => {
  const storage = getStorage();
  if (!storage || tags.length === 0) return false;
  const entry = readTagCache(user);
  if (!entry) return false;
  const counts = incrementTagCounts(entry.counts, tags);
  try {
    storage.setItem(TAGS_KEY, JSON.stringify(counts));
    storage.setItem(USER_KEY, user);
    return true;
  } catch {
    return false;
  }
};

export const incrementTagCounts = (
  counts: TagCounts,
  tags: string[]
): TagCounts => {
  const next: TagCounts = { ...counts };
  tags.forEach((tag) => {
    const trimmed = typeof tag === 'string' ? tag.trim() : '';
    if (!trimmed) return;
    next[trimmed] = (next[trimmed] || 0) + 1;
  });
  return next;
};
