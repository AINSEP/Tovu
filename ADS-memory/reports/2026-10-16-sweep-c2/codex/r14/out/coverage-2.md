TDD(Direct): Loaded the TDD persona to add behavior-focused tests for all eight targets. Production code and git state were left unchanged.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/features/tool-audit/__tests__/repo.dialects.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/dev-supervisor/__tests__/dev-restart.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/media-dependencies.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/settings/hooks/__tests__/use-external-mcp.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx
- /Users/la/Programming/Tovu/apps/website/src/features/site-backup/__tests__/push-jobs.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/http/__tests__/client.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/http/__tests__/client.observability.test.ts

**PER FILE:**

| Source | Added coverage cases |
|---|---|
| `tool-audit/repo.ts` | Default error logger, original-error preservation, and failed-write persistence outcome. Existing suites already exercise retention gaps. Supplied line numbers are stale. |
| `dev-supervisor/dev-restart.ts` | Environment, writer, scheduler and logger defaults; zero delay; non-Error failures; omitted options. |
| `media-dependencies.hooks.ts` | Deletion lines 101–104; missing IDs; slug fallback; default update options; live API bindings. |
| `use-external-mcp.hooks.ts` | Post-save probe success/failure, including lines 250–251; disabled servers; credential hints; uncached updates; populated OAuth fields; default API/locale wiring. |
| `sites-dependencies.hooks.ts` | Live bindings, including lines 7, 9 and 11; unconfigured-write rejection lines 37 and 39–40. |
| `use-trash.hooks.ts` | Current-page failure line 199 and retry; wired controller lines 301–302; pre-load actions; busy purge guard; exhausted cursor. |
| `site-backup/push-jobs.ts` | Ownership checks, rejected outcomes, TTL boundary/expiry, running-job retention, progress snapshots, collection and pre-aborted callers. |
| `http/client.ts` | Neutral refusal translation, explicit refusal identity, native port defaults, injected clock and observed native-client refusal. |

**UNREACHABLE:**

Under the current supported contracts:

- `apps/website/src/platform/dev-supervisor/dev-restart.ts:50`: absent `unref` arm—native Node timers provide it.
- `apps/website/src/features/site-backup/push-jobs.ts:111`: false arm—`onAbort` is assigned synchronously before entering `try`.
- `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts:75`: default locale—every internal caller supplies a string.
- `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts:301`: non-`CredentialInputError` rethrow—the validator throws only that class for supported inputs.

These remain unchanged for the owner’s delete-or-keep decision.

**NOT DONE:**

Tests, typecheck, builds, coverage and package scripts were not run, as requested. **100% coverage remains unverified.** Read-only whitespace checking passed. The concurrently modified backup registration suite was left untouched.
