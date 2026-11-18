# R13 sheet: host presets and frozen forwarders (+ G-SERVER-LOGIC)

Revision 2 (judge finding 1; owner decision OD-3). The census now classes all 54 R13 rows as `allowed-preset` (39) or `frozen` (15): **R13 has no import-cleanup work.** What remains is the exception bookkeeping (R13a), moving logic out of the preset (R13b), one shell (R13c) and the adapter audit (R13d, rewritten: adapters no longer arrive in the preset).

Read `COMMON.md` first. Sites: `sites/R13.sites.tsv` (54, revision 3 re-count): `server` 38 in 13 files, `cli` 1 (39 `allowed-preset`), `sqlite` 11 (one file), `infra` 4 (two files) (15 `frozen`).

## What is already true (verified at the merged state)
- `packages/server/package.json` and `packages/cli/package.json` already carry `jini.kind: "host-preset"`, and the gate knows presets (`scripts/lib/injection-edges.ts:14-19,77`: a preset may import anything; "nothing may import a host-preset package"). **The "mark as host-preset" half of the LANES row is done.** The 36 server/cli sites are allowed edges; they are listed only because the census counts every non-base import.
- `sqlite` and `infra` are `jini.kind: "persistence-adapter"`. Their 15 sites are the Q2 frozen forwarders.
- Importers of the preset inside Jini: only `examples/{minimal-host,reference-web,neutral-host}` (hosts). `packages/db/src/owner-store/index.ts:1` names `@jini-ai/server/owner-store` in a comment only.

So R13 is four small jobs, not one big one.

| Sub-sheet | Work | Estimate (Sonnet) |
|---|---|---|
| R13a | Q2 exception entries for `sqlite`/`infra` + a surface freeze test | 25k |
| R13b | G-SERVER-LOGIC, revision 4: legacy owner-store decoder/reader to platform + db, preset keeps the wiring; `storage/legacy/sqlite.ts` VOID (no importer) | 110k |
| R13c | delete the `createFrontendControl` re-export; `cli → platform` stale dep | 20k |
| R13d | adapter audit after N1, R8b, R10b, R11: nothing Node-specific is left as a default in a domain package; docs | 30k |

