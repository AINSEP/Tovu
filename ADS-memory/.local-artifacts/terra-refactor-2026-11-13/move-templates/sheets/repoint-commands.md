id: RP-commands-1, RP-commands-2   (template T-REPOINT; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: repoint-commands.gen.md)
feature: website/contracts/core/commands
kind_check: REPOINT confirmed. Both files are one-line re-exports of `@jini-ai/cms/core/commands` (non_reexport_statements 0 each). The folder's other two files (`index.ts`, `appliers.ts`) are NOT in this feature and stay untouched (`appliers.ts` holds the host `createRevertRegistry()` binding; `index.ts` is the guarded barrel named in `.dependency-cruiser.mjs:382`).
untangle_overlap: YES -> EXECUTE AFTER WAVE B MERGE. C3.repoint.tsv rows 277, 278, 280, 281, 282, 283, 334 (the 6 commands `__tests__` files + `features/post/__tests__/reverters.schedule-events.test.ts`) and 299 (`platform/db/repos/change-set-repo.ts`), 318 (`features/post/reverters.ts`), 360 (`features/navigation/reverters.ts`) edit OTHER import lines of the same files (`@jini-ai/cms/core` -> `@jini-ai/core/contracts/events`). They never touch `InMemoryChangeSetRepo` or the `revert.js` names. Because C3 changes those files' blobs, every file below except the two shims is guarded BY EXACT TEXT (each OLD must occur exactly once), not by blob.
blocked: no
paths (sheet written on the Mac): TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

## Row RP-commands-1
tovu_file: apps/website/src/contracts/core/commands/repo.memory.ts | blob c48abc60cc5a19a4bf5147de7c9f7185412485c7
non_reexport_statements: 0   (whole file: `export { InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";`)
symbol_map:
  - InMemoryChangeSetRepo -> @jini-ai/cms/core/commands   # packages/cms/package.json:66 "./core/commands"; packages/cms/src/core/commands/index.ts:11 `export { InMemoryChangeSetRepo } from "./repo.memory.js";`
jini_why: pointer only   (the shim has no comment; nothing to move)
importers:                                 # python3 scripts/census.py {TOVU_CLONE} apps/website/src/contracts/core/commands/repo.memory.ts  -> 7 hits
  - apps/website/src/features/post/__tests__/reverters.schedule-events.test.ts:6 | static | "#src/contracts/core/commands/repo.memory"
  - apps/website/src/contracts/core/commands/__tests__/repo.contract.test.ts:8 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts:14 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/repo.memory.unit.test.ts:4 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/authorize-gateway.test.ts:11 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/command-atomicity.test.ts:15 | static | "../repo.memory.js"
  - apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts:5 | static | "../../repo.memory.js"
  (line numbers are at b28d38c6; after wave B they may shift by the C3 edits. Match by TEXT: each file below contains its OLD line exactly once.)
importer_edits (exact text, once per file):
  - features/post/__tests__/reverters.schedule-events.test.ts: `import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/repo.memory";` -> `import { InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";`
  - the 5 files in contracts/core/commands/__tests__/ (repo.contract, revert.unit, repo.memory.unit, authorize-gateway, command-atomicity): `import { InMemoryChangeSetRepo } from "../repo.memory.js";` -> `import { InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";`
  - __tests__/integration/revert-plugin-ext.integration.test.ts: `import { InMemoryChangeSetRepo } from "../../repo.memory.js";` -> `import { InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";`
  Do not merge with any existing `@jini-ai/cms/core/commands` import in the same file (T-REPOINT step 4). If eslint then reports `import/no-duplicates` or `import/order` on the edited line, that is a literal consequence: merge the named import into the existing `@jini-ai/cms/core/commands` import of that file (keep `type` modifiers) and record it.
comment_refs:                              # live paths to repo.memory.ts
  - apps/website/src/platform/db/repos/change-set-repo.ts | " * `core/commands/repo.memory.ts`'s `InMemoryChangeSetRepo` is the first." -> " * Jini `@jini-ai/cms/core/commands`'s `InMemoryChangeSetRepo` is the first."
  - apps/website/src/server/__tests__/identity-routes.test.ts | "  // `listByWorkspace` sorts newest-first (see `core/commands/repo.memory.ts`)." -> "  // `listByWorkspace` sorts newest-first (see Jini `InMemoryChangeSetRepo`, `@jini-ai/cms/core/commands`)."
  (development/refactor-patterns/dedupe/dedupe-08.terra-prompt.md:77 is a history doc: leave it.)
baselines:
  - development/scripts/coverage-integrity-baseline.json | blob 81a29497f1c2b3a4bfa55d4bf54ec407bcec9c59: remove the line `    "src/contracts/core/commands/repo.memory.ts",` (exactly once; it sits inside `knownContaminated`, not last in the array, so no comma fix-up)

## Row RP-commands-2
tovu_file: apps/website/src/contracts/core/commands/revert.ts | blob 34976dc5afe915dd48d4c4642d782dead5afe59d
non_reexport_statements: 0   (whole file: `export * from "@jini-ai/cms/core/commands";`)
symbol_map:                                # the one importer uses these names; all are exported by packages/cms/src/core/commands/revert.ts (34,35,36,43,50,76,105) and re-exported by core/commands/index.ts:10 `export * from "./revert.js";`
  - revertChangeSet, ChangeSetNotFoundError, ChangeSetInvalidStatusError, RevertNotPossibleError, RevertConflictError, RevertForbiddenError, type RevertChangeSetDeps -> @jini-ai/cms/core/commands
jini_why: pointer only
importers:                                 # census.py on revert.ts -> 1 hit
  - apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts:12 | static | "../revert.js"   (closing line of the multi-line import that starts at line 4)
