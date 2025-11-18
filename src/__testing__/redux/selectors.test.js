import {
  selectDisplayableSuggestions,
  selectSuggestedLoading,
  selectIsSuggestionsEmpty,
  selectSuggestionsSpinnerVisible,
} from '../../redux/selectors';

const baseTagsState = {
  suggested: [],
  suggestedLoading: false,
  gptSuggestions: [],
  gptStatus: 'idle',
  gptError: null,
  gptContextKey: null,
  recentTags: [],
  filteredRecentTags: [],
};

const baseAuthState = {
  user: '',
  token: '',
  openAiToken: '',
};

describe('Redux Selectors', () => {
  // Re-adding describe block for selectSuggestedLoading
  describe('selectSuggestedLoading', () => {
    it('reflects only the Pinboard suggestion loading flag', () => {
      const mockState1 = {
        tags: { ...baseTagsState, suggestedLoading: true },
        bookmark: { formData: { tags: [] } },
        auth: baseAuthState,
      };
      expect(selectSuggestedLoading(mockState1)).toBe(true);

      const mockState2 = {
        tags: { ...baseTagsState, suggestedLoading: false },
        bookmark: { formData: { tags: [] } },
        auth: baseAuthState,
      };
      expect(selectSuggestedLoading(mockState2)).toBe(false);

      const mockState3 = {
        tags: { ...baseTagsState, suggestedLoading: false, gptStatus: 'loading' },
        bookmark: { formData: { tags: [] } },
        auth: baseAuthState,
      };
      expect(selectSuggestedLoading(mockState3)).toBe(false);
    });
  });

  describe('selectSuggestionsSpinnerVisible', () => {
    it('is true when either Pinboard or GPT is loading', () => {
      const pinboardLoading = {
        tags: { ...baseTagsState, suggestedLoading: true },
        bookmark: { formData: { tags: [] } },
        auth: baseAuthState,
      };
      expect(selectSuggestionsSpinnerVisible(pinboardLoading)).toBe(true);

      const gptLoading = {
        tags: { ...baseTagsState, gptStatus: 'loading' },
        bookmark: { formData: { tags: [] } },
        auth: baseAuthState,
      };
      expect(selectSuggestionsSpinnerVisible(gptLoading)).toBe(true);

      const idleState = {
        tags: { ...baseTagsState },
        bookmark: { formData: { tags: [] } },
        auth: baseAuthState,
      };
      expect(selectSuggestionsSpinnerVisible(idleState)).toBe(false);
    });
  });

  // --- Memoized Selectors ---
  describe('selectDisplayableSuggestions', () => {
    it('should filter suggested tags based on current tags, ignoring $separator', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: [
            'suggest1',
            'common',
            '$separator',
            'suggest2',
            'another',
          ],
          gptSuggestions: ['ai_tag'],
        },
        bookmark: { formData: { tags: ['current', 'common'] } },
        auth: baseAuthState,
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([
        'suggest1',
        'suggest2',
        'another',
        '$separator',
        'ai_tag',
      ]);
    });

    it('should return all suggestions (except $separator if current tags are empty)', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['suggest1', 'common'],
        },
        bookmark: { formData: { tags: [] } }, // Empty current tags
        auth: baseAuthState,
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([
        'suggest1',
        'common',
      ]);
    });

    it('should drop $separator when all other suggestions are present in current tags', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['suggest1', 'common', '$separator'],
        },
        bookmark: { formData: { tags: ['common', 'suggest1'] } },
        auth: baseAuthState,
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([]);
    });

    it('should return an empty array if suggestions are empty', () => {
      const mockState = {
        tags: { ...baseTagsState, suggested: [] },
        bookmark: { formData: { tags: ['current'] } },
        auth: baseAuthState,
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([]);
    });

    it('should remove separator when one side has no remaining suggestions', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['left'],
          gptSuggestions: ['right'],
        },
        bookmark: { formData: { tags: ['right'] } },
        auth: baseAuthState,
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual(['left']);
    });

    it('should deduplicate overlapping pinboard and GPT suggestions case-insensitively', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['Foo', 'Bar'],
          gptSuggestions: ['foo', 'baz'],
        },
        bookmark: { formData: { tags: [] } },
        auth: baseAuthState,
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([
        'Foo',
        'Bar',
        '$separator',
        'baz',
      ]);
    });

    it('should drop separator when both lists end up empty', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['current'],
          gptSuggestions: ['current'],
        },
        bookmark: { formData: { tags: ['current'] } },
        auth: baseAuthState,
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([]);
    });
  });

  describe('selectIsSuggestionsEmpty', () => {
    it('should return true if displayable suggestions are empty', () => {
      const mockState = {
        tags: { ...baseTagsState, suggested: [] }, // No suggestions
        bookmark: { formData: { tags: ['current'] } },
        auth: baseAuthState,
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(true);
    });

    it('should return false if there are displayable suggestions other than $separator', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['suggest1', '$separator', 'current'],
          gptSuggestions: ['ai_tag'],
        },
        bookmark: { formData: { tags: ['current'] } },
        auth: baseAuthState,
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(false); // 'suggest1' remains
    });
  });
});
