/**
 * Strip URL fragment (everything after '#') and percent-encode.
 * Mirrors the behavior of clean_url in the original implementation.
 * @param {string} url - The raw URL string
 * @returns {string} - Encoded URL suitable for query parameters
 */
export function cleanUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }
  // Remove fragment identifier
  const withoutFragment = url.replace(/#.*$/, '');
  // Percent-encode
  return encodeURIComponent(withoutFragment);
}