# K-09 SP-webhook-tools-1: webhook agent tools -> `@jini-ai/integrations/webhooks/tools`
Replaces audit2 B17: its row says a sheet `split-B17-webhook-tool-handlers.md` exists, but that file is on no branch (commit b9e9a9b9 changed only the index).
kind: SPLIT (K-TOOLS-PATTERN, package = integrations). est: 180k Sonnet + Opus review of the approval port.
tovu_files: `K-09.files.tsv`: `webhooks/agent-tools.ts` 205, `webhooks/tool-registrations.ts` 390. decls: `K-09.decls.tsv` (27 declarations, 10 handlers, longest 27).
over the limit: `buildWebhooksRegistrations` 166, `getWebhooksAgentToolCatalog` 62.
jini_target: `packages/integrations/src/webhooks/tools/{agent-tools,tool-registrations}.ts` (guard: directory absent; read `packages/integrations/src/credentialed-http/tools/tool-registrations.ts` `createCredentialToolRegistrations` for the package's own convention and follow it).
ports: `approvalToolHandler`, `notConfirmedResult` (`contracts/core/human-confirm.js`) -> `deps.approval: { wrap(handler, spec), notConfirmed() }`; behavioural check (LESSON 12): the wrapper's argument ORDER and which object carries `toolId` must match `approvalToolHandler` exactly: write the port from its real signature, do not infer it. `ChatDeleteSurfaceDeps` (`contracts/core/chat-delete-grant`) = `AssistantSurfaceDeps & {...}` -> surfaces type declared locally from core types. `./subscriptions.js`, `./ports.js`, `./types.js` are bindings over `@jini-ai/integrations` webhooks services already: import the Jini leaves directly (verify each name with rg; a name that exists only in Tovu = port).
`isDeepStrictEqual` (`node:util`) -> the new entry is runtime `node`.
`toWebhookDeliveryView` uses `_optional: Record<string, never> = {}` -> `(required, optional = {})` with a real empty optional object (COMMON 10); callers in `K-09.repoint.tsv`.
security (by class only): the views must keep omitting secret material. S0 adds (f): no view returned by any handler has a key matching `/secret|key|token/i` with a non-redacted value, using a fake record that carries marker values.
NOT in this sheet: `keyring.env.ts`, `site-key-ensure.ts`, `site-key-sources.ts`, `secret-sealer.aesgcm.ts`, `seal-aad-invariant.ts`, `secret-scan-guard.ts` (row 57, audit2 B09).
changeset: integrations minor. census: `K-09.census.txt`.
