export type TextSegment = {
  text: string;
  matched: boolean;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits `text` into segments around case-insensitive occurrences of `query`,
 * so a renderer can wrap the matched segments (e.g. in `<mark>`) without
 * touching the rest of the line. Returns the whole text as one unmatched
 * segment when `query` is blank.
 */
export const splitByMatch = (text: string, query: string): TextSegment[] => {
  const trimmed = query.trim();
  if (!trimmed) return [{ text, matched: false }];

  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi');
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, matched: part.toLowerCase() === trimmed.toLowerCase() }));
};

/** Counts case-insensitive occurrences of `query` inside `text`. */
export const countMatches = (text: string, query: string): number => {
  const trimmed = query.trim();
  if (!trimmed) return 0;

  const pattern = new RegExp(escapeRegExp(trimmed), 'gi');
  return text.match(pattern)?.length ?? 0;
};
