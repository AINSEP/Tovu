# X-webmcp-1 — webmcp → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:17 T:18. Depends on: none (only already-Jini code). Est: J 31 min, T 20 min.

## J — move verbatim into Jini (2 files, 62 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/webmcp/settings.ts` | `packages/cms/src/webmcp/settings.ts` | 36 |  |
| `apps/website/src/features/webmcp/webmcp-i18n.ts` | `packages/cms/src/webmcp/webmcp-i18n.ts` | 26 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./webmcp/settings"]
- "@jini-ai/cms" exports["./webmcp/webmcp-i18n"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (5 lines)

```
apps/website/src/features/consent/__tests__/adapters.test.ts:7  '../../webmcp/settings.js' -> '@jini-ai/cms/webmcp/settings'
apps/website/src/features/settings/index.ts:138  '../webmcp/settings.js' -> '@jini-ai/cms/webmcp/settings'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/webmcp/__tests__/published-site.test.ts:5  '../settings.js' -> '@jini-ai/cms/webmcp/settings'
apps/website/src/server/runtime/composition/http-app/public-middleware.ts:27  '#src/features/webmcp/settings' -> '@jini-ai/cms/webmcp/settings'
apps/website/src/features/webmcp/published-html.ts:2  './webmcp-i18n.js' -> '@jini-ai/cms/webmcp/webmcp-i18n'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/features/consent/__tests__/adapters.test.ts`
- `apps/website/src/features/webmcp/__tests__/published-site.test.ts`

## Named mutation
in the Jini copy of `settings.ts`, negate the first `if (` condition of its first exported function; `adapters.test.ts` must go red, then revert
