# Code metrics sweep — non-complexity metrics, 2026-09-04

STATUS: complete

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

STATUS: done. 8/13 measured (one fewer than other scopes — `dead_code` failed). Raw output:
`ADS-memory/.local-artifacts/metrics/2026-09-04-code-metrics-website.{md,json}`.

- **dead_code: UNAVAILABLE, exactly per documented trap #1.** `npx knip --directory apps/website`
  errored `Unable to find package.json` — `apps/website/` is not an npm-workspace member.
  Reported as UNAVAILABLE, not as "0 dead code."
- **Verified vendored-fixture trap (#5) did NOT fire**: grepped the full duplication JSON for
  `astro-bundler-probe`/`node_modules/.vite/deps` — zero hits. The `**/.vite/**` ignore glob held.
- **Verified drizzle exclusion (#4) held**: `apps/website/src/platform/db/drizzle/` and
  `.../drizzle-database-journal/` both exist on disk; zero clone hits reference either directory
  in the duplication JSON. The `drizzle*` wildcard is doing its job.
- **duplication** (jscpd): 9.13% (32696/357988 lines), 3060 clones — highest of the four scopes.
  **The single largest clone in the entire sweep (100 lines, `features/seo/types.ts:25` vs.
  `server/inbound/public-http/http/site/page-head.ts:2`) is a documented, deliberate structural
  duplicate, not a defect** — verified by reading both files: `seo/types.ts`'s own header cites
  ADR-PIPE-008 Decision §2 by name, explains it exists specifically to avoid a `backEdgesIntoServer`
  graph edge, and explicitly instructs "Do not 'fix' this duplicate by turning it back into an
  import." **Do not route this to a dedup refactor.** This is the parallel-implementation
  false-positive category the dispatch warned about, caught before being misreported.
  - `platform/db/schema.ts:1598` vs `:1766` (65 lines): two Drizzle `sqliteTable` credential-set
    definitions sharing boilerplate id/workspaceId/providerId/label columns — normal schema
    repetition, not a real duplication concern, low priority to touch.
  - `features/site-inspection/agent-tools.ts:3` vs `features/theme/agent-tools.ts:1` (51 lines):
    **not verified the same way** — plausibly the same per-feature parallel-implementation pattern
    the seo/page-head case turned out to be, but I did not open both files to confirm. Flag as
    "verify before touching," not as a finding.
  - Remaining top-20 clones are all test-file setup/mock boilerplate (`assistant/__tests__`,
    newsletter route tests, custom-credentials tests, admin route tests) — normal, not actionable.
- **type_safety**: `explicit_any=63` total but `explicit_any_production_only=3` — real production
  `any` usage is small for 358k lines. `non_null_assertion=744` total,
  `non_null_assertion_production_only=34`. `ts_ignore=0`, `ts_expect_error=21`. Cite the
  production-only figures; the raw totals are dominated by test code.
- **coupling/blast_radius**: 2119 modules, 10333 edges. Raw fan-in table top is
  `assert/strict`/`node:test` (794 each — every test file, not app coupling) and `express` (329,
  framework). Real app-level signal: `server/inbound/admin-http/dev-auth.ts` (259 fan-in),
  `server/routes/types.ts` (224 — **per existing project memory this is known type-only coupling
  and already assessed as architecturally free; not re-litigated here**),
  `server/runtime/composition/app.ts` (194, the composition root — expected),
  `platform/db/sqlite/content-db.ts` (121). `dev-auth.ts` at 259 fan-in is the one number here
  that looks disproportionate for what its name implies (a dev-only auth helper) and wasn't
  previously flagged in memory — worth a look at whether that's real app-wide use or a test-helper
  import pattern inflating it.
- **circular_dependencies: 34 cycles found (vs. 4 in admin, 0 elsewhere).** Not 34 independent
  problems — **~18 of them are the same repeating shape**: `assistant/index.ts ->
  assistant/byok-tool-surface.ts -> assistant/tool-registrations.ts ->
  features/<feature>/tool-registrations.ts -> assistant/index.ts`, once per feature
  (post, theme, widgets, recovery, media-generation x2, deployments x2, workspace, members,
  database, site-evidence, comments, settings, navigation, content-types, identity). This has the
  shape of an intentional plugin-registration hub-and-spoke, not 18 separate bugs — **a real fix
  would target the shared `assistant/index.ts <-> tool-registrations.ts` relationship once, not
  each spoke**. I did not check whether this pattern is already an accepted/grandfathered
  architecture decision (out of scope for a metrics-only run; that's an Architecture Adherence
  review job). Three other, smaller, likely-more-tractable cycles:
  - `features/media/index.ts <-> features/media/bootstrap.ts` (2-file)
  - `features/theme/theme-files.ts <-> features/theme/theme.ts` (2-file)
  - `.../site/render.ts -> liquid-sandbox.ts -> worker-sandbox.ts -> ...` (longer, truncated in
    the table at `top=20` chars)
  `repo_config_has_cycle_rule: True` — the repo's dependency-cruiser config does declare a cycle
  rule, so 34 live cycles imply either the rule isn't gating in CI or these are pre-existing and
  accepted; not determined here.
- **churn**: 1243 commits/12mo, 74 mechanical excluded, **1066 stale (pre-restructure) paths
  excluded from the ranking** — by far the largest exclusion of the four scopes, consistent with
  this being the branch that did the big restructure. Quoted, not re-derived. Hottest by
  substantive commits: `server/routes/types.ts` (73), `assistant/tool-registrations.ts` (43),
  `features/theme/theme.ts` (28). No complexity cross-reference available (skipped this run).
- **change_coupling**: 9 pairs over threshold. `features/database/tool-registrations.ts <->
  features/recovery/tool-registrations.ts` (80% confidence, no import edge) lines up with the
  same assistant-registration cycle family above — same underlying architecture question, not a
  new independent signal. `features/deployments/publish-agent-tools.ts` co-changes with three
  different files at 40-57% with none of them importing each other — a mild hidden-coupling hub,
  worth noting, not urgent.

## Known-trap checklist — confirmed per scope

1. **`dead_code`/knip broken for `apps/website` — CONFIRMED, hit exactly as documented.** Failed
   with `Unable to find package.json` on scope 4. Reported UNAVAILABLE, not a clean result.
   Worked correctly (used `--directory <app>`, correctly scoped) for site-chat, sdk, and admin —
   all three have their own `package.json`.
2. **~15% true-positive rate — applied as a caveat everywhere knip produced output** (site-chat: 2
   candidates; sdk: 1; admin: 2 files/113 exports). No knip row anywhere in this report is treated
   as a to-do list.
3. **Scope verification — confirmed correct.** Every knip command line recorded in the report used
   `--directory <app-root>` (e.g. `--directory apps/admin`), not a whole-repo scan. Spot-checked
   by reading the command field of every `dead_code` result.
4. **`drizzle*` exclusion — confirmed in effect for `apps/website`** (the only scope with drizzle
   directories on disk: `platform/db/drizzle/` and `platform/db/drizzle-database-journal/`).
   Grepped the full duplication JSON for "drizzle": zero hits. Not applicable to the other three
   scopes (no drizzle content in them).
5. **Vendored `node_modules` fixture (astro-bundler-probe) — confirmed absent from output.**
   Grepped the full `apps/website/src` duplication JSON for `astro-bundler-probe` and
   `node_modules/.vite/deps`: zero hits. Separately, the **coupling/fan-in tables in admin and
   website are dominated by different third-party leaf nodes** (`vitest`, `react`,
   `@testing-library/react`, `assert/strict`, `node:test`, `express`) — these are
   `doNotFollow: node_modules` leaves that every test file or the framework imports, not real
   architectural coupling. I excluded them by hand when picking out the real app-level fan-in
   numbers quoted in each scope's write-up above, and said so there.
6. **Churn/hotspot stale-path exclusion — quoted, not re-derived, every time**: site-chat 4,
   sdk 0, admin 123, website 1066 paths excluded from the ranking (git couldn't bridge the rename
   for these under `-M -C`). The website number is far the largest, consistent with it being the
   branch that did the big restructure.

## Ranked actionable findings

**Stake a refactor on this:**
1. `apps/admin/src/features/collections/Collections.tsx:127` vs `:283` — verified real ~40-line
   same-file JSX duplication (create-fields vs. edit-fields fieldset), differing only by an id
   prefix. Straightforward extraction. (Gate-logic classifies a same-file 2-site clone as
   Recommended, not Required — but this one is concrete and cheap to fix.)

**Worth a look, not urgent:**
2. `apps/website/src/server/inbound/admin-http/dev-auth.ts` — 259 fan-in, disproportionate for a
   file named as a dev-only auth helper. Not previously covered in project memory. Worth checking
   whether that's genuine app-wide use or test-helper import inflation.
3. The ~18-cycle `assistant/index.ts <-> features/*/tool-registrations.ts` family in
   `apps/website/src` (34 cycles total there, admin has 4 more) — one architectural question
   (the assistant/tool-registrations relationship), not 18 bugs. An Architecture Adherence review
   should determine whether this is accepted/grandfathered before anyone attempts a fix.
4. `apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx <->
   WidgetPickerDialog.hooks.tsx` and the smaller `apps/website/src/features/theme/theme-files.ts
   <-> theme.ts` / `features/media/index.ts <-> bootstrap.ts` 2-file cycles — tighter, likely
   cheaper to break than the assistant hub-and-spoke family, if anyone decides cycles here are
   worth fixing.
5. Hidden change-coupling clusters with no import edge: admin's 3 `features/database/hooks/*`
   files (100% pairwise co-change) plus `use-recovery.hooks.ts <-> use-restore-flow.hooks.ts`
   (100%); website's `database/tool-registrations.ts <-> recovery/tool-registrations.ts` (80%,
   same underlying question as finding #3) and `deployments/publish-agent-tools.ts`'s 3-way hidden
   coupling. Informational — surfaces a shared concern the type system doesn't see; not urgent.
6. `apps/admin/dist-debug/assets/index-CqOruXzQ.js` — a committed prebuilt JS/CSS bundle
   (verified tracked in git, not gitignored) sitting inside `apps/admin/`. Minor housekeeping
   item, unrelated to knip's opinion of it.

**Probably false positives — do not act without verifying first:**
7. `apps/website/src` `features/seo/types.ts` <-> `page-head.ts` 100-line clone — **confirmed
   NOT a defect**: an ADR-PIPE-008-documented deliberate structural duplicate that explicitly says
   not to deduplicate it. Reported here only so nobody re-discovers it as a "top duplication hit"
   and routes it to a refactor.
8. `platform/db/schema.ts` internal 65-line clone (two Drizzle table definitions) — normal schema
   boilerplate repetition, not a real duplication concern.
9. `features/site-inspection/agent-tools.ts` <-> `features/theme/agent-tools.ts` 51-line clone —
   plausibly the same per-feature parallel-implementation pattern as #7, but **not verified** the
   same way; flag for verification, don't act on it as-is.
10. knip's 113 unused-export candidates and 2 unused-file candidates in admin, and single
    candidates in site-chat/sdk — at ~15% measured TPR, treat every row as a hypothesis. The sdk
    "unused file" is a test file knip can't see the runner discovering (near-certain false
    positive by shape). The admin candidates that plausibly aren't (`external-mcp-i18n.ts`,
    various hooks/lib exports) need individual verification before any deletion.

