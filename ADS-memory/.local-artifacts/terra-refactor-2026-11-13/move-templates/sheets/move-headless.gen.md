id: MV-headless-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/contracts/headless
precondition: TODO(judge)   # MOVE-AFTER only (label: MOVE)
tovu_files:
  - apps/website/src/contracts/headless/chart-providers.ts | blob 5bf582e987443afaed96ef35fee897e115856386 | TODO(judge) delete|keep-reduced | 6 loc
  - apps/website/src/contracts/headless/chat-attachment.ts | blob 5f6d9f8800791d0ed684e33ff0c747900941c04e | TODO(judge) delete|keep-reduced | 26 loc
tovu_tests:
  - apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts | blob 4ff8e2f5f3c42afe923ecdf533187acff271d7c0 | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/contracts/headless/chart-providers.ts (survey label MOVE; note: `@jini-ai/ui/charts` (existing), as a `ChartProviderSnapshot` wire type. No ports.)
declarations (name | line | kind):
  - AdminChartProviderSnapshot | apps/website/src/contracts/headless/chart-providers.ts:2 | interface
census_cmd: rg -n --no-heading -e '["'][^"']*chart\-providers(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/headless/chart-providers.ts
importers (1 prod, 0 test; resolved to this file):
  - apps/website/src/contracts/headless/index.ts:3 | reexport | "./chart-providers.js"
path_literals (rg -F "headless/chart-providers", not already importers):
  - -
baselines (json files naming the path): -
jini_target: ui /charts | packages/ui/package.json:44 has exports key ./charts
jini_names (existing declaration in packages/ui/src, excluding tests; none = free to add):
  - AdminChartProviderSnapshot -> ABSENT
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/ui/package.json blob 038974dfc6cdffbaae51a995eda8f36bae1fa263
  - packages/ui/README.md blob 98b67dc9ec874c7c3872b05c1c3f11e515ebab47
  - rg -n "AdminChartProviderSnapshot" packages/ui/src -> prints nothing
    (today it prints 0 line(s))
--- file: apps/website/src/contracts/headless/chat-attachment.ts (survey label MOVE; note: `Jini:packages/daemon/src/http/attachments.ts` (it mints `attachment:${randomUUID()}` at :1245). Check the daemon exports map for the subpath.)
declarations (name | line | kind):
  - CHAT_ATTACHMENT_REF_PATTERN | apps/website/src/contracts/headless/chat-attachment.ts:8 | const
  - ChatAttachmentRefusal | apps/website/src/contracts/headless/chat-attachment.ts:14 | type
  - ChatAttachmentReadResult | apps/website/src/contracts/headless/chat-attachment.ts:23 | type
census_cmd: rg -n --no-heading -e '["'][^"']*chat\-attachment(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/headless/chat-attachment.ts
importers (3 prod, 1 test; resolved to this file):
  - apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:8 | namespace | "../chat-attachment.js"
  - apps/website/src/contracts/headless/index.ts:5 | reexport | "./chat-attachment.js"
  - apps/website/src/contracts/headless/index.ts:6 | reexport | "./chat-attachment.js"
  - apps/website/src/contracts/headless/plugin-install-source.ts:2 | static | "./chat-attachment.js"
  WARNING apps/website/src/contracts/headless/__tests__/index.barrel.unit.test.ts:8 uses namespace (T-REPOINT step 2 / STOP rule)
path_literals (rg -F "headless/chat-attachment", not already importers):
  - -
baselines (json files naming the path): -
jini_target: TODO(judge) (survey names no package)
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
