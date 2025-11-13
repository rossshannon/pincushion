import { createSelector } from '@reduxjs/toolkit';

// Select the suggested tags from the state
const selectSuggestedTags = (state) => state.tags.suggested;
const selectGptSuggestions = (state) => state.tags.gptSuggestions;

// Select the current tags array from the bookmark form data
const selectCurrentTags = (state) => {
  const tags = state.bookmark.formData.tags;
  return Array.isArray(tags) ? tags : [];
};

const normalize = (tag) => (typeof tag === 'string' ? tag.toLowerCase() : tag);

// Memoized selector for displayable suggestions
export const selectDisplayableSuggestions = createSelector(
  [selectSuggestedTags, selectGptSuggestions, selectCurrentTags],
  (pinboard, gpt, currentTags) => {
    const currentTagsSet = new Set(currentTags.map(normalize));
    const cleanse = (list) =>
      (list || []).filter(
        (tag) =>
          tag &&
          tag !== '$separator' &&
          !currentTagsSet.has(normalize(tag))
      );

    const pinboardFiltered = cleanse(pinboard);
    const gptFiltered = cleanse(gpt);

    if (pinboardFiltered.length && gptFiltered.length) {
      return [...pinboardFiltered, '$separator', ...gptFiltered];
    }
    if (pinboardFiltered.length) {
      return pinboardFiltered;
    }
    if (gptFiltered.length) {
      return gptFiltered;
    }
    return [];
  }
);

// Selector for loading state
export const selectSuggestedLoading = (state) =>
  state.tags.suggestedLoading || state.tags.gptStatus === 'loading';

// Selector to check if suggestions are empty
export const selectIsSuggestionsEmpty = createSelector(
  [selectDisplayableSuggestions],
  (suggestions) =>
    suggestions.length === 0 ||
    (suggestions.length === 1 && suggestions[0] === '$separator')
);
