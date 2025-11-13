import {
  enforceMinimumPopupSize,
  isLikelyTouchDevice,
  MIN_POPUP_HEIGHT,
  MIN_POPUP_WIDTH,
} from '../popupAffordances';

describe('popup affordances helpers', () => {
  it('resizes when window is below minimum dimensions', () => {
    const mockResize = jest.fn();
    const result = enforceMinimumPopupSize({
      outerWidth: MIN_POPUP_WIDTH - 100,
      outerHeight: MIN_POPUP_HEIGHT - 200,
      resizeTo: mockResize,
    });
    expect(result).toBe(true);
    expect(mockResize).toHaveBeenCalledWith(MIN_POPUP_WIDTH, MIN_POPUP_HEIGHT);
  });

  it('skips resizing when already large enough', () => {
    const mockResize = jest.fn();
    const result = enforceMinimumPopupSize({
      outerWidth: MIN_POPUP_WIDTH + 50,
      outerHeight: MIN_POPUP_HEIGHT + 50,
      resizeTo: mockResize,
    });
    expect(result).toBe(false);
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('detects touch devices from navigator data', () => {
    expect(
      isLikelyTouchDevice({ navigator: { maxTouchPoints: 2 } })
    ).toBe(true);
    expect(
      isLikelyTouchDevice({ navigator: { maxTouchPoints: 0 } })
    ).toBe(false);
  });
});
