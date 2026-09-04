# Code metrics sweep — non-complexity metrics, 2026-09-04

STATUS: in progress

Dispatched task: run `development/scripts/code-metrics.py --skip complexity,cognitive_complexity,coverage`
across four first-party app scopes, one at a time, while five refactor agents share this
machine. Complexity/cognitive-complexity are already covered by the 2026-09-04 complexity
inventory (`ADS-memory/reports/2026-09-04-complexity-inventory.md` and
`ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/`) and are not re-measured here.
Coverage is skipped because the on-disk lcov is 14+ days stale and known-corrupt.

Metrics this run actually produces (per scope): `duplication`, `type_safety`, `dead_code`,
`coupling`, `blast_radius`, `circular_dependencies`, `api_surface`, `churn`, `hotspots`
(expected UNAVAILABLE here — it needs the skipped `complexity` data), `change_coupling`.

## Machine-safety log

- Pre-start check: `node --import tsx --test` count = 0, no active test runner. Largest node
  RSS ~118MB (website dev server), nothing test-sized. Proceeded without waiting.
- (further waits/checks logged here per scope as they happen)

## Scope 1 — `apps/site-chat/src`

STATUS: done. 9/13 metrics measured (complexity, cognitive_complexity, coverage skipped as
directed; `hotspots` UNAVAILABLE because it needs the skipped `complexity` signal — expected).
Raw output: `ADS-memory/.local-artifacts/metrics/2026-09-04-code-metrics-site-chat.{md,json}`.

- **duplication** (jscpd): 1.998% duplicated lines (67/3354), 11 clone groups, all 8 largest
  hits are inside `__tests__/site-assistant-transport.test.ts` (repeated test setup) or
  `widget.css`. No production-code clone group. **Not actionable** — test-boilerplate and CSS
  duplication under 2% is normal, not a finding.
- **type_safety**: `explicit_any=0`, `non_null_assertion=1` (0 in production-only), `ts_ignore=0`,
  `ts_expect_error=0`. Clean. Not actionable.
- **dead_code** (knip, `--directory apps/site-chat` — correctly scoped, this app HAS its own
  `package.json`): `unused_file_candidates=0`, `unused_export_candidates=2`, both exported
  *types* in `src/client-directives.ts` (`ResolvedPublicTarget`, `ClientDirective`, lines 17/28).
  At ~15% measured true-positive rate, 2 candidates is noise-floor — **not actionable without
  manual verification**, and not worth spending verification time on for a 2-item result.
- **coupling / blast_radius / api_surface**: 27 modules, 49 edges (3 via barrel), fan-out max 8
  (`SiteAssistantWidget.tsx`), fan-in max 6 (external `assert/strict`, `node:test` — test
  infra, not app coupling). Nothing structurally alarming for an app this size.
- **circular_dependencies**: 0 cycles found; repo's dependency-cruiser config does declare a
  cycle rule (`repo_config_has_cycle_rule: True`). Clean.
- **churn**: 17 commits total in the 12-month window, 0 excluded as mechanical, 4 stale paths
  excluded from the ranking (pre-restructure identities git couldn't follow — expected per the
  documented trap, not a bug). Hottest file by substantive commits: `SiteAssistantWidget.tsx`
  (7 commits, 309 lines churned) — this is "hot under its current name only," a ranking of past
  activity, not a live risk signal on its own (no complexity cross-reference available since
  complexity was skipped this run).
- **change_coupling**: 0 pairs over the `min_co_changes=4` threshold. Nothing hidden. Clean.
- **No third-party/vendored paths appeared** in any table (no `node_modules/.vite/deps`-style
  fixture in this scope). No `drizzle` anywhere in site-chat, so trap #4 doesn't apply here.

**Verdict for this scope: no actionable findings.** Everything measured is either clean or below
noise floor.

## Scope 2 — `packages/sdk/src`

