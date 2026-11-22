# U-member-login-1 — member-login → @jini-ai/user-management (Jini step J then Tovu step T)

Lane U. Batch J:6 T:7. Depends on: none (only already-Jini code). Est: J 28 min, T 31 min.

## J — move verbatim into Jini (1 files, 5 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/member-login/types.ts` | `packages/user-management/src/member-login/types.ts` | 5 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/user-management" exports["./member-login/types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (15 lines)

```
apps/website/src/features/agent-plugins/__tests__/fixtures/plugin-exports.ts:4  '../../../member-login/types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts:81  '#src/features/member-login/types' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/agent-plugins/exports/runtime.ts:7  '../../member-login/types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/__tests__/credentials.test.ts:6  '../types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/__tests__/fixtures.ts:5  '../types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/__tests__/link-service.dialects.test.ts:10  '../types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/__tests__/link-service.test.ts:11  '../types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/__tests__/oidc-login.test.ts:5  '../types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/credentials.ts:4  './types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/index.ts:8  './types.js' -> '@jini-ai/user-management/member-login/types'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/member-login/index.ts:9  './types.js' -> '@jini-ai/user-management/member-login/types'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/member-login/link-service.ts:9  './types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/oidc-login.ts:10  './types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/providers.ts:10  './types.js' -> '@jini-ai/user-management/member-login/types'
apps/website/src/features/member-login/ready-providers.ts:6  './types.js' -> '@jini-ai/user-management/member-login/types'
```

## Tovu tests that must stay green (7; import lines are repointed above, assertions untouched)
- `apps/website/src/features/agent-plugins/__tests__/fixtures/plugin-exports.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts`
- `apps/website/src/features/member-login/__tests__/credentials.test.ts`
- `apps/website/src/features/member-login/__tests__/fixtures.ts`
- `apps/website/src/features/member-login/__tests__/link-service.dialects.test.ts`
- `apps/website/src/features/member-login/__tests__/link-service.test.ts`
- `apps/website/src/features/member-login/__tests__/oidc-login.test.ts`

## Named mutation
in the Jini copy of `types.ts`, negate the first `if (` condition of its first exported function; `plugin-exports.ts` must go red, then revert
