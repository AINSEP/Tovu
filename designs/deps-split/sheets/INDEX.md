# deps-split — sheet index (SEQUENCE H1 step 4 = "size 01", re-derived; unblocks H1 step 5 and error-system E3)

Design: `../DESIGN.md`. Shared contract: `COMMON.md` (setup, facts re-check, freeze check, base outputs, per-commit gates, planted STOPs, move rules, stage rules). Every sheet = COMMON + the sheet; nothing in a sheet relaxes COMMON except S13 commit 20 (stated there).
Base for execution: latest `origin/refactor/terra` containing `origin/refactor/import-cycle-b` (facts pinned at `f0613d9e`). Work branch: `refactor/deps-split`, continued by every sheet. Run strictly in order; **one sheet at a time** (each later sheet's line numbers come from the TSVs the previous sheet refreshed).

| sheet | responsibility | prerequisites | budget | commits | product files touched |
|---|---|---|---|---|---|
| S0 | characterization pins, base outputs, planted STOPs | DESIGN; freeze check clean except D0c | ≤200k | 4-6 | tests only |
| S1 | delete `deps.ts:398` re-export; repoint importers by symbol | S0 | ≤80k | 2 | `deps.ts:398`, `src/index.ts`, 1 dev script, 7 tests, 1 `.mjs` test |
| S2 | source readers learn `site-deps/` | S1 | ≤60k | 1-2 | `check-capability-inventory.ts`, 3 tests |
| S3 | overrides / open-store / provider-identity helper groups out | S2 | ≤120k | 3 | `deps.ts` 417-928 (parts), 3 new files, 3 tests |
| S4 | in-place function splits; hoisted fns get real inputs | S3 | ≤180k | ≈12 | `deps.ts` closure only + new unit tests |
| S5 | stage `foundation` (A2-A4) | S4 | ≤150k | 4 | `deps.ts` 964-1087 → 3 slices + stage; `wiring-identity.test.ts:213`; 2 source readers |
| S6 | stage `boot-data` (B1-B3) | S5 | ≤130k | 4 | `deps.ts` 1092-1284 |
| S7 | stage `events-trash` (C1-C4) | S6 | ≤200k | 6 | `deps.ts` 1293-1584 |
| S8 | stage `content-data` (D1-D4) | S7 | ≤120k | 5 | `deps.ts` 1589-1693 |
| S9 | stage `keys-providers` (E1-E4) + E5 split | S8 | ≤180k | 6 | `deps.ts` 1701-1890 |
| S10 | stages `mail-http` + `publishing` | S9 | ≤160k | 7 | `deps.ts` 1901-2076 |
| S11 | stage `connections` + shared `guarded-outbound-http.ts` | S10 | ≤130k | 5 | `deps.ts` 2079-2133, `memory-deps/slices/outbound-http.ts` (deleted, importers repointed) |
| S12 | stage `after-assembly` (I1-I7) | S11 | ≤200k | 8 | `deps.ts` 2722-2932; `serving-app-boot-wiring.unit.test.ts:164` |
| S13 | literal runs, stage objects, root ≤50, debt rows | S12 | ≤240k | ≈22 | `deps.ts` 2134-2714 + root; `size-debt.json`/`error-gate-debt.json` via their scripts |

Total ≈2.15M Sonnet tokens, ≈90 commits. One Opus review after S4, S9 and S13 (diff with `--color-moved=zebra` + the S0 pins' mutation transcript).

Lines are `f0613d9e`; statement indices (column 1 of `work/closure-census.tsv`) are the stable keys until S5. From S5 on, each sheet reads its own lines from the TSVs the previous sheet committed (COMMON §2, §9 rule 8).

## Freeze (H1 step 4)

From S0's first commit until S13's report, no other lane writes `apps/website/src/server/runtime/composition/deps.ts` or `site-deps/**`. Enforced by COMMON §3 at the start of every sheet (fenced command; prints `STOP-FREEZE: <branch>`). The coordinator announces the freeze before S0 and the unfreeze after S13 + H1 step 5.

## Overlap with live lanes (checked 2026-11-18 against each branch's merge-base with `f0613d9e`)

Command used for every row (prints the lane's edits to the composition hot files):
```bash
for b in wave3/su-cms wave3/su-s5 wave3/kt-k03-k04 wave3/kt-k05 wave3/kt-k07 wave3/kt-k09-k10 wave3/kt-t-po wave2/daemon-r7 wave2/daemon-r8 wave2/admin-j wave3/admin-j3-t1a wave3/desktop-d0c wave2/size02-step5; do
  git fetch -q origin $b:refs/remotes/origin/$b; mb=$(git merge-base origin/$b f0613d9e)
  echo "$b: $(git diff --name-only $mb origin/$b -- apps/website/src/server/runtime/composition/deps.ts apps/website/src/server/runtime/composition/app.ts apps/website/src/server/runtime/composition/memory-deps apps/website/src/server/routes/types.ts development/scripts/size-debt.json | tr '\n' ' ')"
done
```

| lane | its edits that meet this plan | rule |
|---|---|---|
| **S/U cms chain** (`wave3/su-cms`, `wave3/su-s5`) | `server/routes/types.ts` import lines (`EntryPublishReadPort`, taxonomy read ports → `@jini-ai/cms/*`); no `deps.ts` edit today. Later S/U steps that move SQL repos (`SqliteEntryRepo`, `SqliteTermRepo`, `SqliteTaxonomyRepo`, trash/taxonomy SQL) repoint **import lines** that live in `deps.ts` today and in `slices/{content-repos,trash-follow-ups}.ts` after S7/S8 | lane S owns the feature folders and the `@jini-ai/cms` side; this plan owns the composition files. During the freeze an S/U step that must repoint a `deps.ts` import waits, or lands before S0. After S7/S8 it repoints the slice file by symbol. Never both in one wave |
| **K lane** (`wave3/kt-k03-k04`, `kt-k05`, `kt-k07`, `kt-k09-k10`, `kt-t-po`) | `size-debt.json` rows (their own); `kt-k05` the same `types.ts` import lines as S/U; `kt-t-po` `composition/serving-app.ts` (not touched here) | debt rows: each lane edits only its rows; on conflict the row is recomputed by `check:size` (SEQUENCE H4 rule). `serving-app.ts`: no overlap except S12's one-entry edit in `serving-app-boot-wiring.unit.test.ts:164` (a test list, not `serving-app.ts`) |
| **daemon R7/R8** (`wave2/daemon-r7`, `wave2/daemon-r8`) | `composition/modules/assistant.ts`, a `modules/__tests__` file, `server/inbound/assistant/*`, `apps/desktop` | no shared file. H1 step 3 is satisfied by absence (DESIGN §3); S0's prerequisite command STOPs if R8 ever adds a `deps.ts` line |
| **admin J/JM** (`wave2/admin-j`, `wave3/admin-j3-t1a`) | `composition/modules/assistant-chats.ts` (j3-t1a); admin app files | no shared file |
| **desktop D0c** (`wave3/desktop-d0c`) | `deps.ts:4` import `startupSecretEnvironment` → `@tovu/host-shared/startup-secrets`; `composition/jini-routes.ts` | **the only live edit of `deps.ts`.** Preferred: merge D0c into terra before S0. Otherwise S0-S5 run with the old spelling, S6 moves the import with statement 34 into `slices/identity-settings.ts`, and D0c's rebase re-applies its one-line change **in that slice file** (by symbol). COMMON §3 expects exactly this one branch |
| **size-02** (`wave2/size02-step5`, H1 step 5) | `app.ts`, `memory-deps/**`, `size-debt.json` | runs **after** S13 (SEQUENCE: size-02 step 6 needs size-01's shared `guarded-outbound-http.ts` = S11). If `wave2/size02-step5` merges before S11, S11 commit 1 repoints its memory copy; if after, size02 repoints to the S11 file. No other shared file |
| import-cycle S3b (`credentials-host-ports.ts`, done) | the literal's `...bindCredentialsHostPorts({ readDeps: () => routeDeps })` (2712) | moves verbatim into the `clients-static` run in S13 |

## What H1 step 5 and E3 can start on

- **H1 step 5** (size-02 steps 4-7, memory root, `createRouteDeps` → `memory-route-deps.ts`) starts after S13's report. It needs S11's `guarded-outbound-http.ts`.
- **Error-system E3** starts after H1 step 5 merges (unfreeze). Ready check, all must hold on the merged base:
```bash
D=apps/website/src/server/runtime/composition
test "$(grep -cvE '^\s*(//|\*|/\*|$)' $D/deps.ts)" -le 500 || echo "E3-BLOCKED: deps.ts over 500 code lines"
test "$(grep -rn 'createConsoleLogger(' $D/deps.ts $D/site-deps | wc -l)" = 1 || echo "E3-BLOCKED: logger not built once in the root"
grep -n 'export function createRouteDeps' $D/app.ts && echo "E3-BLOCKED: memory root still in app.ts (H1 step 5)"
git merge-base --is-ancestor origin/refactor/error-e0-e2 HEAD || echo "E3-BLOCKED: E2 not merged"
```

## Planted-case check of this index's commands (lesson 40)

The freeze command is shown to fire by S0 on the real D0c branch (expected output recorded in S0's report). The E3 ready check prints `E3-BLOCKED: … over 500 …` and `… memory root still in app.ts …` on `f0613d9e` today (verified by the design run: `deps.ts` has 3,036 lines; `app.ts:216` holds `createRouteDeps`).
