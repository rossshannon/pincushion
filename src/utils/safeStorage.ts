/**
 * window.localStorage, or null where there is none to use. Reading the
 * property itself throws a SecurityError when the browser blocks site data,
 * so even the lookup has to be guarded. Calls on the returned Storage can
 * still throw (blocked, or over quota): wrap them, or use readStorageItem.
 */
export const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
};

/** getItem that reports a blocked or missing store as "nothing stored". */
export const readStorageItem = (key: string): string | null => {
  try {
    return getLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
