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

1. Build the migration script, starting with `declarative/basic-declarative` (per the approved
   classification: lowest risk, reference-only, not wired into any site). Its quirks: `styles.css` at
   theme root (not under `css/`) → `css/theme.css`; `templates/` (not `pages/`) → `render/pages/`.
2. Then the rest of the approved classification in order: `storefront` → clean-convert group
   (`fuel`/`gracious-timing`/`portfolite`/`fashion-modern`, path rewrites) → `tailark-*`
   (needs-human-review, still migrate structurally, flag the doc gap) → refuse `mui-marketing`
   (detect + skip, don't touch).
3. Decide `__original-themes__`/`__marketplace__` catalog-copy handling once the real themes they
   mirror are done (see the checkpoint report's own note — this is a design question, not urgent).
4. Milestones 4 (normalizer wiring) and 5 (generated root `index.html`) remain queued behind Milestone 3.
5. Final report to team-lead must re-surface the tailark-* "checked but no record of it" finding as an
   explicit follow-up item, per Leona's instruction — do not let it get silently absorbed.
