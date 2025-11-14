import { createSelector } from '@reduxjs/toolkit';

// Select the suggested tags from the state
const selectSuggestedTags = (state) => state.tags.suggested || [];
const selectGptSuggestions = (state) => state.tags.gptSuggestions || [];

// Select the current tags array from the bookmark form data
const selectCurrentTags = (state) => {
  const tags = state.bookmark.formData.tags;
  return Array.isArray(tags) ? tags : [];
};

const normalize = (tag) =>
  typeof tag === 'string' ? tag.trim().toLowerCase() : '';

const sanitizeList = (list = []) =>
  (list || []).filter((tag) => tag && tag !== '$separator');

const buildUniqueList = (list, seen) => {
  const unique = [];
  sanitizeList(list).forEach((tag) => {
    const lower = normalize(tag);
    if (!lower) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    unique.push(tag);
  });
  return unique;
};

// Memoized selector for displayable suggestions
export const selectDisplayableSuggestions = createSelector(
  [selectSuggestedTags, selectGptSuggestions, selectCurrentTags],
  (pinboard, gpt, currentTags) => {
    const seen = new Set(currentTags.map(normalize));
    const pinboardFiltered = buildUniqueList(pinboard, seen);
    const gptFiltered = buildUniqueList(gpt, seen);

    if (!pinboardFiltered.length && !gptFiltered.length) {
      return [];
    }

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
  Boolean(state.tags.suggestedLoading);

export const selectSuggestionsSpinnerVisible = (state) =>
  Boolean(state.tags.suggestedLoading) || state.tags.gptStatus === 'loading';

// Selector to check if suggestions are empty
export const selectIsSuggestionsEmpty = createSelector(
  [selectDisplayableSuggestions],
  (suggestions) =>
    suggestions.length === 0 ||
    (suggestions.length === 1 && suggestions[0] === '$separator')
);
