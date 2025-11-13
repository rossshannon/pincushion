export const remove_spurious_results = (tag_suggestions) => {
  const spuriousTags = [
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
  // Check if *all* the default spurious tags are present. This is Pinboard's way of indicating
  // that it couldn't find any *real* suggestions.
  const areAllSpuriousTagsPresent = spuriousTags.every((tag) =>
    tag_suggestions.includes(tag)
  );
  return areAllSpuriousTagsPresent ? [] : tag_suggestions;
};

export const remove_overly_common_tags = (tag_suggestions) => {
  // These tags are often added automatically or are too generic to be useful suggestions.
  const ignored_tags = [
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
    // Add any other tags you find consistently unhelpful
  ];

  let filtered_tags = tag_suggestions.filter(
    (tag) => !ignored_tags.includes(tag.toLowerCase())
  );

  // Also filter out any tags starting with 'via:' as they usually indicate the source, not the content.
  filtered_tags = filtered_tags.filter(
    (tag) => !tag.toLowerCase().startsWith('via:')
  );

  return filtered_tags;
};

/**
 * Ranks tags that the user has previously used higher in the suggestion list.
 * Optionally inserts a special "$separator" marker between user tags and other suggestions.
 *
 * @param {string[]} tag_suggestions - The list of suggested tags.
 * @param {Object.<string, number>} allUserTags - A map of all tags the user has used (tag -> count).
 * @returns {string[]} The ranked list of tags, potentially with a separator.
 */
export const rank_users_tags_higher = (tag_suggestions, allUserTags) => {
  if (!allUserTags || Object.keys(allUserTags).length === 0) {
    return tag_suggestions; // No user tags known, return original order
  }

  const ranked_tags = [];
  const userTagsSet = new Set(Object.keys(allUserTags));
  let separatorAdded = false;

  tag_suggestions.forEach((tag) => {
    if (userTagsSet.has(tag)) {
      // User has used this tag before
      if (!separatorAdded) {
        // Insert separator *before* the first non-user tag is added
        // But only if there are also non-user tags to separate from.
        // We'll adjust this later if needed.
        ranked_tags.push('$separator'); // Temporarily add separator
        separatorAdded = true;
      }
      ranked_tags.unshift(tag); // Prepend user tags (they will end up at the start)
    } else {
      ranked_tags.push(tag); // Append non-user tags
    }
  });

  // Clean up separator logic:
  // Find the separator's index
  const separatorIndex = ranked_tags.indexOf('$separator');

  if (separatorIndex !== -1) {
    // If separator is the *only* item, or the *last* item, remove it.
    if (ranked_tags.length === 1 || separatorIndex === ranked_tags.length - 1) {
      ranked_tags.splice(separatorIndex, 1);
    }
    // If separator is the *first* item (meaning *all* suggestions were user tags), remove it.
    else if (separatorIndex === 0) {
      // This logic seems wrong - if separator is first, means all tags after it are non-user tags?
      // Let's rethink: We want the separator *between* user tags and non-user tags.
      // The current logic puts user tags first, then separator, then non-user tags.
      // Let's reverse the prepending logic.
      // Alternative approach: separate into two lists first.

      const userSuggestions = [];
      const otherSuggestions = [];
      tag_suggestions.forEach((tag) => {
        if (userTagsSet.has(tag)) {
          userSuggestions.push(tag);
        } else {
          otherSuggestions.push(tag);
        }
      });

      if (userSuggestions.length > 0 && otherSuggestions.length > 0) {
        return [...userSuggestions, '$separator', ...otherSuggestions];
      } else {
        // If either list is empty, no separator needed
        return [...userSuggestions, ...otherSuggestions];
      }
    }
    // If it's somewhere in the middle, it's correctly placed between user tags and others.
  }

  // If no separator was added (e.g., only user tags or only non-user tags), return the list as is.
  // This case is handled by the alternative approach now.
  return ranked_tags; // Fallback, though the alternative approach should cover it.
};
