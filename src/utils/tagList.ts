/**
 * Pinboard separates a bookmark's tags with spaces, so a tag can never
 * contain one: "foo bar" is two tags, however it was typed or pasted.
 *
 * ASCII whitespace only. A tag Pinboard already holds may contain other
 * characters JavaScript's \s counts as space (a no-break or ideographic
 * space); splitting those would rewrite the user's tags on the next save.
 */
export const splitTags = (input: string): string[] =>
  input.split(/[ \t\n\r\f\v]+/).filter(Boolean);

/**
 * For text the user has just typed or pasted, which is not yet a tag
 * anywhere: every kind of whitespace separates, so a no-break space copied
 * from a web page doesn't end up inside a tag.
 */
export const splitTypedTags = (input: string): string[] => input.split(/\s+/).filter(Boolean);
