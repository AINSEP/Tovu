TDD(Direct): Selected the TDD persona for behavior-focused coverage tests. Extended eight existing suites; production code is unchanged.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/admin/src/features/skills/__tests__/chat-drop.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/security/__tests__/CopyKeysDialog.unit.test.tsx
/Users/la/Programming/Tovu/apps/website/src/features/comments/__tests__/settings.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/credential-copy-tool.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/write-files-validation.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/builtin-role-grants.test.ts
```

PER FILE:

Added scenarios below are **unrun**, so coverage is not yet confirmed.

| Source | Added scenarios |
|---|---|
| `skill-drop.ts` | Line 57 error handling; native-item fallbacks, nested batches, unsupported entries, entry/depth/file/byte limits, saved-event callbacks and rejected proposals. |
| `comments/settings.ts` | ISO-only clock adapter, disabled comments and persisted setting round-trips. Existing suites already exercise the validation branches. |
| `credential-copy-tool.ts` | Malformed inputs/selections, absent capabilities, cancellation races, refusal messages, unexpected exceptions, partial outcomes, masked tails and missing result metadata. |
| `write-files-validation.ts` | Non-string branch/message inputs, malformed files and paths, length boundaries and UTF-8 byte limits. |
| `database-transfer/tool-registrations.ts` | Real temporary SQLite snapshots, injected/default chat capture, missing/corrupt sources, default stores/target/logger and credential-error translation. Reported line 67 is now type-only. |
| `builtin-role-grants.ts` | Default registry arguments, empty grants, dangling policy bindings and unbound roles. |
| `collection-entry-editor-dependencies.hooks.ts` | Default seeds, filtered/unfiltered reads, creation defaults, load/save/lifecycle errors, unknown IDs and publish/unpublish state. |
| `use-copy-keys.hooks.ts` | Lines 42 and 85; stale inventory responses, selection limits, unchecked keys, concurrent submissions, cancellation, default HTTP wiring and desktop bridge variants. |

UNREACHABLE:

- [collection-entry-editor-dependencies.hooks.ts:18](/Users/la/Programming/Tovu/apps/admin/src/features/collections/hooks/collection-entry-editor-dependencies.hooks.ts:18), line 20: private `fakeEntry` always receives an object containing a generated ID; its omitted-argument and nullish-ID fallbacks are unreachable through supported callers.
- [use-copy-keys.hooks.ts:82](/Users/la/Programming/Tovu/apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts:82): `!startSite` and `!hint` cannot be true after `!canStart` is false.
- [tool-registrations.ts:104](/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/tool-registrations.ts:104): destination exchanges always register their locale before reporting.
- [tool-registrations.ts:116](/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/tool-registrations.ts:116): the credential validator throws only `CredentialInputError` for supported inputs; the other-error rethrow is unreachable.
- [tool-registrations.ts:130](/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/tool-registrations.ts:130): the installed Jini caller invokes this opener only for the destination tool, leaving the condition’s false side unreachable.

These branches remain unchanged for the owner’s decision.

NOT DONE:

Tests, typecheck, builds, coverage and package scripts were not run, as instructed. The locked verifier must confirm results and per-file percentages. `git diff --check` passed. No commits or git metadata changes were made.
