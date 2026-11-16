id: DL-error-mapping-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/server/error-mapping
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (respondToApiError); likely DEDUPE/reduce-to-binding or a fold with moved bodies
tovu_file: apps/website/src/server/error-mapping/respond.ts | blob 21779d74aa3082a77939acdbbf4f503de5c5d236
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "respond" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/server/error-mapping/respond.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*respond(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/server/error-mapping/respond.ts
importers (1 prod, 1 test; resolved to this file):
  - apps/website/src/server/error-mapping/__tests__/respond.test.ts:5 | static | "../respond.js"
  - apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts:2 | static | "#src/server/error-mapping/respond"
path_literals (rg -F "error-mapping/respond", not already importers):
  - -
baselines (json files naming the path): -
declarations (name | line | kind):
  - respondToApiError | apps/website/src/server/error-mapping/respond.ts:9 | function
folds: TODO(judge)
tests:
  - apps/website/src/server/error-mapping/__tests__/respond.test.ts | blob fb61613e6c2aac982bdcb83f6825f6d075d4250c | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
