# deps-split — sheet index (revision 2; SEQUENCE H1 step 4 = "size 01", re-derived; unblocks H1 step 5 and error-system E3)

Design: `../DESIGN.md`; what changed and why: `../REVISION-2.md`. Shared contract: `COMMON.md`. All gates and STOP checks: `../work/gates.sh` (fail closed; self-test transcript `../work/gates-selftest.txt`). Every sheet = COMMON + the sheet; nothing in a sheet relaxes COMMON except S13 commit 21 (stated there).
Base for execution: latest `origin/refactor/terra` containing `origin/refactor/import-cycle-b` (facts pinned at `f0613d9e`). Work branch: `refactor/deps-split`, continued by every sheet. Run strictly in order, one sheet at a time; each sheet finds its lines by binding/anchor in the TSVs the previous sheet refreshed (COMMON §2).

| sheet | responsibility | prerequisites (lanes from `work/freeze-lanes.tsv` must be merged into the base first) | budget ceiling | commits | product files touched |
|---|---|---|---|---|---|
| S0 | branch, base outputs, gate proofs (stub + real plants), characterization pins | DESIGN; `gates.sh freeze` exit 0 | 220k | 8-10 | tests only (+ `__fixtures__`) |
| S1 | delete the site-paths re-export; repoint importers by symbol | S0 | 80k | 2 | `deps.ts` (1 line), `src/index.ts`, 1 dev script, 7 tests, 1 `.mjs` test |
| S2 | source readers learn `site-deps/` | S1 | 70k | 2 | `check-capability-inventory.ts`, 3 tests |
| S3 | overrides / open-store / provider-identity groups out; positional helpers → `(required, optional)` | S2; **`wave3/moves-b1` merged** | 130k | 3 | `deps.ts` module helpers, 3 new files, 3 tests |
| S4 | in-place function splits; hoisted closure functions get real inputs | S3; **`wave2/publish-p0-rest` merged** | 190k | ≈12 | `deps.ts` closure + new unit tests |
| S5 | `foundation` stage + prelude tail (awaits stay in root) | S4 | 150k | 4 | `deps.ts`, slices, `wiring-identity.test.ts`, 2 source readers |
| S6 | `boot-data` stage | S5; **`wave3/desktop-d0c` merged** | 130k | 4 | `deps.ts`, slices |
| S7 | `events-trash` stage | S6 | 190k | 6 | `deps.ts`, slices |
| S8 | `content-data` stage | S7 | 120k | 5 | `deps.ts`, slices |
| S9 | keys and providers around 3 root awaits | S8 | 170k | 6 | `deps.ts`, slices |
| S10 | mail, HTTP clients, stores, themes, publish apply around the owner await | S9 | 160k | 7 | `deps.ts`, slices |
| S11 | connections; `composeMemoryOutboundHttp` → shared `composition/outbound-http.ts` | S10 | 120k | 5 | `deps.ts`, `app.ts` (lines 5, 370), memory-deps test moved |
| S12 | after assembly up to the last root await | S11 | 190k | 8 | `deps.ts`, slices, `serving-app-boot-wiring.unit.test.ts` |
| S13 | literal runs, root ≤50, census update, debt rows, E3 check | S12 | 240k | ≈23 | `deps.ts`, `route-deps/`, `literal-keys.cjs`, debt JSONs (exact rows) |

Budget ceilings sum to ≈2.26M tokens; they are **ceilings, not measured costs** (the judge's point stands: execution cost is unverified until S0 runs). A sheet that reaches ~90% of its ceiling commits what is green and reports PARTIAL with the next step. One Opus review after S4, S9 and S13 (diff with `--color-moved=zebra` + the S0 pins' mutation transcript).

## Freeze (H1 step 4) — enforced, not announced

From S0's first gated commit until S13's report, `gates.sh freeze` runs **before every commit** (inside `gates.sh commit`) on the candidate commit. Rules: COMMON §3. In short: a lane may change `deps.ts` / `site-deps/**` / `composition/outbound-http.ts` only if it is in `work/freeze-lanes.tsv` at its exact tip SHA and the current sheet is before its merge-before sheet; a lane may never get a **new** conflict on a shared file from this work; a failed merge-base/merge-tree is a STOP. The coordinator announces the freeze before S0 and the unfreeze after S13 + H1 step 5; changing `freeze-lanes.tsv` is a coordinator decision recorded in a commit of its own.

Proof at `f0613d9e` with the lane refs of 2026-11-18 (`../work/freeze-at-f0613d9e.txt`): exit 0 at S0 with the three listed lanes allowed and three NOTE lines (lanes that already conflict with the base: `refactor/desktop-args` on `size-debt.json`, `refactor/size-02-app` and `wave2/size02-step5` on `app.ts`); exit 1 at S4 (`publish-p0-rest`, `moves-b1` not merged); a staged edit of `deps.ts:2879` at S1 stops with `STOP-FREEZE-CONFLICT origin/wave2/publish-p0-rest: this commit creates a conflict on …/deps.ts`.

## Overlap with live lanes (2026-11-18; tips are `git rev-parse --short` of the fetched refs)

