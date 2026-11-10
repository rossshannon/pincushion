/**
 * Pinboard separates a bookmark's tags with whitespace, so a tag can never
 * contain any: "foo bar" is two tags, however it was typed or pasted.
 */
export const splitTags = (input: string): string[] =>
  input.split(/\s+/).filter(Boolean);
