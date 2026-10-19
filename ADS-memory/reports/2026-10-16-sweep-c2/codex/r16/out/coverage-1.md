TDD(Direct): Chose TDD for behavior-focused coverage gap tests. Added tests for all eight targets; production source is unchanged.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/features/database-transfer/__tests__/destination-store.sqlite.test.ts
- /Users/la/Programming/Tovu/apps/website/src/contracts/headless/__tests__/assistant-tool-approval-policy.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/contracts/headless/__tests__/content-chat-title.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/admin-execution-credential-dependencies.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/assistant-chats-dependencies.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/use-admin-appearance.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/use-interface-preferences.hooks.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/integrations/jini-admin/__tests__/media-ports.unit.test.ts

**PER FILE:**

| Source | Added scenarios |
|---|---|
| `destination-store.ts` | Missing/invalid address payloads, legacy timestamp fallback, blank initial save, exhausted conflicts, other repository failures, concurrent identity replacement. Added home-isolation import first. |
| `assistant-tool-approval-policy.ts` | Malformed click inputs, non-direct capabilities, metadata precedence/fallback, extension classification and metadata preservation. |
| `content-chat-title.ts` | Single-quoted articles, quoted names without introducers, long write/edit labels, dangling introducers, empty names, slug-length boundary. |
| `admin-execution-credential-dependencies.hooks.ts` | Current-view getter (63), override persistence (75–76), undefined override, omitted/nullable/empty fields, real HTTP binding. |
| `assistant-chats-dependencies.hooks.ts` | Creation-time naming, whitespace-only first messages, missing-conversation rename, orphan-transcript deletion. |
| `use-admin-appearance.hooks.ts` | Live refresh filter (13): matching, unrelated and unscoped events; omitted options; explicit roots for reads/previews. |
| `use-interface-preferences.hooks.ts` | Default port and live refresh filter (33): matching, unrelated and unscoped events; unsubscribe behavior. |
| `media-ports.ts` | Malformed/unrelated restore results, cancellation, aborted reads, unknown-provider rejection, queue recovery, tail-only credential markers. |

**UNREACHABLE:**

- `apps/website/src/features/database-transfer/destination-store.ts:56`: private `legacyPublishCredential` and `tokenField` callbacks have no invocation path in this store.
- `apps/website/src/features/database-transfer/destination-store.ts:65`: authorization rejection arms cannot receive mismatched scope through the public methods; each supplies the fixed private scope.
- `apps/website/src/features/database-transfer/destination-store.ts:109`: loop exhaustion cannot fall through; the third failure throws at 118, while other outcomes return.
- `apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts:89`: non-string content is outside the `ChatMessage.content: string` contract.
- `apps/admin/src/integrations/jini-admin/media-ports.ts:54`: missing catalog entry/label fallback is unreachable through current callers, which enumerate or validate catalog IDs.
- `apps/admin/src/integrations/jini-admin/media-ports.ts:53,60`: private `view` always omits its optional argument; private `write` always receives one.

These paths remain unchanged for owner disposition.

**NOT DONE:**

Tests, typecheck, builds, coverage and package scripts were not run, as instructed. Actual pass/fail and 100% coverage remain for the locked verifier. No commits or git-state changes were made.
