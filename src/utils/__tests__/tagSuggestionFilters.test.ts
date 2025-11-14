import {
  removeSpuriousResults,
  removeOverlyCommonTags,
  rankUserTagsHigher,
  postProcessPinboardSuggestions,
} from '../tagSuggestionFilters';

describe('tagSuggestionFilters', () => {
  it('removeSpuriousResults empties default response payloads', () => {
    const spuriousPayload = [
      'ai',
      '2025',
      'articles',
      'history',
      'programming',
      'howto',
      'Politics', // Mixed case still works due to case-insensitive matching
      'tools',
      'fic',
      'llm',
    ];
    expect(removeSpuriousResults(spuriousPayload)).toEqual([]);
  });

  it('removeSpuriousResults keeps tags if default set incomplete', () => {
    const tags = ['ai', 'useful', 'programming'];
    expect(removeSpuriousResults(tags)).toEqual(tags);
  });

  it('removeOverlyCommonTags filters ignored tokens and via: prefixes', () => {
    const tags = ['bookmarks_bar', 'via:feedly', 'custom', 'Another'];
    expect(removeOverlyCommonTags(tags)).toEqual(['custom', 'Another']);
  });

  it('rankUserTagsHigher prioritizes known tags and inserts separator when needed', () => {
    const tags = ['baz', 'foo', 'qux', 'bar'];
    const tagCounts = { Foo: 3, bar: 1 };
    expect(rankUserTagsHigher(tags, tagCounts)).toEqual([
      'foo',
      'bar',
      '$separator',
      'baz',
      'qux',
    ]);
  });

  it('postProcessPinboardSuggestions applies full pipeline', () => {
    const raw = ['Foo', 'foo', 'bar', 'bookmarks_bar', 'via:rss'];
    const tagCounts = { foo: 10 };
    expect(postProcessPinboardSuggestions(raw, tagCounts)).toEqual([
      'Foo',
      '$separator',
      'bar',
    ]);
  });
});
