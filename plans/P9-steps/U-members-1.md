# U-members-1 — members → @jini-ai/user-management (Jini step J then Tovu step T)

Lane U. Batch J:6 T:16. Depends on: C-contracts-core-3. Est: J 42 min, T 61 min.

## J — move verbatim into Jini (4 files, 573 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/members/agent-tools.ts` | `packages/user-management/src/members/agent-tools.ts` | 158 |  |
| `apps/website/src/features/members/types.ts` | `packages/user-management/src/members/types.ts` | 327 |  |
| `apps/website/src/contracts/core/tool-metadata/members.ts` | `packages/user-management/src/members/tool-metadata.ts` | 73 |  |
| `apps/website/src/features/members/member-validation.ts` | `packages/user-management/src/members/member-validation.ts` | 15 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/user-management" exports["./members/agent-tools"]
- "@jini-ai/user-management" exports["./members/member-validation"]
- "@jini-ai/user-management" exports["./members/tool-metadata"]
- "@jini-ai/user-management" exports["./members/types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 36 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/members/__tests__/agent-tools.contract.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (44 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:112  '../../features/members/agent-tools.js' -> '@jini-ai/user-management/members/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.members.test.ts:22  '../../features/members/agent-tools.js' -> '@jini-ai/user-management/members/agent-tools'
apps/website/src/features/members/tool-registrations.ts:26  './agent-tools.js' -> '@jini-ai/user-management/members/agent-tools'
apps/website/src/__tests__/lane-su-pins/p5ab-member-bearer-digest.test.ts:11  '#src/features/members/types' -> '@jini-ai/user-management/members/types'
apps/website/src/features/member-login/__tests__/link-service.test.ts:7  '../../members/types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/access-resolver.test.ts:11  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/consent-service.test.ts:9  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/invariants.test.ts:22  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/member-auth-repo.dialects.test.ts:8  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/member-external-identities.contract.ts:5  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/member-repo.list-cursor.test.ts:9  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/password-auth.test.ts:18  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/password-lifecycle.dialects.test.ts:14  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/repo.dialects.test.ts:7  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/repo.memory.test.ts:10  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/repo.session-revocation.dialects.test.ts:6  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/subscriber-directory.test.ts:6  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/tier-repo.lost-update.test.ts:10  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/tool-registrations.model-facing-errors.test.ts:29  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/write-service.guards.test.ts:7  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/__tests__/write-service.test.ts:35  '../types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/access-resolver.ts:20  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/consent-service.ts:36  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/index.ts:38  './types.js' -> '@jini-ai/user-management/members/types'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/members/index.ts:47  './types.js' -> '@jini-ai/user-management/members/types'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/members/member-admin-writes.ts:3  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/member-challenge-request.ts:7  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/member-challenge.ts:3  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/member-credentials.ts:4  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/member-sign-in.ts:3  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/password-auth.ts:5  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/ports.ts:45  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/repo.memory.ts:20  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/repo.memory.ts:31  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/repo.rows.ts:23  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/repo.ts:3  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/repo.ts:43  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/subscriber-directory.ts:45  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/tool-registrations.ts:36  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/features/members/trash-member.ts:3  './types.js' -> '@jini-ai/user-management/members/types'
apps/website/src/contracts/core/tool-metadata/index.ts:32  './members.js' -> '@jini-ai/user-management/members/tool-metadata'
apps/website/src/features/members/tool-registrations.ts:3  '../../contracts/core/tool-metadata/members.js' -> '@jini-ai/user-management/members/tool-metadata'
apps/website/src/features/members/member-challenge-request.ts:11  './member-validation.js' -> '@jini-ai/user-management/members/member-validation'
apps/website/src/features/members/member-sign-in.ts:6  './member-validation.js' -> '@jini-ai/user-management/members/member-validation'
```

## Tovu tests that must stay green (20; import lines are repointed above, assertions untouched)
- `apps/website/src/__tests__/lane-su-pins/p5ab-member-bearer-digest.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.members.test.ts`
- `apps/website/src/features/member-login/__tests__/link-service.test.ts`
- `apps/website/src/features/members/__tests__/access-resolver.test.ts`
- `apps/website/src/features/members/__tests__/consent-service.test.ts`
- `apps/website/src/features/members/__tests__/invariants.test.ts`
- `apps/website/src/features/members/__tests__/member-auth-repo.dialects.test.ts`
- `apps/website/src/features/members/__tests__/member-external-identities.contract.ts`
- `apps/website/src/features/members/__tests__/member-repo.list-cursor.test.ts`
- `apps/website/src/features/members/__tests__/password-auth.test.ts`
- `apps/website/src/features/members/__tests__/password-lifecycle.dialects.test.ts`
- `apps/website/src/features/members/__tests__/repo.dialects.test.ts`
- `apps/website/src/features/members/__tests__/repo.memory.test.ts`
- `apps/website/src/features/members/__tests__/repo.session-revocation.dialects.test.ts`
- `apps/website/src/features/members/__tests__/subscriber-directory.test.ts`
- `apps/website/src/features/members/__tests__/tier-repo.lost-update.test.ts`
- `apps/website/src/features/members/__tests__/tool-registrations.model-facing-errors.test.ts`
- `apps/website/src/features/members/__tests__/write-service.guards.test.ts`
- `apps/website/src/features/members/__tests__/write-service.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/members/agent-tools.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `types.ts`, negate the first `if (` condition of its first exported function; `agent-tools.contract.test.ts` must go red, then revert
