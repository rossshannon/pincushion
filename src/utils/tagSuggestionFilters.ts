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
];

const OVERLY_COMMON_TAGS = [
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
  'instapaper:import',
  'googlereader',
  'no_tag',
  'evernote-web-clipper',
];

const VIA_PREFIX = /^via:/i;

export function removeSpuriousResults(tags: string[]): string[] {
  if (!tags.length) {
    return tags;
  }
  const lowerSet = new Set(tags.map((tag) => tag.toLowerCase()));
  const hasAllSpurious = SPURIOUS_TAGS.every((tag) => lowerSet.has(tag));
  return hasAllSpurious ? [] : tags;
}

export function removeOverlyCommonTags(tags: string[]): string[] {
  if (!tags.length) {
    return tags;
  }
  const lowerIgnored = new Set(OVERLY_COMMON_TAGS.map((tag) => tag.toLowerCase()));
  return tags.filter((tag) => {
    const lower = tag.toLowerCase();
    if (VIA_PREFIX.test(lower)) {
      return false;
    }
    return !lowerIgnored.has(lower);
  });
}

export function rankUserTagsHigher(
  tags: string[],
  tagCounts: Record<string, number> | undefined | null
): string[] {
  if (!tags.length || !tagCounts || Object.keys(tagCounts).length === 0) {
    return tags;
  }
  const knownTags = new Set(
    Object.keys(tagCounts || {}).map((tag) => tag.toLowerCase())
  );
  const userTags: string[] = [];
  const otherTags: string[] = [];

  tags.forEach((tag) => {
    if (knownTags.has(tag.toLowerCase())) {
      userTags.push(tag);
    } else {
      otherTags.push(tag);
    }
  });

  if (!userTags.length) {
    return otherTags;
  }
  if (!otherTags.length) {
    return userTags;
  }
  return [...userTags, '$separator', ...otherTags];
}

export function postProcessPinboardSuggestions(
  tags: string[],
  tagCounts: Record<string, number> | undefined | null
): string[] {
  if (!tags.length) {
    return tags;
  }
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const deduped = normalized.filter((tag, idx, arr) => arr.indexOf(tag) === idx);
  const withoutSpurious = removeSpuriousResults(deduped);
  const withoutCommon = removeOverlyCommonTags(withoutSpurious);
  return rankUserTagsHigher(withoutCommon, tagCounts);
}
