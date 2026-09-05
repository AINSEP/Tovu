> **SUPERSEDED 2026-09-05.** This report's core claim — "no coverage data on disk is younger than
> 13 days (Aug 20)" — is no longer true. MEASURED: `development/coverage/lcov.info` was
> regenerated later the same day this report was written (mtime 2026-09-03 19:43, per
> `2026-09-05-route-coverage-ground-truth.md` §1), and has been re-measured further since. This
> report is explicitly named and re-verified (not re-quoted) in that later report's intro.
> Current truth: see `ADS-memory/reports/2026-09-05-route-coverage-ground-truth.md`.

# Coverage gap analysis from existing data — 2026-09-03

**Producer:** Programmer persona, analysis/report-only dispatch. **Zero test commands executed** —
confirmed below. No coverage-generating script was run; every number here comes from lcov files
already on disk before this task started.

## 1. Data inventory — what exists, how stale, how trustworthy

| Source | Size | mtime | Scope | Verdict |
|---|---|---|---|---|
| `development/coverage/lcov.info` | 5.5 MB, 1823 `SF:` blocks | **Aug 20 20:22** | `apps/website/src/**` + `packages/*/src` + `apps/site-chat/src` + linked `../Jini/packages/*/dist` (474 blocks) | **Confirmed the exact corrupt combined run already diagnosed in `2026-08-21-repo-wide-combined-coverage-map.md`** — see §2. Not a fresh measurement; 14 days old. |
| `development/coverage/lcov.unit.info` | **0 bytes** | **Sep 3 08:07 (today)** | Would be `test:cov:server:unit` output (`src/server/**` unit tier only) | Empty. Whatever produced this today did not complete or wrote nothing — cannot be analyzed. Not attributable to this session (I ran no test commands); likely a concurrent/interrupted process elsewhere. **Flagged as a data gap, not filled.** |
| `apps/admin/coverage/lcov.info` | 242 bytes, 1 `SF:` block (`src/features/media/media-providers-port.ts` only) | Aug 20 19:06 | Single file | Trivial leftover from an isolated single-file run, not a representative admin snapshot. Ignored. |
| `ADS-memory/.local-artifacts/coverage/set01..set22/lcov.info` | ~25 KB – 330 KB each, 30 files | **Aug 15** | `apps/admin/src/**`, split into ~22 feature-area scoped runs | Trustworthy (scoped runs avoid the dual-instantiation bug — see §2). 19 days old. Already exhaustively triaged in `2026-08-15-admin-coverage.md` + `2026-08-15-admin-coverage-triage.md`. Re-verified currency in §4 rather than re-deriving from scratch. |

No coverage data on disk is younger than **13 days** (Aug 20) except the empty file from this morning.

## 2. Trap corrections applied

- **Dual-instantiation shim-marker rule** (per `2026-08-21-repo-wide-combined-coverage-map.md`): a
  full-repo `test:cov` run merges an ESM and a CJS-interop instantiation of any source file reachable
  through a spawned child process into one `SF:` block. Presence of `__toCommonJS`/`__copyProps`/
  `__toESM`/`__export` in a file's `FN:`/`FNDA:` lines marks that file's numbers as **unusable** —
  `FNF` inflated, `LH` can be deflated by up to tens of lines. I re-derived this from scratch against
  `development/coverage/lcov.info` (not re-quoted): parsed all 1823 `SF:` blocks, excluded 474 `../Jini`
  dist blocks and 0 `node_modules`, leaving **1349 Tovu source files**: **667 clean, 682 shim-marked**
  (script: none retained beyond this session's scratchpad — see §6). Spot-checked against the report's
  own worked example (`src/media/provider-credential-store.ts`: `LH 294/357`, `FNF 43/FNH 29`) — **exact
  match**, confirming this is the identical corrupted artifact already diagnosed, not a newer run.
- **Scoped-run omission ≠ zero coverage:** did not treat any file absent from a `setNN` scoped lcov as
  0% — the admin triage report already documented this trap concretely (e.g. `redirects-port.hooks.ts`
  missing entirely from `set18` because a lazy/dynamic import never loaded it in that scoped run).
- **Failed test = zero coverage:** the Aug 20 combined run had exactly 2 known test failures
  (`liquid-sandbox.test.ts` assertion mismatch; a `serve-command` integration timeout, likely load
  flake) per the Aug 21 report. Checked both implicated source files against my clean/shim
  classification: `liquid-sandbox.ts` is shim-marked (already excluded from my findings on other
  grounds); `serve.ts` is clean at 100% line and not near any threshold. Neither contaminates the
  findings below.
- **Trust line/branch, not statements:** `node --test`'s lcov reporter (this repo's tool for both
  `apps/website` runs) has no statements column at all — N/A, not a live risk here. Only branch and
  line were used for ranking.
