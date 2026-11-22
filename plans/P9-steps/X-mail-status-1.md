# X-mail-status-1 — mail-status → @jini-ai/user-management (Jini step J then Tovu step T)

Lane X. Batch J:20 T:22. Depends on: X-identity-1. Est: J 42 min, T 25 min.

## J — move verbatim into Jini (4 files, 145 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/mail-status/agent-tools.ts` | `packages/user-management/src/mail/status/agent-tools.ts` | 22 |  |
| `apps/website/src/features/mail-status/delivery-agent-tools.ts` | `packages/user-management/src/mail/status/delivery-agent-tools.ts` | 57 |  |
| `apps/website/src/features/mail-status/provider-agent-tools.ts` | `packages/user-management/src/mail/status/provider-agent-tools.ts` | 17 |  |
| `apps/website/src/features/mail-status/permissions.ts` | `packages/user-management/src/mail/status/permissions.ts` | 49 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/user-management" exports["./mail/status/agent-tools"]
- "@jini-ai/user-management" exports["./mail/status/delivery-agent-tools"]
- "@jini-ai/user-management" exports["./mail/status/permissions"]
- "@jini-ai/user-management" exports["./mail/status/provider-agent-tools"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 357 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/mail-status/__tests__/activity-access.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/suppressions-access.unit.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (12 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:108  '../../features/mail-status/agent-tools.js' -> '@jini-ai/user-management/mail/status/agent-tools'
apps/website/src/features/mail-status/tool-registrations.ts:13  './agent-tools.js' -> '@jini-ai/user-management/mail/status/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:111  '../../features/mail-status/delivery-agent-tools.js' -> '@jini-ai/user-management/mail/status/delivery-agent-tools'
apps/website/src/features/mail-status/delivery-tool-registrations.ts:8  './delivery-agent-tools.js' -> '@jini-ai/user-management/mail/status/delivery-agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:109  '../../features/mail-status/provider-agent-tools.js' -> '@jini-ai/user-management/mail/status/provider-agent-tools'
apps/website/src/features/mail-status/provider-tool-registrations.ts:10  './provider-agent-tools.js' -> '@jini-ai/user-management/mail/status/provider-agent-tools'
apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts:15  '../permissions.js' -> '@jini-ai/user-management/mail/status/permissions'
apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts:12  '../permissions.js' -> '@jini-ai/user-management/mail/status/permissions'
apps/website/src/features/mail-status/delivery-tool-registrations.ts:15  './permissions.js' -> '@jini-ai/user-management/mail/status/permissions'
apps/website/src/features/mail-status/domain-deps.ts:2  './permissions.js' -> '@jini-ai/user-management/mail/status/permissions'
apps/website/src/server/inbound/admin-http/routes/system/mail-activity.ts:12  '#src/features/mail-status/permissions' -> '@jini-ai/user-management/mail/status/permissions'
apps/website/src/server/runtime/composition/app-permission-grants.ts:8  '#src/features/mail-status/permissions' -> '@jini-ai/user-management/mail/status/permissions'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts`

## Named mutation
in the Jini copy of `delivery-agent-tools.ts`, negate the first `if (` condition of its first exported function; `activity-access.unit.test.ts` must go red, then revert
