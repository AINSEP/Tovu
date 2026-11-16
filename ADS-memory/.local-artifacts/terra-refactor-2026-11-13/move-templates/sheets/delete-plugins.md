id: DL-plugins-1 .. DL-plugins-6   (template T-DELETE, forwarder form; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: delete-plugins.gen.md)
feature: website/features/plugins
kind_check: DELETE confirmed, in the `forwarder` form (KIND-SUSPECT fired on every file because each holds 1-4 one-line wrapper bodies). Every wrapper only calls the same-named export of `@jini-ai/db/data-modules` (packages/db/package.json:137 "./data-modules") with NO host value; five of them merely turn a positional `store` into `{ store }`. COMMON rule 19 (no forwarders) => delete all six files; importers import Jini directly and the positional callers (tests only) switch to the object form Jini already takes. No body moves, nothing is kept. Jini signatures read: snapshot.ts:38,100; disk-headroom.ts:32; migration-journal.ts:33,40,112,124; plugin-identity.ts:50; migration-recovery.ts:45,63; plugin-store.ts:46 (all `({…}, _optional = {})`; `recoverIncompleteDataModuleMigrations(required)` is passed through unchanged).
untangle_overlap: YES -> EXECUTE AFTER WAVE B MERGE. C3t.repoint.tsv:35 (`data-module.dialects.test.ts`, a different import line), C3t.repoint.tsv:288 (`open-site-content-db.integration.test.ts`, a different import line), C3.repoint.tsv:418 + C4.repoint.tsv:262 (`composition/deps.ts`, other lines). Those 3 files are guarded by TEXT (each OLD occurs exactly the stated number of times); every other file by blob.
blocked: no
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
Jini precondition (read-only): `rg -n "export (async )?function (checkDiskHeadroom|isIncompletePhase|ensureMigrationJournal|findIncompleteJournalEntries|journalEntryOf|recoverIncompleteDataModuleMigrations|restoreSqliteSnapshots|ensurePluginIdentityTable|pluginKernel|isInMemoryDbPath|discardCommittedSnapshot)\b" {JINI_CLONE}/packages/db/src/data-modules` prints 11 lines, and `rg -n "beginJournalEntry|stageJournalPhase|advanceJournalPhase|getPluginIdentity|checkNamespaceAdoption|snapshotDb|RecoveryResult|PluginKernel" {JINI_CLONE}/packages/db/src/data-modules/index.ts` shows each name reachable (direct or `export *`); else SKIP.

## Files deleted (tovu_file_after: delete for all six; moved_bodies: -; why_moves: -; baselines: - (rg over *.json/*.mjs/*.cjs/*.yml for each path: only `cloud/reports/extract-integ2-gates.json`, a run report naming the TEST file, not a baseline; leave it); comment_refs: -; path_literals: -; jini_commit: -)
| id | tovu_file | blob | non_reexport_statements | why_dead |
|---|---|---|---|---|
| DL-plugins-1 | apps/website/src/features/plugins/disk-headroom.ts | c4e82bd18509c471b1ab16e9ba2482c200c4cce9 | 1 | forwarder: checkDiskHeadroom only calls @jini-ai/db/data-modules checkDiskHeadroom with no host value |
| DL-plugins-2 | apps/website/src/features/plugins/migration-journal.ts | 3fc7a6e3df8476284b4c260a5c6ecf02150df9a6 | 4 | forwarder: isIncompletePhase, ensureMigrationJournal, findIncompleteJournalEntries, journalEntryOf only call the same @jini-ai/db/data-modules names (positional store -> { store }) |
| DL-plugins-3 | apps/website/src/features/plugins/migration-recovery.ts | 6bbd21f972d461a35dd533dc158819ff7ab36a23 | 2 | forwarder: recoverIncompleteDataModuleMigrations, restoreSqliteSnapshots |
| DL-plugins-4 | apps/website/src/features/plugins/plugin-identity.ts | 89d171f3c78d2fdfb511da1ce064e6b0730fac32 | 1 | forwarder: ensurePluginIdentityTable (positional store); 0 callers of it outside the file |
| DL-plugins-5 | apps/website/src/features/plugins/plugin-store.ts | bb94d43fccee1e9ff9485d405358e4c2f775c3da | 1 | forwarder: pluginKernel (positional store) |
| DL-plugins-6 | apps/website/src/features/plugins/snapshot.ts | cde2ca7c257b3b76b72071d7008f308cda0a76ab | 2 | forwarder: isInMemoryDbPath, discardCommittedSnapshot |

