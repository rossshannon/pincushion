import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';

type TagList = string[];

const selectSuggestedTags = (state: RootState): TagList =>
  state.tags.suggested || [];

const selectGptSuggestions = (state: RootState): TagList =>
  state.tags.gptSuggestions || [];

const selectCurrentTags = (state: RootState): TagList => {
  const tags = state.bookmark.formData.tags;
  return Array.isArray(tags) ? tags : [];
};

const normalize = (tag: string): string => tag.trim().toLowerCase();

const sanitizeList = (list: TagList = []): TagList =>
  list.filter((tag) => Boolean(tag) && tag !== '$separator');

const buildUniqueList = (list: TagList, seen: Set<string>): TagList => {
  const unique: TagList = [];
  sanitizeList(list).forEach((tag) => {
    const lower = normalize(tag);
    if (!lower) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    unique.push(tag);
  });
  return unique;
};

export const selectDisplayableSuggestions = createSelector(
  [selectSuggestedTags, selectGptSuggestions, selectCurrentTags],
  (pinboard: TagList, gpt: TagList, currentTags: TagList): TagList => {
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

export const selectSuggestedLoading = (state: RootState): boolean =>
  Boolean(state.tags.suggestedLoading);

export const selectSuggestionsSpinnerVisible = (
  state: RootState
): boolean =>
  Boolean(state.tags.suggestedLoading) || state.tags.gptStatus === 'loading';

export const selectIsSuggestionsEmpty = createSelector(
  [selectDisplayableSuggestions],
  (suggestions: TagList): boolean =>
    suggestions.length === 0 ||
    (suggestions.length === 1 && suggestions[0] === '$separator')
);
