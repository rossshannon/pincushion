const SPURIOUS_TAGS = [
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
] as const;

const IGNORED_TAGS = new Set(
  [
    'bookmarks_bar',
    'pin-later',
    'unread',
    '*resources',
    'unlabeled',
    'via:packrati.us',
    'bookmarks_menu',
    '.from:twitter',
    'twitterlink',
    'from',
    'ifttt',
    'later',
    'saved',
    'read',
    'feedly',
    'for',
    'recently',
    'tobookmarks',
    'from:ifttt',
    'instapaper',
    '!fromtwitter',
    'feedbin',
    'favorites_bar',
    'imported',
    '.dailybrowse',
    'barra_dei_preferiti',
    'bookmarks_toolbar',
    'via:pocket',
    'from_pocket',
    'pocket',
    'archive',
    'toread',
    'readlater',
    'via:popular',
    '!tweet',
    'twitter-fav',
    'created-by:ifttt',
    'starred',
    'soon',
    'riposte',
    'github:starred',
    'iftttfeedly',
    'github-starred-to-pinboard',
    'appdotnet',
    'top',
    'instapaper:',
    '&amp;',
    '(popular',
    '--',
    'bookmarks)',
    'from:feedly',
    'from:rss',
    'instapaper:import',
    'instapaper:starred',
    '*',
    '**',
    '***',
    'googlereader',
    'no_tag',
    'evernote-web-clipper',
  ].map((tag) => tag.toLowerCase())
);

export const remove_spurious_results = (tagSuggestions: string[] = []): string[] => {
  const areAllSpuriousTagsPresent = SPURIOUS_TAGS.every((tag) =>
    tagSuggestions.includes(tag)
  );
  return areAllSpuriousTagsPresent ? [] : tagSuggestions;
};

export const remove_overly_common_tags = (tagSuggestions: string[] = []): string[] => {
  const normalized = tagSuggestions.filter((tag) => {
    const lower = tag.toLowerCase();
    return !IGNORED_TAGS.has(lower) && !lower.startsWith('via:');
  });
  return normalized;
};

export const rank_users_tags_higher = (
  tagSuggestions: string[] = [],
  allUserTags: Record<string, number> | null | undefined
): string[] => {
  if (!allUserTags || Object.keys(allUserTags).length === 0) {
    return tagSuggestions;
  }

  const userSuggestions: string[] = [];
  const otherSuggestions: string[] = [];
  const userTagsSet = new Set(Object.keys(allUserTags));

  tagSuggestions.forEach((tag) => {
    if (userTagsSet.has(tag)) {
      userSuggestions.push(tag);
    } else {
      otherSuggestions.push(tag);
    }
  });

  if (!userSuggestions.length || !otherSuggestions.length) {
    return [...userSuggestions, ...otherSuggestions];
  }

  return [...userSuggestions, '$separator', ...otherSuggestions];
};