STATUS: done. 9/13 measured (same skip set as scope 1). Raw output:
`ADS-memory/.local-artifacts/metrics/2026-09-04-code-metrics-sdk.{md,json}`.

Package is tiny: 245 lines, 6 modules (effectively `index.ts` + one test file).

- **duplication**: 0%, 0 clones. Clean (trivially, given size).
- **type_safety**: `explicit_any=0`, `non_null_assertion=1` (0 production-only), no
  ts-ignore/expect-error. Clean.
- **dead_code** (knip, `--directory packages/sdk` — correctly scoped, has own `package.json`):
  1 unused-file candidate: `src/__tests__/unit/sdk-public-api.unit.test.ts`. **This is almost
  certainly a false positive** — knip has no model of the test runner's discovery glob, so it
  sees a file nothing `import`s and flags it, even though `node --test` runs it directly. Not
  actionable.
- **coupling/blast_radius/api_surface**: 6 modules, 5 edges, fan-out max 5 (the test file
  importing what it tests). Nothing notable at this size.
- **circular_dependencies**: 0 cycles. Clean.
- **churn**: 2 commits total in 12 months, 0 stale paths excluded. Too little history to say
  anything about hotness.
- **change_coupling**: 0 pairs over threshold (only 2 commits, expected).
- No third-party/vendored paths, no drizzle relevance.

