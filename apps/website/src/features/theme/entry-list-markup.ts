export const ENTRY_LIST_ATTRIBUTE = "data-tovu-entry-list";

/**
 * Review fix 3a (`2026-09-23-review-E4-R1-report.md`): every selector below is scoped under the
 * `[data-tovu-entry-list]` attribute {@link renderEntryList} puts on ITS OWN wrapper element (the
 * `<div>`/`<ul>` cards/list root), never a bare `.entry-list` class selector. Declarative themes
 * already use the plain `entry-list`/`entry-list--<route>` classes for their own built-in post/
 * product index (`render.ts`'s `entryList`/`productEntryList`) — a bare `.entry-list` rule would
 * silently turn THAT unrelated vertical list into a grid the moment this style is wired into a
 * second call site ({@link withEntryListStyleOnce}'s `pageShell` wiring). Scoping to the attribute
 * (which only this module's own markup ever emits) makes the style unable to match anything this
 * module didn't render, regardless of how many other places call {@link withEntryListStyleOnce}.
 */
const ENTRY_LIST_STYLE_OPEN_TAG = "<style data-tovu-entry-list>";

/** One `<style>` block providing the default `.entry-list`/`.entry-card` look via zero-specificity
 * `:where()` rules and theme tokens with fallbacks (D6: no theme.css edit — any theme rule still
 * wins). Cards default to a 3-column grid (overridden per-marker by `--entry-list-columns`),
 * collapsing to a single column under 640px so a narrow theme column or mobile viewport never clips
 * a card. `data-tovu-entry-list` is also the injection marker {@link withEntryListStyleOnce} checks
 * for (see {@link ENTRY_LIST_STYLE_OPEN_TAG}'s doc for why every rule is attribute-scoped). */
export const ENTRY_LIST_DEFAULT_STYLE =
  ENTRY_LIST_STYLE_OPEN_TAG +
  ":where([data-tovu-entry-list]){display:grid;gap:1rem;grid-template-columns:repeat(var(--entry-list-columns,3),minmax(0,1fr));list-style:none;padding:0;margin:0}" +
  ":where([data-tovu-entry-list].entry-list--list){display:flex;flex-direction:column;grid-template-columns:none}" +
  ":where([data-tovu-entry-list] .entry-card){border:1px solid var(--border,#ddd);background:var(--surface,transparent);padding:1rem;border-radius:.5rem}" +
  ":where([data-tovu-entry-list] .entry-card__title){margin:0 0 .5rem}" +
  ":where([data-tovu-entry-list] .entry-card__fields dt){color:var(--muted,#666);font-size:.85em}" +
  ":where([data-tovu-entry-list] .entry-card__fields dd){margin:0 0 .75rem}" +
  "@media (max-width:640px){:where([data-tovu-entry-list]){grid-template-columns:1fr}}" +
  // AW-7 layouts. Carousel: CSS-only scroll-snap (no script ships with a Tier-1 plugin), each card
  // most of the width on a phone so the next one peeks in and signals "scroll".
  ":where([data-tovu-entry-list].entry-list--carousel){display:flex;grid-template-columns:none;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:.5rem}" +
  ":where([data-tovu-entry-list].entry-list--carousel > .entry-card){flex:0 0 min(85%,22rem);scroll-snap-align:start}" +
  ":where([data-tovu-entry-list].entry-list--accordion){display:block}" +
  ":where([data-tovu-entry-list] .entry-accordion__item){border-bottom:1px solid var(--border,#ddd);padding:.75rem 0}" +
  ":where([data-tovu-entry-list] .entry-accordion__question){cursor:pointer;font-weight:600}" +
  ":where([data-tovu-entry-list] .entry-accordion__field){margin:.5rem 0 0}" +
  "</style>";
