# import-cycle-a — run report (2026-11-16)

Unattended cloud build run. Design: `plan/import-cycle-design-2026-11-16` `designs/import-cycles/DESIGN.md` (rev 2 + Judge response), `AMENDMENTS-A` A7, `SEQUENCE.md` H1/H2.
Branch `refactor/import-cycle-a` in both repos, from `origin/refactor/terra` (Tovu `80b00f5b`, Jini `02edbb68`). No pull request opened. Nothing force-pushed.

Status: **COMPLETE for the steps named in the task** (Tovu S0, S1, S2, S3a; Jini J1, J3, J4). Not started, by instruction: S3a-types, S3b, S4, S5, S6, J2.

## Commits

| Repo | Step | SHA | What |
|---|---|---|---|
| Tovu | S0 | `6b6cd662` | rank table, `feature-rank:<n>` rules at warn, node check at error, its test |
| Tovu | S1 | `1a280697` | `publish-trust/connect.ts` imports the path guard from `@jini-ai/devops/deploy`; 2 re-exports deleted |
| Tovu | S2 | `173f6709` | `API_CONNECTION_VAULT_KIND` + `apiConnectionVaultScope` move to `platform/secrets`; 1 re-export deleted; 3 production + 6 test importers repointed |
| Tovu | S3a | `cf1f59c6` | both callers use Jini's `repositoryTargetError`; forwarder `source-control/repository-target.ts` deleted |
| Jini | J1 | `8eb653a0` | `json-event-stream-shared.ts` leaf; 5 handlers repointed |
| Jini | J3 (test) | `2b502ead` | characterization test for the queue's actions column |
| Jini | J3 | `ff4d9323` | `QueueActionsCell.tsx` + `QueueActionsCell.hooks.ts` |
| Jini | J4 | `c56f73eb` | guard rule R14 (runtime module cycles), config, debt list, fixtures |
| Jini | J4 (test) | `0a1b2dc0` | two guard-drift stub lists gain the new modules |

Tovu commits build on Jini `refactor/terra` `02edbb68`. Tovu `tsc -p tsconfig.json` is also 0 errors against Jini `refactor/import-cycle-a` `0a1b2dc0` (rebuilt and linked).

## Cycle count after each step (the design's scripts)

Tovu, `edges.mjs` (program emit) + `graph.mjs summary` + `check:boundaries`:

| After | Feature SCC | Mutual pairs | `feature-rank` rows | File-level runtime cycles |
|---|---|---|---|---|
| base `80b00f5b` | 24 | 3 | (rule absent; prototype: 11) | 0 |
| S0 | 24 | 3 | 11 | 0 |
| S1 | 7 | 3 | 10 | 0 |
| S2 | 5 | 3 | 9 | 0 |
| S3a | 5 | 3 | 8 | 0 |

These equal the design's §4 table. The 8 rows left are S3b (1), S4 (1), S5 (6). The rank table regenerated on `80b00f5b` equals the design's table (0 differences, 68 features). The second cycle through `server/` and `assistant/` (8 units, B lanes) is unchanged.

Jini, `edges.mjs` (transpile emit) + `graph.mjs summary` + the J4 prototype on the pinned dependency-cruiser 18.1.0:

| After | Runtime file cycles | J4 rows | Package edges / cycles |
|---|---|---|---|
| base `02edbb68` | 3 (6, 4, 2 files) | 9 | 82 / 0 |
| J1 | 2 (4, 2) | 4 | 82 / 0 |
| J3 | 1 (4) | 3 | 82 / 0 |

The 9 rows on 18.1.0 are the same 9 the design measured on 18.7.2. The cycle left is the daemon one (J2).

## Pins and mutation proof

Every pin was green on the unmodified tree first, then seen red under a local mutation that was reverted before the real change.

| Step | Pin | Mutation → result |
|---|---|---|
| S0 | new `development/scripts/__tests__/check-feature-ranks.test.ts` (5 cases, runs the CLI) | unranked check off → 1 red; tests-only folders counted → 5 red; integer check off → 1 red; stale check off → 2 red |
| S0 | real tree | `object-storage` removed from the table → `unranked feature: object-storage`, exit 1 |
| S1 | `publish-trust/__tests__/candidate-declarations.contract.test.ts` "escaping candidates are refused before resolution or IO" | guard ignores the path → red |
| S2 | `api-connections/__tests__/plugin-state-format.pin.unit.test.ts` | `ownerKey` changed → red; kind string changed → red; format string changed → red |
| S3a | `commit-site.unit.test.ts`, `write-files-validation.unit.test.ts`, `repository-target.unit.test.ts` | each caller drops the host validator → 5, 2 and 1 red |
| J1 | agent-runtime parser + defs suites (49 files, 857 tests) | `pickUsage` copies nothing → 10 red; todo rule lost → 2 red; `dispatchFrame` finds nothing → 108 red |
| J1 | J4 prototype | leaf written with `import { type CodexStreamState }` → cycle row is back |
| J3 | 3 new tests in `QueueSection.unit.test.tsx` | hook ignores filter status → 1 red; column passes empty permissions → 2 red; cell never renders the menu → 2 red; menu button with no items → 1 red |
| J4 | `runRuntimeCycleSelfTest` (8 expectations) | imports read before compilation → 4 fail; no tsconfig → 4 fail; stale debt ignored → 1; partial debt accepted → 1; tests not excluded → 4 |

