# X-external-mcp-1 — external-mcp → @jini-ai/mcp (Jini step J then Tovu step T)

Lane X. Batch J:18 T:19. Depends on: none (only already-Jini code). Est: J 34 min, T 25 min.

## J — move verbatim into Jini (2 files, 244 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/external-mcp/agent-tools.ts` | `packages/mcp/src/external/agent-tools.ts` | 221 | W1 |
| `apps/website/src/features/external-mcp/built-in-connections.ts` | `packages/mcp/src/external/built-in-connections.ts` | 23 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/mcp" exports["./external/agent-tools"]
- "@jini-ai/mcp" exports["./external/built-in-connections"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 31 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/external-mcp/__tests__/unit/built-in-connections.unit.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (11 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:43  '../../features/external-mcp/agent-tools.js' -> '@jini-ai/mcp/external/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.external-mcp.test.ts:21  '../../features/external-mcp/agent-tools.js' -> '@jini-ai/mcp/external/agent-tools'
apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts:14  '../../agent-tools.js' -> '@jini-ai/mcp/external/agent-tools'
apps/website/src/features/external-mcp/operations-tools.ts:8  './agent-tools.js' -> '@jini-ai/mcp/external/agent-tools'
apps/website/src/features/external-mcp/tool-registrations.ts:34  './agent-tools.js' -> '@jini-ai/mcp/external/agent-tools'
apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts:2  '#src/features/external-mcp/built-in-connections' -> '@jini-ai/mcp/external/built-in-connections'
apps/website/src/server/inbound/admin-http/routes/external-mcp/list.ts:2  '#src/features/external-mcp/built-in-connections' -> '@jini-ai/mcp/external/built-in-connections'
apps/website/src/server/inbound/admin-http/routes/external-mcp/put.ts:6  '#src/features/external-mcp/built-in-connections' -> '@jini-ai/mcp/external/built-in-connections'
apps/website/src/server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts:8  '#src/features/external-mcp/built-in-connections' -> '@jini-ai/mcp/external/built-in-connections'
apps/website/src/server/runtime/composition/permanent-delete-deps.ts:1  '#src/features/external-mcp/built-in-connections' -> '@jini-ai/mcp/external/built-in-connections'
apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts:33  '#src/features/external-mcp/built-in-connections' -> '@jini-ai/mcp/external/built-in-connections'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.external-mcp.test.ts`
- `apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/external-mcp/agent-tools.ts` (1)
- `apps/website/src/features/external-mcp/built-in-connections.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/external-mcp/agent-tools.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/external-mcp/built-in-connections.ts:7: const value: unknown = JSON.parse(env.TOVU_BUILT_IN_MCP_SERVER_IDS ?? "[]");
```

## Named mutation
in the Jini copy of `agent-tools.ts`, negate the first `if (` condition of its first exported function; `built-in-connections.unit.test.ts` must go red, then revert
