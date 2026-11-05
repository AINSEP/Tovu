# bugs — runtime verification (in progress)

Started 2026-11-05 18:50 UTC; hard stop 20:50 UTC.
Branches: Tovu `cloud/bugs` from `e327c07c8`; Jini `cloud/bugs` from `6f507852d`.
Job instructions read with git show from Jini `origin/cloud-plans-1105`.

Initial evidence on unmodified source:
- Tovu desktop resources: 40 passed; product memory telemetry: 7 passed.
  `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test src/desktop-resources.test.ts src/product-memory-telemetry.test.ts`
- Jini Cloudflare edges: 8 passed.
  `node --test packages/agent-plugins/cloudflare/lib/__tests__/domain-edges.test.mjs`
- Jini registry/move: 40 passed.
  `npm --prefix packages/platform run test -- src/fs/__tests__/directory-workspace.test.ts src/fs/__tests__/verified-directory-move.test.ts`

Setup: documented /workspace/shared scripts are absent; existing /workspace/.tovu-build setup used instead. Initial Tovu media tests, hardwiring and test typecheck exposed stale installed Jini build outputs. Rebuilding the exact base and relinking before attributing diagnostics. pnpm 10.33.2 uses a copied cache under /workspace/work because the original store is read-only.

Pending: media publish/re-plan, registry recovery adversarial cases, receipt writes under filesystem restrictions, disposable migrated database copy, post-setup hardwiring/type-error count.

Excluded: coverage ratchet/full coverage; desktop GUI, customer themes/videos, fluent translation checks and vendor-account rows. No owner data, deployment, publication or main pushes.