## Metrics unavailable / untrustworthy

- **`complexity` / `cognitive_complexity`** — deliberately skipped this run per dispatch
  instructions; already measured today at threshold 0, see
  `ADS-memory/reports/2026-09-04-complexity-inventory.md`. Not re-measured, not contradicted here.
- **`coverage`** — deliberately skipped; on-disk lcov is 14+ days stale and known dual-instantiation-corrupt. A fresh pass is separately planned.
- **`hotspots`** — UNAVAILABLE in all four scopes as a direct consequence of skipping
  `complexity` (the script requires both signals and refuses to report churn alone as a
  "hotspot"). Not a tooling failure — a designed dependency the skip set triggered.
- **`dead_code` for `apps/website/src`** — UNAVAILABLE, knip cannot run without a `package.json`
  knip can anchor `--directory` to; `apps/website` has none. This is the one metric this dispatch
  could not produce for the largest of the four scopes.
- **`dead_code` everywhere it DID run** — available but low-confidence (~15% true-positive rate,
  documented and applied above); every row is a hypothesis, not a finding.
- **Cycle "new vs. base" status** — this dispatch reports raw cycle counts and shapes but did not
  diff them against a comparison base or check `gate-validation-status.md` for whether the
  cycle-detection gate is validated. That determination belongs to a code-review pass, not this
  metrics-only sweep.

## Per-scope result

| Scope | Status | Metrics measured | Notes |
|---|---|---|---|
| `apps/site-chat/src` | done | 9/13 | clean, no actionable findings |
| `packages/sdk/src` | done | 9/13 | too small for signal, one likely-false-positive knip hit |
| `apps/admin/src` | done | 9/13 | strongest concrete refactor candidate (Collections.tsx); 4 cycles; committed dist-debug artifact |
| `apps/website/src` | done | 8/13 | `dead_code` UNAVAILABLE (knip/no package.json, as documented); 34 cycles (mostly one repeating shape); largest duplication clone is a documented non-defect |

STATUS: complete
