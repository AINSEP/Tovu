PARTIAL T 57079db4f J f6503fb8f: api baselines not regenerated (pre-existing drift); 6 Tovu named mutations not re-run (R01.T, R02.T, R03.T x2, P10-H2.T x2)

# W3 ARCH + EXT-CRP — review, test, fix (Opus cloud run, 2026-11-25)

Branches: Jini `integ/w3-arch-crp-2026-11-25`, Tovu `integ/w3-arch-crp-2026-11-25`, both cut from
`origin/integ/merge-23-2026-11-25` (Jini `ab4e873e6`, Tovu `f81b1839a`).
Inputs merged cleanly: Jini `codex/w3-archj` (bb3b42f0d), `codex/w3-ext-crpj` (fa8e49561), cherry-picked G06 top
commit `b71234629` only. Tovu `codex/tv-w3-arch2` (5271abf110), `codex/tv-w3-ext-crp2` (b4e8968fdd). No conflicts.
Personas loaded: `AI-Dev-Shop/agents/code-inspection/skills.md` (reviewer) and
`AI-Dev-Shop/agents/programmer/skills.md` (fixes). 4 Sonnet subagents built CRP-04/05, 06/07, 10(+12 review), 11;
Opus reviewed, built CRP-05 install-response, fixed gates, ran all suites and the merge-23 comparisons.

The half-finished Tovu edits from the 10:20 SIGTERM were checked: Sol had started none of the Tovu halves of CRP-04/05/06/07/10/11.
It left one dangling import (`response.ts` → `hasConsentGatedScripts`, CRP-08.T). Both are now done or fixed.

## Per-sheet

