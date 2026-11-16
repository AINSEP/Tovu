id: MV-workspace-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/features/workspace
precondition: TODO(judge)   # MOVE-AFTER only (label: MOVE)
tovu_files:
  - apps/website/src/features/workspace/repo.ts | blob 637d6c262153d395842e84cd1fa3b4303e81fbf4 | TODO(judge) delete|keep-reduced | 88 loc
tovu_tests:
  - apps/website/src/features/workspace/__tests__/repo.dialects.test.ts | blob 8b7172a77b11542f7e0255c942be0eaeaf8701e3 | TODO(judge)   # move-to-jini | keep-repointed | delete
  - apps/website/src/features/workspace/__tests__/workspace.lost-update.test.ts | blob 3016143f1e6db4316c6ecbe06aaa3e96334b4b76 | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/features/workspace/repo.ts (survey label MOVE; note: `@jini-ai/cms/workspace` → new `workspace/sql/repo.ts` (same pattern as `cms/src/redirects/sql/repo.ts`). Host supplies `StorageKernel<{workspaces}>` with `run`)
declarations (name | line | kind):
  - SqlWorkspaceRepo | apps/website/src/features/workspace/repo.ts:19 | class
  - workspaceRepoFor | apps/website/src/features/workspace/repo.ts:99 | function
census_cmd: rg -n --no-heading -e '["'][^"']*repo(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/workspace/repo.ts
importers (1 prod, 2 test; resolved to this file):
  - apps/website/src/features/workspace/__tests__/repo.dialects.test.ts:7 | static | "../repo.js"
  - apps/website/src/features/workspace/__tests__/workspace.lost-update.test.ts:6 | static | "../repo.js"
  - apps/website/src/features/workspace/repo.sqlite.ts:3 | static | "./repo.js"
path_literals (rg -F "workspace/repo", not already importers):
  - development/scripts/write-path-inventory.baseline.json:982:    "file": "src/features/workspace/repo.sqlite.ts",
baselines (json files naming the path): -
jini_target: cms /workspace | packages/cms/package.json:22 has exports key ./workspace
jini_names (existing declaration in packages/cms/src, excluding tests; none = free to add):
  - SqlWorkspaceRepo -> ABSENT
  - workspaceRepoFor -> ABSENT
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/cms/package.json blob 1d49bc2899be0d9925a391340bd1fea61777e17d
  - packages/cms/README.md blob a604eb8ec382cc0819305ed0939995519ed1157b
  - rg -n "SqlWorkspaceRepo|workspaceRepoFor" packages/cms/src -> prints nothing
    (today it prints 0 line(s))
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