## Gates

Tovu (after each of S1, S2, S3a; S0 changes no source):
- `tsc -p tsconfig.json --noEmit`: 0 errors. `tsc -p tsconfig.tests.json --noEmit`: 0 errors. Same as base.
- `npm run check:boundaries`: node check passes (68 folders, 0 problems); depcruise exits 16, as on base (the 16 `no-deep-imports:*` error rows the design names in §8.1).
- `npm run check:size` and `npm run check:complexity`: **exit 1 on the unmodified base** (16 and 25 worsened/new rows from other work). Their output after every step is identical to the base output (empty diff), so no step added or worsened a row.
- Tests (website runner, concurrency 1): S0 5/5; S1 23 files, 463/463; S2 25 files, 339/340; S3a 6 files, 155/155; wider run over `source-control`, `custom-credentials`, `project-keys`, `api-connections`, `publish-trust` (non-Postgres): 1419/1420.
- The two failures are not from this branch:
  - `api-connections/__tests__/shared-bindings.postgres.test.ts` needs a PostgreSQL server (`/tmp/.s.PGSQL.5432` missing). Fails the same way on the tree before S2.
  - `api-connections/__tests__/vendor-neutrality.test.ts` "no generic seam file names the first provider" reports 6 hits; 5 are in `features/agent-plugins/*`, which this branch does not touch, and the sixth is a comment line in `shared-owner.ts` that is unchanged from base.

Jini:
- `pnpm guard`: exit 0. `pnpm guard:drift` (what CI runs): exit 0, 0 new violations. `pnpm check:size`, `pnpm check:complexity`: pass.
- `pnpm -r --no-bail typecheck`: exit 0. `tsc -p scripts/tsconfig.json`: 0 errors.
- `@jini-ai/agent-runtime` vitest: 187 files, 4489 passed, 1 skipped, before and after J1.
- `@jini-ai/admin` vitest after J3: 212 files, 2856 passed (3 of them new).
- `scripts/__tests__` vitest: 835 passed, 7 failed, 33 skipped. The 7 (`coupling-isolation` ×5, `optional-peer-contract` ×2, and `extract-s3-source-contracts` failing to load) fail the same way on `02edbb68` in this container; one needs commit `35c4961af`, which a shallow clone does not have.
- Changesets (patch): `agent-runtime-json-event-stream-leaf.md`, `admin-queue-actions-cell-files.md`.

## Deviations from the design, and things to know

1. **J4 carries a debt list.** The design adds the gate "after J1–J3" at error with nothing left. The sequence moves J2 behind R8b, so `scripts/runtime-cycle-debt.json` lists the four daemon files of J2's cycle. Shrink-only: a cycle with any member outside the list fails; an entry whose file left its cycle fails too. J2 deletes the four entries. This is the one decision I made that the design did not: please ratify or tell the J2 executor to change it.
2. **J4 lives in the guard, not in `quality:depcruise`.** `scripts/check-runtime-cycles.ts` spawns the pinned dependency-cruiser with `scripts/runtime-cycles.depcruise.mjs` and is called from both `guard.ts` and `check-guard-drift.ts`. It also scans `packages/cms/forms/src`, which the prototype's `packages/*/src` glob missed. It adds about 16 s to the guard.
3. **J3's prerequisite was not checked.** The design says "after untangle R1 is closed for these two files"; the sequence lists J3 as runnable now. I did not verify R1's state. If R1 still edits `QueueSection.tsx` or `QueueSection.hooks.ts`, expect a merge conflict there.
4. **S0 node check.** Same three rules as the design's script. Differences: messages name the table file and say what a rank must be; the script's `--self-test` flag became a `node:test` file that runs the CLI on a fixture tree; rules are emitted in rank order.
5. **S0 on a linked checkout.** With Jini linked, Tovu's existing `no-circular` rule prints 8 extra warn rows that point into `../Jini/packages/*/dist` (the Jini cycles, seen through the symlinks). They do not appear on an unlinked install and are not `feature-rank` rows.
6. **S3a and `check-architecture.baseline.json`.** Line 75 still lists the deleted edge `write-files-validation.ts -> source-control/repository-target.ts`. I left the file alone: it is a snapshot regenerated with `--update`, and `npm run check:architecture` already fails on base (4 metrics). S3a moves its numbers the right way (cross-feature edges 434 → 433, API surface 851 → 850).
7. **S3a test shape.** `repository-target.unit.test.ts` keeps every assertion; two calls now pass `{ validateTarget }` instead of a positional validator, because that is Jini's signature.
8. **Unused names removed with the moves** (they would otherwise be dead imports): `isContainedDeployConfigPath` in `deploy-config-registry.ts`'s import (S1), `type VaultContext` in `vault-stores.ts` (S2).
9. Tovu has dependency-cruiser 18.1.0 installed; the design's Tovu prototype ran on 18.7.2. Same 11 rows.

## Next step

- Tovu: **S3a-types** (move the domain interface that receives the new members out of `server/routes/types.ts`), then S3b → S4 → S5a → S5b → S6. All wait for SEQUENCE H1 step 5 (size 01 and size-02 steps 4–7).
- Jini: **J2** after R8b: leaf `agent-executor/mcp-json-file.ts` per A7.4 (`McpJsonServerEntry` moves into the leaf), then delete the four entries in `scripts/runtime-cycle-debt.json`.