| Sheet | Status | Notes |
|---|---|---|
| R01.TABLE.J | built-by-Sol, **fixed** | CSS witness used `new URL(import.meta.url)` (not `file:` under jsdom) → 2 NEW ui reds; `M-rename-table-markup-only` verified failing |
| R01.TABLE.T | built-by-Sol OK | admin vitest 6/6 |
| R02.CONSENT.J/T | built-by-Sol OK | cookie-consent 281/281; Tovu consent service/tools pass |
| R03.MCP-ALIASES.J/T | built-by-Sol OK | agent-plugins 2495 pass; Tovu alias binding tests pass |
| R03.SHARE-KEY.J/T | built-by-Sol OK | providers fail closed (`isShareArtifactKey?.() !== true`); site-share-wiring passes |
| K03.BRIDGE.J | built-by-Sol OK | daemon green; R15 mcp-bridge debt 7→3 (tightened) |
| G06.RUN.J | built by w3-noj (Opus design), **fixed** | daemon 268 files / 4888 tests green incl. r8a pins; R15 hits 85→88 fixed (neutral local names, debt 84) |
| P10-H2.MIGRATE.J/T | built-by-Sol OK, **fixed** tests | actor from `ctx.principal.id` (never input/confirmer); test typing via `ledgerDetail()` |
| CRP-01.J/T | built-by-Sol OK, test-type fix | serving-routine unknown-key probe typed |
| CRP-02.J/T | built-by-Sol, **fixed** | `render` port must return the `UIResource` card, not a URI (NEW Tovu typecheck red) |
| CRP-03.J/T | built-by-Sol OK, test-type fix | outbox-drainer spy typed to operation-span overload |
| CRP-04.J/T | J half by Sol + **built** presentation; T **built** | `MediaListLookup<number \| null>` fix; mutations `spread-presentation-settings`, `report-upload-length-for-svg` (J) and the T byte-size wire mutation verified failing |
| CRP-05.J/T | probe Sol (WHY header restored); install-response **built-by-Opus**; T **built** | install-response uses injected lifecycle predicates (agent-plugins→cms cycle) — **design deviation, owner review**; `put-install-warning-in-body`, `skip-saved-endpoint-match`, `eagerly-open-saved-credential` verified failing |
| CRP-06.J/T | J partial Sol + **built** import-errors; T **built** | `isStalePlan` → `boolean` (sheet's predicate invalid TS); import-errors runtime `node`; 4 mutations verified |
| CRP-07.J/T | J Sol (**fixed** `_optional` typing); T **built** | cookie name stays in Tovu; `MEMBER_AUTH_FAILURE` stays host (used by 4 host routes); 3+1 mutations verified |
| CRP-08.J/T | built-by-Sol, **fixed** | host `response.ts` import (SyntaxError at load) and cookie-consent `jini.entries` metadata |
| CRP-09.J/T | built-by-Sol OK | |
| CRP-10.J/T | **built** | structural ingress result type (FIX row's type was the raw provider shape); `allow-originless-form`, `allow-foreign-origin-json` verified |
| CRP-11.J/T | J 2/6 Sol + **built** 4; T **built** | node vs universal classification (Sol's blocker), isolation domain fix, inherited-key dispatch fix, 6+1 mutations verified; worker module budget +4 (documented) |
| CRP-12.J/T | built-by-Sol, **fixed** | test fixture 404 + type; SI-domain share of `seo/absolute-url`; `drop-marketing-canonical-fallback` verified |

## Tests run (NEW vs merge-23)

Comparisons ran the same files on a merge-23 worktree. Jini used node_modules symlinked from this checkout. Tovu used the same
linked Jini build. Node 22 here, while the repos want Node 24, so Tovu route suites ran with a one-line `RegExp.escape` polyfill.

- **Jini `pnpm guard`: PASS** (0 violations, after the 4 fixes above).
- **Jini strict `pnpm -r typecheck` + scripts tsc:** only OLD errors remain (`ActorIdentityInput` in `user-management` cms-entries-authorization test and `examples/notes-app`; files untouched).
- **Jini build:** all packages build except `user-management`, which fails on the same OLD test-file error. dist is emitted.
- **Jini package tests** (pass/fail):
  - daemon 4888/0
  - agent-plugins 2495/0
  - db 1082/0
  - cookie-consent 281/0
  - infra 185/0
  - analytics 294/0
  - devops 1960/0
  - ui 9014/2: both NEW, fixed, now 17/17 in those files
  - core 3220/3: OLD provider-neutral
  - user-management 1968/7: public-args NEW, fixed; the other 6 OLD
  - agent-runtime 4733/12: OLD/env (packed-install `smol-toml`, sandbox network)
  - cms 8830/11: all OLD (4 contract/boundary/pglite files fail on merge-23 too; result-html is Node 22)
- **`pnpm api:check`:** exit 0. Drift is shown, including broad pre-existing drift. Baselines were **not** regenerated (left).
- **Tovu `npm run typecheck`: 0 errors** (merge-23 + this Jini: 3).
- **Tovu `typecheck:tests`:** 750 errors vs 741 on merge-23. All 14 NEW errors are fixed, and a rerun shows **0 NEW**.
- **Tovu admin `tsc`:** 1 NEW (`human-confirm` render type), fixed in Jini. The rest are OLD (4839 on merge-23).
- **Tovu changed + same-directory tests** (1189 files): 13191 pass / 217 fail / 83 cancelled. Against merge-23, 30 failures are new by name:
  - 23 in `tool-surface-exchanges.test.ts`: load flake under the parallel run, 45/45 alone.
  - 5 `*.postgres.test.ts`: no Postgres in sandbox.
  - 2 in `worker-import-graph`: CRP-11 module budget, fixed (+4, documented). Its test 14 is OLD.
  - All other reds are OLD.

## Bugs found

All are logged in `development/open-bugs.md` under "W3 ARCH + EXT-CRP integration", fixed, OPEN or OLD. Headline: Sol's CRP-08.T
dangling import broke every site-pages suite at load. Sol's CRP-02 render type and CRP-04 byte-size type broke Tovu typecheck.
CRP-11 dispatch resolved inherited keys (`type:"constructor"`); this was pre-existing in Tovu and is fixed at the move. Five
guard violations are fixed. Sol's tests had 14 NEW type errors.

## Left / needs a decision
- CRP-05 install-response predicate-port shape (deviation from sheet text; follows set-enabled precedent) — owner review.
- API baselines: regenerate once on the integration tip (`pnpm api:update`); drift predates this branch.
- 6 Tovu named mutations not re-run here: R01.T `M-host-queries-retired-table-class`, R02.T `M-drop-tovu-banner-copy-port`, R03.T `M-unbind-tovu-mcp-aliases` and `M-share-kit-uses-archive-file-policy`, P10-H2.T `M-migrate-assistant-as-confirmer` and `M-migrate-admin-as-agent`. Their tests pass.
- `w3-crp12-origin-read-pin` test gap (see open-bugs).

## FILES LEFT
- EXT-CRP NOT-SHEETED: **30 files** (sheet ledger: 8 admin HTTP + 22 public HTTP).
- ARCH NOT-SHEETED handoff, with no file count in the sheet: R01 census, R02 IDs, R03 namespace, G06 physical split, H2 broad write cutover.
