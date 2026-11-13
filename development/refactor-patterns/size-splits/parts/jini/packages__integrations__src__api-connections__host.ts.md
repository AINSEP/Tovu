### jini:packages/integrations/src/api-connections/host.ts
- **Over:** `createApiConnectionHost` 163 (file 222, under)
- **Phase:** now · **Batch:** size-39
- **Tests:** `rg -l "api-connections/host" packages/integrations --glob '*.test.*'` (run each, one at a time) + `pnpm --filter @jini-ai/integrations run typecheck`.
- **Responsibility map** (inner functions of `createApiConnectionHost`; all close over `required`):

| unit | statements (anchors) | job |
|---|---|---|
| A clients | `function clientFor(`, `function hostedCallbackUrl(`, `function byoCallbackUrl(`, `function hooksFor(`, `function serviceFor(` | resolve a connection's OAuth client, callback URLs, hooks and service |
| B honest records | `function tokensFor(`, `async function markReconnectRequired(`, `async function tokensForAnotherClient(`, `async function readHonestRecord(`, `const honestRecords` | read stored records without trusting tokens sealed for another client |
| C tool access | `async function declaredFor(`, `function accessTokensFor(`, `const toolConnections` | the connection port executable tools use |
| D host | state (`records`, `budgets`, `callbackInbox`, `pluginState`, `lastSignInAttempts`, `signInHandoffs`, `byoClients`), `listConnections`, `apiOriginsFor`, `requestedScopes`, `statusOf`, `sharedOAuth`, `prepareSignIn`, the return | compose the host |

- **Splits** (module-level factories above `createApiConnectionHost`, in order A, B, C; bodies word for word, comments move with each function):
  1. `createConnectionClients({ required, byoClients }: ConnectionClientsInput<State>): ConnectionClients` ← unit A; returns `{ clientFor, hostedCallbackUrl, byoCallbackUrl, hooksFor, serviceFor }`. Host: `const { clientFor, hostedCallbackUrl, byoCallbackUrl, hooksFor, serviceFor } = createConnectionClients({ required, byoClients });` placed where `clientFor` was declared (after `listConnections`).
  2. `createHonestRecords({ required, records, listConnections, clientFor }: HonestRecordsInput<State>): HonestRecords` ← unit B; returns `{ tokensFor, markReconnectRequired, readHonestRecord, honestRecords }`.
  3. `createToolConnections({ required, budgets, records, listConnections, serviceFor, markReconnectRequired, readHonestRecord }: ToolConnectionsInput<State>): { declaredFor, accessTokensFor, toolConnections }` ← unit C.
  Input fields = exactly the closure names each unit's bodies read (the outline's `uses:` is truncated at 14 names; the typecheck names any missing one). Types: `ConnectionClientsInput<State> = { required: ApiConnectionRuntimeHostDeps<State>; byoClients: WeakMap<DeclaredApiConnection, ByoClient | ApiConnectionError> }`, others alike; return types via `ReturnType<typeof createX>` are NOT allowed for the input side — declare inputs explicitly, outputs may be inferred.
- **Importers to update:** none (no export moves; `createApiConnectionHost` and `ApiConnectionHost` keep their signatures).
- **After:** `createApiConnectionHost` ~75; factories ~45 / ~30 / ~40; file ~240.
- **Risks / notes:** inner functions are hoisted today (function declarations), so a function used before its declaration line still works; after the split each factory call must come before the first use of anything it returns — order: `listConnections` → clients → honest records → `apiOriginsFor` → tool connections → rest. `byoClients` is one WeakMap shared by A and `listConnections`: pass the same instance, never create a second.
