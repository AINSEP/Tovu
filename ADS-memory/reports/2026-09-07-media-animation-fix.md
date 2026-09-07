# Animation-flattening fix (Jini) + third stale MIME list (Tovu admin)

Agent H (Programmer). Two tasks per dispatch: (1) stop `SharpImageTransformer` from silently
flattening animated GIF/WebP to a still frame, (2) align `FILE_HANDLER_ALLOWED_MIME_TYPES`
(`apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts`) to the server's real allowlist and
fix its false comment.

## Proof up front — a real multi-frame image survives end to end

Built a genuine 3-frame animated GIF via `sharp`'s own `join({ animated: true })` API (not a mock),
ran it through the REAL `SharpImageTransformer.transform` (no test double), and asserted the decoded
output's frame count directly via `sharp(..., { animated: true }).metadata().pages`:

- Plain re-encode to webp: **output `pages === 3`** (was `undefined`/1 before the fix — confirmed RED
  first).
- Resize to a different aspect ratio (10x5, `fit: "cover"`) on the same 3-frame source: **output
  `pages === 3`, `pageHeight === 5`, total `height === 15`** (`5 * 3`) — proves the resize did NOT
  squash all frames into one frame's worth of height.
- A separate 4-frame fixture with distinct solid colors, resized aggressively (40x20 source frames
  cropped to 8x8 with `fit: "cover"`): sampled the center pixel of each of the 4 output frames and
  confirmed each still matches its own source frame's color (no bleed across frame boundaries).

Full test file: `/Users/la/Programming/Jini/packages/cms/src/media/__tests__/image-transformer.sharp.test.ts`
(3 new tests, all passing; 7/7 in the file, 87/87 in the whole `src/media/` suite).

## Task 1 — the trap in the dispatch was real, but not the one it named

**Confirmed real (RED first):** `image-transformer.sharp.ts:119` called `sharpFactory(Buffer.from(input.bytes))`
with no options. Sharp decodes only frame 0 without `{ animated: true }`/`pages: -1`. Fixed.

**Confirmed empirically, contradicting part of the dispatch's stated trap:** the dispatch warned that
"the existing `pipeline.resize(...)` will squash all frames into a single frame's height" and that
resize "generally must constrain width only." I verified this is **not true for this package's pinned
`sharp@0.35.3`**, by reading `pipeline.cc`'s native resize code and then proving it with the crop-boundary
test above:
- `sharp`'s C++ pipeline is already page-height-aware: `width`/`height` passed to `.resize()` are
  resolved against the per-frame `pageHeight` (`sharp::GetPageHeight`), not the full multi-frame
  canvas — this has been true since a documented sharp version, not something this fix needed to add.
- The existing `pipeline.resize(input.params.width, input.params.height, { fit })` call at
  `image-transformer.sharp.ts:122` needed **zero changes**. Adding manual width-only/pageHeight
  recomputation, as the dispatch suggested, would have been redundant with (and risked conflicting
  with) sharp's own correct handling.

**The real trap, found by testing every `TransformFormat` output against an animated source:**
loading with `{ animated: true }` and then encoding to a format that **cannot** carry animation
(jpeg, png) does not merely flatten to frame 0 — it makes sharp write the entire multi-frame "toilet
roll" (all frames stacked vertically) out as **one tall, visibly corrupted static image** (confirmed:
a 3-frame 20x10-per-frame GIF encoded to jpeg with `animated: true` unconditionally applied produced a
10x30 image — all 3 frames stacked, not a clean still). This is worse than the pre-existing bug.

**Fix:** gate `{ animated: true }` on `ANIMATION_CAPABLE_FORMATS = new Set(["webp", "gif"])` (the two
`TransformFormat` values that support animated output). For jpeg/png targets, the transformer keeps
the old single-frame decode — now a **documented, deliberate** flatten-to-first-frame instead of an
accidental one. This directly fixes the real-world bug: Tovu's own "public" transform (the one every
embedded image URL actually uses, per Agent E's report) is registered with `format: "webp"` — an
animation-capable format — so this fix restores real motion for exactly the path Leona hit.

