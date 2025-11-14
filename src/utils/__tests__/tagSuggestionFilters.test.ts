import {
  removeSpuriousResults,
  removeOverlyCommonTags,
  rankUserTagsHigher,
  postProcessPinboardSuggestions,
} from '../tagSuggestionFilters';

describe('tagSuggestionFilters', () => {
  it('removeSpuriousResults empties default response payloads', () => {
    const spuriousPayload = [
      'ifttt',
      'facebook',
      'youtube',
      'objective-c',
      'twitter',
      'twitterlink',
      'wsh',
      '.from:twitter',
      '@codepo8',
      '1960s',
    ];
    expect(removeSpuriousResults(spuriousPayload)).toEqual([]);
  });

  it('removeSpuriousResults keeps tags if default set incomplete', () => {
    const tags = ['ifttt', 'useful', 'objective-c'];
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
