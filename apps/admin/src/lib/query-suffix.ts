/** `"a=1"` -> `"?a=1"`; an empty query string adds nothing to the path. */
export function querySuffix({ query }: { query: string }, _options = {}): string {
  return query ? `?${query}` : "";
}