census (python3 scripts/census.py {TOVU_CLONE} <file>; 19 hits total, must match exactly):
  disk-headroom.ts (1): plugins/__tests__/disk-headroom.test.ts:12 static "../disk-headroom.js"
  migration-journal.ts (6): composition/__tests__/open-site-content-db.integration.test.ts:10 static "#src/features/plugins/migration-journal"; plugins/__tests__/data-module.dialects.test.ts:11 static; migration-journal.test.ts:10 static; migration-recovery.test.ts:11 static, :14 static, :169 dynamic `const { advanceJournalPhase } = await import("../migration-journal.js");`
  migration-recovery.ts (4): composition/open-site-content-db.ts:1 static "#src/features/plugins/migration-recovery"; migration-recovery.test.ts:15 static; data-module.test.ts:336 dynamic, :581 dynamic
  plugin-identity.ts (2): data-module.dialects.test.ts:12 static; plugin-identity.test.ts:10 static
  plugin-store.ts (1): data-module.test.ts:23 static
  snapshot.ts (5): composition/deps.ts:194 static "#src/features/plugins/snapshot"; composition/__tests__/open-site-content-db.integration.test.ts:11 static; server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts:16 static; snapshot.test.ts:11 static; migration-recovery.test.ts:16 static
reach_check:
  - rg -n --no-heading -e "features/plugins/(disk-headroom|migration-journal|migration-recovery|plugin-identity|plugin-store|snapshot)" -e "\.\./(disk-headroom|migration-journal|migration-recovery|plugin-identity|plugin-store|snapshot)\.js" apps content development .github package.json --glob '!**/node_modules/**'  -> before: exactly the 19 census lines. After: nothing.

importers (replace ONLY the specifier string on each line; every name keeps its spelling; no lint rule forbids a second import of `@jini-ai/db/data-modules` in the same file (eslint.config.mjs has no import/no-duplicates), so do not merge):
  - "../disk-headroom.js", "../migration-journal.js", "../migration-recovery.js", "../plugin-identity.js", "../plugin-store.js", "../snapshot.js" -> "@jini-ai/db/data-modules" on every census line in apps/website/src/features/plugins/__tests__/ (14 lines, the 3 dynamic `await import("…")` included)
  - "#src/features/plugins/migration-journal", "#src/features/plugins/migration-recovery", "#src/features/plugins/snapshot" -> "@jini-ai/db/data-modules" on composition/open-site-content-db.ts:1, composition/deps.ts:194 (TEXT: `import { isInMemoryDbPath } from "#src/features/plugins/snapshot";` exactly once), open-site-content-db.integration.test.ts:10,11, create-sqlite-route-deps-for-workspace.integration.test.ts:16 (5 lines)
  Names imported (all exported by Jini under the same spelling): checkDiskHeadroom; beginJournalEntry, ensureMigrationJournal, findIncompleteJournalEntries, advanceJournalPhase, stageJournalPhase; recoverIncompleteDataModuleMigrations, restoreSqliteSnapshots, type RecoveryResult; checkNamespaceAdoption, getPluginIdentity; pluginKernel, type PluginKernel; isInMemoryDbPath, discardCommittedSnapshot, snapshotDb.

