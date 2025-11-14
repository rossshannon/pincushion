import {
  remove_spurious_results,
  remove_overly_common_tags,
  rank_users_tags_higher,
} from '../tagUtils';

describe('tagUtils helpers', () => {
  test('remove_spurious_results empties lists when only default tags returned', () => {
    const input = [
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
    expect(remove_spurious_results(input)).toEqual([]);
  });

  test('remove_spurious_results keeps useful suggestions', () => {
    const result = remove_spurious_results(['ifttt', 'javascript']);
    expect(result).toEqual(['ifttt', 'javascript']);
  });

  test('remove_overly_common_tags strips noisy defaults and via prefixes', () => {
    const filtered = remove_overly_common_tags([
      'bookmarks_bar',
      'via:packrati.us',
      'Via:newsletter',
      'useful-tag',
    ]);
    expect(filtered).toEqual(['useful-tag']);
  });

  test('rank_users_tags_higher separates known tags and inserts separator', () => {
    const ranked = rank_users_tags_higher(
      ['react', 'pinboard', 'news'],
      { react: 10, javascript: 5 }
    );
    expect(ranked).toEqual(['react', '$separator', 'pinboard', 'news']);
  });

  test('rank_users_tags_higher omits separator when only user or other tags exist', () => {
    expect(rank_users_tags_higher(['react'], { react: 3 })).toEqual(['react']);
    expect(rank_users_tags_higher(['pinboard'], { react: 3 })).toEqual([
      'pinboard',
    ]);
  });
});
