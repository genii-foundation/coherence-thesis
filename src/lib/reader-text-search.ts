// Shared text folding for the reader's three filtering surfaces: manuscript
// search, the outline filter, and the bookmarks filter. Each surface used to
// declare its own private helper, and the two that existed disagreed, so a
// third copy would have made the divergence permanent.
//
// The two functions are deliberately different and are not interchangeable.
// `foldSearchText` is for matching against manuscript prose, where punctuation
// is noise. `foldTitleText` is for matching against titles, where collapsing
// punctuation would merge visually distinct entries.

// Aggressive fold for prose matching: lowercase, punctuation to spaces,
// whitespace collapsed. Apostrophes survive so "reader's" stays one token.
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Light fold for title matching. Preserves punctuation.
export function foldTitleText(value: string): string {
  return value.trim().toLowerCase();
}

export function searchTerms(query: string): string[] {
  return foldSearchText(query).split(" ").filter(Boolean);
}

// Lowest index at which any term appears, or -1. Callers pass text that is
// already folded; folding here would hide the cost from the per-keystroke path.
export function firstTermIndex(foldedText: string, terms: string[]): number {
  const indexes = terms
    .map((term) => foldedText.indexOf(term))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

export function matchesFoldedQuery(values: string[], foldedQuery: string): boolean {
  if (!foldedQuery) return true;
  return values.some((value) => foldTitleText(value).includes(foldedQuery));
}