folds (positional -> object call shape; tests only; exact text, replace ALL occurrences in the named file, counts must match before editing):
  - plugins/__tests__/migration-journal.test.ts | blob a3e3729a28618cdab409155572d78249d5181811:
      "ensureMigrationJournal(contentKernel({ store: db }))" x4 -> "ensureMigrationJournal({ store: contentKernel({ store: db }) })"
      "findIncompleteJournalEntries(contentKernel({ store: db }))" x6 -> "findIncompleteJournalEntries({ store: contentKernel({ store: db }) })"
  - plugins/__tests__/migration-recovery.test.ts | blob e140fd24324432092f1bee31b7a35242c75de9ce:
      "ensureMigrationJournal(contentKernel({ store: db }))" x5 -> "ensureMigrationJournal({ store: contentKernel({ store: db }) })"
      "ensureMigrationJournal(kernel)" x1 -> "ensureMigrationJournal({ store: kernel })"
      "findIncompleteJournalEntries(contentKernel({ store: db }))" x1 -> "findIncompleteJournalEntries({ store: contentKernel({ store: db }) })"
      "findIncompleteJournalEntries(contentKernel({ store: restored }))" x1 -> "findIncompleteJournalEntries({ store: contentKernel({ store: restored }) })"
      "findIncompleteJournalEntries(contentKernel({ store: reopened }))" x1 -> "findIncompleteJournalEntries({ store: contentKernel({ store: reopened }) })"
      "findIncompleteJournalEntries(kernel)" x1 -> "findIncompleteJournalEntries({ store: kernel })"
  - plugins/__tests__/data-module.dialects.test.ts (TEXT-guarded: C3t:35):
      "ensureMigrationJournal(kernel)" x2 -> "ensureMigrationJournal({ store: kernel })"
      "findIncompleteJournalEntries(kernel)" x2 -> "findIncompleteJournalEntries({ store: kernel })"
  - plugins/__tests__/data-module.test.ts | blob b733575527c28107aedd1012129a049cd060bdbd:
      "pluginKernel(contentKernel({ store: db }))" x3 -> "pluginKernel({ store: contentKernel({ store: db }) })"
  - composition/__tests__/open-site-content-db.integration.test.ts (TEXT-guarded: C3t:288):
      "ensureMigrationJournal(contentKernel({ store: raw }))" x1 -> "ensureMigrationJournal({ store: contentKernel({ store: raw }) })"
  Every other call of a forwarded name already passes an object (checkDiskHeadroom({ dbPath }), isInMemoryDbPath({ dbPath }), discardCommittedSnapshot({ snapshotPath }), restoreSqliteSnapshots({ dbPath, entries }), recoverIncompleteDataModuleMigrations({ … }), the journal-phase functions) and is unchanged. Check after: `rg -n "\b(ensureMigrationJournal|findIncompleteJournalEntries|pluginKernel|ensurePluginIdentityTable|journalEntryOf)\((?!\{)" -P apps/website/src` prints nothing.
tests (all stay; assertions untouched; only import specifiers and the call shapes above change):
  - plugins/__tests__/disk-headroom.test.ts | blob 3ec7c8df8035f82688df7d7bbdd67d644db77c05 | repoint import to @jini-ai/db/data-modules
  - plugins/__tests__/data-module.dialects.test.ts | text-guarded | repoint (2 lines) + folds
  - plugins/__tests__/migration-journal.test.ts | blob a3e3729a… | repoint + folds
  - plugins/__tests__/migration-recovery.test.ts | blob e140fd24… | repoint (5 lines: :11, :14, :15, :16 and the dynamic import at :169) + folds
  - plugins/__tests__/data-module.test.ts | blob b7335755… | repoint (:23 and the 2 dynamic imports) + folds
  - plugins/__tests__/plugin-identity.test.ts | blob 7f2e9b8360dd7cdfd4de00a5eca13d0fc64375e1 | repoint
  - plugins/__tests__/snapshot.test.ts | blob 81f9f8318cb729206a108e8efcb5e77b9319df6d | repoint
  - composition/__tests__/open-site-content-db.integration.test.ts | text-guarded | repoint (2 lines) + fold
  - server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts | blob bad272d42660aba127aafdb9f8e63172c1409630 | repoint
  (prod: composition/open-site-content-db.ts | blob b9ef12832d097c0e62994fee3514d1829218d545 | repoint line 1; composition/deps.ts | text-guarded | repoint line 194.)
relocations: -
untangle_followup: -
tovu_msg: "refactor(plugins): drop the data-modules forwarders; import @jini-ai/db/data-modules directly"
Commit paths (17): 6 deleted files + 9 test files + open-site-content-db.ts + deps.ts.
Cloud run owes: Tovu typecheck; the 9 tests above (they now exercise Jini directly). No RED test, no behaviour change (each wrapper was a pure forwarder).
est_executor_tokens: ~50k Sonnet (11 edited files, 38 mechanical replacements)
