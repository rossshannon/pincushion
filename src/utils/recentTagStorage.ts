const STORAGE_KEY = 'pincushion.recentTags';
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export type RecentTagEntry = {
  tag: string;
  timestamp: number;
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
};

const safeParse = (raw: string | null): RecentTagEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Validate each entry has the expected shape
    return parsed.filter(
      (entry): entry is RecentTagEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.tag === 'string' &&
        typeof entry.timestamp === 'number'
    );
  } catch (_err) {
    return [];
  }
};

const cleanExpiredEntries = (entries: RecentTagEntry[]): RecentTagEntry[] => {
  const cutoff = Date.now() - TTL_MS;
  return entries.filter((entry) => entry.timestamp > cutoff);
};

export const getRecentTags = (): string[] => {
  const storage = getLocalStorage();
  if (!storage) return [];

  const entries = safeParse(storage.getItem(STORAGE_KEY));
  const validEntries = cleanExpiredEntries(entries);

  // If we cleaned up expired entries, persist the cleaned list
  if (validEntries.length !== entries.length) {
    persistRecentTags(validEntries);
  }

  // Return unique tags, most recent first
  const seen = new Set<string>();
  const uniqueTags: string[] = [];

  // Sort by timestamp descending (most recent first)
  const sorted = [...validEntries].sort((a, b) => b.timestamp - a.timestamp);

  for (const entry of sorted) {
    if (!seen.has(entry.tag)) {
      seen.add(entry.tag);
      uniqueTags.push(entry.tag);
    }
  }

  return uniqueTags;
};

export const addRecentTags = (tags: string[]): boolean => {
  const storage = getLocalStorage();
  if (!storage) return false;

  const now = Date.now();
  const existingEntries = safeParse(storage.getItem(STORAGE_KEY));
  const validEntries = cleanExpiredEntries(existingEntries);

  // Add new entries for each tag
  const newEntries: RecentTagEntry[] = tags.map((tag) => ({
    tag,
    timestamp: now,
  }));

  // Combine: new entries come first (so they're most recent)
  const combined = [...newEntries, ...validEntries];

  return persistRecentTags(combined);
};

const persistRecentTags = (entries: RecentTagEntry[]): boolean => {
  const storage = getLocalStorage();
  if (!storage) return false;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch (_err) {
    return false;
  }
};

export const clearRecentTags = (): boolean => {
  const storage = getLocalStorage();
  if (!storage) return false;

  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch (_err) {
    return false;
  }
};

// For testing purposes
export const _internals = {
  TTL_MS,
  STORAGE_KEY,
  cleanExpiredEntries,
  safeParse,
};
