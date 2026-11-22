# X-webhooks-1 — webhooks → @jini-ai/integrations (Jini step J then Tovu step T)

Lane X. Batch J:13 T:15. Depends on: none (only already-Jini code). Est: J 43 min, T 37 min.

## J — move verbatim into Jini (4 files, 450 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/webhooks/seal-aad-invariant.ts` | `packages/integrations/src/webhooks/site/seal-aad-invariant.ts` | 247 |  |
| `apps/website/src/features/webhooks/signing.ts` | `packages/integrations/src/webhooks/site/signing.ts` | 44 | W2 |
| `apps/website/src/features/webhooks/subscriptions.ts` | `packages/integrations/src/webhooks/site/subscriptions.ts` | 127 |  |
| `apps/website/src/features/webhooks/signing.keyring.ts` | `packages/integrations/src/webhooks/site/signing.keyring.ts` | 32 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/integrations" exports["./webhooks/site/signing"]
- "@jini-ai/integrations" exports["./webhooks/site/signing.keyring"]
- "@jini-ai/integrations" exports["./webhooks/site/subscriptions"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 322 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/webhooks/__tests__/seal-aad-invariant.test.ts`
- `apps/website/src/features/webhooks/__tests__/signing.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (20 lines)

```
apps/website/src/features/webhooks/__tests__/delivery.test.ts:17  '../signing.js' -> '@jini-ai/integrations/webhooks/site/signing'
apps/website/src/features/webhooks/__tests__/signing.keyring.test.ts:5  '../signing.js' -> '@jini-ai/integrations/webhooks/site/signing'
apps/website/src/platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts:10  '#src/features/webhooks/signing' -> '@jini-ai/integrations/webhooks/site/signing'
apps/website/src/server/routes/types.ts:59  '../../features/webhooks/signing.js' -> '@jini-ai/integrations/webhooks/site/signing'
apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts:9  '#src/features/webhooks/signing' -> '@jini-ai/integrations/webhooks/site/signing'
apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.test.ts:7  '#src/features/webhooks/signing' -> '@jini-ai/integrations/webhooks/site/signing'
apps/website/src/server/runtime/composition/webhook-delivery-worker.ts:3  '#src/features/webhooks/signing' -> '@jini-ai/integrations/webhooks/site/signing'
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts:53  '#src/features/webhooks/subscriptions' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.integration.test.ts:10  '#src/features/webhooks/subscriptions' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/features/webhooks/__tests__/agent-tools.delete-confirmation.test.ts:9  '../subscriptions.js' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/features/webhooks/__tests__/delivery.test.ts:18  '../subscriptions.js' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/features/webhooks/__tests__/subscriptions.test.ts:12  '../subscriptions.js' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/features/webhooks/__tests__/subscriptions.test.ts:13  '../subscriptions.js' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/features/webhooks/index.ts:49  './subscriptions.js' -> '@jini-ai/integrations/webhooks/site/subscriptions'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/webhooks/index.ts:62  './subscriptions.js' -> '@jini-ai/integrations/webhooks/site/subscriptions'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts:11  '#src/features/webhooks/subscriptions' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts:25  '#src/features/webhooks/subscriptions' -> '@jini-ai/integrations/webhooks/site/subscriptions'
apps/website/src/features/webhooks/__tests__/signing.keyring.test.ts:4  '../signing.keyring.js' -> '@jini-ai/integrations/webhooks/site/signing.keyring'
apps/website/src/server/runtime/composition/memory-deps/route-deps/members-media-newsletter-forms.ts:7  '#src/features/webhooks/signing.keyring' -> '@jini-ai/integrations/webhooks/site/signing.keyring'
apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts:31  '#src/features/webhooks/signing.keyring' -> '@jini-ai/integrations/webhooks/site/signing.keyring'
```

## Tovu tests that must stay green (10; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts`
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.integration.test.ts`
- `apps/website/src/features/webhooks/__tests__/agent-tools.delete-confirmation.test.ts`
- `apps/website/src/features/webhooks/__tests__/delivery.test.ts`
- `apps/website/src/features/webhooks/__tests__/signing.keyring.test.ts`
- `apps/website/src/features/webhooks/__tests__/subscriptions.test.ts`
- `apps/website/src/platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/webhooks/signing.ts` (2)
- `apps/website/src/features/webhooks/signing.keyring.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/webhooks/seal-aad-invariant.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `seal-aad-invariant.ts`, negate the first `if (` condition of its first exported function; `seal-aad-invariant.test.ts` must go red, then revert