**Whether to gate on the SOURCE actually being multi-frame:** tested and confirmed unnecessary.
Loading a genuinely static PNG with `{ animated: true }` produces byte-identical output dimensions to
loading it without the option (sharp resolves `pages`/`nPages` to 1 when there's no multi-page
metadata to read). Unconditional (for animation-capable target formats) is simpler and provably
harmless.

**Resource-exhaustion surface — does NOT widen unboundedly, but does raise typical cost:**
- Sharp's `limitInputPixels` guard (default ~268,402,689 px, `0x3FFF**2`) is unconditional and checks
  the FULL decoded canvas (`image.width() * image.height()`, `common.cc:613-615`) — for a multi-page
  load that total already includes every frame combined (`width * pageHeight * pages`). Turning on
  `{ animated: true }` does not remove or raise this cap; it was already there for any single-frame
  image large enough to trip it.
- It DOES mean legitimate animated files now do proportionally more decode/re-encode work than the
  previous (buggy) frame-0-only path — expected and intended, since processing every frame is the
  actual feature. A malicious upload could spread many small frames across the same total-pixel
  budget to maximize frame count (more re-encode CPU work per input byte than an equivalent static
  image), but cannot exceed the existing pixel ceiling to do it.
- The input side is separately bounded by `DEFAULT_MAX_UPLOAD_BYTES` (10 MiB compressed,
  `media-service.ts:79`) before any bytes reach this transformer at all — same cap Agent E's report
  already relied on for the media-import size discussion.
- **Net judgment: this is a real, disclosed increase in per-request CPU cost for animated files, not
  a new unbounded surface.** Flagging explicitly per the dispatch's requirement rather than asserting
  "no risk."

**Files changed (Jini repo, `general-work` branch):**
- `packages/cms/src/media/image-transformer.sharp.ts` — `SharpFactory` type gained an optional
  `options?: { animated?: boolean }` second parameter; added `ANIMATION_CAPABLE_FORMATS`; the
  `sharpFactory(...)` call now passes `{ animated: true }` when `input.params.format` is webp/gif.
  Docblock rewritten with the empirical findings above (resize correctness, format gating, resource
  bounds) so a future reader doesn't re-attempt the manual-pageHeight "fix" that isn't needed.
- `packages/cms/src/media/__tests__/image-transformer.sharp.test.ts` — 3 new tests (frame-count
  preservation on plain re-encode, frame-accurate resize, deliberate-flatten-to-one-frame for jpeg).
- Built `dist` via `npx tsc -p tsconfig.json` from `packages/cms` only (never `pnpm -r build`). Tovu's
  `node_modules/@jini-ai/cms` is a real symlink to `Jini/packages/cms` — confirmed the rebuilt
  `dist/media/image-transformer.sharp.js` carries the fix.
- Committed separately in the Jini repo (`a476a18e`), explicit paths, no `git add -A`. Not published —
  local build only, per instructions.

**Verification commands (fresh):**
```
cd /Users/la/Programming/Jini/packages/cms
npx vitest run src/media/__tests__/image-transformer.sharp.test.ts   # 7 pass, 0 fail
npx vitest run src/media/                                             # 87 pass, 0 fail
npx tsc -p tsconfig.json --noEmit                                     # 0 errors
npx eslint src/media/image-transformer.sharp.ts src/media/__tests__/image-transformer.sharp.test.ts \
  --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}'  # clean
npx tsc -p tsconfig.json                                              # dist rebuild, clean
```

## Task 2 — third MIME list aligned, false comment fixed

Read Agent E's report (`ADS-memory/reports/2026-09-07-media-motion-graphics.md`) and verified its
core claim against source rather than trusting it: `DEFAULT_ALLOWED_MIME_TYPES`
(`Jini/packages/cms/src/media/media-service.ts:105-113`) is exactly 7 types — `image/jpeg`,
`image/png`, `image/webp`, `image/gif`, `image/avif`, `video/mp4`, `video/webm`. Confirmed correct;
this is the real ceiling.

**Fix:** `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:339` —
`FILE_HANDLER_ALLOWED_MIME_TYPES` widened from 5 image-only types to all 7. Its doc comment claimed
("Mirrors the server's own advisory upload allowlist") something that was false since `video/mp4`/
`video/webm` were added server-side 2026-08-24 and never mirrored here — rewrote the comment to state
plainly that this is a hand-copied, manually-synced list (same precedent as
`IMPORTABLE_CONTENT_TYPES` in `apps/website/src/features/media-import/fetch-image.ts`), and to name
the drift that just happened so it reads as a documented risk, not a repeated false claim.

