import {
  selectDisplayableSuggestions,
  selectSuggestedLoading,
  selectIsSuggestionsEmpty,
} from '../../redux/selectors';

const baseTagsState = {
  suggested: [],
  suggestedLoading: false,
  gptSuggestions: [],
  gptStatus: 'idle',
  gptError: null,
  gptContextKey: null,
};

describe('Redux Selectors', () => {
  // Re-adding describe block for selectSuggestedLoading
  describe('selectSuggestedLoading', () => {
    it('should return the suggestedLoading boolean', () => {
      const mockState1 = {
        tags: { ...baseTagsState, suggestedLoading: true },
        bookmark: { formData: { tags: [] } },
      };
      expect(selectSuggestedLoading(mockState1)).toBe(true);

      const mockState2 = {
        tags: { ...baseTagsState, suggestedLoading: false },
        bookmark: { formData: { tags: [] } },
      };
      expect(selectSuggestedLoading(mockState2)).toBe(false);

      const mockState3 = {
        tags: { ...baseTagsState, suggestedLoading: false, gptStatus: 'loading' },
        bookmark: { formData: { tags: [] } },
      };
      expect(selectSuggestedLoading(mockState3)).toBe(true);
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
      };
      // 'common' should be filtered out, $separator remains
      expect(selectDisplayableSuggestions(mockState)).toEqual([
        'suggest1',
        '$separator',
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
          suggested: ['suggest1', 'common', '$separator', 'suggest2'],
        },
        bookmark: { formData: { tags: [] } }, // Empty current tags
      };
      // $separator might still be filtered depending on use case, selector keeps it
      expect(selectDisplayableSuggestions(mockState)).toEqual([
        'suggest1',
        'common',
        '$separator',
        'suggest2',
      ]);
    });

    it('should drop $separator when all other suggestions are present in current tags', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['suggest1', 'common', '$separator'],
        },
        bookmark: { formData: { tags: ['common', 'suggest1'] } },
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([]);
    });

    it('should return an empty array if suggestions are empty', () => {
      const mockState = {
        tags: { ...baseTagsState, suggested: [] },
        bookmark: { formData: { tags: ['current'] } },
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([]);
    });

    it('should remove separator when one side has no remaining suggestions', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['left', '$separator', 'right'],
          gptSuggestions: [],
        },
        bookmark: { formData: { tags: ['right'] } },
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual(['left']);
    });
  });

  describe('selectIsSuggestionsEmpty', () => {
    it('should return true if displayable suggestions are empty', () => {
      const mockState = {
        tags: { ...baseTagsState, suggested: [] }, // No suggestions
        bookmark: { formData: { tags: ['current'] } },
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(true);
    });

    it('should return true if displayable suggestions only contained separator', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['current', '$separator'],
        },
        bookmark: { formData: { tags: ['current'] } },
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(true);
    });

    it('should return false if there are displayable suggestions other than $separator', () => {
      const mockState = {
        tags: {
          ...baseTagsState,
          suggested: ['suggest1', '$separator', 'current'],
        },
        bookmark: { formData: { tags: ['current'] } },
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(false); // 'suggest1' remains
    });
  });
});
