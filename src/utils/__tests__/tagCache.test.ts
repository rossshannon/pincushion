import { vi } from 'vitest';
import {
  readTagCache,
  writeTagCache,
  bumpTagCache,
  applyTagDelta,
  diffTagLists,
  isEmptyDelta,
} from '../tagCache';

describe('tagCache', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('round-trips counts for the owning user and reports their age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(writeTagCache('ross', { react: 3, redux: 1 })).toBe(true);
    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));

    const entry = readTagCache('ross');
    expect(entry?.counts).toEqual({ react: 3, redux: 1 });
    expect(entry?.ageMs).toBe(10 * 60 * 1000);
  });

  it('returns null when nothing is cached', () => {
    expect(readTagCache('ross')).toBeNull();
  });

  it('refuses to serve another user’s cache', () => {
    writeTagCache('ross', { react: 3 });
    expect(readTagCache('someone-else')).toBeNull();
  });

  it('still serves a legacy cache that was written before user keying', () => {
    window.localStorage.setItem('tags', JSON.stringify({ legacy: 2 }));
    window.localStorage.setItem('tagTimestamp', `${Date.now()}`);
    expect(readTagCache('ross')?.counts).toEqual({ legacy: 2 });
  });

  it('treats a missing timestamp as infinitely old', () => {
    window.localStorage.setItem('tags', JSON.stringify({ react: 1 }));
    expect(readTagCache('ross')?.ageMs).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns null for corrupt or non-object payloads', () => {
    window.localStorage.setItem('tags', '{not json');
    expect(readTagCache('ross')).toBeNull();
    window.localStorage.setItem('tags', JSON.stringify(['a', 'b']));
    expect(readTagCache('ross')).toBeNull();
  });

  it('bumps counts for saved tags without touching the timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    writeTagCache('ross', { react: 3 });
    vi.setSystemTime(new Date('2026-01-01T00:30:00Z'));

    expect(
      bumpTagCache('ross', { added: ['react', 'vite', ' vite ', ''], removed: [] })
    ).toBe(true);
    const entry = readTagCache('ross');
    expect(entry?.counts).toEqual({ react: 4, vite: 2 });
    expect(entry?.ageMs).toBe(30 * 60 * 1000);
  });

  it('decrements removed tags and drops them at zero', () => {
    writeTagCache('ross', { react: 3, once: 1 });
    expect(bumpTagCache('ross', { added: [], removed: ['react', 'once'] })).toBe(true);
    expect(readTagCache('ross')?.counts).toEqual({ react: 2 });
  });

  it('does not bump when there is no cache to patch or the delta is empty', () => {
    expect(bumpTagCache('ross', { added: ['react'], removed: [] })).toBe(false);
    expect(window.localStorage.getItem('tags')).toBeNull();
    writeTagCache('ross', { react: 3 });
    expect(bumpTagCache('ross', { added: [], removed: [] })).toBe(false);
  });

  it('applyTagDelta is pure and never goes below zero', () => {
    const original = { a: 1 };
    const next = applyTagDelta(original, { added: ['a', 'b'], removed: ['zzz'] });
    expect(next).toEqual({ a: 2, b: 1 });
    expect(original).toEqual({ a: 1 });
  });

  it('diffTagLists reports only what changed', () => {
    expect(diffTagLists([], ['a', 'b'])).toEqual({ added: ['a', 'b'], removed: [] });
    expect(diffTagLists(['a', 'b'], ['a', 'b'])).toEqual({ added: [], removed: [] });
    expect(isEmptyDelta(diffTagLists(['a', 'b'], ['b', 'a']))).toBe(true);
    expect(diffTagLists(['a', 'old'], ['a', ' new '])).toEqual({
      added: ['new'],
      removed: ['old'],
    });
  });
});