**RED first:** added a test pinning `FILE_HANDLER_ALLOWED_MIME_TYPES` to the exact 7-type set
(mirroring `fetch-image.test.ts`'s equivalent pin, per E's report). Ran it fresh against the
unmodified file: failed exactly as expected (missing `video/mp4`/`video/webm`, no other drift). Fixed
the source, reran: green, 47/47 in the full test file.

**Files changed (Tovu repo, `restructure/apps-website-phased` branch):**
- `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` — list widened, comment fixed.
- `apps/admin/src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx` — 1 new pinning test.
- Committed (`596cdbce`), explicit paths.

**Verification commands (fresh, apps/admin dir, `TOVU_ADMIN_PASSWORD` unset):**
```
env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx
# 47 pass, 0 fail
npx tsc -p tsconfig.json --noEmit   # 0 errors (matches the ZERO baseline)
npx eslint src/features/posts/hooks/use-post-editor.hooks.ts src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx \
  --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}'
# 3 pre-existing warnings (lines 297, 391, 738 — none touched by this change), 0 errors
```

## Two things found beyond the literal ask — flagging, not fixing (out of scope)

1. **A FOURTH stale accept-list E's census missed, live in Agent F's territory.**
   `apps/admin/src/features/media/Media.tsx:819` has a raw HTML `accept="image/jpeg,image/png,image/webp,image/gif,image/avif"`
   attribute on the upload `<input>` — still 5 image-only types, no video, same drift shape as Task 2
   but in the Media Library's own upload form rather than the post-editor drag/paste path. Confirmed
   via `git log` this survived F's own most recent commit on that file (`bf41e81c`) and is not part of
   F's currently in-progress uncommitted work (which is unrelated — an HTML-attributes editor feature
   being reverted). **Not fixed by me** — `apps/admin/src/features/media/**` is explicitly Agent F's
   live territory per this dispatch's collision-avoidance rule. Sent F a direct message with the exact
   line and the fix shape (same pattern as Task 2) so it doesn't get missed a second time.

2. **Widening `FILE_HANDLER_ALLOWED_MIME_TYPES` opens a second on-ramp to a pre-existing "no video
   node" editor gap — not a new bug class.** Traced `handleFileDrop`/`handleFilePaste` and the Media
   Picker's own `insertMediaRef` (`apps/admin/src/lib/media-image-extension.tsx`): both build the
   IDENTICAL `{assetId, transformName: "public", alt}` shape into TipTap's `MediaImage` node — there
   is no video node type in this editor's schema, and `server/http/site/render.ts`'s public render
   switches on `node.type === "image"` specifically. `transformName: "public"` is an image re-encode
   transform; asking it to run against a video asset's bytes would surface as an
   `ImageSourceCorruptError` when that rendition is ever generated. **This gap already exists today**
   via the Media Picker (which already lets an operator pick a video asset — `media_upload_asset` has
   accepted video since 2026-08-24, and `Media.tsx` already has a `"video"` preview stage) — my change
   only adds a second entry point (drag/paste) into the same existing gap, it does not create a new
   failure mode. Fixing it for real needs a video/embed node type in the editor schema plus a matching
   `render.ts` case — well beyond this dispatch's "align the list, fix the comment" scope. Flagging for
   Leona's ruling: is a real video-in-post-body feature wanted, or should both entry points instead be
   restricted to image-only until such a node exists?

## Architecture Audit

- **Status: PASS.**
- ADR rules checked: port/adapter boundary in `image-transformer.ts`/`image-transformer.sharp.ts`
  (unchanged — `ImageTransformerPort` contract untouched, only the real adapter's internal call
  changed); no new external dependency added; no change to the public rendition route's contract;
  Tovu's `apps/admin` client/server boundary (`FILE_HANDLER_ALLOWED_MIME_TYPES` stays a hand-copied
  literal, not an import of server-side code, per that file's own stated boundary rule).
- Files audited: both changed files in each repo (listed above).
- Violations found: none.

## Pre-Completion Checklist

