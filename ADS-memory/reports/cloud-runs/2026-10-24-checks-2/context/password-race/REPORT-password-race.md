Programmer(Direct): Used Programmer + Security personas for the authorization race and atomic persistence.

Implemented the fix across change, reset, and first-password setup:

- [password-auth.ts](/Users/la/Programming/tovu-integration-clones/tovu-fu/apps/website/src/features/members/password-auth.ts): revalidates authorization after hashing, under the existing member lock. Password, revocations, and profile now share one transaction.
- Wiring updated in `members/ports.ts`, public member `deps.ts`, and composition `app.ts`.
- Added [SQLite/PGlite regression tests](/Users/la/Programming/tovu-integration-clones/tovu-fu/apps/website/src/features/members/__tests__/password-lifecycle.dialects.test.ts); updated existing service and HTTP fixtures.

Decisions: reused Jini’s kernel; no dependency added. Missing transactional storage fails closed, including memory-only composition. Enumeration responses remain unchanged.

Static syntax/diff checks passed; password code CCN ≤8, new tests ≤7. Full typecheck was interrupted before completion. **No tests run, commits made, or desktop files edited.**

Scoped commands for the runner:

```bash
node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks \
  apps/website/src/features/members/__tests__/password-auth.test.ts \
  apps/website/src/features/members/__tests__/password-lifecycle.dialects.test.ts \
  apps/website/src/server/__tests__/routes/member-password-auth.test.ts
```

```bash
cd apps/admin
./node_modules/.bin/vitest run --maxWorkers=2 --minWorkers=1 \
  src/features/members/__tests__
```
