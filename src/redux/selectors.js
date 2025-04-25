import { createSelector } from '@reduxjs/toolkit';

// Select the suggested tags from the state
const selectSuggestedTags = (state) => state.tags.suggested;

// Select the current tags array from the bookmark form data
const selectCurrentTags = (state) =>
  state.bookmark.formData.tags.split(' ').filter(Boolean);

// Memoized selector for displayable suggestions
export const selectDisplayableSuggestions = createSelector(
  [selectSuggestedTags, selectCurrentTags],
  (suggestions, currentTags) => {
    const currentTagsSet = new Set(currentTags);
    return suggestions.filter(
      (tag) => tag === '$separator' || !currentTagsSet.has(tag)
    );
  }
);

// Selector for loading state
export const selectSuggestedLoading = (state) => state.tags.suggestedLoading;

// Selector to check if suggestions are empty
export const selectIsSuggestionsEmpty = createSelector(
  [selectDisplayableSuggestions],
  (suggestions) =>
    suggestions.length === 0 ||
    (suggestions.length === 1 && suggestions[0] === '$separator')
);
