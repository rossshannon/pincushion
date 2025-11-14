export function cleanUrl(urlInput: string | null | undefined): string {
  if (typeof urlInput !== 'string') {
    return '';
  }
  const withoutFragment = urlInput.replace(/#.*$/, '');
  return encodeURIComponent(withoutFragment);
}
