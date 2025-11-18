import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';

type TagList = string[];

const selectSuggestedTags = (state: RootState): TagList =>
  state.tags.suggested || [];

const selectGptSuggestions = (state: RootState): TagList =>
  state.tags.gptSuggestions || [];

const selectFilteredRecentTags = (state: RootState): TagList =>
  state.tags.filteredRecentTags || [];

const selectRecentTags = (state: RootState): TagList =>
  state.tags.recentTags || [];

const selectHasOpenAiToken = (state: RootState): boolean =>
  Boolean(state.auth.openAiToken);

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
  [
    selectSuggestedTags,
    selectGptSuggestions,
    selectFilteredRecentTags,
    selectRecentTags,
    selectHasOpenAiToken,
    selectCurrentTags,
  ],
  (
    pinboard: TagList,
    gpt: TagList,
    filteredRecent: TagList,
    recentTags: TagList,
    hasOpenAiToken: boolean,
    currentTags: TagList
  ): TagList => {
    const seen = new Set(currentTags.map(normalize));

    // Use filtered recent tags if GPT is available, otherwise show all recent tags
    const recentToShow = hasOpenAiToken ? filteredRecent : recentTags;
    const recentFiltered = buildUniqueList(recentToShow, seen);
    const pinboardFiltered = buildUniqueList(pinboard, seen);
    const gptFiltered = buildUniqueList(gpt, seen);

    const result: TagList = [];

    // Add recent tags first (they're already filtered/validated)
    if (recentFiltered.length) {
      result.push(...recentFiltered);
    }

    // Add pinboard suggestions
    if (pinboardFiltered.length) {
      if (result.length) {
        result.push('$separator');
      }
      result.push(...pinboardFiltered);
    }

    // Add GPT suggestions
    if (gptFiltered.length) {
      if (result.length) {
        result.push('$separator');
      }
      result.push(...gptFiltered);
    }

    return result;
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
