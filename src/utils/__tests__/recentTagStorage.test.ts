import {
  getRecentTags,
  addRecentTags,
  clearRecentTags,
  _internals,
} from '../recentTagStorage';

const { STORAGE_KEY, TTL_MS, cleanExpiredEntries, safeParse } = _internals;

describe('recentTagStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('safeParse', () => {
    test('returns empty array for null input', () => {
      expect(safeParse(null)).toEqual([]);
    });

    test('returns empty array for invalid JSON', () => {
      expect(safeParse('not json')).toEqual([]);
    });

    test('returns empty array for non-array JSON', () => {
      expect(safeParse('{"tag": "test"}')).toEqual([]);
    });

    test('filters out invalid entries', () => {
      const input = JSON.stringify([
        { tag: 'valid', timestamp: 123 },
        { tag: 'missing-timestamp' },
        { timestamp: 456 },
        'not-an-object',
        null,
        { tag: 123, timestamp: 456 }, // tag should be string
      ]);
      expect(safeParse(input)).toEqual([{ tag: 'valid', timestamp: 123 }]);
    });

    test('parses valid entries', () => {
      const entries = [
        { tag: 'tag1', timestamp: 1000 },
        { tag: 'tag2', timestamp: 2000 },
      ];
      expect(safeParse(JSON.stringify(entries))).toEqual(entries);
    });
  });

  describe('cleanExpiredEntries', () => {
    test('removes entries older than TTL', () => {
      const now = Date.now();
      const entries = [
        { tag: 'recent', timestamp: now - 1000 }, // 1 second ago
        { tag: 'old', timestamp: now - TTL_MS - 1000 }, // expired
      ];
      expect(cleanExpiredEntries(entries)).toEqual([
        { tag: 'recent', timestamp: now - 1000 },
      ]);
    });

    test('keeps all entries within TTL', () => {
      const now = Date.now();
      const entries = [
        { tag: 'tag1', timestamp: now - 1000 },
        { tag: 'tag2', timestamp: now - TTL_MS + 1000 }, // just within TTL
      ];
      expect(cleanExpiredEntries(entries)).toEqual(entries);
    });

    test('removes all expired entries', () => {
      const now = Date.now();
      const entries = [
        { tag: 'old1', timestamp: now - TTL_MS - 1000 },
        { tag: 'old2', timestamp: now - TTL_MS - 2000 },
      ];
      expect(cleanExpiredEntries(entries)).toEqual([]);
    });
  });

  describe('addRecentTags', () => {
    test('adds tags to empty storage', () => {
      addRecentTags(['tag1', 'tag2']);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(2);
      expect(stored[0].tag).toBe('tag1');
      expect(stored[1].tag).toBe('tag2');
    });

    test('adds tags to existing storage', () => {
      const now = Date.now();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ tag: 'existing', timestamp: now - 1000 }])
      );

      addRecentTags(['new']);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(2);
      expect(stored[0].tag).toBe('new');
      expect(stored[1].tag).toBe('existing');
    });

    test('cleans expired entries when adding', () => {
      const now = Date.now();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ tag: 'expired', timestamp: now - TTL_MS - 1000 }])
      );

      addRecentTags(['new']);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].tag).toBe('new');
    });

    test('returns true on success', () => {
      expect(addRecentTags(['tag1'])).toBe(true);
    });

    test('allows duplicate tags with different timestamps', () => {
      const now = Date.now();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ tag: 'repeat', timestamp: now - 5000 }])
      );

      addRecentTags(['repeat']);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(2);
      expect(stored[0].timestamp).toBe(now);
      expect(stored[1].timestamp).toBe(now - 5000);
    });
  });

  describe('getRecentTags', () => {
    test('returns empty array when storage is empty', () => {
      expect(getRecentTags()).toEqual([]);
    });

    test('returns unique tags in most-recent-first order', () => {
      const now = Date.now();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { tag: 'tag1', timestamp: now - 1000 },
          { tag: 'tag2', timestamp: now - 2000 },
          { tag: 'tag1', timestamp: now - 3000 }, // duplicate, older
        ])
      );

      expect(getRecentTags()).toEqual(['tag1', 'tag2']);
    });

    test('filters out expired tags', () => {
      const now = Date.now();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { tag: 'recent', timestamp: now - 1000 },
          { tag: 'expired', timestamp: now - TTL_MS - 1000 },
        ])
      );

      expect(getRecentTags()).toEqual(['recent']);
    });

    test('cleans up expired entries in storage', () => {
      const now = Date.now();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { tag: 'recent', timestamp: now - 1000 },
          { tag: 'expired', timestamp: now - TTL_MS - 1000 },
        ])
      );

      getRecentTags();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].tag).toBe('recent');
    });

    test('sorts by timestamp descending', () => {
      const now = Date.now();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { tag: 'oldest', timestamp: now - 3000 },
          { tag: 'newest', timestamp: now - 1000 },
          { tag: 'middle', timestamp: now - 2000 },
        ])
      );

      expect(getRecentTags()).toEqual(['newest', 'middle', 'oldest']);
    });
  });

  describe('clearRecentTags', () => {
    test('removes all recent tags from storage', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ tag: 'test', timestamp: Date.now() }])
      );

      clearRecentTags();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    test('returns true on success', () => {
      expect(clearRecentTags()).toBe(true);
    });
  });

  describe('TTL behavior', () => {
    test('tags expire after 30 minutes', () => {
      addRecentTags(['tag1']);
      expect(getRecentTags()).toEqual(['tag1']);

      // Advance time by 29 minutes - should still be there
      jest.advanceTimersByTime(29 * 60 * 1000);
      expect(getRecentTags()).toEqual(['tag1']);

      // Advance time by 2 more minutes (31 total) - should be expired
      jest.advanceTimersByTime(2 * 60 * 1000);
      expect(getRecentTags()).toEqual([]);
    });
  });
});
