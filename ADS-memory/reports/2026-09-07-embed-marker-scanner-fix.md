# Embed marker scanner: comment/raw-text-aware fix

Fixes the defect diagnosed in `ADS-memory/reports/2026-09-07-media-embed-unresolved.md`:
`MARKER_PATTERN` (`apps/website/src/contracts/core/embeds/marker.ts`) scanned raw HTML with no
awareness of HTML comments or `<script>`/`<style>` raw-text content, so a well-formed
`data-embed-config` marker written inside an authoring note or a `<style>` block's CSS comment was
extracted and resolved as if it were live markup — producing the spurious "unresolved media
reference" warning on 3 published pages (including the site root) on every render.

## RED (before the fix)

Added to `apps/website/src/contracts/core/embeds/__tests__/marker.unit.test.ts`:

- marker inside an HTML comment → must yield 0 markers, plus a live control marker elsewhere in the
  same fixture must still be found
- marker inside a `<style>` block's CSS comment → same shape
- marker inside a `<script>` block → same shape (extends the fix to raw-text elements generally)
- a fourth guard test asserting `whole`/`tag`/`attrs`/`inner`/`index` are read from the ORIGINAL
  text, not a masked copy, when a live marker sits next to comment/style/script blocks

```
node --import tsx --test apps/website/src/contracts/core/embeds/__tests__/marker.unit.test.ts
✖ scanEmbedMarkers ignores a marker written inside an HTML comment...        2 !== 1
✖ scanEmbedMarkers ignores a marker written inside a <style> block's...      2 !== 1
✖ scanEmbedMarkers ignores a marker written inside a <script> block...       2 !== 1
ℹ tests 13, pass 10, fail 3
```

(The 4th new test passed even before the fix — it only pins behavior the fix must not break.)

## The fix

In `marker.ts`:

- `MARKER_PATTERN` gained the `d` (`hasIndices`) flag — no change to what it matches, only that a
  match now reports each capture group's `[start, end)` offsets.
- New `maskNonRenderableRegions(html)`: returns a **same-length** copy of `html` with every HTML
  comment (`<!--...-->`) and the raw-text content of every `<script>`/`<style>` element replaced by
  space filler. Same length is load-bearing — every offset `scanEmbedMarkers` reports, and
  `substituteMarkers`'s index-based splice back into the *original* html, depends on positions never
  shifting.
- `scanEmbedMarkers` now runs `MARKER_PATTERN` against the **masked** copy (so a marker inside a
  masked region can never match at all), but reads every field (`whole`, `tag`, `attrs`, the raw
  JSON, `inner`) back out of the **original**, unmasked `html` at the match's own group offsets
  (via the new `d`-flag indices + a small `requireGroupRange` helper). This means: a marker that
  legitimately sits next to (or has nested inside its own fallback content) a comment/style/script
  block still reports its true, byte-for-byte authored content — masking only decides eligibility,
  never content.

No changes to `resolver-service.ts`, `html-embeds.ts`'s `WRAPPER_PRESERVING_EMBED_TYPES`, or any DB
content — all out of scope per dispatch and left untouched.

## GREEN (after the fix)

```
node --import tsx --test apps/website/src/contracts/core/embeds/__tests__/marker.unit.test.ts
ℹ tests 13, pass 13, fail 0
```

## Consumers found and their suites run

`scanEmbedMarkers`/`MARKER_PATTERN` is the one shared parser; per its own file header the consumers
are `widgets/html-embeds.ts`, `core/entry-refs/extractor.ts`, and `features/theme/static-render.ts`
(menu/partial/post-previews), plus everything that renders through the site route layer on top of
those. Ran every suite that exercises the scanner, directly or through a consumer, one file per
`node --test` invocation, all from repo root:

| Suite | Result |
|---|---|
| `contracts/core/embeds/__tests__/marker.unit.test.ts` | 13/13 pass |
| `contracts/core/embeds/__tests__/marker.canary.test.ts` (real theme files on disk) | 9/9 pass |
| `features/widgets/__tests__/unit/html-embeds.unit.test.ts` | 37/37 pass |
| `features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts` | 41/41 pass |
| `contracts/core/entry-refs/__tests__/extractor-marker.canary.test.ts` | 8/8 pass |
| `contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts` | 14/14 pass |
| `contracts/core/entry-refs/__tests__/integration/html-entry-refs-consistency.integration.test.ts` | 15/15 pass |
| `features/theme/__tests__/menu-tree-render.test.ts` | 17/17 pass |
| `features/theme/__tests__/static-render-page-shell-fallback.test.ts` | 14/14 pass |
| `features/theme/__tests__/static-render-post-previews.test.ts` | 11/11 pass |
| `features/theme/__tests__/theme-slot-honors-current-page.test.ts` | 3/3 pass |
| `server/inbound/public-http/routes/site/__tests__/static-menu-embed-resolution.test.ts` | 6/6 pass |
| `server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts` | 6/6 pass |
| `server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts` | 7/7 pass |

