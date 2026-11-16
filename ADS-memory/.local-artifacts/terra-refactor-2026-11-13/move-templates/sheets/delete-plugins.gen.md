id: DL-plugins-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/features/plugins
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (checkDiskHeadroom); likely DEDUPE/reduce-to-binding or a fold with moved bodies
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (isIncompletePhase, ensureMigrationJournal, findIncompleteJournalEntries, journalEntryOf); likely DEDUPE/reduce-to-binding or a fold with moved bodies
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (recoverIncompleteDataModuleMigrations, restoreSqliteSnapshots); likely DEDUPE/reduce-to-binding or a fold with moved bodies
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (ensurePluginIdentityTable); likely DEDUPE/reduce-to-binding or a fold with moved bodies
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (pluginKernel); likely DEDUPE/reduce-to-binding or a fold with moved bodies
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (isInMemoryDbPath, discardCommittedSnapshot); likely DEDUPE/reduce-to-binding or a fold with moved bodies
tovu_file: apps/website/src/features/plugins/disk-headroom.ts | blob c4e82bd18509c471b1ab16e9ba2482c200c4cce9
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "disk-headroom" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/plugins/disk-headroom.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*disk\-headroom(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/plugins/disk-headroom.ts
importers (0 prod, 1 test; resolved to this file):
  - apps/website/src/features/plugins/__tests__/disk-headroom.test.ts:12 | static | "../disk-headroom.js"
path_literals (rg -F "plugins/disk-headroom", not already importers):
  - -
baselines (json files naming the path): -
declarations (name | line | kind):
  - checkDiskHeadroom | apps/website/src/features/plugins/disk-headroom.ts:4 | function
  - HeadroomCheck | apps/website/src/features/plugins/disk-headroom.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
folds: TODO(judge)
tests:
  - apps/website/src/features/plugins/__tests__/disk-headroom.test.ts | blob 3ec7c8df8035f82688df7d7bbdd67d644db77c05 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
tovu_file: apps/website/src/features/plugins/migration-journal.ts | blob 3fc7a6e3df8476284b4c260a5c6ecf02150df9a6
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "migration-journal" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/plugins/migration-journal.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*migration\-journal(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/plugins/migration-journal.ts
importers (0 prod, 4 test; resolved to this file):
  - apps/website/src/features/plugins/__tests__/data-module.dialects.test.ts:11 | static | "../migration-journal.js"
  - apps/website/src/features/plugins/__tests__/migration-journal.test.ts:10 | static | "../migration-journal.js"
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts:11 | static | "../migration-journal.js"
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts:14 | static | "../migration-journal.js"
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts:169 | dynamic | "../migration-journal.js"
  - apps/website/src/server/runtime/composition/__tests__/open-site-content-db.integration.test.ts:10 | static | "#src/features/plugins/migration-journal"
path_literals (rg -F "plugins/migration-journal", not already importers):
  - -
baselines (json files naming the path): -
declarations (name | line | kind):
  - isIncompletePhase | apps/website/src/features/plugins/migration-journal.ts:8 | function
  - ensureMigrationJournal | apps/website/src/features/plugins/migration-journal.ts:9 | function
  - findIncompleteJournalEntries | apps/website/src/features/plugins/migration-journal.ts:10 | function
  - journalEntryOf | apps/website/src/features/plugins/migration-journal.ts:11 | function
  - beginJournalEntry | apps/website/src/features/plugins/migration-journal.ts:6 | re-export from "@jini-ai/db/data-modules"
  - stageJournalPhase | apps/website/src/features/plugins/migration-journal.ts:6 | re-export from "@jini-ai/db/data-modules"
  - advanceJournalPhase | apps/website/src/features/plugins/migration-journal.ts:6 | re-export from "@jini-ai/db/data-modules"
  - JournalPhase | apps/website/src/features/plugins/migration-journal.ts:6 | re-export (type) from "@jini-ai/db/data-modules"
  - JournalEntry | apps/website/src/features/plugins/migration-journal.ts:6 | re-export (type) from "@jini-ai/db/data-modules"
folds: TODO(judge)
tests:
  - apps/website/src/features/plugins/__tests__/data-module.dialects.test.ts | blob 9bad254cddfb3e6e6920a05dcf76e9f900875515 | TODO(judge) delete|repoint
  - apps/website/src/features/plugins/__tests__/migration-journal.test.ts | blob a3e3729a28618cdab409155572d78249d5181811 | TODO(judge) delete|repoint
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts | blob e140fd24324432092f1bee31b7a35242c75de9ce | TODO(judge) delete|repoint
  - apps/website/src/server/runtime/composition/__tests__/open-site-content-db.integration.test.ts | blob 18c95281ad476c230026f190ef4a2a45b5fc16ea | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
tovu_file: apps/website/src/features/plugins/migration-recovery.ts | blob 6bbd21f972d461a35dd533dc158819ff7ab36a23
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "migration-recovery" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/plugins/migration-recovery.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*migration\-recovery(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/plugins/migration-recovery.ts
importers (1 prod, 2 test; resolved to this file):
  - apps/website/src/features/plugins/__tests__/data-module.test.ts:336 | dynamic | "../migration-recovery.js"
  - apps/website/src/features/plugins/__tests__/data-module.test.ts:581 | dynamic | "../migration-recovery.js"
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts:15 | static | "../migration-recovery.js"
  - apps/website/src/server/runtime/composition/open-site-content-db.ts:1 | static | "#src/features/plugins/migration-recovery"
path_literals (rg -F "plugins/migration-recovery", not already importers):
  - apps/website/src/platform/db/client/__tests__/open-site-db-client.unit.test.ts:33:  { label: "features/plugins/migration-recovery", test: (rel) => rel.startsWith("features/plugins/migration-recovery")
baselines (json files naming the path): -
declarations (name | line | kind):
  - recoverIncompleteDataModuleMigrations | apps/website/src/features/plugins/migration-recovery.ts:4 | function
  - restoreSqliteSnapshots | apps/website/src/features/plugins/migration-recovery.ts:5 | function
  - RecoveryResult | apps/website/src/features/plugins/migration-recovery.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
folds: TODO(judge)
tests:
  - apps/website/src/features/plugins/__tests__/data-module.test.ts | blob b733575527c28107aedd1012129a049cd060bdbd | TODO(judge) delete|repoint
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts | blob e140fd24324432092f1bee31b7a35242c75de9ce | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
tovu_file: apps/website/src/features/plugins/plugin-identity.ts | blob 89d171f3c78d2fdfb511da1ce064e6b0730fac32
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "plugin-identity" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/plugins/plugin-identity.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*plugin\-identity(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/plugins/plugin-identity.ts
importers (0 prod, 2 test; resolved to this file):
  - apps/website/src/features/plugins/__tests__/data-module.dialects.test.ts:12 | static | "../plugin-identity.js"
  - apps/website/src/features/plugins/__tests__/plugin-identity.test.ts:10 | static | "../plugin-identity.js"
path_literals (rg -F "plugins/plugin-identity", not already importers):
  - apps/website/src/platform/site-dir/__tests__/integration/duplicate-content-db.integration.test.ts:207: *   and `features/plugins/plugin-identity.ts`. Installed on every site that has ever installed a
baselines (json files naming the path): -
declarations (name | line | kind):
  - ensurePluginIdentityTable | apps/website/src/features/plugins/plugin-identity.ts:4 | function
  - getPluginIdentity | apps/website/src/features/plugins/plugin-identity.ts:2 | re-export from "@jini-ai/db/data-modules"
  - checkNamespaceAdoption | apps/website/src/features/plugins/plugin-identity.ts:2 | re-export from "@jini-ai/db/data-modules"
  - PluginProvenance | apps/website/src/features/plugins/plugin-identity.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
  - PluginIdentityRecord | apps/website/src/features/plugins/plugin-identity.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
  - NamespaceAdoptionDecision | apps/website/src/features/plugins/plugin-identity.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
folds: TODO(judge)
tests:
  - apps/website/src/features/plugins/__tests__/data-module.dialects.test.ts | blob 9bad254cddfb3e6e6920a05dcf76e9f900875515 | TODO(judge) delete|repoint
  - apps/website/src/features/plugins/__tests__/plugin-identity.test.ts | blob 7f2e9b8360dd7cdfd4de00a5eca13d0fc64375e1 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
tovu_file: apps/website/src/features/plugins/plugin-store.ts | blob bb94d43fccee1e9ff9485d405358e4c2f775c3da
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "plugin-store" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/plugins/plugin-store.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*plugin\-store(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/plugins/plugin-store.ts
importers (0 prod, 1 test; resolved to this file):
  - apps/website/src/features/plugins/__tests__/data-module.test.ts:23 | static | "../plugin-store.js"
path_literals (rg -F "plugins/plugin-store", not already importers):
  - -
baselines (json files naming the path): -
declarations (name | line | kind):
  - pluginKernel | apps/website/src/features/plugins/plugin-store.ts:4 | function
  - PluginStore | apps/website/src/features/plugins/plugin-store.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
  - PluginCoreTables | apps/website/src/features/plugins/plugin-store.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
  - PluginKernel | apps/website/src/features/plugins/plugin-store.ts:2 | re-export (type) from "@jini-ai/db/data-modules"
folds: TODO(judge)
tests:
  - apps/website/src/features/plugins/__tests__/data-module.test.ts | blob b733575527c28107aedd1012129a049cd060bdbd | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
tovu_file: apps/website/src/features/plugins/snapshot.ts | blob cde2ca7c257b3b76b72071d7008f308cda0a76ab
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "snapshot" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/plugins/snapshot.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*snapshot(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/plugins/snapshot.ts
importers (1 prod, 4 test; resolved to this file):
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts:16 | static | "../snapshot.js"
  - apps/website/src/features/plugins/__tests__/snapshot.test.ts:11 | static | "../snapshot.js"
  - apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts:16 | static | "#src/features/plugins/snapshot"
  - apps/website/src/server/runtime/composition/__tests__/open-site-content-db.integration.test.ts:11 | static | "#src/features/plugins/snapshot"
  - apps/website/src/server/runtime/composition/deps.ts:194 | static | "#src/features/plugins/snapshot"
path_literals (rg -F "plugins/snapshot", not already importers):
  - -
baselines (json files naming the path): -
declarations (name | line | kind):
  - isInMemoryDbPath | apps/website/src/features/plugins/snapshot.ts:4 | function
  - discardCommittedSnapshot | apps/website/src/features/plugins/snapshot.ts:5 | function
  - snapshotDb | apps/website/src/features/plugins/snapshot.ts:2 | re-export from "@jini-ai/db/data-modules"
folds: TODO(judge)
tests:
  - apps/website/src/features/plugins/__tests__/migration-recovery.test.ts | blob e140fd24324432092f1bee31b7a35242c75de9ce | TODO(judge) delete|repoint
  - apps/website/src/features/plugins/__tests__/snapshot.test.ts | blob 81f9f8318cb729206a108e8efcb5e77b9319df6d | TODO(judge) delete|repoint
  - apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts | blob bad272d42660aba127aafdb9f8e63172c1409630 | TODO(judge) delete|repoint
  - apps/website/src/server/runtime/composition/__tests__/open-site-content-db.integration.test.ts | blob 18c95281ad476c230026f190ef4a2a45b5fc16ea | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
