TDD(Direct): Selected TDD for behavior-based coverage test design. Updated seven existing test files; production code is unchanged.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/server/runtime/boot/__tests__/boot-readiness-warnings.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/post/__tests__/post.delete.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/analytics/__tests__/recent-hits-tool.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/content-types/__tests__/repo.dialects.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/auth-schemes.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/confirmation.test.ts

PER FILE:

Paths below are relative to `apps/website/src`. These are intended branch exercises; execution remains unverified.

| Source | Added coverage cases |
|---|---|
| `contracts/core/agent-permission-mode.ts` | Invalid overrides fall back correctly in local and production modes; explicit optional argument. |
| `contracts/core/soft-delete.ts` | Empty-string deletion marker remains trashed. Existing tests exercise absent/null markers. |
| `features/analytics/tool-registrations.ts` | Null referrer tie ordering in both input orders. |
| `features/change-sets/tool-registrations.ts` | Omitted input, equal timestamps, populated optional audit fields, and input-array preservation. |
| `features/content-types/repo.rows.ts` | Omitted tombstone clears a previously stored timestamp to NULL, across both dialects. |
| `features/custom-credentials/auth-schemes.ts` | Non-ENOENT source read error propagates. |
| `features/newsletter/confirmation.ts` | Missing subscription rejects without consuming the token; HTTP custom port/base path. |
| `features/newsletter/repo.rows.ts` | Unchanged: existing dialect tests already exercise both default-list flag values. |

UNREACHABLE: None identified.

NOT DONE: Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. **100% coverage is not yet verified.** No git state changes were made. Read-only whitespace checking passed. Expected addition: eight runnable tests, including both dialect instances, plus one URL scenario.
