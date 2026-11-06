# forms-privacy

Status: in progress.

Branch in both repos: `cloud/forms-privacy`. Bases: Jini `e0dab177afd45fccca44fef82b0a36b37b1c87f5`; Tovu `64aae82d7683805c29dbb07aeb08e06f96d3bbdb`.

Implemented reference delivery payloads with legacy compatibility, token-only attempt deduplication, and rich answer/tool contracts. Placement IDs are implemented; every rendered Tovu form occurrence gets distinct controls and matching labels/help/error references. Focused checks and final SHA inventory will follow.

Current checks: Jini delivery tests 41 passed; Admin answer formatting 27 passed; Tovu tools 11 passed; Tovu composition 5 passed. Regression tests reproduced the defects before production edits. Initial recursive build overlapped newly added red tests and failed on those expected type errors; clean baseline is not claimed.

Files in this checkpoint:
- `apps/website/src/features/forms/tool-registrations.ts`
- `apps/website/src/platform/db/repos/__tests__/form-delivery-repo.dialects.test.ts`
- `apps/website/src/platform/db/repos/form-delivery-repo.ts`
- `apps/website/src/server/runtime/composition/__tests__/form-delivery.test.ts`
- `apps/website/src/server/runtime/composition/form-delivery.ts`
- `apps/website/src/features/forms/__tests__/tool-definition-view.unit.test.ts`

Open: placement IDs, final affected checks/typechecks/complexity lint, legacy copy inventory, exact Cloudflare republish requirements. No deployment or publish performed.

Second checkpoint: in progress. First pushes confirmed: Jini `a6d5d1dae`, Tovu `be90a02d9`. All four steps implemented. Scoped tests/typechecks and strict complexity are green; full-app delivery fixtures currently stop during unrelated app bootstrap at `commerce_get_status has no approval classification`, being checked on untouched base. No tests or approval rules have been bypassed.