| lane (tip) | its edits that meet this plan | rule |
|---|---|---|
| `wave3/desktop-d0c` (`a7ebde50`) | `deps.ts:4` import `startupSecretEnvironment` → `@tovu/host-shared/startup-secrets`; `src/index.ts` two imports; `error-gate-debt.json` (a `process-error-guards` row) | listed, merge before **S6** (the import moves with `identity`); `src/index.ts` (S1) and the debt file (S13) are shared: conflict-gated |
| `wave2/publish-p0-rest` (`9a6a942e`) | `deps.ts:1035` `publishTrustRevocationStoreFor({ kernel })`, `deps.ts:2879` `selectConnectedDestination({ rows })` | listed, merge before **S4** (2879 is inside `configureSiteSharing`); after it merges, the boot-order deny-store anchor text changes with it |
| `wave3/moves-b1` (`b8a30637`) | `deps.ts:197` `isInMemoryDbPath` import → `@jini-ai/db/data-modules` | listed, merge before **S3** (`prepareCompositionStorage` moves to `open-store.ts` with that import) |
| `refactor/size-02-app` (`9224337d`) | its `deps.ts` import change is already on the base (equivalent text) — merge-tree shows no `deps.ts` change; `app.ts`, `memory-deps/slices/outbound-http.ts`, `external-mcp-oauth-loopback-wiring` test, `size-debt.json` | not listed (no exclusive change). Already conflicts with the base on `app.ts` (NOTE). S11 moves `memory-deps/slices/outbound-http.ts`: if this lane is still unmerged then, the freeze check decides (a new conflict = STOP; coordinator merges or retires the lane) |
| `wave2/size02-step5` (`210ba239`; H1 step 5) | `app.ts`, `memory-deps/**`, `size-debt.json` | runs after S13; already conflicts with the base on `app.ts` (NOTE). It must re-point to `composition/outbound-http.ts` (S11) when it rebases |
| `wave3/xpkg-c12obs-r12` (`d8243896`) | `app.ts:50` import; both S3 importer tests (`deps-observability-wiring`, `deps-provider-plugin-boot`); `provider-plugins.ts`, `plugin-runtime`-adjacent tests | shared files, conflict-gated at every commit; if S3's commit would conflict, merge this lane first |
| `wave3/kt-t-po` (`e905b35e`) | `error-gate-debt.json` (a `go-live` row) | shared file; S13's transfer of the `deps.ts` row is conflict-gated |
| K lane (`wave3/kt-k03-k04`, `kt-k05`, `kt-k07`, `kt-k09-k10`), `wave2/kt-K-02`, `wave3/hooks-sweep-2`, `wave3/tc-wave4`, `refactor/desktop-args`, `refactor/size-05-posteditor` | `size-debt.json` rows (their own) | each lane edits only its rows; conflict-gated; a row is recomputed by `check:size`, never re-keyed by hand |
| S/U cms chain (`wave3/su-cms`, `wave3/su-s5`) | `server/routes/types.ts` imports; later steps repoint SQL-repo **import lines** that live in `deps.ts` today and in `slices/{content-repos,trash-follow-ups}.ts` after S7/S8 | during the freeze such a step waits or lands before S0 (the freeze check stops it otherwise); after S7/S8 it repoints the slice file by symbol |
| daemon R7/R8 (`wave2/daemon-r7`, `wave2/daemon-r8`) | `composition/modules/assistant.ts`, `server/inbound/assistant/*`, `apps/desktop` | no shared file; S0's prerequisite stops if R8 ever edits `deps.ts` (H1 step 3) |
| admin J/JM (`wave2/admin-j`, `wave3/admin-j3-t1a`) | `composition/modules/assistant-chats.ts`, admin app | no shared file |
| this plan, S11 | `app.ts` lines 5 and 370 (the memory root's import and call of the moved owner) | listed here so size-02 sees it: H1 step 5 rebases onto it |

Re-derive the table at S0 with:
```bash
set -euo pipefail
DS_SHEET=S0 bash designs/deps-split/work/gates.sh freeze   # exclusive-path edits, allowed lanes, new conflicts, NOTEs
```

## What H1 step 5 and E3 can start on

- **H1 step 5** (size-02 steps 4-7, memory root, `createRouteDeps` → `memory-route-deps.ts`) starts after S13's report. It needs S11's `composition/outbound-http.ts`.
- **Error-system E3** starts after H1 step 5 merges (unfreeze). Ready check on the merged base (exits non-zero and prints `E3-BLOCKED …` lines until all four hold: `deps.ts` passes the owner limits, exactly one `createConsoleLogger(` in `deps.ts` + `site-deps/`, no `createRouteDeps` in `app.ts`, E2 merged):
```bash
set -euo pipefail
bash designs/deps-split/work/gates.sh e3-ready
```
On `f0613d9e` the design run's first version of this check (a plain code-line count instead of eslint) printed `E3-BLOCKED deps.ts has 1619 code lines (> 500)` and `E3-BLOCKED memory root still in app.ts (H1 step 5)` and exited 1; the eslint form needs `npm ci`, so S0 runs it once after setup and records the output (expected: the same two blockers).

## Planted-case proof of this index's commands (lesson 40)

`gates.sh selftest` (stub tools; transcript `../work/gates-selftest.txt`, 18 cases, all fired / passed at `f0613d9e`) covers newlines, tests, shape, grep tool errors and four freeze cases (unlisted lane, listed lane before/at its sheet, moved tip). S0 adds the real-tool plants (`work/base-outputs/planted-real.txt`).
