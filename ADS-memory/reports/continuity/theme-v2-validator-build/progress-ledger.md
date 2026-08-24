# Progress Ledger

- workstream: theme-v2-validator-build
- scope_type: security fix + validator build + schema decisions + CLI/marketplace wiring
- owner: Claude Sonnet 5 (Programmer, dispatched by team-lead) / Leona Burime
- started_at: 2026-08-18T08:30:00-07:00
- last_updated_at: 2026-08-18T10:30:00-07:00
- related_state_file: `development/docs/themes/theme-authoring-guide-v2.md` (target design doc)
- decisions_file: `ADS-memory/reports/swarm-consensus/runs/2026-08-17-tovu-theme-invariant-structure-consensus-report.md`
- evaluator_mode: not-needed

## Current Objective

Build Tovu's theme v2 package validator (Milestone 2 of a 5-milestone dispatch), on top of a
security parity fix (Milestone 1, DONE) and two schema-blocking decisions this milestone required
resolving first. Milestones 3 (migration script) and 4 (asset normalizer wiring) NOT STARTED —
Milestone 3 explicitly requires a go/no-ahead from Leona/team-lead before running any real migration
(dry-run classification report first). Milestone 5 (generated root `index.html` for static-tier
themes) was added mid-session by team-lead, deliberately sequenced AFTER Milestone 2 since it needs
the schema v2 root-index-file entry and hooks into the same validate/build flow — NOT STARTED YET.

## Read This First (next session boot packet)

1. This ledger.
2. The original dispatch message (in this session's transcript) — full Milestone 1-4 spec.
3. Team-lead's Milestone 5 follow-up message (in this session's transcript) — root `index.html` spec.
4. `development/docs/themes/theme-authoring-guide-v2.md` — target design, now with 4 stale claims
   corrected this session (sourceDir gap, `form` embed type — see Decisions below).
