id: HD-tool-metadata-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/contracts/core/tool-metadata
WARNING KIND-SUSPECT HARDEN: Tovu-only content is limited to ['ToolApprovalClass', 'ToolApprovalPolicy'] and string literals ['execution-setting', 'export-commit', 'http-method', 'page-control', 'plugin-enable', 'theme-activation']; looks like a narrowing/binding (DEDUPE), not a Jini gap
tovu_files:
  - apps/website/src/contracts/core/tool-metadata/approval-policy.ts | blob ab110905d4399077f621602a62927ef17286ce90 | TODO(judge)   # delete-and-repoint | reduce-to-binding
jini_survivor: packages/core/src/tool-metadata-types.ts | blob f0dee41efea721fc19686c97f0fffac2ba2065d7
parity_hints (mechanical token diff, Tovu-only vs survivor; judge each):
  identifiers only in Tovu: ['ToolApprovalClass', 'ToolApprovalPolicy']
  string literals only in Tovu: ['execution-setting', 'export-commit', 'http-method', 'page-control', 'plugin-enable', 'theme-activation']
parity: TODO(judge)   # P1..Pn rows, generic? yes -> Jini | no -> Tovu option
census_cmd: rg -n --no-heading -e '["'][^"']*approval\-policy(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/contracts/core/tool-metadata/approval-policy.ts
importers (63 prod, 0 test; resolved to this file):
  - apps/website/src/contracts/core/tool-metadata/agent-plugins.ts:2 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/analytics.ts:2 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/assistant.ts:3 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/change-sets.ts:2 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/comments.ts:2 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/commerce.ts:2 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/consent.ts:3 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/content-duplication.ts:2 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/content-read.ts:2 | static | "./approval-policy.js"
  - apps/website/src/contracts/core/tool-metadata/content-types.ts:2 | static | "./approval-policy.js"
  - ... 53 more; the full list is in the sidecar <sheet>.census.txt (same format)
path_literals (rg -F "tool-metadata/approval-policy", not already importers):
  - -
baselines (json files naming the path): -
jini_target: TODO(judge) (survey names no package)
wire_drift: TODO(judge)
jini_failing_tests: TODO(judge)
jini_change: TODO(judge)
new_options: TODO(judge)
changeset: TODO(judge)
tovu_binding_or_repoint: TODO(judge)
tovu_tests: TODO(judge)
jini_msg / tovu_msg: TODO(judge)
