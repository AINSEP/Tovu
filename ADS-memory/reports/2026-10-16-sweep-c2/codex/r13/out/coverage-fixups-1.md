TDD(Direct): Chose TDD to correct test fixtures and contract assertions.

CHANGED FILES:

- [delete-user-service.test.ts:577](/Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/delete-user-service.test.ts:577) — VERDICT: test bug. Used a unique caller username; retained the seeded target and owner-required assertion.
- [PublishContentDialog.unit.test.tsx:1973](/Users/la/Programming/Tovu/apps/admin/src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx:1973) — VERDICT: test bug. Used an empty `ApiError` to reach the fallback; retained the expected text.
- [use-roles.unit.test.tsx:66](/Users/la/Programming/Tovu/apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx:66) — VERDICT: test bug. Asserted `{}`, the API parser’s result for an empty 204 response.

NOT DONE: Tests, typecheck, builds, package scripts, and coverage verification were not run, as instructed. Git state was untouched.
