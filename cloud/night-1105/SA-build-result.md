Programmer(Direct): Implemented SA jobs 1, 4 and 6.

- Auth: replaced generic failures in [dev-auth.ts:622](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/server/inbound/admin-http/dev-auth.ts:622) with anonymous-safe explanations and correlated copy details. Preserved 401/429 handling and session ordering.
- Skills: translated page, row, dialog and fallback text; added formatted failures.
- Cleanup: replaced throwing global guards with verification through Jini’s shared teardown queue.

[Full file list, root causes, regressions and review notes](/Users/la/Programming/tovu-integration-clones/prov2-tovu/ADS-memory/.local-artifacts/sa-login-skills-cleanup/progress-ledger.md).

Jini core typecheck and scoped whitespace checks passed. **No tests ran.** Open: updated Jini core package integration, runtime verification and language review. Concurrent edits were preserved; no commits.

Added cost: no requests or polls; each unexpected auth failure adds one redacted log and at most one tracker event. Clipboard payload is capped at 8,192 characters per click.

Run after updating Tovu’s consumed Jini core package.

Tovu clone root:

```bash
node --import tsx --test --test-timeout=60000 --test-concurrency=2 apps/website/src/server/inbound/admin-http/__tests__/dev-auth-failures.unit.test.ts apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts apps/website/src/server/inbound/admin-http/__tests__/dev-auth.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/vitest-compat.unit.test.ts apps/website/src/__tests__/fixtures/teardown.test.ts
```

Jini clone root:

```bash
node --import tsx --test --test-timeout=60000 --test-concurrency=2 packages/core/src/__tests__/teardown.test.ts packages/agent-plugins/__tests__/vitest-compat.test.mjs
```

Tovu `apps/admin`:

```bash
npx vitest run --maxWorkers=2 src/features/auth/__tests__ src/features/skills/__tests__
```