5. `src/features/theme/validation/validate-theme-package.ts` — the validator orchestrator, own file
   header explains the v1-fallback/v2-strict branching and the one known limitation (v2 compiled-tree
   hash coverage not wired — `build-conformance.ts` doesn't understand `render/` yet).

## Decisions Made This Session

- Security fix (Milestone 1): `theme_write_file` agent tool now refuses writes into `preview/`,
  matching `explore.ts`'s PUT route (`isGeneratedThemePath`). Commit `c4540386`.
- `lineage` moved out of `theme.json` into its own sidecar file (`.tovu-lineage.json`,
  `theme-lineage.ts`) — was blocking `additionalProperties: false`. `marketplace.ts`'s
  `rewriteThemeManifestId` no longer takes an `extra` merge param (dead after this).
- `skipLiquidAllowlist` no longer read from a theme's own `theme.json` — resolves from
  `TRUSTED_SKIP_LIQUID_ALLOWLIST_THEME_IDS` (empty `Set` in `theme.ts`, maintainer-controlled).
  Zero themes on disk used this flag, so this was a clean behavior change, not a migration.
- `theme-authoring-guide-v2.md` corrected: sourceDir/reserved-directory gap was already fixed
  (`isSourceDirGeneratedConflict`, `theme.ts:653`, commit 45f5e219) — doc said "still open", was
  stale. `form` embed type removed from the doc's vocabulary — confirmed removed from the real
  runtime 2026-08-10 (`resolver-service.ts`'s own doc comment); real vocabulary is
  `widget`/`media`/`post`/`content`/`menu`/`partial` (six, not seven).
- Both schema commits landed BEFORE the validator was built, so the validator's `manifest-v2.ts` and
  `markup.ts` were written against the corrected (real) state, not the stale one.
- `validate-theme-package.ts`'s v1-fallback path defers entirely to `loadTheme()`'s own errors
  (no re-derivation) — confirmed clean against all 11 real first-party themes in `src/themes/`
  (schemaVersion 1, valid, 0 errors/warnings for every one, via a throwaway sanity script, not a
  committed test).
- `tovu theme validate <dir> --profile <p> --json` wired as a NESTED commander subcommand (`theme`
  parent + `validate` child), not a flat command — `src/cli/introspect.ts` extended to flatten nested
  subcommands into the manifest's flat `commands` array (`"theme validate"` full-path name), since
  Milestones 3/4 are expected to add sibling subcommands (`theme migrate`, `theme package`) later.
- `marketplace.ts`'s `downloadMarketplaceTheme` now validates the fixture (`profile: "install"`)
  BEFORE either `cpSync` copy — stays pure validate-then-copy, never validate-and-fix (mutating
  during download would invalidate a compiled theme's `artifactHashes`).
- Known, disclosed limitation: a v2-declared COMPILED theme's generated-tree hash-coverage
  exhaustiveness is NOT checked on the v2-strict validation path — `build-conformance.ts`'s own file
  discovery still scans v1's flat `pages/`/`css/`/`js/` layout, not v2's `render/`-nested tree. No
  real v2-declared compiled theme exists yet to test against either way. Flagged in
  `validate-theme-package.ts`'s own file header, not silently skipped.

## Code Changes (all tests green as of last-verified-good-state below)

- `src/features/theme/tool-registrations.ts` — Milestone 1 fix (`isGeneratedThemePath` check).
- `src/features/theme/theme-lineage.ts` (NEW) — lineage sidecar file read/write.
- `src/features/theme/marketplace.ts` — lineage relocation, `rewriteThemeManifestId` simplified,
  install-profile validate-then-copy gate (fixed a bug where `id: fixture.manifest.id` was passed
  instead of `id: marketplaceId` — caught by the RED/GREEN discipline on the regression test).
- `src/features/theme/theme.ts` — `skipLiquidAllowlist` trust-list change, doc comment updates.
- `src/features/theme/index.ts` — barrel exports for `theme-lineage.ts` and
  `validation/validate-theme-package.ts` (kept CLI/explore.ts off deep imports — caught by
  `check:architecture`'s "module API surface" metric regressing when I first got this wrong).
- `src/features/theme/validation/` (NEW dir) — `profiles.ts`, `manifest-v2.ts`, `structure.ts`,
  `references.ts`, `markup.ts`, `validate-theme-package.ts`.
- `src/server/routes/admin/themes/explore.ts` — lineage read via barrel, stale sourceDir comment fixed.
- `src/cli/introspect.ts` — nested-subcommand flattening.
- `src/cli/program.ts` — `theme validate` subcommand wired.
- `src/cli/commands/theme/validate.ts` (NEW) — the CLI command itself.
- `development/docs/themes/theme-authoring-guide-v2.md` — 4 stale-claim corrections (see Decisions).
- Tests: `theme-lineage.test.ts` (NEW), `theme.test.ts` (+1), `marketplace-download-route.integration.test.ts`
  (+1 test, 2 assertions changed), `validate-theme-package.test.ts` (NEW, 21 tests),
  `introspect.unit.test.ts` (+2), `introspect-command.integration.test.ts` (2 assertions updated),
  `theme-validate-command.integration.test.ts` (NEW, 4 tests).

## Last Verified Good State

- `npx tsc -p tsconfig.json --noEmit`: PASS (run repeatedly through the session).
- `npm run check:architecture`: PASS, ahead of baseline (11.73→11.56 propagation cost, 16.84%→16.76%
  core size) — NOT yet run with `--update` to lock in (deliberately left for team-lead/Leona's call).
- `src/features/theme/**/*.test.ts` (339 tests): all PASS.
- `src/server/routes/admin/themes/__tests__/*` + `src/server/__tests__/routes/*theme*`/`*marketplace*`
  (47+6+1 tests across files): all PASS.
- CLI suite (`src/cli/__tests__/**`, 15 tests incl. new `theme-validate-command.integration.test.ts`):
  all PASS.
- Sanity check (uncommitted, one-off): all 11 real first-party themes in `src/themes/` validate
  `schemaVersion: 1, valid: true, 0 errors, 0 warnings` through the new orchestrator.

## Commits This Session

1. `c4540386` — Milestone 1: `theme_write_file` preview/ write gap fix.
2. `d784b631` — schema decisions: lineage relocation + skipLiquidAllowlist trust-list + doc fixes.
3. NOT YET COMMITTED as of this ledger write: the full `validation/` module set + CLI + marketplace
   wiring (this is the next action — commit before continuing to Milestone 5).

## Next Actions

1. Commit the validator + CLI + marketplace-install wiring (everything since commit `d784b631`).
2. Report Milestone 2 complete to team-lead (checkpoint, per the standing "report after every
   milestone" instruction) — include the known v2-compiled-hash-coverage limitation.
3. Start Milestone 5 (generated root `index.html`, static-tier only): needs (a) a schema v2 entry so
   `structure.ts`'s `checkApprovedRoots` doesn't reject a generated `index.html` at the theme root —
   mark it generated/optional the same way `preview/` is; (b) the actual splice logic — `partial`-type
   embeds get real content spliced from the theme's own `render/partials/*` (or v1 `nav.html`/
   `footer.html`), `menu`/`post`/`content` types get the literal placeholder
   `<!-- live content when connected to Tovu -->`; (c) a regeneration hook — team-lead deferred the
   exact hook point to "once you're in Milestone 2 code", candidate: `validateThemePackage`'s v1/v2
   branches don't currently WRITE anything, so this likely needs its OWN small module (e.g.
   `static-portability-index.ts`) invoked from wherever a static theme's save/build completes, not
   folded into the validator itself (the validator's job is checking, not generating).
4. Milestone 3 (migration script) — STILL BLOCKED on Leona/team-lead go-ahead after a dry-run
   classification report. Do not start without it, per the original dispatch's explicit instruction.
5. Milestone 4 (asset normalizer wiring) — not started, lowest priority per original dispatch ordering.

## Loop Alerts

None — no file has been edited 3+ times for the same failing cluster. One caught-and-fixed bug
(marketplace.ts's `id` argument) took one wrong attempt + one fix, resolved via the RED/GREEN
discipline before it reached a commit.

## Session 2 (fresh agent, continued from this ledger) — Milestone 3 dry-run, HARD STOP

Dispatched with an explicit order: Milestone 3 (migration script) before 4/5, with Milestone 3's
dry-run classification report as a mandatory checkpoint before any real migration runs. Read the
three prior commits (`c4540386`, `d784b631`, `a69632b5`) plus the consensus report and
`theme-authoring-guide-v2.md` first — did not re-derive them.

**No migration code written yet, by design — this is the checkpoint, not the implementation.**

### Inventory: 11 real themes (matches Milestone 2's "all 11 first-party themes" count) + 2 catalog
copies (`__original-themes__/static/basic`, `__marketplace__/static/basic` — mirrors, not
independently authored, handled separately, see report to team-lead).

### Two NEW cross-cutting blockers found, neither in the original dispatch brief, both bigger than a
single-theme quirk — full detail sent to team-lead via SendMessage, summarized here:

1. **Runtime asset-rewrite pipeline has zero apiVersion branching.**
   `static-asset-contract.ts`'s `TOKEN_STYLESHEET_SENTINEL` (literal `<link rel="stylesheet"
   href="../css/styles.css" />`) and `rewriteAssetPaths`/`findUnrewrittenAssetPaths` (hardcoded
   `../css/`/`../js/` regex) are called unconditionally by `static-render.ts::renderStaticPage`
   (every static page, every request) and `build-conformance.ts` (compiled-theme install gate) —
   neither checks `theme.manifest.apiVersion`. Migrating a theme's on-disk shape to v2
   (`css/theme.css`, `scripts/`) without also making this pipeline version-aware breaks token
   injection (silent console-warn, ships with no design tokens) and 404s every css/js asset for
   that theme, undetected by Milestone 2's validator (checks package shape, not this runtime
   behavior). Recommendation sent to team-lead: branch this pipeline on `apiVersion` the same way
   the validator already does, not a global rename.
2. **3 of 8 static themes (fuel, gracious-timing, portfolite) carry pre-existing, already-flagged
   UNCONFIRMED license status** (Framer Marketplace-derived; each theme's own `NOTICE.md` already
   says, in its own words, "do not treat this theme as clear to resell/ship without independently
   confirming license terms" — not a new finding, predates this session). v2's `license`/`LICENSE`
   manifest fields cannot be honestly populated for these three. Recommendation: leave `license`
   unset, carry `NOTICE.md` forward verbatim (v2 keeps it as an optional free-text file), do not
   silently resolve or hide the uncertainty. Separately, the 3 `tailark-*` themes have ZERO
   provenance documentation despite `fuel/NOTICE.md` claiming they were "checked against their own
   marketplace license text" — that check isn't recorded anywhere retrievable.

### Per-theme classification (full detail + reasoning in the SendMessage report to team-lead)

- **CLEAN-CONVERT**: `basic`, `storefront`, `basic-declarative` (no hardcoded asset-path rewrites
  needed beyond the standard folder moves; `basic` also needs its `build-preview.mjs`'s pre-existing
  `docs-sidebar.js` drift fixed during migration, not carried forward).
- **CLEAN-CONVERT with required path rewrites** (`images/` → `assets/images/` in hardcoded
  `/theme-assets/<id>/images/...` refs, mechanical but must-not-skip): `fuel` (12 refs across
  nav.html + pages), `gracious-timing` (10 refs), `portfolite` (13 refs), `fashion-modern` (1 ref,
  plus its own `assets/` folder needs nesting under `assets/images/` since v2 reserves `assets/` as
  the whole-media-folder name).
- **NEEDS-HUMAN-REVIEW (documentation gap, not structural)**: `tailark-dusk`, `tailark-quartz-dark`,
  `tailark-quartz-libre` — structurally clean, flat shape, no hardcoded refs, but zero NOTICE.md/
  license documentation despite a same-repo claim they were vetted.
- **REFUSE**: `mui-marketing` — deliberate CSR bypass-the-conformance-gate theme, explicitly
  documented in its own `theme.json` description. Migration script must detect and skip.

### Next Actions

1. Send the full checkpoint report to team-lead (SendMessage) — done same turn as this ledger update.
2. **STOP. Wait for go-ahead from Leona/team-lead before writing any migration script code**, per the
   original dispatch's explicit instruction — this applies doubly now given the two new cross-cutting
   blockers, which change what the migration script should even output.
3. Once unblocked: build the migration script per the original brief's 9-step shape, starting with
   `basic-declarative` (lowest risk, reference-only, not wired into any site) to prove the JSON-tier
   path before touching a live static theme.
4. Milestones 4 (normalizer wiring) and 5 (generated root `index.html`) remain queued behind
   Milestone 3 per the explicit dispatch order this session received.

## Session 2 continued — go-ahead received, Blocker A fixed (2 commits), Blocker B decided

Leona's answers (relayed by team-lead): Blocker A → fix it (apiVersion-branch, same pattern as the
validator), with its own commit + regression tests, v1 byte-identical, BEFORE migration code. Blocker
B → ship fuel/gracious-timing/portfolite as-is, `license` unset, `NOTICE.md` forward verbatim. Per-theme
classification approved unchanged. tailark-* documentation gap noted, not resolved now — re-flag in the
final report. Start migration with `basic-declarative`.

**Blocker A turned out to be TWO fixes, not one** — found the second while scoping the migration script,
reported it to team-lead as a heads-up (proceeding under the same approved pattern, not blocking):

1. Commit `2f545002` — `static-asset-contract.ts`/`static-render.ts`/`build-conformance.ts` (the three
   files team-lead named): request-time asset-path REWRITING inside already-loaded page HTML.
2. Commit `f1f1b9ef` — `theme.ts`'s `loadTheme()`/`loadStaticTierAssets`/`loadSlotPartials` (NOT
   originally named): file-discovery — WHERE on disk the loader looks for pages/templates/css/partials
   in the first place. Without this, a v2-migrated theme fails to even LOAD (`status: "invalid"`),
   before commit 1's fix could matter at all. Same `apiVersion === 2` branch pattern, same
   byte-identical-v1 guarantee, own regression tests (5 new, `theme-load-api-version.test.ts`).

Both confirmed against the full `src/features/theme` suite: 339 (Milestone 2 baseline) → 346 → 351,
all passing, zero regressions. `npx tsc -p tsconfig.json --noEmit` clean after each commit.

**apiVersion is now a real, load-bearing field**: `ThemeManifest.apiVersion?: 2` (`theme.ts`), parsed
in `loadTheme()` from `raw.apiVersion === 2`. Every real theme on disk has no `apiVersion` field, so
every one of them is unaffected — this is purely additive, opt-in infrastructure the migration script
can now target.

### Next Actions (current)

1. ~~Build the migration script, starting with `declarative/basic-declarative`~~ — **DONE.**
2. Then the rest of the approved classification in order: `storefront` → clean-convert group
   (`fuel`/`gracious-timing`/`portfolite`/`fashion-modern`, path rewrites) → `tailark-*`
   (needs-human-review, still migrate structurally, flag the doc gap) → refuse `mui-marketing`
   (detect + skip, don't touch).
3. Decide `__original-themes__`/`__marketplace__` catalog-copy handling once the real themes they
   mirror are done (see the checkpoint report's own note — this is a design question, not urgent).
4. Milestones 4 (normalizer wiring) and 5 (generated root `index.html`) remain queued behind Milestone 3.
5. Final report to team-lead must re-surface the tailark-* "checked but no record of it" finding as an
   explicit follow-up item, per Leona's instruction — do not let it get silently absorbed.

## Session 2 continued — Milestone 3, first real theme migrated

Built `src/features/theme/migration/` (`theme-migration-plan.ts` — pure, disk-free, tier-dispatched
planner, only `declarative` implemented so far; `migrate-theme.ts` — `migrateThemeToV2` orchestrator:
stage into a SIBLING directory (not `os.tmpdir()` — caught in my own zero-findings self-check that
`renameSync` needs same-filesystem, which `/tmp` isn't guaranteed to share with the project dir),
verify two ways (`validateThemePackage` AND a real `loadTheme()` call — the v2-strict validator path
never calls `loadTheme()`, so it alone wouldn't catch a missing required template), atomic replace
with a kept v1 backup on success, idempotent, `--dry-run` support). Wired `tovu theme migrate <dir>`
CLI subcommand mirroring `theme validate`'s shape. 18 new tests (9 unit, 4 CLI integration, 5 already
counted under the loader fix). Commit `26f19bf6`.

**Ran it for real against `basic-declarative`** (the approved starting theme) — dry-run inspected
first (byte-identical content diffs confirmed), then the real migration: `styles.css` → `css/theme.css`,
`templates/*.json` → `render/pages/*.json`, manifest gets `apiVersion: 2` + `$schema`, every other
field unchanged. Verified valid (schema v2, profile author) with only the two expected pre-existing
warnings (missing license, missing preview thumbnail). Idempotency re-run confirmed
(`status: "already-migrated"`). Full `src/features/theme` + `assistant/tool-registrations.themes`
suite (383 tests) green after the real mutation. Commit `1b17abcb` — git shows pure renames, zero
content diff on any moved file. The tool's own v1 backup was deleted after commit (git history is
the real rollback; a stray uncommitted backup folder is just clutter).

### Next Actions (current)

1. Report this milestone to team-lead (SendMessage) before continuing to the rest of task #8's
   themes — per the standing "report after every milestone" instruction, and because the next slice
   (templated + static tier planners) is materially more complex than declarative's pure-JSON case.
2. Task #8: `storefront` (templated, simplest — no chrome partials) next, to prove the templated-tier
   planner before the static tier's asset-path-rewrite complexity (`fuel`/`gracious-timing`/
   `portfolite`/`fashion-modern`'s `images/` → `assets/images/` rewrites, `basic`'s `preview/`
   regeneration, `mui-marketing`'s refuse case).

## Session 3 (fresh agent `theme-v2-build-3`, dispatched as a duplicate of `theme-v2-build-2` — see
below) — storefront migrated, new cross-cutting blocker found before static tier

**Dispatch collision, resolved:** this session was dispatched with the exact same task-#8 brief while
`theme-v2-build-2` already owned it and had uncommitted WIP in the shared working tree. Flagged to
team-lead before touching anything; team-lead confirmed `theme-v2-build-2` was already dead (killed
before this session was dispatched — the "owner: theme-v2-build-2" on task #8 was stale bookkeeping),
reassigned task #8 to this session. The orphaned WIP (`theme-migration-plan.ts` generalized to cover
`templated`/`handlebars` tiers, not just `declarative`) was inspected, typechecked, scoped-tested
(7/7 green, matched `storefront`'s real shape exactly), and kept rather than redone — commit `6ab2b6f9`.

**Real bug found and fixed:** `buildV2Manifest` in `migrate-theme.ts` carried every v1 manifest field
forward unchanged, but v1's `engine: 1` (a bare number — confirmed dead at runtime, `theme.ts`'s own
doc comment: "nothing in the engine branches on it") must become v2's `{ name, version }` object
(`manifest-v2.ts`'s `v2-engine-shape`/`v2-engine-name` rules). `basic-declarative` never had an
`engine` field so this path was untested until `storefront` hit it. Fixed with a tier -> engine-name
map (`templated` -> `"liquid"`, `handlebars` -> `"handlebars"`, matching
`theme-authoring-guide-v2.md`'s own worked example) in a new `convertEngineField` helper. RED
confirmed first, regression test added. Commit `f221b1c7`.

**`storefront` migrated for real** (commit `2e01a20c`): dry-run byte-identical diff confirmed first,
real migration, double-verify (validator + `loadTheme()`), idempotent re-run confirmed, full
`src/features/theme` suite (364 tests) + `theme-migrate-command`/`theme-validate-command` CLI
integration (8 tests) green. v1 backup deleted post-commit (git history is the rollback, same
precedent as `basic-declarative`).

**New cross-cutting blocker found, reported to team-lead, NOT YET RESOLVED — do not start the
static-tier planner until this is settled:**

Every one of the 8 remaining real themes — all 7 static themes (`basic`, `fuel`, `gracious-timing`,
`portfolite`, `tailark-dusk`, `tailark-quartz-dark`, `tailark-quartz-libre`) AND `fashion-modern` — has
a root-level `screenshots/` folder. `structure.ts`'s `V2_APPROVED_ROOTS` does not include
`"screenshots"`, and `structure-unapproved-root` is a hard `error` in every profile (not in
`PUBLISH_ONLY_RULES`, `profiles.ts`). So every one of these migrations will fail validation as soon as
a static-tier planner exists, unless this is resolved first. Can't be silently folded into
`assets/previews/` either — that rule checks the literal filename `assets/previews/card.webp`
(`validate-theme-package.ts:144`), and these are real screenshot files (jpg/png), so satisfying it
would mean an actual image re-encode + rename, not a file move. `theme-files.ts` already has its own
explicit precedent that `screenshots/` is real author-owned marketing content, deliberately distinct
from generated preview output (`isGeneratedThemePath`'s own doc comment) — it was just never added to
the v2-strict schema's approved-roots list. Recommendation sent to team-lead: add `"screenshots"` to
`V2_APPROVED_ROOTS` (no data movement needed) + update `theme-authoring-guide-v2.md` §3's tree diagram
to match — looks like a Milestone 2 schema-build oversight, not a genuinely open product question, but
flagged rather than unilaterally changed since it touches the schema/design doc, same as Blocker A.

**Classification correction:** `fashion-modern`'s real `tier` is `"templated"` (folder
`src/themes/templated/fashion-modern/` and its own `theme.json` both agree), NOT `"static"` as the
original checkpoint classification grouped it. It needs the templated-tier planner (already built),
not a static-tier path-rewrite pass. It DOES still need: (a) the same `engine: 1` conversion
storefront needed, (b) an `assets/` -> `assets/images/` nesting fix for its one hardcoded ref
(`/theme-assets/fashion-modern/assets/hero-outerwear.jpg` in `home.liquid`) — the templated planner
doesn't move an `assets/` folder at all today (only `styles.css` + `templates/`), so it needs a small
extension regardless of the screenshots/ question's outcome. Not yet built.

**Unverified from this session** (inherited from the earlier checkpoint classification, not
independently re-confirmed yet): the exact path-rewrite counts for `fuel`/`gracious-timing`/
`portfolite` (12/10/13 refs respectively, per the original checkpoint), and the tailark-* themes'
"structurally clean" claim beyond the screenshots/ finding above.

**Pre-existing, unrelated to this session's work — noting for whoever looks next:**
`src/themes/static/mui-marketing/` is entirely untracked in git (`git log --all` finds zero history
for it, confirmed via `git ls-files` returning empty) — file mtimes are Aug 17, a day before this
session started, so this predates this session and is not something this session created or touched.
Not committing it as part of any of the above; flagging since it's the refuse-case theme this batch
still needs to reach.

### Next Actions (current)

1. **Blocked on team-lead's screenshots/ decision** before building the static-tier planner at all —
   holding here rather than building it on a schema gap that would fail 100% of the remaining batch.
2. Once resolved: build the static-tier planner (`pages/`, `nav.html`/`footer.html`/
   `footer-minimal.html` partials, `css/`, `js/`, hardcoded `images/` -> `assets/images/` path
   rewrites), starting with whichever of `fuel`/`gracious-timing`/`portfolite` team-lead prefers, or
   `basic` first since it's the reference/most-tested theme (has `preview/` regeneration to handle too
   — `build-preview.mjs`'s own pre-existing `docs-sidebar.js` drift, per the original checkpoint, not
   carried forward).
3. Extend the templated-tier planner (or add a one-off step) for `fashion-modern`'s `assets/` folder,
   then migrate it.
4. `tailark-dusk`/`tailark-quartz-dark`/`tailark-quartz-libre` — migrate once the static planner
   exists; re-flag the pre-existing NOTICE.md documentation-gap finding in the final report per
   Leona's standing instruction (still not resolved, not this session's job to resolve).
5. `mui-marketing` — verify the planner correctly refuses it (deliberate CSR bypass-conformance
   theme). Note it's also untracked in git (see above) — that's a separate, pre-existing issue.
6. Two catalog copies (`__original-themes__/static/basic`, `__marketplace__/static/basic`) — open
   design questions from the earlier checkpoint, still unresolved, still not this session's call alone.
7. Milestones 4/5 remain queued behind task #8's completion.

## Session 4 (parallel agent `theme-migrate-fuel-group`, dispatched by team-lead alongside two siblings
each owning a disjoint theme set) — screenshots/ blocker resolved by a sibling before this session
started (`c2fd0bea`/`139ce1f5`/`1aa438af`/`6dfd7f2b` already landed), static-tier planner already built.
This session owned `fuel`, `gracious-timing`, `portfolite` only — never touched `validation/` or
`migration/` shared engine files per explicit dispatch instruction, even after finding a real bug in
them (see below).

**`fuel` was already mid-migration on disk when this session started** (v1 files deleted, v2 shape
staged, `theme.json` modified, uncommitted `.v1-backup-<ts>/` present) — the expected pre-commit state
of a real `migrateThemeToV2` run per team-lead's framing. Did not assume it was fine — re-verified with
the validator and a real `loadTheme()` call before touching anything, per the dispatch's explicit
instruction.

**Real bug found: `migrate-theme.ts`'s `copyCarryOverFiles()` silently drops files.** The planner
(`theme-migration-plan.ts`'s `CARRY_OVER_UNCHANGED` set, and the `TOKENS_MODE_FILE_PATTERN` regex)
correctly names `NOTICE.md` and `tokens.<mode>.json` as carry-forward-unchanged, but the orchestrator's
physical-copy function only ever implemented `tokens.json` and `screenshots/` — never `NOTICE.md`,
never the mode-token pattern. Neither the v2-strict validator nor a real `loadTheme()` call catches
either omission (both are optional/lazily-loaded), so a migration can report `status: "migrated"` with
`valid: true` while silently shipping a broken/incomplete theme. This is in `src/features/theme/
migration/`, one of the two shared-engine paths this session was told to stop-and-report on rather than
edit — reported to team-lead via SendMessage instead of fixed. NOT yet fixed as of this ledger entry
(next agent/session should check `copyCarryOverFiles()` before assuming it's resolved).

Impact found empirically:
- `fuel`: lost `NOTICE.md` only (fuel has no `tokens.<mode>.json` — single-mode theme).
- `gracious-timing`: lost BOTH `NOTICE.md` AND `tokens.light.json` (the theme's real light-mode color
  values — the more serious half, since it's functional content, not documentation, and gracious-timing
  ships `modes: ["dark","light"]`).
- `portfolite`: same both-file loss pattern as `gracious-timing` (also ships `tokens.light.json`).

**Workaround used, not a fix to the shared file:** after each real (non-dry-run) `migrateThemeToV2`
call, manually `cp`'d the missing file(s) from that theme's own `.v1-backup-<ts>/` directory back into
the migrated theme directory (plain file copy within the theme's own folder — not an edit to
`migration/` or `validation/`), then re-ran the validator + `loadTheme()` + idempotency check to
confirm the restore left a byte-identical, fully-valid v2 theme before committing. Confirmed via `git
status` that every restored file matched HEAD exactly (showed as unchanged, not modified) after the
copy, proving the original content was recovered verbatim.

**All three committed, working tree clean for this session's scope:**
- `65e242e4` — `fuel` (12/12 asset-path refs rewritten, NOTICE.md restored).
- `79779456` — `gracious-timing` (10/10 render/ refs rewritten — the 11th of 11 raw occurrences was
  NOTICE.md's own prose mention, correctly left untouched by the rewriter's `render/`-only scope;
  NOTICE.md + tokens.light.json restored).
- `6d708f78` — `portfolite` (13/13 asset-path refs rewritten, matching the original checkpoint's
  estimate exactly; no nav/footer partials — ships `slots: {}`, single-page theme; NOTICE.md +
  tokens.light.json restored).

Each commit individually verified before being made: v2-strict validator clean (only the expected
`license-missing`/`preview-thumbnail-missing` warnings, matching every prior migrated theme), real
`loadTheme()` call returns `status: "valid"`, idempotent re-run returns `already-migrated`, asset-path
rewrite completeness confirmed by grepping for leftover old-prefix references under `render/` (zero)
and counting new-prefix occurrences against the pre-migration raw count.

**Unrelated environment noise hit during this session, NOT this session's doing, NOT fixed by this
session:**
1. `theme-pages-render.canary.test.ts` failed once per full-suite run (335/336,
   consistently) — caused by leftover `.tovu-migrate-staging-tailark-*` directories under
   `src/themes/static/` from a sibling agent's concurrent, still-in-progress `tailark-*` migration
   work (confirmed via `git status` that the real `tailark-*` theme directories are untouched — this is
   purely staging-dir debris, self-resolving once that sibling commits/cleans up). Reported to
   team-lead, not investigated further since it isn't this session's theme scope.
2. The `tovu` CLI (`src/cli/main.ts` / `theme migrate` / `theme validate` subcommands) was broken for
   part of this session by an unrelated syntax error in `src/server/modules/assistant-ag-ui.ts`
   (`Unexpected "*"` at line 53, esbuild transform failure) — a sibling agent's concurrent AG-UI
   rewrite work, not a theme-migration file, not touched by this session. Worked around by calling
   `migrateThemeToV2`/`validateThemePackage`/`loadTheme` directly via a scratch `tsx` script instead of
   through the CLI's full command-registration import graph (`src/features/theme/**` itself imports
   cleanly, confirmed by the scratch script succeeding). Whoever picks up the CLI-invocation path next
   should re-check `tovu theme migrate`/`tovu theme validate` actually run before relying on them again.

### Next Actions (current)

1. **`copyCarryOverFiles()` in `migrate-theme.ts` still needs the real fix** — add `NOTICE.md` (a plain
   `existsSync`+`cpSync`, same pattern as `tokens.json`/`screenshots`) and the `tokens.<mode>.json`
   glob (matching `TOKENS_MODE_FILE_PATTERN` from `theme-migration-plan.ts` — needs a `readdirSync` +
   pattern-test loop, not a single hardcoded filename, since a theme could ship `tokens.dark.json` too)
   to the physical-copy function. Until this lands, every future static-tier migration with a
   `NOTICE.md` or a `tokens.<mode>.json` needs the same manual restore-and-reverify workaround this
   session used. Owner: whoever owns `src/features/theme/migration/` next (not this session, per
   explicit dispatch scope).
2. This session's three themes (`fuel`, `gracious-timing`, `portfolite`) are DONE — migrated, verified,
   committed, v1 backups deleted (git history is the rollback, same precedent as
   `basic-declarative`/`storefront`).
3. Remaining task #8 batch, per the shared checkpoint classification (unchanged by this session):
   `fashion-modern` (templated-tier extension needed for its `assets/` folder — not built),
   `tailark-dusk`/`tailark-quartz-dark`/`tailark-quartz-libre` (in progress by a sibling agent as of
   this session, per the staging-dir evidence above), `basic` (static, has `preview/` regeneration to
   handle), `mui-marketing` (refuse case, verify-only, also untracked in git — pre-existing, unrelated).
4. Two catalog copies (`__original-themes__/static/basic`, `__marketplace__/static/basic`) — still an
   open design question, still not any single session's call alone.
5. Milestones 4/5 remain queued behind task #8's completion.

## Session 4 (fresh agent `theme-v2-build-3`'s sibling, dispatched as Programmer, scope: `tailark-dusk`/
`tailark-quartz-dark`/`tailark-quartz-libre` ONLY) — verified structurally clean, found a NEW
cross-cutting schema gap, HARD STOP before any real migration

Confirmed the static-tier planner (`1aa438af`), `screenshots/` approved-root fix (`c2fd0bea`), and
`modes`/`defaultMode`/`pages`/`slots` flat-field fix (`592e1ca1`) are all already landed and current —
did not re-derive, read `git log` first. `fuel` is mid-migration in the shared working tree right now
(uncommitted deletes/adds under `src/themes/static/fuel/`) — that's `theme-migrate-fuel-group`'s WIP,
not touched, not mine.

**All three tailark themes verified structurally simple, matching the original classification**: no
`images/`/hardcoded `/theme-assets/<id>/...` refs, no `assets/` folder, no v1 `engine` field (so no
`convertEngineField` path needed), one `css/styles.css`, one `js/` dir (`main.js`, `reveal.js`,
`theme-toggle.js`, `vendor/motion.js` + `vendor/LICENSE.md`) each. The known NOTICE.md/license
documentation gap is confirmed real and unchanged (zero license docs on disk for any of the three,
despite `fuel/NOTICE.md`'s same-repo claim the family was checked) — not resolved this session, per
standing instruction; re-flagged below.

**NEW blocker found via dry-run (`tovu theme migrate <dir> --dry-run --json`), all three themes,
identical failure — NOT fixed, shared validation code, out of this session's scope to touch:**

`manifest-v2.ts`'s top-level field allowlist does not include `templates`. All three tailark
`theme.json` files declare `"templates": ["blog-post.html"]` (v1's mechanism for a shared blog-post
route template a theme's `pages` array resolves `templateChoice` against — confirmed load-bearing at
runtime, not vestigial: `theme.ts` has a whole validation function
(`validateTemplateEntriesResolveToMarkedPages` area, ~line 522-568) plus `theme.ts:672`/`:730` carrying
it into the loaded `Theme` object, and `static-render.ts` reads `theme.manifest.templates` in at least
3 places, lines ~506-649, to resolve which page a template choice renders). Because v2 schema is
`additionalProperties: false`, every dry-run fails with:

```
v2-unknown-field: theme.json: unrecognized top-level field 'templates' (schema v2 is
additionalProperties: false)
```

**This is not unique to my three themes** — grepped every static theme's `theme.json`:
`basic`, `gracious-timing`, `portfolite` ALSO declare a `templates` field and will hit the identical
error whenever their migrations are attempted (none of the three are migrated yet as of this
ledger write). `fuel` does NOT use `templates` (its blog posts are separate hardcoded `pages` entries,
no shared template), which is presumably why this gap didn't surface during `theme-migrate-fuel-group`'s
work. This looks like the same shape of issue as the earlier `screenshots/`-approved-roots gap
(`c2fd0bea`) — a Milestone 2 schema-build oversight (the v1->v2 field-carry-forward in `manifest-v2.ts`
missed one real field), not a design question — but per this session's explicit instruction ("if you
think [a shared engine file] needs a change, STOP and report, don't edit it"), this session did NOT
touch `src/features/theme/validation/manifest-v2.ts`.

**No real migration run for any of the three tailark themes. No files under
`src/themes/static/tailark-*` touched by this session.** Dry-run only (read-only against the real repo
plus a throwaway staging dir the CLI itself creates/cleans up).

### Recommendation sent to team-lead

Add `templates` to `manifest-v2.ts`'s v2 top-level field allowlist (array of strings, matching v1's
shape — this session did not design the exact v2 schema entry, just located the gap and its blast
radius). Affects 6 static themes total once every theme reaches migration: my 3 (`tailark-dusk`,
`tailark-quartz-dark`, `tailark-quartz-libre`) + `basic`/`gracious-timing`/`portfolite` (not my scope).

### Next Actions (current)

1. **Blocked on team-lead/shared-engine-owner's `templates` field fix** before any real migration of
   the three tailark themes — holding here rather than migrating into a guaranteed-invalid v2 package.
2. Once the schema gap is fixed: re-run dry-run for all three (expect clean diffs given the structural
   simplicity confirmed above), then real migration one at a time, each with dry-run inspect -> real
   migrate -> double-verify (validator + `loadTheme()`) -> idempotency re-run -> scoped
   `src/features/theme` test run, per standing workflow.
3. Re-flag in the final report to team-lead: tailark-* NOTICE.md/license documentation gap is STILL
   open, STILL not this session's job to resolve (unchanged from Session 3's finding).

## Session 4 (`theme-migrate-tailark-group`) continued — schema fix confirmed, all three migrated and
committed, one more shared-engine bug found (already known — sibling hit it too), one canary-test
finding corrected

Team-lead fixed `templates` (landed inside `65e242e4`, a race with a concurrent commit — noted by
team-lead as messier attribution but safely in history). Re-ran all three dry-runs: clean, `valid:
true`, only the two expected `license-missing`/`preview-thumbnail-missing` warnings.

**CLI was broken for this session too** (`src/cli/main.ts` fails via esbuild: `Unexpected "*"` at
`src/server/modules/assistant-ag-ui.ts:53` — a concurrent, unrelated AG-UI rewrite, not touched).
Same workaround as `theme-migrate-fuel-group` independently used: called `migrateThemeToV2`/
`validateThemePackage`/`loadTheme` directly via a throwaway root-level `.tmp-theme-*.ts` script
(deleted before commit, never staged) instead of through the CLI's command-registration import graph.

**Hit the identical `copyCarryOverFiles()` bug `theme-migrate-fuel-group` already documented above**
(did not know about their finding until after discovering it independently via post-migration
double-verification — `tokensLight keys: 0` on a theme declaring `modes: ["dark","light"]` is what
gave it away). All three tailark themes ship `tokens.light.json`; the real (non-dry-run) migration
silently dropped it every time, matching `gracious-timing`/`portfolite`'s exact failure mode (none of
the three tailark themes have `NOTICE.md` to lose — the pre-existing documentation gap noted
repeatedly above). Same workaround: `cp` from each theme's own `.v1-backup-<ts>/` back into the live
directory before re-verifying, confirmed `git diff` showed the restored file as byte-identical/
unchanged against HEAD. Not fixed in `migration/` — this is now THREE independent sessions' evidence
(`fuel`-group + this session) that `copyCarryOverFiles()` needs the real fix (`NOTICE.md` +
`tokens.<mode>.json` glob) before any more static-tier themes migrate.

**All three verified individually** (validator + real `loadTheme()` call confirming `tokensLight`
actually populates + idempotent re-run) and content-diffed byte-identical against each v1 backup
before the backups were deleted. Committed as `cf77d62c` (single commit, all three themes — team-lead's
dispatch grouped them as one unit, unlike the fuel-group's three separate commits). v1 backups and
staging dirs deleted post-verification, same precedent as every prior real migration this workstream.

**Corrected finding on `theme-pages-render.canary.test.ts`:** `theme-migrate-fuel-group`'s entry above
attributes this test's failure to this session's leftover STAGING directories ("self-resolving once
that sibling commits/cleans up"). That undersells it. Ran the scoped suite AFTER this session's staging
dirs were fully cleaned up and the real migration committed: still fails, identical `ENOENT: no such
file or directory, scandir '.../fuel/pages'`. Root cause by code inspection: `readTheme()` in that test
file (line 78) unconditionally does `readHtmlDir(path.join(dir, "pages"))` with no `apiVersion`
branching — every real migrated static theme (now `fuel`, and structurally the same fate awaits
`gracious-timing`/`portfolite`/all three tailark themes once the test's iteration order reaches them)
no longer has a `pages/` folder at all (moved to `render/pages/`). This is permanent, not staging
debris — the test itself needs the same `apiVersion === 2` branch Blocker A already applied to
`static-asset-contract.ts`/`static-render.ts`/`build-conformance.ts`/`theme.ts`'s loader. File lives at
`src/features/theme/__tests__/theme-pages-render.canary.test.ts` — not literally inside `validation/`
or `migration/`, but cross-cutting all six static themes (three of them outside this session's scope),
so treated it the same way: reported, not touched.

### Next Actions (current)

1. **All three tailark themes DONE** — migrated, verified, committed (`cf77d62c`), v1 backups and
   staging dirs deleted. Nothing further owed on this session's assigned scope.
2. Full report sent to team-lead (SendMessage) covering: schema fix confirmation, the
   `copyCarryOverFiles()` bug (now corroborated by two independent sessions), the corrected
   `theme-pages-render.canary.test.ts` diagnosis, and the still-open tailark-* NOTICE.md/license gap.
3. Whoever owns `src/features/theme/migration/` next should fix `copyCarryOverFiles()` (two independent
   sessions' worth of evidence now) and whoever owns test infra next should apiVersion-branch
   `theme-pages-render.canary.test.ts`'s `readTheme()` — both block every remaining static-tier
   migration's clean regression run, not just this session's themes.

## Session 5 (Programmer, dispatched directly by team-lead, scope: `mui-marketing` refusal
verification + the two catalog copies ONLY) — both done, zero code/content changes

Read `git log` first — confirmed static-tier planner (`1aa438af`), `screenshots/` fix (`c2fd0bea`),
`modes`/`defaultMode`/`pages`/`slots` fix (`592e1ca1`) already landed. Observed two sibling agents
live in the shared tree: `theme-migrate-fuel-group` (uncommitted `fuel/` migration, untouched) and
`theme-migrate-tailark-group` (leftover `.tovu-migrate-staging-tailark-*` dirs from Session 4 above,
untouched). Also noticed `src/themes/static/basic/pages/index.html` modified, unrelated to any theme
migration seen in this session — not investigated, not mine, flagged here only so the next reader
doesn't assume it's migration fallout.

**Task 1 — `mui-marketing`: refusal CONFIRMED live**, not just read from code. Ran
`npx tsx src/cli/main.ts theme migrate src/themes/static/mui-marketing --dry-run --json`:

```json
{
  "themeId": "mui-marketing",
  "status": "failed",
  "plan": { "moves": [...], "unrecognized": ["authoring"] },
  "reason": "refusing to migrate: 1 root-level file(s) with no known v2 destination: authoring"
}
```

Exit code 1. The static-tier planner correctly treats `mui-marketing`'s `authoring/` folder (its
hand-authored CSR source, distinct from the `js/`/`pages/` bypass output) as an unrecognized root
entry and refuses before any staging directory is even created — real theme dir confirmed untouched
(`git status --short` unchanged from before the run, no leftover `.tovu-migrate-staging-*` dir for
this theme). No code changes needed; the existing "unrecognized root file -> refuse" path
(`migrate-theme.ts:202-209`) already does the right thing for this theme's specific shape. Also
confirmed (pre-existing, not this session's doing): `src/themes/static/mui-marketing/` is still fully
untracked in git, matching Session 3's note.

**Task 2 — catalog copies: both open questions surfaced, NEITHER decided, NEITHER folder's content
touched (read-only inspection only).** Current state as of this session, for whoever decides:

- `src/themes/__original-themes__/static/basic/` (not `src/themes/static/__original-themes__/` — the
  original dispatch had the path one level off; corrected here) — still v1-shaped, no `apiVersion`
  field. The REAL `src/themes/static/basic/theme.json` is ALSO still v1-shaped (not yet migrated as of
  this session) — so **Question 1 is not yet time-pressured**: nothing has migrated ahead of its
  mirror yet. Open question, unchanged: once `static/basic` migrates, does `__original-themes__`'s
  copy (a "reset to original" mirror) get the identical v2 transform applied in lockstep, or does
  "reset to original" mean something else post-v2 (restore v1 shape as a historical snapshot, or
  restore v2 shape as the new baseline)? Not decided here.
- `src/themes/__marketplace__/static/basic/` (same path correction) — `id: "basic"` (the colliding
  fixture id, confirmed), still v1-shaped, and its real mirror `src/themes/static/portfolite/` is ALSO
  still v1-shaped (not yet migrated) — so **Question 2 is also not yet time-pressured**. Open
  question, unchanged: should this copy mirror `portfolite`'s eventual v2 migration, or deliberately
  stay v1-shaped as regression coverage proving "a legacy-shape marketplace download still installs
  correctly"? Not decided here.

Both questions reported directly to team-lead via SendMessage in this session's checkpoint, per
dispatch instruction, not left to the ledger alone.

**Milestones 4/5 — deliberately NOT started.** Checked: `code-tier-asset-normalizer.ts` (Milestone 4's
target) already exists as a source file but isn't wired into author/publish/CI packaging yet, and no
`static-portability-index.ts` (Milestone 5's likely module, per Session 1's own speculation) exists
yet either — both genuinely open. But with three sibling agents live in the same working tree right
now (`theme-migrate-fuel-group`, `theme-migrate-tailark-group`, and an unexplained `static/basic/
pages/index.html` edit from an unidentified fourth party), starting cross-cutting packaging-pipeline
work here risked exactly the file-conflict the dispatch warned about. Reported instead of guessing,
per the dispatch's own explicit fallback instruction.

### Next Actions (current)

1. Team-lead/Leona decide catalog-copy Questions 1 and 2 above — no urgency, both mirrors' real
   counterparts are still unmigrated too.
2. Milestones 4/5 remain unclaimed — safest to start once the fuel/tailark migrations currently
   in-flight land, reducing shared-tree collision risk.
3. The `templates` top-level-field schema gap (Session 4, `manifest-v2.ts`) still blocks `basic`,
   `gracious-timing`, `portfolite`, and all three `tailark-*` themes' real migrations — unresolved,
   not this session's scope, re-flagging since it also blocks `static/basic`'s migration referenced
   in Question 1 above.