## R13a: Q2 forwarders
1. **Same commit, three files** (no coordinator): (a) `scripts/injection-exceptions.json`: one entry per `{owner, target, specGlob}` for `sqlite → chat|daemon|db|registry` and `infra → db`, each with `ownerQuestion: "Q2"`, `approved: "2026-11-15"` and a `removeAt: "next major"` note (read `InjectionException` in `scripts/lib/injection-debt.ts` for the real schema first; if it has no free-text field, put the note in `_comment`). Its `_comment` today says the file is "empty by owner rule 2026-11-15" and that the forwarders "are deleted in lane R13": **that sentence is superseded by the owner rule in this run's brief (sqlite/infra frozen); reword it, keeping the "never add one to silence the gate" rule.** (b) `scripts/injection-debt.json`: delete the `sqlite`/`infra` keys the new exceptions now cover (the gate fails on a stale allowance). (c) the gate test that pins the exceptions list, if one exists (`rg -n "injection-exceptions" scripts/__tests__`). `pnpm guard` must be green after this one commit; `diff /tmp/guard-before.txt <(pnpm guard 2>&1)` shows no new finding.
2. Freeze test: `packages/sqlite/src/__tests__/old-surface` already pins the surface (GAPS §5 names `old-surface.json`); verify it fails when an export is **added** as well as removed (add a throwaway export locally, run, revert). Add the same pin for `infra` if missing (`packages/infra/src/__tests__/surface.test.ts`: sorted export names of each entry equal a checked-in list).
3. GAPS Q-G2 (keep chat's two `{ db }` wrappers in `sqlite` until the major): follow the recommendation (keep) unless the owner has answered otherwise; C-CHAT-DEPS CH2 creates `chat-history-compat.ts`. R13a does not touch it.

## R13b: G-SERVER-LOGIC (preset = wiring only), revision 4 (2026-11-18, run r13b-c12obs-fix)

**Status: EXECUTABLE.** Revision 2 described `owner-store/backup.ts` as an exporter that re-encrypts vault exports. It is not, and the executor stopped (Jini `origin/wave2/xpkg-r13b-r3b:cloud-results/xpkg-r13b-r3b.md`). Every fact below was re-read on **Jini `4c1892368` / Tovu `ada11733f`** (`origin/refactor/terra`). The mutation results were run there, with Node 24.11.1 and `npx vitest run src/owner-store` in `packages/server` (53 tests green on the base). Note: `--maxWorkers=2` makes `packages/server` vitest fail with `options.minThreads and options.maxThreads must not conflict`, so run it without that flag.

### What the code is
| file (lines) | what it really is | exports (public via `@jini-ai/server/owner-store`) |
|---|---|---|
| `owner-store/backup.ts` (161) | a **read-only decoder** of the legacy `jini-owner-store` v1/v2 passphrase backup: `openWithPassphrase`, then structural validation (fields, copyable kind, hint policy, grants and cleanups). It does no export, no sealing and no re-encryption. | `readLegacyOwnerBackup`, `OwnerStoreBackupError` |
| `owner-store/legacy.ts` (121) | a **read-only reader** of `owner.db` + `owner.key`. It is made of 3 SQL reads over db's owner-store schema, one legacy keyring and vault policy (env var `OWNER_STORE_KEY`, salt `jini-owner-store-v1`, file fallback on, auto-generate **off**, `authorize` = owner workspace + null principal + copyable kind), and one decrypt with a fixed recovery error per row | `OWNER_WORKSPACE_ID`, `ownerContext`, `countLegacyOwnerStore`, `readLegacyOwnerStore`, `OwnerStoreRecoveryError`, types `LegacyOwner{Entry,Destination,Snapshot,Counts,StoreFile}` |
| `owner-store/index.ts` (6) | re-export shell of the two files | — |
| `storage/legacy/sqlite.ts` (66) | legacy DDL wiring (projects + chat + agent-sessions) and the `app.sqlite` cache | **no importer** in Jini source or Tovu source (only allowlists: `knip.json:710`, `scripts/error-gate-debt.json`, `scripts/check-engine-boundaries.ts`, `scripts/__tests__/storage-public-entries.test.ts`) |

Importers (whole list, both repos): Jini: only the owner-store tests. Tovu: `apps/website/src/cli/commands/owner-store.ts:11-12`, `owner-store-import.ts:2`, `__tests__/unit/owner-store-import.unit.test.ts:3`, `__tests__/integration/owner-store.integration.test.ts:17` (`ownerContext`). `packages/db/src/owner-store/index.ts:1` names the reader's home in a comment.

### Who owns each vault function today (the "second owner" check)
| concept | owner today | R13b decision |
|---|---|---|
| portable entry shape | platform `credential-sets/vault-archive.ts` `VaultArchiveEntry`, which is **field for field** the same as `LegacyOwnerEntry` | **reuse it**: `LegacyOwnerEntry` is deleted and every use takes `VaultArchiveEntry` (this is the reconciliation the STOP asked for) |
| copy-eligible kinds | platform `credential-sets/vault.meta.ts` `isCopyableKind` (the decoder and the reader already import it) | unchanged, still the only owner |
| archive portability | platform `vault-archive.ts` `assertPortable` (private; rejects `personal-execution`, `mcp-env`, `mcp-auth`, and any principal) | **not touched.** It is a different, wider rule than `isCopyableKind` (it lets `custom` and `api-connection` through), so merging the two would be a behaviour change. Owner question **Q-R13b-1** (report) |
| passphrase envelope, keyring, sealer, vault service | platform `secrets/*`, `credential-sets/vault.service.ts` | unchanged |
| owner-store schema | db `owner-store/` (migrations, DDL) | db also gets the 3 SQL reads over that schema |
| grants / revocations / recovery error / owner context | only in the preset | move to platform beside the decoder (new subpath, see step 2) |

So nothing gets a second owner: the decoder and reader move **next to** the owners they already call. The STOP's other finding ("no export to characterize") is answered by the pins in step 1, which pin what the code really does.

**Plan decision (the owner can veto it; no executor decides it):** keep the legacy import capability. Deleting it would be a behaviour change for any host that still has an old `owner.db`. Move its logic to its owners and leave the preset with only the file wiring. Rejected options: deleting it (behaviour change; Tovu's `owner-store import` command uses all of it); keeping it in the preset (the file holds validation, SQL and security policy, not wiring). `storage/legacy/sqlite.ts` (item 4 of revision 2) is **VOID**: no host imports it, so by the sheet's own rule it stays in the preset as wiring. Nothing is done to it and the frozen `sqlite` surface is unchanged.

### Prerequisites (in Jini, then in Tovu; each `ok` must print, the `rg` lines must print what is shown)
```bash
git merge-base --is-ancestor 4c1892368 HEAD && echo ok
rg -n "from ['\"]" packages/server/src/owner-store/backup.ts packages/server/src/owner-store/legacy.ts | wc -l   # 13
rg -n "^export " packages/server/src/owner-store/index.ts | wc -l                                               # 2
rg -ln "readLegacyOwner|countLegacyOwnerStore|OwnerStore(Backup|Recovery)Error|ownerContext|LegacyOwner" packages examples -g '!**/dist/**' -g '!**/node_modules/**' -g '!*.md' -g '!*CHANGELOG*'
# prints exactly 7 files: owner-store/{backup,legacy,index}.ts and __tests__/{backup.test,legacy.test,fixture,unit/legacy-empty-m2.unit.test}.ts
```
```bash
# in Tovu
git merge-base --is-ancestor ada11733f HEAD && echo ok
rg -ln "@jini-ai/server/owner-store" apps packages -g '!**/node_modules/**'
# prints exactly the 4 Tovu files listed above
```
A different list is a **STOP**: report the new importer and do not edit it.

### Step 1: characterization pins first (one Jini commit, tests only, S2)
The existing 53 tests were run against 16 mutations of the old code. Eleven of them turn red. Five survive, and those five are the pins to add:

| id | mutation (in the old file) | red today? | pin that turns it red |
|---|---|---|---|
| B1 | drop `\|\| !isCopyableKind[...]` in `assertEntryIdentity` | **no**: the existing "non-copyable kind" case uses `custom`, which `VAULT_KINDS` already rejects | backup: a v1 doc with an `mcp-env` entry (`meta: {}`) is `invalid-backup` |
| B2 | hints not stripped | yes (3) | — |
| B3 | unknown version accepted | yes (1) | — |
| B4 | passphrase failure swallowed | yes (1) | — |
| B5 | hint policy off | yes (7) | — |
| B6 | duplicate ids accepted | yes (1) | — |
| B7 | parse error not mapped to the fixed error | yes (1) | — |
| B8 | grants dropped | yes (1) | — |
| L1 | `allowFileAutoGenerate: true` | yes (1) | — |
| L2 | decrypt failure skipped instead of the recovery error | yes (2) | — |
| L3 | `authorize` allows everything | **no** | legacy: a store holding an `mcp-env` row in the owner workspace is an `OwnerStoreRecoveryError` |
| L4 | `owner_revocations` presence probe removed | yes (2) | — |
| L5 | `readLegacyOwnerStore` opens read-write | **no** | legacy: a recording `SqliteOpener` sees `{ readonly: true, fileMustExist: true }` for both readers |
| L6 | `countLegacyOwnerStore` opens read-write | **no** | same pin |
| L7 | `workspace_id = 'owner'` filter removed | **no** | legacy: a row put under `workspaceId: 'ws-other'` is not in `entries` |
| L8 | `ownerContext` drops `binding` | yes (1) | — |

The four pins are written and proven (GREEN on `4c1892368`, each RED under its mutation) in **`R13b-characterization-pins.test.ts.txt`**. The 16 mutations can be replayed with **`R13b-mutations.py.txt`** (both files sit next to this sheet). Fold the pins into `owner-store/__tests__/backup.test.ts` (B1) and `legacy.test.ts` (L3, L5-L7). The `putRaw` helper may join `fixture.ts`. Paste the green run and the five red runs into the report:
```bash
(cd packages/server && npx vitest run src/owner-store)            # 57 passed (53 on the base + 4 pins)
python3 -I <U>/sheets-2026-11-16/R13b-mutations.py.txt             # from the Jini root; every line shows "failed"
```
Security class (S15): secret decoding, key handling, read-only access. The producers of each invariant are the platform passphrase envelope (authentication), `isCopyableKind` (kind gate), the legacy keyring options (no key generation), the `authorize` callback (scope), and db `openSqliteFileKernel({ readOnly })` (no writes).

### Step 2: the move (one Jini commit + one paired Tovu commit, COMMON "Cross-repo pairs")
Tests first: the moved tests (below) are created at their new paths **before** the source and run RED (`Failed to load url ../legacy-owner.js` / the db functions missing). Then:

(a) **NEW `packages/platform/src/secrets/legacy-owner.ts`**, subpath `@jini-ai/platform/secrets/legacy-owner` (runtime `node`). Every name moves **verbatim with its comments**:
- all of `backup.ts`: `OwnerStoreBackupError`, `readLegacyOwnerBackup`, the 7 constants and the 9 private helpers;
- from `legacy.ts`: `OWNER_WORKSPACE_ID`, `ownerContext`, `OwnerStoreRecoveryError`, `LegacyOwnerDestination`, and `LegacyOwnerSnapshot`, whose `entries` become `VaultArchiveEntry[]` (`import type` from `./credential-sets/vault-archive.js`);
- `ownerVault`, exported as `openLegacyOwnerVault({ repo, keyFilePath }, options = {})`. The only change is that it receives a `repo: VaultRepoPort` (core) instead of building `SqlSecretsVaultRepo` from a kernel, because platform must not import db. The keyring options and the `authorize` body are **byte-identical**;
- `readEntry`, exported as `readLegacyOwnerEntry({ vault, row })` with `row: { id; kind; ownerKey; binding }` (camelCase: db maps the column). Its `catch { throw new OwnerStoreRecoveryError(); }` stays byte-identical, because the fixed error is the invariant that keeps key material out of diagnostics.
- Imports are platform-internal (`./passphrase-envelope.js`, `./keyring.env.js`, `./secret-sealer.aesgcm.js`, `./credential-sets/{vault.meta,vault.service,vault-archive}.js`) plus `@jini-ai/core/contracts/vault`. It must import **no** `@jini-ai/db` and no `kysely`. About 235 lines.
- `packages/platform/package.json`: `exports["./secrets/legacy-owner"]` (`types`/`import`/`default` → `./dist/secrets/legacy-owner.*`, same shape as `./secrets/credential-token`) and `jini.entries["./secrets/legacy-owner"] = "node"`. Also add a README row, a `knip.json` platform entry line next to `src/secrets/credential-token.ts`, and run `pnpm api:update` for `jini-ai__platform.json`.

(b) **`packages/db/src/owner-store/index.ts`**: the code goes **in the entry file** (no new `export … from` line, S3). Move `LegacyOwnerDatabase` and three SQL reads verbatim from `legacy.ts`:
- `countOwnerStoreRows({ kernel })`, the two counts;
- `listOwnerEntryRows({ kernel, workspaceId })`, the `secrets_vault` select mapped to `{ id, kind, ownerKey, binding }`. The preset passes `OWNER_WORKSPACE_ID`, because db cannot import platform;
- `listOwnerDestinations({ kernel, table })`, which is `destinations` with its "0001 step" comment.

Rewrite line 1 to: `Legacy owner database schema history and its read-only row queries; decryption lives in @jini-ai/platform/secrets/legacy-owner, the file wiring in @jini-ai/server/owner-store.` Then run `pnpm api:update` for `jini-ai__db.json`.

(c) **`packages/server/src/owner-store/index.ts`** replaces its 6 re-export lines with the wiring, about 40 lines:
- `LegacyOwnerStoreFile` and `LegacyOwnerCounts` (moved);
- `countLegacyOwnerStore(required, _options = {})`: opens the kernel read-only, runs the db count, closes in `finally`;
- `readLegacyOwnerStore(required, options = {})`: opens the kernel read-only, builds `SqlSecretsVaultRepo` (the cast keeps its "Kysely's DB generic is invariant" comment), calls `openLegacyOwnerVault`, loops `listOwnerEntryRows` through `readLegacyOwnerEntry`, reads both destination tables, and closes in `finally`.

The signatures and doc comments of both functions stay as they are, so Tovu's calls are unchanged. `git rm owner-store/backup.ts owner-store/legacy.ts`. `kysely` then has **no** import left in `packages/server/src` (verified: `legacy.ts:2` is the only one). In this same commit, delete server's `kysely` entries in `peerDependencies`, `peerDependenciesMeta` and `jini.optionalPeers`. Keep the `devDependencies` line, because `__tests__/fixture.ts` imports `sql`. Update `scripts/__tests__/optional-peer-contract.test.ts` if it pins that peer, then run `pnpm install`.

(d) **Tests.**
- `git mv owner-store/__tests__/backup.test.ts ../../platform/src/secrets/__tests__/legacy-owner-backup.test.ts`. Its imports change to `../legacy-owner.js` and `../passphrase-envelope.js`. Every case moves, including the B1 pin.
- The `ownerContext` case of `unit/legacy-empty-m2.unit.test.ts` moves to `platform/src/secrets/__tests__/legacy-owner.unit.test.ts`. That file also gets these cases:
  - `readLegacyOwnerEntry` with a **fake** `{ get }` (no `vi.mock`): `get` throws → `OwnerStoreRecoveryError`; `get` returns null → the same error; a summary maps to the 9 `VaultArchiveEntry` fields;
  - `openLegacyOwnerVault` over `InMemoryVaultRepo`: an `mcp-env` row or another workspace gets `VaultError` code `context` (L3 is now caught in the platform unit test too);
  - a missing key file is a recovery error and creates no file (L1).
- The `legacy.test.ts`, `fixture.ts` and m2 empty-store cases stay in server, as integration tests of the wiring over real SQLite. They import `../index.js`. The fixture's `ownerContext` comes from `@jini-ai/platform/secrets/legacy-owner`, and the L3/L5-L7 pins stay with them.
- New `packages/db/src/__tests__/owner-store-rows.unit.test.ts` over `openMemorySqliteKernel` + `ownerStoreDdl`: counts; owner-workspace filter (L7); destination order; a 0000 store with no `owner_revocations` returns `[]` (L4).
- Test count per package before and after in the report. The server count falls by exactly the cases that moved, and platform + db rise by at least that (S13).

(e) **Shared files in the same commit.**
- `scripts/error-gate-debt.json`: the `packages/server/src/owner-store/legacy.ts` / `catch-reads-error` / `1` row becomes `packages/platform/src/secrets/legacy-owner.ts` with the same rule and value, edited by hand. The catch moved verbatim; it is not new debt. `node scripts/check-error-gate.mjs --strict` must print no added or worsened entry.
- `.changeset/r13b-legacy-owner.md`: server **major** (names removed from `./owner-store`), platform minor (new subpath), db minor (new names).
- Rewrite the README "Legacy owner store" section of server and add one to platform; db README; `packages/server/docs/spec/api.spec.md` owner-store lines; the `CAPABILITIES.md` row if one names the owner store.

(f) **Tovu pair** (message: `Checked against Jini <sha>`; Tovu typechecked linked to that SHA):
- `owner-store.ts:11-12`: `countLegacyOwnerStore`, `readLegacyOwnerStore` stay on `@jini-ai/server/owner-store`. `OwnerStoreBackupError`, `OwnerStoreRecoveryError`, `readLegacyOwnerBackup` and `type LegacyOwnerSnapshot` come from `@jini-ai/platform/secrets/legacy-owner`.
- `owner-store-import.ts:2` and `owner-store-import.unit.test.ts:3`: `LegacyOwnerEntry` becomes `VaultArchiveEntry` from `@jini-ai/platform/secrets/credential-sets`, and `LegacyOwnerSnapshot` comes from the platform subpath.
- `owner-store.integration.test.ts:17`: `ownerContext` comes from the platform subpath.
- Run `rg -n "jini-ai/platform/secrets/credential-token" <Tovu> -g '!**/node_modules/**' -g '!cloud/**'`. If it prints an enumeration of platform subpaths, add the new one beside it.
- Gates: `npm run typecheck`, then `npx vitest run` on the 3 owner-store test files in `apps/website`.

### Step 3: what is checked
COMMON S1-S15 blocks, plus the blocks below. Every commit runs the **whole suite** of each touched package: `for p in platform db server; do npm --prefix packages/$p run test; done` (lesson 45). Base outputs are captured before step 1 and compared after each commit; only lines that went away are allowed (lessons 44, 46):
```bash
for c in guard check:hooks check:why-comments check:errors check:size check:complexity api:check; do pnpm $c > /tmp/base-$c.txt 2>&1; echo "$c exit $?"; done   # on BASE; rerun into /tmp/after-$c.txt and diff
node scripts/check-error-gate.mjs --strict    # after step 2: no added or worsened entry (the renamed legacy-owner row is the only change)
```
```bash
# the preset holds only wiring: no SQL text, no crypto, no validation helper left in server owner-store
rg -n "sql\`|openWithPassphrase|isCopyableKind|EnvOrFileKeyring|throw new OwnerStore" packages/server/src/owner-store -g '!**/__tests__/**'   # prints nothing
# platform imports no db and no kysely
rg -n "@jini-ai/db|from ['\"]kysely" packages/platform/src/secrets/legacy-owner.ts                                              # prints nothing
# one entry shape
rg -n "LegacyOwnerEntry" packages apps -g '!**/node_modules/**' -g '!**/dist/**' -g '!*CHANGELOG*'                               # prints nothing (both repos)
```
S3 note: `openLegacyOwnerVault` and `readLegacyOwnerEntry` are not forwarders, because each holds the moved body. The server functions are wiring that adapts a file path and an opener into a kernel and a repo.

### STOP (R13b)
- A prerequisite list differs (a new importer or a changed file).
- `VaultArchiveEntry` and the old `LegacyOwnerEntry` are no longer mutually assignable. Check with `tsc` before deleting the type: a one-line `satisfies` in the platform test both ways.
- A pin of step 1 is green under its mutation.
- `pnpm guard` reports a `platform → db` or `db → platform` edge.
- Any other file in platform `credential-sets` grows a legacy owner-store reader in the meantime (a second owner).

## R13c: small deletions
1. `packages/server/src/index.ts:94` `export { createFrontendControl } from '@jini-ai/daemon/http'` is a re-export shell (ruling (d)). Importers: `rg -n "createFrontendControl" apps packages examples` in both repos; each one that imports it from `@jini-ai/server` switches to `@jini-ai/daemon/http`. Pair if Tovu has one. The second `server/src/index.ts` daemon site (line 95 or near): read it; same rule.
2. `cli → platform` is a declared dependency with no import (G-STALE-DEPS row). `cli → sidecar` (`local-daemon-discovery.ts`) is an allowed preset edge: nothing to do.

## R13d: adapter audit (after N1, R8b, R10b-1, R11a, R11b-1..3)
OD-3 put the Node bindings in `@jini-ai/node-adapters`; nothing moves into the preset. This run checks the end state and fixes only what the commands below print.
1. **No domain package binds platform by default:** `node <U>/sheets-2026-11-16/scripts/census.mjs <jini> <U> /tmp/census && awk -F'\t' '$2=="platform" && $12=="work"' /tmp/census/CENSUS-sites.tsv` prints nothing. A row that is left belongs to the lane named in column 11: report it, do not fix another lane's file.
2. **The adapter package obeys its rule:** N1's commands (surface pin T3, the `rg` for service assembly and for lazy imports) all pass with the entries later lanes added (`./agent-plugins`, `./http`, `./agent-runtime`); `awk -F'\t' '$1=="node-adapters"' /tmp/census/CENSUS-sites.tsv` shows only class `allowed-adapter`.
3. **The preset uses the bindings, it does not re-declare them:** `rg -n "satisfies (FileLockPort|AtomicFileWriterPort|ProcessControlPort|GuardedHttpPort)" packages/server/src examples -g '!**/__tests__/**'` prints nothing (a hand-written binding outside the adapter package is replaced by the import, in this run, if the file is the preset's or an example's).
4. `packages/server/src/adapters/node-pty.ts` stays (native dependency; OD-8). `packages/server/src/__tests__/runtime-port-bindings.typecheck.ts` keeps one line per binding the preset passes, each `satisfies` the core port without a cast.
5. Docs: `packages/node-adapters/README.md` and `source-map.md` list every entry and where each file came from; `CAPABILITIES.md` row; DESIGN §7 Q8 gets a one-line "superseded by OD-3 (2026-11-16)" note.

## Tests to write first (R13c/d)
- R13c: a source-level export test for `@jini-ai/server` index that lists allowed exports; `createFrontendControl` absent (RED before the deletion).
- R13d: no new production code; the three commands of items 1–3 are the tests, pasted into the report.

## STOP
- R13b: see "STOP (R13b)" in its section (revision 4).
- R13d: item 1 or 2 prints a row.
