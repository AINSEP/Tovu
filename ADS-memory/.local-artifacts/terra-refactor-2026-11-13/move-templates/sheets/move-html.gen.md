id: MV-html-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/html
precondition: TODO(judge)   # MOVE-AFTER only (label: MOVE)
tovu_files:
  - apps/website/src/platform/html/style-values.ts | blob 0855e4431bd8dc96a664bdbdb6431530e988abb7 | TODO(judge) delete|keep-reduced | 58 loc
tovu_tests:
  - apps/website/src/platform/html/__tests__/style-values.test.ts | blob e2ed5e7004dd52302b33ced6fd9d52fa65107223 | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/platform/html/style-values.ts (survey label MOVE; note: Pure allowlist/regex, no ports.)
declarations (name | line | kind):
  - safeTextAlign | apps/website/src/platform/html/style-values.ts:33 | function
  - safeAspectRatio | apps/website/src/platform/html/style-values.ts:56 | function
census_cmd: rg -n --no-heading -e '["'][^"']*style\-values(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/html/style-values.ts
importers (1 prod, 1 test; resolved to this file):
  - apps/website/src/platform/html/__tests__/style-values.test.ts:4 | static | "../style-values.js"
  - apps/website/src/server/inbound/public-http/http/site/render.ts:49 | static | "#src/platform/html/style-values"
path_literals (rg -F "html/style-values", not already importers):
  - apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts:2713:// (platform/html/style-values.ts) instead of escaping-and-emitting whatever a
baselines (json files naming the path): -
jini_target: cms / | packages/cms/package.json:155 has exports key .
jini_names (existing declaration in packages/cms/src, excluding tests; none = free to add):
  - safeTextAlign -> ABSENT
  - safeAspectRatio -> ABSENT
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/cms/package.json blob 1d49bc2899be0d9925a391340bd1fea61777e17d
  - packages/cms/README.md blob a604eb8ec382cc0819305ed0939995519ed1157b
  - rg -n "safeTextAlign|safeAspectRatio" packages/cms/src -> prints nothing
    (today it prints 0 line(s))
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
