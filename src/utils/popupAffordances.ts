export const MIN_POPUP_WIDTH = 600;
export const MIN_POPUP_HEIGHT = 750;

type WindowLike = {
  outerWidth?: number;
  outerHeight?: number;
  resizeTo?: (width: number, height: number) => void;
  navigator?: { maxTouchPoints?: number };
};

export function enforceMinimumPopupSize(win?: WindowLike): boolean {
  if (!win || typeof win.resizeTo !== 'function') {
    return false;
  }
  const currentWidth =
    typeof win.outerWidth === 'number' ? win.outerWidth : MIN_POPUP_WIDTH;
  const currentHeight =
    typeof win.outerHeight === 'number' ? win.outerHeight : MIN_POPUP_HEIGHT;
  if (currentWidth >= MIN_POPUP_WIDTH && currentHeight >= MIN_POPUP_HEIGHT) {
    return false;
  }
  win.resizeTo(
    Math.max(currentWidth, MIN_POPUP_WIDTH),
    Math.max(currentHeight, MIN_POPUP_HEIGHT)
  );
  return true;
}

export function isLikelyTouchDevice(win?: WindowLike): boolean {
  const nav =
    win?.navigator ||
    (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!nav || typeof nav.maxTouchPoints !== 'number') {
    return false;
  }
  return nav.maxTouchPoints > 0;
}
