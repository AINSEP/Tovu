### jini:packages/integrations/src/credentialed-http/tools/tool-registrations.ts
- **Over:** `createCredentialToolRegistrations` 107
- **Phase:** now · **Batch:** size-29
- **Tests:** none import it by name in integrations except `src/credentialed-http/tools/__tests__/contracts-closure.test.ts` (smoke); run it with `pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`, plus `pnpm --filter @jini-ai/integrations run typecheck`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | set-username / set-token / create-card helpers, `createCredentialSaveHandlers` | save-card handling (unchanged) |
| B | handler `[operations.ids.makeRequest]` | model-issued credentialed request |
| C | handler `[operations.ids.writeFiles]` | repository files write |
| D | `list`, `verify`, `setUsername` handlers + `buildDomainRegistrations` call | registration wiring (stays) |

- **Splits** (same file, module level directly above `createCredentialToolRegistrations`):
  1. HELPER `createMakeRequestHandler({ routeDeps, host, operations, credentialedRequest }: CreateMakeRequestHandlerInput): ToolHandler` ← the arrow assigned to `[operations.ids.makeRequest]: async (ctx, { emitSurface } = {})` (body verbatim; the helper returns that arrow). Include in the input only the closure names the body reads.
  2. HELPER `createWriteFilesHandler({ routeDeps, host, operations, sourceControlWrite }: CreateWriteFilesHandlerInput): ToolHandler` ← the arrow for `[operations.ids.writeFiles]: async (ctx): Promise<WriteFilesResult>`.
  3. In `handlers`: `[operations.ids.makeRequest]: createMakeRequestHandler({ … })`, `[operations.ids.writeFiles]: createWriteFilesHandler({ … })`. Input types use the existing `CredentialToolActorDeps`, `CustomCredentialToolHost`, ports types from the function's signature.
- **Importers to update:** none.
- **After:** file ~465; `createCredentialToolRegistrations` ~40; `createMakeRequestHandler` ~55; `createWriteFilesHandler` ~42.
- **Risks / notes:** keep each handler's explicit return-type annotation on the arrow so `ToolHandler` assignment does not widen. Comments inside the handler bodies move with them.