**Verdict for this scope: no actionable findings.** Package is too small and too clean to
produce a real signal; the one knip hit is a known false-positive shape (test-runner entry
point knip can't see).

## Scope 3 — `apps/admin/src`

STATUS: done. 9/13 measured. Raw output:
`ADS-memory/.local-artifacts/metrics/2026-09-04-code-metrics-admin.{md,json}`.
This is the scope two refactor agents (refactor-admin-components, refactor-admin-lib) are
actively editing — treat all findings as a snapshot at commit `efc8b6a7`, not necessarily
still true.

- **duplication** (jscpd): 4.63% (8576/185364 lines), 844 clone groups. The 20 largest are
  almost entirely cross-file `__tests__/*.unit.test.tsx` setup/mock boilerplate (normal, not
  actionable). **One exception is real production duplication**: `features/collections/Collections.tsx:127`
  and `:283` — verified by reading both blocks — are a ~40-line near-identical JSX fieldset
  (a "create fields" form and an "edit fields" form, differing only by an `ct-field-*` vs
  `ct-edit-field-*` id prefix). Same-file, 2-site, so by the gate-logic rubric this is
  Recommended-not-Required, but it's a genuine, easy extraction (parameterize by id prefix).
  **This is the strongest concrete refactor candidate in the whole sweep.**
- **type_safety**: `explicit_any=127` but `explicit_any_production_only=0` — every `any` is
  confined to test files, none in production code. `non_null_assertion=461` total,
  `non_null_assertion_production_only=73` — real production presence, Tier B (Recommended-only
  per the skill, not Required). `ts_ignore=0`, `ts_expect_error=5`. **Net read: healthier than
  the headline `461` non-null-assertion number implies** — always cite the production-only
  figures, not the raw ones, for this app.
- **dead_code** (knip, `--directory apps/admin`): 2 unused-file candidates, 113 unused-export
  candidates (~15/~7 ≈ 16 realistic after the measured false-positive rate).
  - `dist-debug/assets/index-CqOruXzQ.js` flagged unused is **not a knip false positive — it's
    revealing a real issue**: `apps/admin/dist-debug/` is a **committed build artifact
    directory** (verified via `git ls-files apps/admin/dist-debug`, tracked, not gitignored).
    A prebuilt JS/CSS bundle sitting in git is its own (separate, minor) finding regardless of
    knip's opinion of it.
  - The other candidate, `src/features/settings/external-mcp-i18n.ts`, and the 113 unused
    exports (sample includes plugin-bundled shadcn-ui example components, which are plausibly
    reference/skill content rather than dead app code) need the standard per-candidate
    verification before acting — not treated as a to-do list.
- **coupling / blast_radius**: 1380 modules, 4551 edges. **The raw "highest fan-in" table is
  dominated by third-party/test-infra leaf nodes** — `apps/admin/node_modules/vitest/dist/index.js`
  (302), `@testing-library/react` (212), `react` (157/127 across two copies) — these are
  `doNotFollow: node_modules` leaf nodes that every test file imports, not architectural
  coupling. **Excluding those**, the real app-level fan-in signal is `@/lib/api` / `apps/admin/src/lib/api.ts`
  (285/103 combined alias+real-path counts) and `dictionary-translator.ts` (43/31) — both
  expected central hubs (API client, i18n) for an app this size, not alarming on their own.
- **circular_dependencies**: **4 real cycles found** (repo's dependency-cruiser config does
  declare a cycle rule, so these should be gated in CI once/if that gate is validated — see
  `gate-validation-status.md`, not checked as part of this metrics-only dispatch):
  1. `pages/hooks/use-theme-pages.hooks.ts <-> pages/lib/theme-page-publish-state.ts`
  2. `pages/rules.ts <-> pages/hooks/use-theme-pages.hooks.ts` (combines with #1 into a 3-file tangle across `pages/rules.ts`, `.../use-theme-pages.hooks.ts`, `.../theme-page-publish-state.ts`)
  3. `nav.ts -> panels.tsx -> components/PlaceholderTabs.tsx -> components/Placeholder.tsx -> nav.ts` (4-file cycle)
  4. `components/WidgetPickerDialog/WidgetPickerDialog.tsx <-> WidgetPickerDialog.hooks.tsx` (component/hooks-file mutual import — the same anti-pattern shape the repo's own hooks-extraction convention is meant to prevent)
  Whether any of these are pre-existing (grandfathered) vs. new against the branch's comparison
  base was **not checked here** — that comparison is a code-review-time job (Dimension:
  Architecture Adherence), not this measurement dispatch's.
- **api_surface**: 62 directories measured, `@/lib` widest (18 externally-imported modules).
  No action implied on its own.
- **churn**: 672 commits/12mo, 32 mechanical excluded, 123 stale (pre-restructure) paths
  excluded from the ranking — quoted, not re-derived. Hottest by substantive commits:
  `lib/api.ts` (66), `features/posts/PostEditor.tsx` (38), `App.tsx` (30). This is "what was
  hot," not a live hotspot ranking — no complexity cross-reference available since complexity
  was skipped this run.
- **change_coupling**: 25 pairs over `min_co_changes=4`, several at 100% confidence with *no*
  import edge — most interesting cluster is 3 `features/database/hooks/*.hooks.ts` files
  (`use-migrate-forward-section`, `use-restore-points-section`, `use-timeline-section`) that
  pairwise co-change at 100% confidence with zero static link between them, plus
  `use-recovery.hooks.ts <-> use-restore-flow.hooks.ts` (100%). This is real signal that these
  files encode a shared concern the type system doesn't see — worth a look if anyone touches
  that feature area, not urgent on its own.

## Scope 4 — `apps/website/src`

STATUS: pending

## Known-trap checklist (filled in as scopes complete)

1. `dead_code` / knip broken for `apps/website` (`--directory` needs a `package.json` that
   doesn't exist there) — TBD per scope.
2. knip true-positive rate ~15% even when it runs — treat all rows as hypotheses.
3. knip without `--directory` scans the whole repo — verify actual scope per run.
4. `drizzle*` exclusion glob (not just `drizzle`) must be in effect for duplication — TBD.
5. Vendored `node_modules` in `apps/website/src/features/theme/__tests__/fixtures/astro-bundler-probe/` — check duplication/type-safety output for third-party paths.
6. Churn/hotspot paths can be stale identities post-restructure — quote the script's own exclusion count, don't re-derive.

## Ranked actionable findings

TBD — filled in after all scopes complete.

## Metrics unavailable / untrustworthy

TBD.
