# Media slug + HTML attributes — handoff (context-rotation, mid-Task-2)

Agent I. Stopped by the coordinator at ~550k tokens (rotation limit ~300k, coordinator's own
admitted miss on timing, not a quality problem with the work). This is a cold-start handoff — the
next agent has none of this conversation's context. Read this whole file before touching code.

Repos: Tovu `/Users/la/Programming/Tovu` (branch `restructure/apps-website-phased`), Jini
`/Users/la/Programming/Jini` (branch `general-work`).

## TASK 0 (accept video in the media upload picker) — DONE by a different agent, not me

Agent H fixed it in Tovu commit `c55da3e1` before my dispatch even finished being written — the
coordinator verified it independently. **Do not touch it again.** I did the one piece still assigned
to me: confirmed no inner `startsWith("image/")` guard exists anywhere in the upload path
(`use-media.hooks.ts`'s `upload()` passes `file.type` straight to `port.uploadMedia`, no filtering)
and no such guard exists in `use-media-preview.hooks.ts`'s image→video→placeholder fallback chain.

**NOT verified**: an actual end-to-end live upload of a real video file through the running dev
admin, confirmed to land correctly in the Videos tab. I only read code paths; I never drove a real
upload. The coordinator's own message asked for this explicitly and I did not get to it before being
pulled. If nothing else picks this up, it is the one open item from Task 0.

Also flagged, not fixed (separate from Task 0's own scope): `Media.tsx`'s `MediaTypeEmptyState`
copy/comment drifted stale twice in one day (first said "server rejects video", then after that was
fixed said "the picker only lists images") — Agent H fixed the comment and the copy itself
("Uploaded videos appear here once you add them.") and Agent H separately translated that new string
into all 21 `MEDIA_DICT` locales (commit `05bb6b21`, confirmed via a teammate message, not
independently verified by me). I did not touch `Media.tsx`'s empty-state code myself.

## TASK 1 (media slug) — DONE and verified, including the live-DB backfill

### Status: shippable as committed. Every piece below is committed in both repos.

**Identity model** (Leona's decisions, all implemented as specified): `slug` is a separate field
from `title`, auto-derived at upload, independently editable, never recomputed on a title rename.
`id` (UUID) stays the canonical primary key; `slug` is an additional lookup key.

**DB enforcement**: `idx_media_workspace_slug`, a real `UNIQUE(workspace_id, slug)` index — this is
the actual enforcement, not the app-level check. Verified read-only against the live
`sites/tovu-com/content.db` schema directly (not inferred). Migration `apps/website/src/platform/db/
drizzle/0059_woozy_micromacro.sql` adds the nullable `slug` column + this index in one migration —
safe against existing rows because SQL treats every NULL as distinct under a unique index, so 16
NULL-slug rows didn't violate it before the backfill ran. `schema.postgres.ts` regenerated via
`development/scripts/generate-postgres-schema.ts` (never hand-edit that file directly — it's a build
artifact of `schema.ts`), drift/parity suites re-run clean at the time.

**Backfill: DONE, on the live DB, by Leona herself** (I could not run `--apply` against
`sites/tovu-com/content.db` — the harness's permission classifier blocked that specific live-DB
write; I stopped and asked rather than trying to route around it, which was the right call — the
coordinator confirmed Leona ran it directly). Coordinator verified read-only: `count(slug) = 16`,
all distinct, restore point captured automatically before the write
(`restore-point-backfill-media-slugs-wm16-*.db`). Collision suffixing worked on real data: two
`blue-circle` titles → `blue-circle`/`blue-circle-2`; two
`higgsfield-red-fox-snowy-pine-forest-dawn` titles → the `-2` pair. The backfill script itself
(`development/scripts/backfill-media-slugs.ts`) is dry-run-by-default, idempotent, and has 3
adversarial tests (`development/scripts/__tests__/backfill-media-slugs.test.ts`) — all passing at
last run.

**A REAL GAP the coordinator caught from the live backfill output, NOT fixed**: derived slugs have
**no maximum length**. Two live titles are themselves long, truncated, machine-generated strings
(pre-existing truncation, not mine to fix), and their slugs inherited the full length verbatim:
`a-solid-red-equilateral-triangle-centered-on-a-plain-pure-wh`,
`a-polished-square-social-media-graphic-a-vibrant-blue-to-vio`. Nothing crashed and nothing
collided, but `deriveUniqueMediaSlug`/`slugifyMediaTitle`
(`/Users/la/Programming/Jini/packages/cms/src/media/media-service.ts`) has **no length cap at all**
— unlike `post.ts`'s `MAX_SLUG_LENGTH = 120` with an explicit check in `resolveExplicitSlug`. A
future very-long title will produce an equally long slug. **Not done. Needs a cap added to both the
live-derivation path (`deriveUniqueMediaSlug`) and probably `resolveSlugForUpdate`'s explicit-edit
validation.** I did NOT add one — flagging instead of guessing a number Leona hasn't set.

**Already correctly handled** (the coordinator asked me to double check this specific concern,
worried it might be missing — it is not): a title that slugifies to the empty string (punctuation-
only, emoji-only, non-Latin script) falls back to the literal base `"untitled"`, then goes through
the same collision-suffix loop as any other base. Tested directly:
`"uploadMedia falls back to 'untitled' when a non-empty title slugifies to nothing"` in
`packages/cms/src/media/__tests__/media-service.test.ts`. This was NOT a gap.

**Duplicate-slug error surfacing — confirmed working at both layers**, the other thing the
coordinator asked me to re-check:
- API: `PATCH .../media/:mediaId` with a slug already used by a different row in the same workspace
  returns **409** with a message naming the conflicting slug (`update.ts`'s catch block maps
  `MediaConflictError` → 409). Tested: `"update: a slug already claimed by ANOTHER row in the same
  workspace is refused with 409, naming the conflict — and neither row's slug changes"`.
- Admin UI: the 409's message surfaces through `EditMediaPanel`'s existing `role="alert"` save-error
  banner (the exact same banner every other save failure already uses — no new error UI invented).
  Tested end to end in `apps/admin/src/features/media/__tests__/Media.unit.test.tsx`: `"a 409 slug
  conflict from the server surfaces through the same save-error banner other failures use, naming
  the conflict"`.

**Lookup accepts slug OR id**: `findMediaByIdOrSlug` (Jini `media-service.ts`, slug-first-then-id,
mirroring `post.ts`'s `getAdminPostByIdOrSlug`) is wired into three call sites a human can actually
type into: the `"media"` embed-marker resolver (`resolver-service.ts`'s `resolveOneMediaEmbed` —
the resolved MAP KEY stays the raw typed ref so the caller's own by-marker-id lookup still matches,
but the emitted public URL's `assetId` is normalized to the canonical `record.id` so a later slug
rename can't break a URL already baked into previously-rendered HTML), the public image rendition
route (`rendition-service.ts`'s `resolveMediaRendition` — every `asset_renditions` read/write inside
it was rebound to the resolved canonical id, NOT the raw possibly-slug input, to avoid writing
slug-keyed duplicate rendition rows; this is tested explicitly), and the shared
`resolveMediaOriginalBlob` (covers both the admin preview route AND the public video-original
route in one edit).

**Deliberately left on UUID-only lookup** (a scoping decision, not an oversight): the TipTap
ref-node image path (`resolver-service.ts`'s `resolvePostContentMediaContext`,
`pages.ts`'s `resolveMediaAssetMetadataForRender`) and `features/seo/media.ts`'s asset lookup. Both
are populated by the system (the media picker inserts a real UUID), never hand-typed, so slug
support there is lower-value. If a future ask specifically wants SEO fields or the TipTap picker to
accept a typed slug, these are the two remaining `findById` call sites to upgrade the same way.

**i18n gap, since fixed by another agent**: I originally flagged that the new "Slug" admin field
label had no translated `MEDIA_DICT` entry (falls back to English via the pre-existing `?? key`
chain). I did not verify whether anyone has since added it — check `media-i18n.ts` for a `"Slug"`
key before assuming it's still missing.

### Files touched for Task 1, all committed

Jini: `packages/cms/src/media/types.ts`, `ports.ts`, `repo.memory.ts`, `media-service.ts`,
`index.ts`, `rendition-service.ts`, plus `__tests__/media-service.test.ts` and
`__tests__/rendition-service.test.ts`. Built (`npm run build` in `packages/cms`) after every change
— Tovu's `node_modules/@jini-ai/cms` is a symlink to source but Tovu imports the **dist** output, so
a source-only edit with no rebuild is invisible to Tovu until built.

Tovu: `apps/website/src/platform/db/schema.ts` + `schema.postgres.ts` (+ the 0059 migration/meta
files), `apps/website/src/platform/db/sqlite/media-repo.sqlite.ts`, `apps/website/src/features/media/
index.ts`, `apps/website/src/features/widgets/resolver-service.ts`, `apps/website/src/server/inbound/
admin-http/routes/media/{update.ts,parse.ts}` + its test, `apps/website/src/server/inbound/
admin-http/routes/media/original.ts`, `apps/website/src/server/inbound/admin-http/http/media.ts`,
`apps/website/src/features/media/__tests__/repo.contract.test.ts`,
`development/scripts/backfill-media-slugs.ts` + its test.

Admin: `apps/admin/src/lib/api.ts` (`AdminMedia.slug`, `updateMedia` option), `apps/admin/src/
features/media/{Media.tsx,rules.ts}`, `apps/admin/src/features/media/hooks/{use-edit-media-panel.
hooks.ts,media-port.hooks.ts,media-dependencies.hooks.ts}`, `apps/admin/src/features/posts/hooks/
post-editor-dependencies.hooks.ts`, plus ~16 test-fixture files across `apps/admin` that needed a
`slug` field added once `AdminMedia.slug` became required (apps/admin's `tsc` DOES type-check test
files, unlike apps/website's — this bit me once early on; expect the same for `htmlAttributes` in
Task 2's remaining admin work).

## TASK 2 (HTML attributes) — HALF DONE. Write path + render path landed in apps/website and Jini.
## Admin UI wiring NOT STARTED. Two known-broken pre-existing tests, deliberately not fixed.

### Design (reused, not redesigned, per the mandate)

`apps/admin/src/features/media/rules.ts`'s `parseMediaHtmlAttributes`/
`isAllowedMediaHtmlAttributeName`/`describeMediaHtmlAttributeError` (24 tests, already existed,
already unwired) is the source of truth for the rules. I did **not** import it across the
browser/Node boundary — **do not attempt this** (see "tried and rejected" below). Instead I ported
the same logic verbatim into a new Node-side file, `packages/cms/src/media/html-attributes.ts`
(Jini), which both Jini's own `media-service.ts` and Tovu's `apps/website` (both pure Node) import
from `@jini-ai/cms/media`. Two copies of the same rules now exist by design — this mirrors the
codebase's own existing precedent for `DEFAULT_ALLOWED_MIME_TYPES` vs.
`FILE_HANDLER_ALLOWED_MIME_TYPES`/`IMPORTABLE_CONTENT_TYPES`. If the allowlist ever changes, it must
change in BOTH `apps/admin/src/features/media/rules.ts` and `packages/cms/src/media/
html-attributes.ts` — there is no single source of truth across the browser/Node boundary, and that
is accepted, disclosed drift risk, not an oversight.

**Tried and rejected**: importing `@jini-ai/cms/media` directly into `apps/admin` (Vite/browser) so
admin could share Jini's copy instead of keeping its own. Did not attempt it in code — reasoned
through it and stopped, because `@jini-ai/cms/media`'s barrel (`index.ts`) re-exports files that
import real Node built-ins (`node:crypto` in `media-service.ts`, `node:fs` in `blob-store.fs.ts`,
native `sharp` bindings in `image-transformer.sharp.ts`), and `apps/admin` currently has **zero**
existing imports from `@jini-ai/cms` to prove Vite's tree-shaking handles this cleanly. Risking
Leona's live admin dev server (`https://localhost:5173`, explicitly must not be broken) on an
unproven bundling assumption was not worth it under time pressure. If a future agent wants to
collapse the two copies into one, prove the Vite bundle stays clean FIRST (a throwaway import + a
dev build), before wiring it into real code.

### Storage shape

`MediaRecord.htmlAttributes: string | null` (Jini `types.ts`) — same shape as `cssClass`: one raw
string column, `null` means not set, the stored text is the RAW validated source text (e.g.
`data-motion="fade-in" loading="lazy"`), not a parsed/serialized map. `media.html_attributes TEXT`
nullable column, migration `0060_fast_human_cannonball.sql`, additive, no backfill needed (every
pre-existing row already reads back correctly as `NULL`).

### Write path — DONE, tested, committed (Jini `e0fb57a2`, Tovu `1499abc3`)

`updateMediaMetadata` (Jini `media-service.ts`) validates a provided `htmlAttributes` value via
`resolveHtmlAttributesForUpdate` BEFORE building the updated record — an `on*` handler, a
`javascript:` value, or a disallowed name throws `MediaValidationError` naming the exact rejected
attribute, and the whole call writes nothing (proven by a test that also changes `alt` in the same
call and confirms `alt` did NOT persist either — atomic all-or-nothing, matching how
`width`/`height`'s positive-integer check already behaves). `apps/website`'s `update.ts` PATCH route
already maps `MediaValidationError` → 400 (pre-existing catch branch, needed no new mapping) and now
reads `htmlAttributes` as its 9th patch key. 19 tests total across Jini's `media-service.test.ts`
(8), Jini's new `html-attributes.test.ts` (23, ported 1:1 from admin's own suite), and Tovu's
`update.test.ts` (5 new: valid value persists, on* rejected + nothing else in the call persists,
javascript: rejected, disallowed name rejected, null clears, omit leaves unchanged).

### Render path — DONE, tested, committed (Tovu `1499abc3`)

`render.ts`'s `renderImageTag`/`renderVideoTag` both gained an `htmlAttributes: string | null` prop,
parsed via the SAME `@jini-ai/cms/media` `parseMediaHtmlAttributes` and re-validated at render time
(defense-in-depth: fails CLOSED — emits nothing extra — on a parse error, never trusts a stored
value blindly even though the write path already validated it). `renderImageTag` specifically
handles the `loading` collision: that tag already hardcodes `loading="lazy"`, and `loading` is
itself an allowlisted attribute name, so an operator's own `loading="eager"` now OVERRIDES the
default instead of being silently dropped or emitted twice (tested). `renderVideoTag` has no such
hardcoded default, so every allowlisted attribute (including boolean ones like `muted`, which the
parser stores as an empty string) is emitted as-is — HTML treats any value on a boolean attribute,
including `""`, as true, so `muted=""` and bare `muted` are equivalent; no separate boolean-emission
branch was needed.

Threaded through both call chains that already threaded `width`/`height`/`cssClass`:
`resolver-service.ts`'s `resolveOneMediaEmbed`/`buildMediaImageIr`/`resolvePostContentMediaContext`,
and `pages.ts`'s `resolveMediaAssetMetadataForRender`. `MediaAssetRenderMeta` (the JSON-round-tripped
per-asset map `render.ts` reconstructs across the widgets/render.ts layering boundary) gained the
field in its interface, its JSON parser (`parseMediaAssetMeta`), and its normalizer
(`resolveMediaAssetOverrides`, `normalizeMediaDimensions`).

### KNOWN BROKEN, deliberately not fixed — 5 failing tests, all pre-existing fixtures in files this
### work did not otherwise touch

Verified once, honestly, right before stopping (do not re-verify blindly — re-run and see for
yourself, this is a snapshot):

```
apps/website tsc -p tsconfig.json --noEmit:  0 errors
node --import tsx --test <4 suites>:         263 tests, 258 pass, 5 fail
```

The 5 failures are ALL the same root cause: a `MediaRecord`/render-props-shaped object literal that
predates `htmlAttributes` existing, now missing the key, tripping a `deepStrictEqual` against an
`actual` that legitimately has `htmlAttributes: null`/`undefined` where the `expected` literal has
no such key at all. This is the EXACT same class of gap the `slug` field caused earlier in Task 1
(fixed then by adding `slug: "..."` to ~16 admin fixtures + this file's own `makeMedia()` factory) —
the fix here is equally mechanical, just not done:

- `apps/website/src/features/media/__tests__/repo.contract.test.ts` — `makeMedia()`'s factory
  (already has `slug`, needs `htmlAttributes: null` added the same way) — 1 test:
  `"[sqlite] save() then findById() round-trips"`.
- `apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.
  test.ts` — 4 tests, all comparing a `{componentId, props: {...}}` or a per-asset metadata object
  literal against a resolved value that now carries `htmlAttributes`:
  - `"a \"media\" embed with no variant resolves against CORE_PUBLIC_TRANSFORM_NAME (\"public\") by default"`
  - `"a \"media\" embed whose asset is a recorded VIDEO resolves to a video IR — ..."`
  - `"a \"media\" embed with mediaContentTypeStore supplied but no recorded type for this asset's sha256 falls through to the ordinary image path unchanged"`
  - `"a \"content\" embed's bodyJson containing a ref-based image resolves mediaTransformVersions/mediaAssetMetadata into its IR props — ..."`

**Do not "fix" these by removing the field from production code** — the field is real and correct;
the fixtures are stale. Add `htmlAttributes: null` (or a real record's own value, matched to the
test seed) to each literal and re-run.

### NOT STARTED — apps/admin UI for htmlAttributes

None of this is done:
- `AdminMedia.htmlAttributes: string | null` in `apps/admin/src/lib/api.ts`.
- `updateMedia`'s options type + `MediaPort.updateMedia`'s options type need `htmlAttributes`.
- `rules.ts`'s `MediaMetadataPatch`/`diffMediaMetadata` need the field (same `null`-means-clear
  shape as `cssClass`, copy that exactly).
- `use-edit-media-panel.hooks.ts` needs `htmlAttributesText`/`setHtmlAttributesText` state.
- `Media.tsx`'s `EditMediaPanel` needs the actual `<input>`, likely a live (as-you-type) hint reusing
  the ALREADY-BUILT, ALREADY-TESTED `parseMediaHtmlAttributes`/`describeMediaHtmlAttributeError`
  from admin's own `rules.ts` — they exist, tested, unwired, exactly for this.
- Every `AdminMedia`-shaped test fixture across `apps/admin` will again need a new field added, same
  drill as `slug` (see Task 1's file list above) — apps/admin's `tsc` WILL catch every one, run it
  early and often rather than batching all fixes to the end.

**The one thing that MUST NOT be reintroduced**: on 2026-09-07, an earlier agent (F) shipped this
exact field once already and it was reverted, because `save()` returned early whenever
`htmlAttributesText` failed the allowlist check, BEFORE `diffMediaMetadata` ever ran — an invalid
HTML-attributes value silently blocked saving title/alt/caption/credit/cssClass too, a real
functional regression on fields that genuinely persist (see `ADS-memory/reports/
2026-09-07-media-admin-ui.md` for the full incident). The fix is: **never gate `save()` on the
client-side validator's result.** Let `diffMediaMetadata` run unconditionally, submit the patch, and
let the SERVER's 400 (already wired, already tested) surface through the existing error banner —
exactly how `slug`'s malformed-format 400 already works, proven in `Media.unit.test.tsx`. A live
inline hint using the client validator is fine and encouraged; a client-side gate on `save()` is not.

## Everything I inherited that I found WRONG or needed correcting

- **Task 0 was already done** by the time my dispatch was written — the coordinator's own line
  numbers (`~721`/`~725`) were already stale by the time I read the file (an unrelated commit had
  shifted them); I found the real state by content, not the line numbers, and the coordinator's
  follow-up message confirmed this independently. Lesson already logged in the codebase's own
  memory (`feedback_symptom_reachable_by_many_routes` territory) but worth restating: locate by
  content in a shared tree, never trust a line number from a brief written before you started.
- **The coordinator's "past-context" message claimed three specific admin files were uncommitted**
  (`media-dependencies.hooks.ts`, `media-port.hooks.ts`, `apps/admin/src/lib/api.ts`). I checked —
  they were NOT uncommitted; they were already committed in `d79b0376` well before that message
  arrived. I did not re-commit them. Whatever produced that claim (a stale git-status snapshot on
  the coordinator's side, most likely) was wrong; I'm flagging it rather than silently trusting it,
  per this session's own standing rule that every report — including the coordinator's — is a claim
  to verify, not a fact to act on unchecked.
- The original dispatch's assumption that `apps/website`'s `tsc` would catch a missing-field test
  fixture (the way `apps/admin`'s does) is **false** — `apps/website`'s `tsc` config excludes test
  files entirely. This is why the slug rollout needed a manual test-suite run to find the
  `repo.contract.test.ts` gap, and why Task 2's 5 known-broken tests exist silently right now with a
  clean `tsc` — a green `tsc` on `apps/website` proves nothing about test-file correctness. Always
  actually run the test suite; do not infer test health from `tsc`.

## Verification commands for the next agent (run yourself, don't trust this snapshot)

```
# Jini
cd /Users/la/Programming/Jini/packages/cms && npx tsc --noEmit -p . && npx vitest run

# Tovu apps/website
cd /Users/la/Programming/Tovu
npx tsc -p tsconfig.json --noEmit
env -u TOVU_ADMIN_PASSWORD node --import tsx --test \
  apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts \
  apps/website/src/server/inbound/admin-http/routes/media/__tests__/update.test.ts \
  apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts \
  apps/website/src/features/media/__tests__/repo.contract.test.ts

# Tovu apps/admin (run from apps/admin, TOVU_ADMIN_PASSWORD unset)
cd /Users/la/Programming/Tovu/apps/admin && npx tsc --noEmit
env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/media/
```

## Suggested next routing

1. Fix the 5 known-broken fixtures (mechanical, ~10 minutes).
2. Add a max-length cap to slug derivation (Jini `deriveUniqueMediaSlug`/`slugifyMediaTitle`) —
   needs Leona's number, or a reasonable default matching `post.ts`'s `MAX_SLUG_LENGTH = 120`.
3. Finish apps/admin's htmlAttributes UI wiring per the "NOT STARTED" section above — respecting the
   "never gate save() on client validation" rule.
4. Confirm Task 0's one open item: an actual live video upload through the dev admin, landing
   correctly in the Videos tab.
5. Confirm whether `media-i18n.ts` now has a translated "Slug" label (I flagged it missing; another
   agent may have since added it, unverified by me).

---

# Agent J — Tasks 1-3 complete (2026-09-07)

Cold-started from the handoff above, read in full before touching anything. All three assigned
tasks are done, committed, and verified with fresh test runs. Commits: Tovu `2d6d40ae` (Task 1),
`71d26c0e` (Task 3), `4998ea91` (Slug i18n, see below); Jini `4d6b840d` (Task 2). Task 0's one open
item (live video upload through the dev admin) was **not** in my assignment and remains open — I did
not touch it.

## TASK 1 — required-vs-optional decision: REQUIRED (kept as-is), fixtures fixed

`htmlAttributes` stays a required `string | null` on `MediaRecord`/`AdminMedia` — not made optional.
This was already the deliberate, documented design, not something I had to decide fresh:
`MediaRecord.width`/`height`/`cssClass`'s own doc says they are "Always present (never `undefined`)
... so every existing `MediaRecord` construction site is forced to make an explicit choice," and
`htmlAttributes`'s doc explicitly says it "follows... the same 'one string column, `null` means not
set' shape {@link cssClass} already establishes." Making it optional would have been the wrong fix —
it would have silently reintroduced the "does this field exist on this record or not" ambiguity the
existing fields deliberately close off. The correct fix, and the one I made: add `htmlAttributes:
null` to the two stale fixture factories (`repo.contract.test.ts`'s `makeMedia()`,
`resolve-html-page-embeds.integration.test.ts`'s `mediaRecord()`) and the 4 IR-props literals that
compared against a resolved value now carrying the field
(`apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts`).
Fresh run: `apps/website` tsc 0 errors, the 4 named suites 263/263 passing (was 258/263).

## TASK 2 — slug max-length cap (Jini, committed `4d6b840d`)

Added `MEDIA_MAX_SLUG_LENGTH = 120` to `packages/cms/src/media/media-service.ts` (Jini) — same
number as `post.ts`'s `MAX_SLUG_LENGTH`, not a new one, per the dispatch's instruction to follow
posts rather than invent a second convention. **One correction to the dispatch's own premise,
verified against source before acting on it**: `post.ts` does NOT cap its own title-derived slug at
all — `MAX_SLUG_LENGTH` there is enforced only in `resolveExplicitSlug` (the caller-supplied-slug
path), confirmed by reading `post.ts:730-751` and the total absence of any length check in
`createPost`'s derive-on-create branch (`post.ts:821-836`) or a corresponding test. So "posts cap
derivation at 120" was not quite accurate; what's true is "posts cap the EXPLICIT edit path at 120."
I applied the SAME bound to media's two paths, but by DESIGN, not by literally copying: `deriveUniqueMediaSlug`
(the derive-on-upload/backfill path, no human to prompt) truncates and strips a trailing dash the cut
can introduce; `resolveSlugForUpdate` (the explicit admin-edit path, a human typed it) rejects with
`"slug must be 120 characters or fewer"`, the identical message shape `post.ts`'s
`resolveExplicitSlug` uses. On a collision, the loop re-truncates the BASE (never the suffix) so
every candidate it ever checks against `findBySlug` already obeys the cap, not just the first one.

Also pinned (already correct code, previously untested for the ADVERSARIAL case specifically): two
DIFFERENT titles that both slugify to the empty string collide on the `"untitled"` fallback and are
disambiguated by the same suffix loop as any other collision (`"untitled"` / `"untitled-2"`) — this
is what stops an empty derived slug from ever being inserted twice as a bare `""`, which the unique
index would treat as one real value, not "unset," and would otherwise surface as a confusing
constraint violation instead of a clean second slug.

5 new tests in `packages/cms/src/media/__tests__/media-service.test.ts` (38 total, all passing):
truncation with no trailing dash, collision-plus-truncation re-truncating the base, the two-empty-titles
collision, explicit-edit rejection at 121 chars with the exact message, explicit-edit acceptance at
exactly 120. Jini full suite: 679/679 passing. Package rebuilt (`npm run build` in `packages/cms`) so
Tovu's dist-consuming import picks it up — confirmed via a fresh `apps/website` tsc (0 errors) and
re-run of the 4 affected suites (263/263) after the rebuild.

**Method note, disclosed rather than hidden**: I wrote the implementation and the tests in the same
pass, not test-first — a deviation from the letter of "RED first." I did verify by inspection that
the OLD code had no cap at all (confirmed above, `deriveUniqueMediaSlug` before my edit was
`base = slugifyMediaTitle(title) || "untitled"` with no truncation whatsoever), so each new test is
provably meaningful, not vacuous — but I did not literally run them against the old code to see them
fail. Flagging this so it isn't silently presented as a stronger guarantee than it is.

## TASK 3 — admin UI wiring (Tovu, committed `71d26c0e` + `4998ea91`)

**Server-side enforcement — confirmed real, both layers, verified against source (not repeating a
prior claim unchecked):**
- **Write path**: `apps/website/src/server/inbound/admin-http/routes/media/update.ts`'s
  `parseMediaMetadataPatch` reads `htmlAttributes` as a plain optional/nullable string with NO
  format check of its own — the comment there says so explicitly ("Format/allowlist validation
  happens entirely in `updateMediaMetadata`"). The actual gate is Jini's `resolveHtmlAttributesForUpdate`
  (`media-service.ts:536-544`), called from `updateMediaMetadata` BEFORE the record is built; a
  rejection throws `MediaValidationError`, which `update.ts`'s catch block maps to 400, and nothing
  is written (matches Task 2's own already-existing tests).
- **Render path**: `apps/website/src/server/inbound/public-http/http/site/render.ts`'s
  `resolveMediaHtmlAttributes` (line 622) re-parses the STORED value through the same
  `@jini-ai/cms/media`'s `parseMediaHtmlAttributes` and fails CLOSED (emits nothing extra) on any
  parse error — its own doc comment states this is deliberate defense-in-depth against an older code
  path, a direct DB edit, or a future write-side bug, not trusting the write path's validation alone.

So Agent I's "fail-closed re-validation in render.ts" claim checks out at both the write path and
the render path — I am not just repeating it, I read both call sites myself.

**The a7cce060 regression — confirmed NOT reintroduced, pinned by 4 new tests across 2 files:**
`use-edit-media-panel.hooks.ts`'s `save()` calls `diffMediaMetadata` unconditionally, with no
`if (htmlAttributesError) return` anywhere in the function (verify: it's a 3-line function now,
`diff -> maybe onCancel -> mutate`, unchanged in shape from before this field existed). `Media.tsx`'s
Save button is disabled only on `saving`, never on the new field's validity. `htmlAttributesError` is
exposed purely as a live hint rendered via `.field-error` (an existing shared class already used
elsewhere for exactly this: a visible, non-blocking per-field message) next to the input.
- `use-edit-media-panel.hooks.unit.test.tsx`: `save()` still calls the port and completes while
  `htmlAttributes` is invalid (the exact shape of the reverted bug — the OLD `save()` would `return`
  before this point was ever reached); a valid change reaches the port using the same trim-to-null
  convention as `cssClass`.
- `Media.unit.test.tsx` (new `describe("EditMediaPanel — HTML attributes field")`): typing an on*
  handler shows a specific, named error but does NOT disable Save; clicking Save with an invalid
  draft (title also changed) still sends the PATCH request at all — under the old bug, `fetch` would
  never have been called and the mocked route would never see a request, regardless of what it was
  stubbed to return; a value THIS form's own client-side allowlist accepts but the server rejects
  (mocked 400) still surfaces through the same `role="alert"` save-error banner every other failure
  uses, proving the banner reflects the server's real answer, not merely echoing the client's own
  parse. A valid value round-trips through a real PATCH body assertion (`{ htmlAttributes:
  'data-motion="fade-in"' }`) — addresses the dispatch's warning that the PATCH route returns 200
  whether or not an unrecognized key actually saved: every assertion here is on the PATCH BODY the
  client sent or the fake port's stored VALUE, never on a bare status code.

**One thing worth being precise about, since I initially wrote the test the other way and had to
correct it**: `diffMediaMetadata` is a pure diff, not a validator (see its own doc). So when
`htmlAttributes` is genuinely dirty AND invalid, the invalid value legitimately rides along in the
same atomic PATCH as any other changed field — it is NOT filtered out client-side. A real server then
rejects that whole call atomically (Jini's `updateMediaMetadata` already writes nothing on rejection,
proven by an existing test that also changes `alt` in the same call). That is correct, honest
atomic-PATCH behavior, not a residual form of the old bug — the old bug was a client-side gate that
stopped `save()` from ever attempting the request at all, which is what all four new tests actually
pin.

**Mechanical fixture fallout (apps/admin tsc catches every one, unlike apps/website's excluded test
files)**: 21 files needed a `htmlAttributes: null` (or equivalent) literal added once the field
became required on `AdminMedia` — `agent-handle-batch3.unit.test.tsx`, `EmbedInsertControl.unit.test.tsx`,
`MediaPickerDialog.hooks.unit.test.tsx`, `MediaPickerDialog.unit.test.tsx`,
`media-type-filter.unit.test.tsx`, `use-edit-media-panel.hooks.unit.test.tsx`,
`use-media-preview.hooks.unit.test.tsx`, `use-media.hooks.unit.test.tsx` (3 occurrences),
`use-post-editor.hooks.unit.test.tsx`, `post-editor-dependencies.hooks.ts` (production file — a
fake/seed `AdminMedia` literal, not the route itself), `MediaRefField.hooks.unit.test.ts`,
`MediaRefField.unit.test.tsx`, `Seo.unit.test.tsx`, `api-media.unit.test.ts`,
`media-image-extension.unit.test.tsx`, plus `Media.unit.test.tsx`'s own `ACTIVE_ITEM`/`TRASHED_ITEM`
(not tsc-forced there since those two literals aren't typed as `AdminMedia`, added anyway for
consistency). `apps/admin` tsc: 0 errors, confirmed fresh after every edit. Full `apps/media/`
suite plus every other touched scope (SEO, posts, MediaPickerDialog, api-media,
media-image-extension): 382/382 passing.

**i18n**: added `"HTML attributes (optional)"` plus the 4 allowlist-rejection message templates
(`describeMediaHtmlAttributeError`'s keys) to all 21 `MEDIA_DICT` locales — `media-i18n.unit.test.ts`'s
cross-locale parity guard passes. Also closed the ONE item this handoff left explicitly unverified:
`media-i18n.ts` had NO `"Slug"` entry in any locale (confirmed by grep before assuming either way,
per this session's own standing rule) — added it to all 21 locales too, kept as Latin `"Slug"`
everywhere except `hi`/`ur`/`bn` (phonetic transliteration), matching this file's own existing
precedent for the `"Alt"` label. Committed separately as `4998ea91` since it's an independent fix,
not part of the htmlAttributes feature itself.

**Complexity check (Jini, outside `apps/admin/src` so not exempt)**: `npx eslint
packages/cms/src/media/media-service.ts --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}'`
flags `uploadMedia` (complexity 13) and `updateMediaMetadata` (complexity 20, cognitive 18). Verified
these are PRE-EXISTING, not introduced by my Task 2 edit: I linted commit `e0fb57a2` (immediately
before my change) via `git show` and got the IDENTICAL three violations at the identical scores.
Neither function's own body grew a new branch from my change — I only added calls to the new/edited
helper functions (`deriveUniqueMediaSlug`, `resolveSlugForUpdate`, `capSlugCandidate`), which are not
flagged. Not fixed — out of scope (pre-existing, cross-cutting refactor, not something this dispatch
asked for).

## Fresh verification commands run for this handoff (not a re-paste of a stale snapshot)

```
# Jini
cd /Users/la/Programming/Jini/packages/cms && npx tsc --noEmit -p . && npx vitest run
# -> 0 tsc errors, 679/679 tests passing. Then: npm run build (Tovu consumes dist, not source).

# Tovu apps/website
cd /Users/la/Programming/Tovu && npx tsc -p tsconfig.json --noEmit
env -u TOVU_ADMIN_PASSWORD node --import tsx --test \
  apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts \
  apps/website/src/server/inbound/admin-http/routes/media/__tests__/update.test.ts \
  apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts \
  apps/website/src/features/media/__tests__/repo.contract.test.ts
# -> 0 tsc errors, 263/263 tests passing.
env -u TOVU_ADMIN_PASSWORD node --import tsx --test development/scripts/__tests__/backfill-media-slugs.test.ts
# -> 3/3 passing (slug cap change doesn't disturb the backfill script's own suite).

# Tovu apps/admin (from apps/admin, TOVU_ADMIN_PASSWORD unset)
cd /Users/la/Programming/Tovu/apps/admin && npx tsc --noEmit
env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/media/ src/components/__tests__/MediaPickerDialog.unit.test.tsx \
  src/components/__tests__/MediaPickerDialog.hooks.unit.test.tsx src/components/__tests__/EmbedInsertControl.unit.test.tsx \
  src/components/__tests__/agent-handle-batch3.unit.test.tsx src/features/seo/ src/lib/__tests__/api-media.unit.test.ts \
  src/lib/__tests__/media-image-extension.unit.test.tsx src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx
# -> 0 tsc errors, 382/382 tests passing.
```

## Database

Did not touch `sites/tovu-com/content.db` at all — no read, no write, no backfill script run against
it. Every DB-adjacent change in Task 2 lives entirely in Jini's `media-service.ts` (pure logic, no
schema/migration change) and needed no data migration: the new length cap only affects slugs derived
from this point forward, and every already-backfilled live row is already well under 120 characters
per the prior handoff's own audit.

## Remaining open items (not mine to close)

- Task 0's live video upload through the dev admin (never in my assignment).
- The pre-existing `uploadMedia`/`updateMediaMetadata` complexity-ceiling violations in Jini
  (confirmed pre-existing above, not something Task 2 was scoped to fix).
- No other open items from Tasks 1-3 — all three are complete, committed, and verified.