importer_edits:
  - __tests__/revert.unit.test.ts: `} from "../revert.js";` -> `} from "@jini-ai/cms/core/commands";`  (exactly once)
comment_refs:                              # live paths to revert.ts; each OLD text occurs once in its file
  - apps/website/src/features/change-sets/agent-tools.ts | " * `change_sets_revert` never accepts `force` — see `contracts/core/commands/revert.ts`'s own" -> " * `change_sets_revert` never accepts `force` — see Jini `@jini-ai/cms/core/commands` `revert.ts`'s own"
  - apps/website/src/features/post/reverters.ts | " * The concrete `post/update` and `post/delete` inverse appliers `core/commands/revert.ts`'s" -> " * The concrete `post/update` and `post/delete` inverse appliers Jini `cms/core/commands/revert.ts`'s"
  - apps/website/src/features/navigation/reverters.ts | " * `menu/update` inverse applier `core/commands/revert.ts`'s generic `RevertRegistry` dispatches to," -> " * `menu/update` inverse applier Jini `cms/core/commands/revert.ts`'s generic `RevertRegistry` dispatches to,"
  - apps/website/src/features/navigation/reverters.ts | " * `revertChangeSet` (`contracts/core/commands/revert.ts`) already re-reads {@link currentVersion} and" -> " * `revertChangeSet` (`@jini-ai/cms/core/commands`) already re-reads {@link currentVersion} and"
  - apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts | " * @file `core/commands/revert.ts` × the post `update` reverter — SPEC-005 BR-08, AC-17." -> " * @file Jini `cms/core/commands/revert.ts` × the post `update` reverter — SPEC-005 BR-08, AC-17."
  - development/open-bugs.md | blob 05ee0e5f952412cbb9962ad46dd8e5afd1500453 | "Jini `packages/cms/src/core/commands/revert.ts` (public entry `@jini-ai/cms/core/commands`); Tovu's\n`apps/website/src/contracts/core/commands/revert.ts` is a re-export." -> "Jini `packages/cms/src/core/commands/revert.ts` (public entry `@jini-ai/cms/core/commands`); Tovu\nimports it directly." (two lines -> two lines)
  - development/scripts/check-coverage-integrity.ts | blob 7667dec55c36dfd0a5ac605d7e650088d7f94a09 | the two lines " * different from a real logic-bearing file (`apps/website/src/contracts/core/commands/revert.ts`,\n * `.../platform/export/route-manifest.ts`) that happens to ALSO show wrapper names -- there, the" -> " * different from a real logic-bearing file (`apps/website/src/platform/export/route-manifest.ts`)\n * that happens to ALSO show wrapper names -- there, the"  (the example file is deleted; the remaining example still exists)
baselines:
  - development/scripts/coverage-integrity-baseline.json: remove the line `    "src/contracts/core/commands/revert.ts",` (exactly once; not last in the array)
  - development/scripts/write-path-inventory.baseline.json | blob 4013829dc6f0a7ba3c2be10b945b3b0c5b094237: remove the TWO objects whose `"file": "src/contracts/core/commands/revert.ts"` (today lines 143-150 `ChangeSetRepoPort.save` line 131 and 152-159 `OutboxPort.enqueue` line 144), each `  {` ... `  },` block whole. Both rows are ALREADY stale (revert.ts has been a one-line re-export since the cms move; the inventory cannot find line 131/144 there), so removing them only stops the `--check` "disappeared" report for them. After the edit run `node -e 'JSON.parse(require("fs").readFileSync("development/scripts/write-path-inventory.baseline.json","utf8"))'` (must not throw).
  Baseline search (T-REPOINT step 4) with the repo-relative path prints nothing because these ledgers store app-relative `src/...` paths; the rows above come from `rg -n -F "src/contracts/core/commands/revert" -g '*.json'` and must be the only hits, else SKIP.

## Order of work (one job, both rows)
1. Branch rule; blob checks of the two shims, coverage-integrity-baseline.json, write-path-inventory.baseline.json, check-coverage-integrity.ts, open-bugs.md; precondition: `rg -n "InMemoryChangeSetRepo|revertChangeSet" {JINI_CLONE}/packages/cms/src/core/commands/index.ts {JINI_CLONE}/packages/cms/src/core/commands/revert.ts` shows index.ts:11 and revert.ts:105.
2. Census both shims (output must equal the lists above, line numbers may differ after wave B; specifiers must not).
3. importer_edits, comment_refs, baselines.
4. `git rm -q -- apps/website/src/contracts/core/commands/repo.memory.ts apps/website/src/contracts/core/commands/revert.ts`; re-run both censuses: 0 hits. `rg -n -F "commands/repo.memory" apps development -g '!**/node_modules/**' -g '!development/refactor-patterns/**'` and the same for `commands/revert.ts` print nothing.
5. eslint the 13 edited .ts files. One Tovu commit, no Jini commit:
tovu_msg: "refactor(commands): import InMemoryChangeSetRepo and revert from @jini-ai/cms directly"
paths: the 2 deleted shims, 7 importer test files, change-set-repo.ts, identity-routes.test.ts, change-sets/agent-tools.ts, post/reverters.ts, navigation/reverters.ts, coverage-integrity-baseline.json, write-path-inventory.baseline.json, check-coverage-integrity.ts, development/open-bugs.md (18 paths)
Cloud run owes: Tovu typecheck; the 7 repointed tests; `npm run check:coverage-integrity` unaffected (baseline is not wired as default). No RED test, no behaviour change.
est_executor_tokens: ~45k Sonnet (16 edited files)