- **Zero-hit ≠ phantom:** the one file class I flagged as low-branch (`src/index.ts`) was read in full
  before characterizing it — its low branch % is explained by its own header comment ("never imported
  by a test" — it self-invokes `main()` at module load) and is a legitimate untestable-by-design
  boot entrypoint, not a real gap. Not reported as a finding.
- **lcov duplicate FN entries / branch misattribution:** covered by the shim-marker exclusion above;
  did not additionally hand-verify BRDA entries inside the shim-marked set since that whole bucket is
  already out of scope for ranking (see §3).

## 3. Findings — `apps/website` (the un-triaged half of this repo)

**Headline finding: the only full-repo coverage measurement for `apps/website/src` is 14 days old and
unusable for 51% of its files** (682/1349, shim-marked). No scoped re-run exists on disk to recover
ground truth for that half, and today's attempted `test:cov:server:unit` run produced an empty file.
This is the single largest, most systemic gap — a measurement gap, not (yet) a demonstrated coverage
gap — and it is general/repo-wide, not specific to routes (excluded `src/server/routes/**`, 
`tovu-route-coverage`'s territory, from everything below) or complexity (`tovu-complexity`'s territory).

Within the **trustworthy 667-file clean set** (excluding `src/server/routes/**`, leaving 626
function-bearing clean files): **zero files have 0% line coverage**, and only **3 files** fall under
50% branch coverage, none of which are real gaps on inspection:

| File | Branch | Line | Why not a real gap |
|---|---|---|---|
| `apps/website/src/index.ts` | 6/15 (40%) | 93.5% | Process entrypoint; self-invokes `main()` at module load; file's own header states it can never be imported by a test. All real logic lives in the (well-tested) modules it composes. |
| `apps/website/src/db/migration/pg-fixture.ts` | 5/12 (41.7%) | 98.7% | Test-support fixture, not production logic. |
| `apps/website/src/cli/commands/theme/migrate.ts` | 4/9 (44.4%) | 98.2% | Single CLI command, near-total line coverage; remaining branches are almost certainly one error-path each. |

**Conclusion for `apps/website`: no urgent, actionable coverage gap exists in the half of the codebase
current data can actually speak to.** This corroborates the Aug 21 report's own conclusion ("nothing in
the clean set looks like a coverage emergency") and extends it — that conclusion still holds against a
broader 626-file re-derivation (vs. their 88-file table, likely filtered to a narrower area set), 13
days later, no regression visible. The real risk is the unmeasured 682-file shim-marked half, which is
a tooling/process gap (see §5), not something this analysis pass can characterize per-file without
violating the no-test-execution constraint.

## 4. Findings — `apps/admin` (currency check against the existing Aug 15 triage, not re-derivation)

Rather than re-parsing the `setNN` lcov files from scratch (already done exhaustively in
`2026-08-15-admin-coverage-triage.md`), I re-verified each of that report's ranked findings against the
current tree to confirm which are still open 19 days later:

1. **RESOLVED, do not re-recommend.** The triage's #1 finding — `use-composio-config.hooks.ts`,
   `use-external-mcp.hooks.ts`, `use-settings-ui.hooks.ts`, `composio-config-dependencies.hooks.ts`,
   `connectors-port.ts` all at or near literal 0% with **no test files** — is now stale. All five now
   have paired `__tests__/*.unit.test.ts(x)` files on disk (verified by `find`; confirmed present, not
   merely stubbed — did not re-run them to check pass/fail, which would violate this task's constraint).
   Whoever next needs a fresh admin coverage baseline should treat this as closed and not queue it
   again.
2. **LIKELY STILL OPEN.** `features/menus/hooks/use-menu-editor.hooks.ts` — branch 16/64 (25%) as of
   Aug 15. `git log --since=2026-08-15` on both the source and its test file shows only two unrelated
   refactor commits (import-alias conversion, biome-ignore conversion) — no test-content changes. The
   underlying tree-recursion branch gap (move-up/down/into, remove-last-child, etc., per the original
   triage's reading of the file) is very likely still present, but this is inference from absence of
   commits, not a fresh measurement.
3. **LIKELY STILL OPEN.** `features/widgets/hooks/use-widget-region-editor.hooks.ts` — branch 7/18
   (39%). Same check: only a `useEffect`-dependency-array fix and the same import-alias refactor
   touched this file since Aug 15; no test-content commits. The stale-version/409-conflict branch gap
   flagged in the original triage is likely unaddressed.
4. **UNCLEAR, moved since.** `features/posts/PostEditor.tsx` — the triage explicitly deferred this
   (branch 64% is healthier than func 28%, recommended only a 10-minute read before committing effort).
   `git log` shows **substantial activity since**: two dedicated complexity refactors
   (`6a7942fa` "Toolbar cyc 62->1", `429af785` "PostEditor cyc 25->9") plus a WIP halted-refactor
   snapshot (`03cc7144`, still in the tree per today's `git status`, described as "halted phase-3
   refactor in a green state"). This file has changed shape enough that the Aug 15 numbers should be
   treated as **not current** — needs a fresh scoped `posts` measurement before anyone acts on it, not
   inference from the old numbers.

None of 2–4 above required a test run to state — this is git-log-based currency triage on top of
already-measured, already-trustworthy Aug 15 data, per the task's no-execution constraint.

## 5. Flagged as urgent / worth its own follow-up task

1. **The `test:cov` full-repo measurement is unusable for half the codebase and has been for at least
   13 days with no scoped-rerun campaign to compensate.** This isn't a new discovery (Aug 21 already
   named it "not usable"), but the situation is unchanged 13 days later and it blocks any future
   general-coverage gap analysis of `apps/website`, not just this one. Recommend: either fix the
   dual-instantiation root cause (Layer 1's fix was scoped but explicitly deferred pending Layer 2 —
   see `2026-08-21-session-handoff-coverage-still-open.md` §1), or stand up a scoped-run rotation for
   `apps/website/src/**` areas the way `apps/admin` already has one.
2. **`development/coverage/lcov.unit.info` is 0 bytes as of this morning.** Worth a quick check by
   whoever owns today's session of what produced it and whether it silently failed — an empty lcov
   from a `test:cov:server:unit` invocation is a stronger signal than "no data," since the script does
   `rm -f` then writes fresh; zero bytes written back means the run started and produced no reporter
   output at all (crash before first test, or the file-list resolution returned nothing).
3. **`PostEditor.tsx` (admin)** needs a fresh scoped measurement, not inherited Aug 15 numbers — it has
   had two complexity refactors and a halted WIP snapshot since. Flag for whoever next runs an admin
   coverage pass to re-scope `set09-posts` before trusting old branch/func numbers there.

## 6. Overlap check against concurrent agents

- **`tovu-route-coverage`**: excluded `src/server/routes/**` from all `apps/website` findings above —
  that is its territory. My findings are entirely outside it.
- **`tovu-complexity`**: no complexity metrics used anywhere in this report; coverage % only.
- This report's `apps/website` section is **not** a restatement of route coverage — the un-triaged,
  general-coverage half of the repo (`src/server` outside `routes/`, `src/features`, `src/assistant`,
  `src/db`, `src/core`, `src/widgets`, etc.) turned out to have no urgent findings in its trustworthy
  half, and an unresolved measurement gap in the other half. That is new information, not an overlap.

## 7. Confirmation

**Zero test commands were run during this task.** No `npm test`, `npx vitest`, `node --test`, `test:cov`,
or any coverage-generating script was executed. All numbers above come from lcov files with the mtimes
listed in §1, which predate this task. A Python parsing script was used only to read
`development/coverage/lcov.info` (no execution of repo code); it and its JSON output live in this
session's scratchpad, not the repo.