- Requirements re-verified against the dispatch: both tasks' literal asks are done.
- Fresh evidence commands: listed under each task above, all rerun in this session, not from memory.
- Test-integrity: no certified/existing test was deleted or weakened. Two Jini tests were added, one
  hooks test was added; the two Jini tests that previously encoded the "video is rejected" behavior
  (Task 2's sibling list, `fetch-image.test.ts`) were Agent E's prior work, untouched by me.
- Scope confirmation: Task 1 touched only `packages/cms/src/media/image-transformer.sharp.ts` and its
  test file in Jini. Task 2 touched only the two named files in
  `apps/admin/src/features/posts/**`. Verified via `git status` before and after that
  `apps/admin/src/features/media/**` (Agent F's live territory) was never written to by me.
- Open items: the two flags above (Media.tsx's stale accept list; the video-into-image-node gap),
  both explicitly named for Leona/F rather than silently fixed or silently ignored.

## Self-Validation

Runtime-changing behavior is in scope (Task 1 changes real image-processing output bytes). Ran the
bounded validation directly against the real adapter rather than the full app runtime (no daemon/API
restart needed — this is a pure library function, exercised end-to-end with real `sharp` and a real
multi-frame fixture, which is the strongest available evidence short of clicking through the live
admin UI with a live upload).

- Status: **PASS**.
- Report path: this file.
- Attempts used: 1 (RED confirmed first try, fix worked first try, no retries needed).
- Critical path checked: animated GIF -> webp re-encode, plain and resized.
- Negative/edge path checked: animated source -> jpeg (non-animatable format) does NOT regress to the
  worse "stacked frames" corruption; malformed-GIF rejection (`ImageSourceCorruptError`) still fires
  unchanged (existing test, rerun, still green); static single-frame image unaffected (existing test,
  rerun, still green).
- No bounded diagnosis pass was needed — the empirical sharp-behavior investigation (pipeline.cc
  reading, probe scripts) happened BEFORE writing the fix, not as a repair-loop diagnosis after a
  failed attempt.

## Style Notes / function-quality table

| unit | disposition | findings | local fix attempted |
|---|---|---|---|
| `SharpImageTransformer.transform` (Jini) | NO_RECORDED_FINDINGS (pre-existing `Medium` finding about untested-without-real-sharp carried forward unchanged — not introduced by this change) | none new | n/a |
| `ANIMATION_CAPABLE_FORMATS` (Jini, new) | NO_RECORDED_FINDINGS | none | n/a |
| `FILE_HANDLER_ALLOWED_MIME_TYPES` (Tovu, modified) | NO_RECORDED_FINDINGS | none | n/a |

Zero-findings skepticism pass: both changed production units are data/gating changes (a constant
list, a Set-membership check feeding an existing conditional), not new branching logic — the actual
correctness risk lived in `sharp`'s own native behavior, which is why this task's evidence bar was an
empirical fixture-based test rather than more inline findings. Variable-name audit: `preserveAnimation`
correctly names a boolean gating the `{ animated: true }` load option (not the resize step, which is
unconditional either way) — checked against its one call site, no stale/misleading name found.

No adversarial aggregate/cross-item workflow is in scope here (single-item transform call, single
constant list) — `adversarial-test-design` skill not activated.

## Deviations from plan

None from the dispatch's literal scope. One deviation from the dispatch's own stated technical
approach: it anticipated a width-only-resize / manual-pageHeight-recomputation fix for Task 1; I
instead verified (and documented) that the existing resize call needed no change at all, backed by
direct evidence rather than the dispatch's assumption. Flagging this as "verified premise, didn't
match the stated hypothesis" per this repo's own stated discipline that inherited premises get
repeated but only implementations get tested.

## Risks and tech debt introduced

None net-new. The two flagged items above are pre-existing gaps this task's scope surfaced, not
introduced.

## Suggested next routing

- Agent F (or whoever next touches `apps/admin/src/features/media/**`): fix `Media.tsx:819`'s stale
  `accept` attribute the same way as Task 2 here.
- Leona: rule on whether video-in-post-body is a wanted near-term feature (needs a real video node
  type + `render.ts` case) or whether both insertion paths (Media Picker, drag/paste) should instead
  be temporarily restricted back to image-only until that exists.
