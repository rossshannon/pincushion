import {
  selectDisplayableSuggestions,
  selectSuggestedLoading,
  selectIsSuggestionsEmpty,
} from '../../redux/selectors';

describe('Redux Selectors', () => {
  // Re-adding describe block for selectSuggestedLoading
  describe('selectSuggestedLoading', () => {
    it('should return the suggestedLoading boolean', () => {
      const mockState1 = {
        tags: { suggestedLoading: true },
        bookmark: { formData: { tags: '' } },
      };
      expect(selectSuggestedLoading(mockState1)).toBe(true);

      const mockState2 = {
        tags: { suggestedLoading: false },
        bookmark: { formData: { tags: '' } },
      };
      expect(selectSuggestedLoading(mockState2)).toBe(false);
    });
  });

  // --- Memoized Selectors ---
  describe('selectDisplayableSuggestions', () => {
    it('should filter suggested tags based on current tags, ignoring $separator', () => {
      const mockState = {
        tags: {
          suggested: [
            'suggest1',
            'common',
            '$separator',
            'suggest2',
            'another',
          ],
        },
        bookmark: { formData: { tags: 'current common' } },
      };
      // 'common' should be filtered out, $separator remains
      expect(selectDisplayableSuggestions(mockState)).toEqual([
        'suggest1',
        '$separator',
        'suggest2',
        'another',
      ]);
    });

    it('should return all suggestions (except $separator if current tags are empty)', () => {
      const mockState = {
        tags: { suggested: ['suggest1', 'common', '$separator', 'suggest2'] },
        bookmark: { formData: { tags: '' } }, // Empty current tags
      };
      // $separator might still be filtered depending on use case, selector keeps it
      expect(selectDisplayableSuggestions(mockState)).toEqual([
        'suggest1',
        'common',
        '$separator',
        'suggest2',
      ]);
    });

    it('should return only $separator if all other suggestions are present in current tags', () => {
      const mockState = {
        tags: { suggested: ['suggest1', 'common', '$separator'] },
        bookmark: { formData: { tags: 'common suggest1' } },
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual(['$separator']);
    });

    it('should return an empty array if suggestions are empty', () => {
      const mockState = {
        tags: { suggested: [] },
        bookmark: { formData: { tags: 'current' } },
      };
      expect(selectDisplayableSuggestions(mockState)).toEqual([]);
    });
  });

  describe('selectIsSuggestionsEmpty', () => {
    it('should return true if displayable suggestions are empty', () => {
      const mockState = {
        tags: { suggested: [] }, // No suggestions
        bookmark: { formData: { tags: 'current' } },
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(true);
    });

    it('should return true if displayable suggestions only contain $separator', () => {
      const mockState = {
        tags: { suggested: ['current', '$separator'] }, // 'current' will be filtered
        bookmark: { formData: { tags: 'current' } },
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(true);
    });

    it('should return false if there are displayable suggestions other than $separator', () => {
      const mockState = {
        tags: { suggested: ['suggest1', '$separator', 'current'] },
        bookmark: { formData: { tags: 'current' } },
      };
      expect(selectIsSuggestionsEmpty(mockState)).toBe(false); // 'suggest1' remains
    });
  });
});
