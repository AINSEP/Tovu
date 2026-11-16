id: SP-composition-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/server/runtime/composition
precondition: TODO(judge)   # MOVE-AFTER only (label: MIXED)
tovu_files:
  - apps/website/src/server/runtime/composition/provider-revision-watch.ts | blob 2166c3fbe86615431e51aad820fec22ee88930af | blob-guarded | 55 loc
tovu_tests:
  - apps/website/src/server/runtime/composition/__tests__/provider-revision-watch.unit.test.ts | blob a76cc6145f2cdf64abfbf931efc29f8af3bbbe80 | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/server/runtime/composition/provider-revision-watch.ts (survey label MIXED; note: MOVE the `watchProviderRevisions` loop and `revisionSnapshot` to `@jini-ai/plugins/host/node` (it takes `schedule` and `reapply` ports). STAY-PRODUCT: `siteProv)
declarations (name | line | kind):
  - siteProviderRevisions | apps/website/src/server/runtime/composition/provider-revision-watch.ts:6 | function
  - watchProviderRevisions | apps/website/src/server/runtime/composition/provider-revision-watch.ts:27 | function
split:   # one row per declaration above, none omitted
  - siteProviderRevisions | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - watchProviderRevisions | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
ports: TODO(judge)
shape_changes: TODO(judge)
census_cmd: rg -n --no-heading -e '["'][^"']*provider\-revision\-watch(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/server/runtime/composition/provider-revision-watch.ts
importers (1 prod, 1 test; resolved to this file):
  - apps/website/src/server/runtime/composition/__tests__/provider-revision-watch.unit.test.ts:8 | static | "../provider-revision-watch.js"
  - apps/website/src/server/runtime/composition/deps.ts:24 | static | "./provider-revision-watch.js"
path_literals (rg -F "composition/provider-revision-watch", not already importers):
  - -
baselines (json files naming the path): -
jini_target: plugins /host/node | packages/plugins/package.json:18 has exports key ./host/node
jini_names (existing declaration in packages/plugins/src, excluding tests; none = free to add):
  - siteProviderRevisions -> ABSENT
  - watchProviderRevisions -> packages/plugins/src/host/provider-revision-watch.ts:50:export function watchProviderRevisions(
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/plugins/package.json blob ffcaf09e65b0087c9e93138952b356afe965f8b9
  - packages/plugins/README.md blob 21f56bb6440608251213ab61114f77b1e72947d8
  - rg -n "siteProviderRevisions|watchProviderRevisions" packages/plugins/src -> prints nothing
    (today it prints 1 line(s); names already exist, check twin/SPLIT)
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
jini_code: TODO(judge)
jini_index: TODO(judge)
tovu_reduced: TODO(judge)
binding_edits: TODO(judge)
tests_split: TODO(judge)