Total: 201/201 passing across 14 files. Not run: `serve-command*.integration.test.ts` (explicitly
banned — hangs, orphans live `tovu serve` children).

## Root tsc

`npx tsc -p tsconfig.json --noEmit` → exit 0, no output, both before and after this change (the root
config excludes test files, so this is evidence the production module compiles, not that the new
tests do — the tests were proven to compile and run instead, via `node --test` succeeding).

## Two prior findings NOT re-litigated, and verified still true after this change

- `WRAPPER_PRESERVING_EMBED_TYPES` (`html-embeds.ts`) still splices `media`/`post`/`content` inside
  the marker's own tag; only `widget` is whole-element replace — untouched by this change, and
  `html-embeds.unit.test.ts`'s wrapper-preservation tests still pass.
- A self-closing marker still never resolves (`MARKER_PATTERN`'s backreferenced `<\/\1>` requires an
  explicit close tag) — untouched, not addressed here (by design, per the original diagnosis).

## Function quality

| unit | disposition | findings | local fix |
|---|---|---|---|
| `blank` | NO_RECORDED_FINDINGS | — pure, O(n) over its own string | — |
| `maskNonRenderableRegions` | NO_RECORDED_FINDINGS | — pure, O(n); two bounded regex passes over `html` | — |
| `requireGroupRange` | NO_RECORDED_FINDINGS | — pure, O(1), fail-fast on an impossible input | — |
| `scanEmbedMarkers` (changed) | NO_RECORDED_FINDINGS | — pure, same O(n) shape as before, one extra O(n) masking pass | — |

Zero-findings skepticism pass: `maskNonRenderableRegions`'s two `.replace` calls run in sequence
(comments first, then raw-text elements) over the *progressively* masked string — checked that this
ordering cannot double-count or misalign offsets, since masking never changes length and a
comment fully inside a `<script>`/`<style>` block (the `<script><!-- ... --></script>` legacy hack)
gets masked twice, both times to the same space filler, which is idempotent. Variable-name audit:
`whole`/`tag`/`attrs`/`raw`/`inner`/`index` in `scanEmbedMarkers` now read from `html` (the
parameter, i.e. the original), not `masked` — verified by the added 4th unit test, which would fail
if any of them were still sourced from the masked copy.

## Architecture Audit

- **Status: PASS.**
- Rules checked: this module is documented as "the ONE parser for embed markers... PURE. No I/O, no
  DOM, no resolution" — the fix adds no I/O, no new external dependency, and changes no consumer's
  call signature.
- Files audited: `apps/website/src/contracts/core/embeds/marker.ts`,
  `apps/website/src/contracts/core/embeds/__tests__/marker.unit.test.ts`.
- No violations found.

## Pre-Completion Checklist

- Requirements re-verified against the dispatch: RED test with a control case ✓, script-block case
  added ✓, fix in the shared scanner only ✓, offsets preserved via same-length masking ✓, DB/content
  rows untouched ✓, `resolver-service.ts` untouched ✓, GREEN ✓.
- Fresh evidence commands: shown above (RED, GREEN, all 14 consumer-suite runs, root tsc).
- No certified/existing test was deleted or weakened — only additions.
- Scope: only `marker.ts` (production) and `marker.unit.test.ts` (tests) touched. No edits under
  `apps/website/src/cli/__tests__/`, `apps/admin/src`, or `resolver-service.ts`.
- Open items: none for this task. The DB rows that surfaced the bug are untouched by design (per
  dispatch) — the warning will stop appearing on the next render of those pages once this ships.

## Self-Validation

Not applicable as a full runtime harness — this is a pure-function fix with no server restart
available (dispatch bars restarting the dev server/daemon). Verified instead via the full consumer
test matrix above, which includes integration tests that boot real static-render/route-layer paths
(`resolve-html-page-embeds.integration.test.ts`, `static-menu-embed-resolution.test.ts`,
`static-post-previews-resolution.test.ts`) against seeded DBs — these are the closest available
proxy for the live render path and all pass.
