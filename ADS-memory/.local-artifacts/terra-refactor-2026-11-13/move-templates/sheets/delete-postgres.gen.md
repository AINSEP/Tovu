id: DL-postgres-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/db/postgres
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (evaluatePostgresRestoreCapability); likely DEDUPE/reduce-to-binding or a fold with moved bodies
tovu_file: apps/website/src/platform/db/postgres/db-ops.ts | blob f0ae79da921710771458470be800b9ee5e194085
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "db-ops" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/platform/db/postgres/db-ops.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*db\-ops(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/db/postgres/db-ops.ts
importers (1 prod, 1 test; resolved to this file):
  - apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts:11 | static | "#src/platform/db/postgres/db-ops"
  - apps/website/src/platform/db/postgres/db-ops-adapter.ts:2 | static | "./db-ops.js"
path_literals (rg -F "postgres/db-ops", not already importers):
  - apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts:63: * // src/platform/db/postgres/db-ops.ts (pure evaluation logic only — no live pg client here yet)
  - apps/website/src/server/runtime/composition/store-bound-services.ts:3:import { PostgresDbOpsAdapter } from "#src/platform/db/postgres/db-ops-adapter";
  - apps/website/src/server/runtime/composition/__tests__/store-bound-services.integration.test.ts:4:import { RestorePointsUnavailableError } from "#src/platform/db/postgres/db-ops-adapter";
baselines (json files naming the path): -
declarations (name | line | kind):
  - PostgresRestoreToolingConfig | apps/website/src/platform/db/postgres/db-ops.ts:16 | interface
  - evaluatePostgresRestoreCapability | apps/website/src/platform/db/postgres/db-ops.ts:40 | function
folds: TODO(judge)
tests:
  - apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts | blob e6606656268b394783394d1ba7a0cc031d42f620 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
