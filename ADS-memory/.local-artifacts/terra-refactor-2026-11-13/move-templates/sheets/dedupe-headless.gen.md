id: DD-headless-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/contracts/headless
precondition: TODO(judge)   # MOVE-AFTER only (label: DEDUPE)
tovu_files:
  - apps/website/src/contracts/headless/plugin-export-catalog.ts | blob 89b3b1e26ad72cc2d85c972f7c262dd5ee782b6d | blob-guarded | 20 loc
tovu_tests:
  - -
--- file: apps/website/src/contracts/headless/plugin-export-catalog.ts (survey label DEDUPE; note: `@jini-ai/plugins/host` (`host/tools/contract.ts` `PluginExportRow` made generic over `props` and `consent`). | route: 14: needs a Jini addition before the dedu)
declarations (name | line | kind):
  - PluginExportCatalogRow | apps/website/src/contracts/headless/plugin-export-catalog.ts:5 | interface
  - PluginExportCatalogPort | apps/website/src/contracts/headless/plugin-export-catalog.ts:18 | interface
census_cmd: rg -n --no-heading -e '["'][^"']*plugin\-export\-catalog(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/headless/plugin-export-catalog.ts
importers (4 prod, 0 test; resolved to this file):
  - apps/website/src/contracts/headless/index.ts:4 | reexport | "./plugin-export-catalog.js"
  - apps/website/src/features/agent-plugins/exports/runtime.ts:5 | static | "../../../contracts/headless/plugin-export-catalog.js"
  - apps/website/src/features/agent-plugins/exports/runtime.ts:6 | reexport | "../../../contracts/headless/plugin-export-catalog.js"
  - apps/website/src/features/plugin-runtime/tool-registrations.ts:4 | static | "../../contracts/headless/plugin-export-catalog.js"
path_literals (rg -F "headless/plugin-export-catalog", not already importers):
  - -
baselines (json files naming the path): -
jini_target: plugins /host | packages/plugins/package.json:17 has exports key ./host
jini_names (existing declaration in packages/plugins/src, excluding tests; none = free to add):
  - PluginExportCatalogRow -> ABSENT
  - PluginExportCatalogPort -> ABSENT
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/plugins/package.json blob ffcaf09e65b0087c9e93138952b356afe965f8b9
  - packages/plugins/README.md blob 21f56bb6440608251213ab61114f77b1e72947d8
  - rg -n "PluginExportCatalogRow|PluginExportCatalogPort" packages/plugins/src -> prints nothing
    (today it prints 0 line(s))
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
