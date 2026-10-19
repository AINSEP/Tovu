TDD(Direct): Loaded the TDD persona for coverage-gap test design.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/admin/src/features/taxonomy/__tests__/use-taxonomy.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/users/__tests__/use-users.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/publish-content/__tests__/publish-content-port.scope.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts
- /Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/api-key-secret.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/default-credential-exposure.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/identity/default-credential-exposure.ts
- /Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/repo.contract.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/observability/__tests__/unit/otel.unit.test.ts

PER FILE:

Tests added to exercise these paths; execution remains pending.

| Source | Added coverage |
|---|---|
| `taxonomy-dependencies.hooks.ts` | Missing-term errors, taxonomy deletion, rename, sibling preservation, optional blockers and empty defaults; targets 57, 70–80. |
| `default-credential-exposure.ts` | Scanner exclusions, broken symlinks, read failures, CLI success/failure and entry point. Reported 30–43 are now comments. Added injectable output/exit handlers. |
| `newsletter/repo.memory.ts` | Seed/default branches, workspace/key filtering, updates, lookup misses and snapshot immutability across all six repositories. |
| `otel.ts` | Invalid exporter, span adaptation, parent variants, error descriptions and async-scope cleanup. Reported 28–30 are now comments. |
| `use-visitor-credential-form.hooks.ts` | Settings-save errors, cancelled discovery, model-selection branches and known/unknown preset IDs. Injected the probe port; missing optional discovery now stays idle. |
| `publish-content-dependencies.hooks.ts` | Live destination/confirm/execute requests, default lifecycle, URL precedence, custom identifiers and empty/key-only scopes. |
| `api-key-secret.ts` | Numeric validation branches, foreign scheme, wrong digest length, invalid scrypt cost and crypto callback failure. |
| `users-dependencies.hooks.ts` | Legacy response defaults, password-reset request, fake defaults/errors, enable/delete state changes and Jini adapters. |

UNREACHABLE:

- `apps/admin/src/features/users/hooks/users-dependencies.hooks.ts:33,35`: private `fakeUser` always receives an object containing a generated `principalId`; its omitted-argument and fallback-ID branches cannot execute.
- `apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts:350`: absent `testConnection` is unreachable under the supported `ExecutionPort` contract, which requires that method.

These branches were retained for the owner’s decision.

NOT DONE:

Tests, typecheck, builds, coverage and package scripts were not run, as instructed. **100% coverage is not verified.** Whitespace checks passed. No commits or git-state mutations were made.
