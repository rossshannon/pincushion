import { createSelector } from '@reduxjs/toolkit';

// Select the suggested tags from the state
const selectSuggestedTags = (state) => state.tags.suggested;
const selectGptSuggestions = (state) => state.tags.gptSuggestions;

// Select the current tags array from the bookmark form data
const selectCurrentTags = (state) => {
  const tags = state.bookmark.formData.tags;
  return Array.isArray(tags) ? tags : [];
};

const selectAllSuggestions = createSelector(
  [selectSuggestedTags, selectGptSuggestions],
  (pinboard, gpt) => {
    if (!gpt.length) {
      return pinboard;
    }
    if (!pinboard.length) {
      return gpt;
    }
    const combined = [...pinboard];
    if (combined[combined.length - 1] !== '$separator') {
      combined.push('$separator');
    }
    return [...combined, ...gpt];
  }
);

// Memoized selector for displayable suggestions
export const selectDisplayableSuggestions = createSelector(
  [selectAllSuggestions, selectCurrentTags],
  (suggestions, currentTags) => {
    const currentTagsSet = new Set(currentTags);
    return suggestions.filter(
      (tag) => tag === '$separator' || !currentTagsSet.has(tag)
    );
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
