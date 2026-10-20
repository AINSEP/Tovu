/** Requests still outside the top 3 after the 2026-10-01 additions, and why. Remove an id once it passes.
 * Shared with deploy-ops' displacement check, which cannot regress a request that is already a gap. */
export const KNOWN_GAPS: ReadonlyMap<string, string> = new Map([
  ["pg-04", "typo 'delte': exact-token index, the model's query rewrite fixes it"],
  ["fm-07", "typo 'submisions': same"],
  ["nl-03", "typo 'newsleter': same"],
  ["md-02", "alt text for images ranks the media read card first; the update tool is 4th"],
  ["mn-05", "menus have no delete tool of their own; trash_item reaches them but ranks 10th"],
  ["dp-05", "'netlify' is a vendor word; core tool metadata names no hosting vendor (owner rule), so the active hosting plugin's discovery keywords answer it, outside this core-only catalog"],
]);
