# G-STALE-DEPS sheet: delete manifest declarations that no production file uses (one Sonnet run, ~35k)

Read `COMMON.md` first. Source: `census/merged/CENSUS-manifest.tsv`, rows with `status = STALE` (a `dependencies` or `peerDependencies` entry on a non-base `@jini-ai/*` package with **no** production import, type-only and dynamic imports included). 19 rows at the merged state. GAPS §3.2 listed 19 at an older base; two rows differ: `db → platform` is already gone, and `analytics → agent-runtime` is new (C6 removed its last import).

This lane edits only `packages/*/package.json` and the manifest-assertion tests named below. Revision 2 (judge finding 1): each per-package commit also carries `pnpm-lock.yaml` and deletes that manifest's own keys from `scripts/injection-debt.json` (a stale allowance fails the gate, rule `injection-debt-stale`). The list of stale rows is `awk -F'\t' '$5=="STALE"' census/merged/CENSUS-manifest.tsv` (20 rows on merge-a+b: re-run the census first; `user-management → ui-kit` is **USED** under option C and is not touched). The table below has all 20: rows 1–19 are this lane's, row 20 (`daemon → db`) is listed only to be skipped.

| # | owner → target | field | test files that still import the target | action |
|---|---|---|---|---|
| 1 | agent-plugins → commerce | peer (optional) | 0 | delete (also drop `peerDependenciesMeta`) |
| 2 | analytics → agent-runtime | peer (optional) | 0 | delete |
| 3 | capability-providers → platform | peer (optional) | 0 | delete |
| 4 | cli → platform | dependency | 0 | delete |
| 5 | commerce → agentic | peer (optional) | 0 | delete |
| 6 | commerce → ui | peer (optional) | 0 | delete |
| 7 | http-kit → platform | dependency | 0 | delete |
| 8 | integrations → db | peer (optional) | 0 | delete |
| 9 | registry → db | peer (optional) | 0 (GAPS named `tool-catalog/__tests__/loads-without-driver.test.ts`; it does not import db by a static import: read it) | delete; keep `@jini-ai/db` in `devDependencies` only if that test resolves it at run time |
| 10 | ui → platform | dependency | 0 | delete |
| 11 | user-management → agentic | peer (optional) | 0 (`src/__tests__/package-entries.test.ts` asserts the manifest) | delete + update the assertion |
| 12 | admin → agentic | peer (optional) | 1 (`forms/react/__tests__/forms-agent-drive.unit.test.tsx`) | **step 2** |
| 13 | admin → ui-kit | peer (optional) | 6 | **step 2** |
| 14 | chat → agentic | dependency | 8 | **step 2** (C-CHAT-DEPS CH4 owns it; skip if that sheet has landed) |
| 15 | cms → platform | peer (optional) | 1 (`forms/__tests__/email-sender.unit.test.ts`) | **step 2** |
| 16 | plugins → db | peer (optional) | 1 (`host/__tests__/integration/repo.contract.integration.test.ts`) | **step 2** |
| 17 | registry → platform | dependency | 1 (`__tests__/github-client.test.ts`) | **step 2** |
| 18 | ui → agentic | dependency | 1 (`react/__tests__/components/agent-handles-driver.integration.test.tsx`) | **step 2** |
| 19 | ui → ui-kit | dependency | 2 (`__tests__/ui-kit-render-support.tsx`, the same integration test) | **step 2** |
| 20 | daemon → db | dependency | — | **skip** (Opus review B11): R8b step 9 owns daemon's manifest (`R8-RUNTIME.md` §12.5: `@jini-ai/db` and `@jini-ai/platform` leave daemon's `dependencies` only after `rg` shows no `src` importer). Do not touch `packages/daemon/package.json` in this lane (INDEX §4 gives daemon to R8a-rest/R8b). |

## Step 1 (rows 1–11): delete now
1. For each row, re-verify: `rg -n "@jini-ai/<target>['\"/]" packages/<owner>` (all files, tests and scripts and `tsup`/`vite` configs included, not only `src`). Any hit outside comments: the row moves to step 2.
2. Delete the key (and its `peerDependenciesMeta` and `jini.optionalPeers` text if present). One commit per package, so each is green alone: `pnpm install --config.prefer-workspace-packages=true` (lockfile change is expected: commit it in the same commit), `pnpm --filter @jini-ai/<owner> build`, `npm --prefix packages/<owner> run test`, `pnpm guard`.
3. Manifest-assertion tests to update in the same commit as their package: user-management `src/__tests__/package-entries.test.ts`; anything `rg -n "peerDependencies|optionalPeers" packages/<owner>/src -g '**/__tests__/**'` shows. Update the expected list; do not delete the assertion.

## Step 2 (rows 12–19): move the declaration to `devDependencies`, do not delete the tests
These packages' **tests** still import the target. Deleting the declaration would break them; rewriting them is G-TESTS. This lane does the part that is safe now:
- move the key from `dependencies`/`peerDependencies` to `devDependencies` (`workspace:^`), so the production manifest is clean and the gate's manifest rule passes;
- list each row in the report as "test edge left for G-TESTS T<n>" (rows 12, 13, 18, 19 → T3; 14 → C-CHAT-DEPS/T0; 15, 16, 17 → T2/T4).
A published consumer that relied on the transitive install of the target is affected: note each row in a changeset (`patch`, "no longer declares …").

## Tests
This lane changes no behaviour. The check that proves it: each package's full test count before and after is equal, and `node scripts/census.mjs` afterwards reports `manifest: STALE 0`.

## STOP
- A build config (`tsup`, `vite`, `exports` conditions) names the target (then it is not stale).
- `pnpm install` changes a version of anything other than the removed links.
