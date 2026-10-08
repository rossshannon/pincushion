import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * index.html is not exercised by the React tests, but its resource hints
 * have sharp edges: a preconnect only helps if its CORS mode matches the
 * request that later uses the connection. These checks pin the pairing.
 */
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

const linkTags = (): string[] => html.match(/<link\b[^>]*>/gs) ?? [];
const tagsWhere = (predicate: (tag: string) => boolean): string[] =>
  linkTags().filter(predicate);
const hasAttr = (tag: string, attr: string): boolean =>
  new RegExp(`\\b${attr}(\\s*=|\\s|/|>)`).test(tag);

describe('index.html resource hints', () => {
  it('preconnects to the API bridge in CORS mode, matching the anonymous axios requests', () => {
    const [bridge] = tagsWhere(
      (tag) => tag.includes('rel="preconnect"') && tag.includes('%VITE_PINBOARD_BRIDGE_URL%')
    );
    expect(bridge).toBeDefined();
    expect(hasAttr(bridge, 'crossorigin')).toBe(true);
  });

  it('loads the Google Fonts stylesheet without crossorigin so it reuses the plain preconnect', () => {
    const stylesheets = tagsWhere(
      (tag) => tag.includes('rel="stylesheet"') && tag.includes('fonts.googleapis.com')
    );
    expect(stylesheets.length).toBeGreaterThan(0);
    stylesheets.forEach((tag) => expect(hasAttr(tag, 'crossorigin')).toBe(false));

    const [preconnect] = tagsWhere(
      (tag) => tag.includes('rel="preconnect"') && tag.includes('fonts.googleapis.com')
    );
    expect(preconnect).toBeDefined();
    expect(hasAttr(preconnect, 'crossorigin')).toBe(false);
  });

  it('preconnects to fonts.gstatic.com in CORS mode, as font-face fetches are CORS', () => {
    const [preconnect] = tagsWhere(
      (tag) => tag.includes('rel="preconnect"') && tag.includes('fonts.gstatic.com')
    );
    expect(preconnect).toBeDefined();
    expect(hasAttr(preconnect, 'crossorigin')).toBe(true);
  });

  it('does not carry a meta cache-control tag, which browsers ignore', () => {
    expect(html).not.toMatch(/http-equiv="cache-control"/i);
  });
});
