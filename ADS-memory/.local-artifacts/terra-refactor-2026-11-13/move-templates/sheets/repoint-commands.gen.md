id: RP-commands-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/contracts/core/commands
tovu_file: apps/website/src/contracts/core/commands/repo.memory.ts | blob c48abc60cc5a19a4bf5147de7c9f7185412485c7
symbol_map:
  - InMemoryChangeSetRepo -> @jini-ai/cms/core/commands | packages/cms/package.json:66 has exports key ./core/commands
jini_why: TODO(judge)   # pointer only | already on Jini declaration | MOVE {comment} -> {jini file}
comments_in_file: 0 code-free comment line(s) to preserve
census_cmd: rg -n --no-heading -e '["'][^"']*repo\.memory(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/core/commands/repo.memory.ts
importers (0 prod, 7 test; resolved to this file):
  - apps/website/src/contracts/core/commands/__tests__/authorize-gateway.test.ts:11 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/command-atomicity.test.ts:15 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts:5 | static | "../../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/repo.contract.test.ts:8 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/repo.memory.unit.test.ts:4 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts:14 | static | "../repo.memory.js"
  - apps/website/src/features/post/__tests__/reverters.schedule-events.test.ts:6 | static | "#src/contracts/core/commands/repo.memory"
path_literals (rg -F "commands/repo.memory", not already importers):
  - development/scripts/coverage-integrity-baseline.json:28:    "src/contracts/core/commands/repo.memory.ts",
  - development/refactor-patterns/dedupe/dedupe-08.terra-prompt.md:77:In core/commands/repo.memory.ts `save`, media/repo.memory.ts rendition `save(record: AssetRenditionRecord)` and blob-gc `save(entry: B
  - apps/website/src/platform/db/repos/change-set-repo.ts:19: * `core/commands/repo.memory.ts`'s `InMemoryChangeSetRepo` is the first.
  - apps/website/src/server/__tests__/identity-routes.test.ts:305:  // `listByWorkspace` sorts newest-first (see `core/commands/repo.memory.ts`).
baselines (json files naming the path): -
comment_refs: TODO(judge)
tovu_file: apps/website/src/contracts/core/commands/revert.ts | blob 34976dc5afe915dd48d4c4642d782dead5afe59d
symbol_map:
  - * -> @jini-ai/cms/core/commands | packages/cms/package.json:66 has exports key ./core/commands
jini_why: TODO(judge)   # pointer only | already on Jini declaration | MOVE {comment} -> {jini file}
comments_in_file: 0 code-free comment line(s) to preserve
census_cmd: rg -n --no-heading -e '["'][^"']*revert(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/core/commands/revert.ts
importers (0 prod, 1 test; resolved to this file):
  - apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts:12 | static | "../revert.js"
path_literals (rg -F "commands/revert", not already importers):
  - apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts:13: * @file `core/commands/revert.ts` × the post `update` reverter — SPEC-005 BR-08, AC-17.
  - development/open-bugs.md:9:Jini `packages/cms/src/core/commands/revert.ts` (public entry `@jini-ai/cms/core/commands`); Tovu's
  - development/open-bugs.md:10:`apps/website/src/contracts/core/commands/revert.ts` is a re-export.
  - development/scripts/coverage-integrity-baseline.json:29:    "src/contracts/core/commands/revert.ts",
  - development/scripts/write-path-inventory.baseline.json:148:    "file": "src/contracts/core/commands/revert.ts",
  - development/scripts/write-path-inventory.baseline.json:157:    "file": "src/contracts/core/commands/revert.ts",
  - development/scripts/check-coverage-integrity.ts:88: * different from a real logic-bearing file (`apps/website/src/contracts/core/commands/revert.ts`,
  - apps/website/src/features/change-sets/agent-tools.ts:20: * `change_sets_revert` never accepts `force` — see `contracts/core/commands/revert.ts`'s own
  - apps/website/src/features/post/reverters.ts:21: * The concrete `post/update` and `post/delete` inverse appliers `core/commands/revert.ts`'s
  - apps/website/src/features/navigation/reverters.ts:12: * `menu/update` inverse applier `core/commands/revert.ts`'s generic `RevertRegistry` dispatches to,
  - apps/website/src/features/navigation/reverters.ts:42: * `revertChangeSet` (`contracts/core/commands/revert.ts`) already re-reads {@link currentVersion} and
baselines (json files naming the path): -
comment_refs: TODO(judge)
