### jini:packages/integrations/src/api-connections/hosted-mcp/shared-sign-in.ts
- **Over:** `createSharedExternalMcpOAuth` 257
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/api-connections/hosted-mcp/__tests__/shared-owner.test.ts` (run: `pnpm --filter @jini-ai/integrations exec vitest run src/api-connections/hosted-mcp/__tests__/shared-owner.test.ts --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | interfaces `SharedSignIn*`, `SharedExternalMcpOwner`, `SharedMcpConfiguration`, `SharedMcpContext`, `MCP_PLUGIN_ID`, `consumerId` | contracts the host fulfils (unchanged) |
| B | `optionalAuthorization`, `audienceIdentity` (closure fns that read no locals) | pure endpoint-identity helpers |
| C | `unavailable` … `refreshFor` (L88–L131) | per-site resolvers: errors, binding/context lookup, endpoint target, refresher cache |
| D | `consumer` … `currentSelection` (L132–L214) | selection/attempt steps over the owner store |
| E | `return {` props `beginConnect`, `pollDeviceAuthorization` | the two long service methods |
| F | the returned service object | wiring |

- **Splits** (same file, module level, above `createSharedExternalMcpOAuth`, in this order):
  1. Lift `function optionalAuthorization(...)` and `function audienceIdentity(...)` verbatim to module level (they read no closure locals).
  2. HELPER `createSharedSignInResolvers({ deps, shared, resolveProvider, ports }: CreateSharedSignInResolversInput): SharedSignInResolvers` ← statements `const unavailable = () => new ApiConnectionError(` through `async function refreshFor(credentialId: string) {` (~45 lines). Returns `{ unavailable, invalidState, deviceKeyFor, bindingFor, contextFor, endpointIdentity, target, refreshFor }` (`refreshers` stays private inside it). It destructures `owner, bindings, siteId` from `shared` itself. Type `SharedSignInResolvers` = `ReturnType<typeof createSharedSignInResolvers>` declared right below the function.
  3. HELPER `createSharedSignInSteps({ deps, shared, configure, ports, resolvers }: CreateSharedSignInStepsInput): SharedSignInSteps` ← statements `const consumer = createSharedOAuthConsumer({` through `async function currentSelection(input: { serverId: string }) {` (~85 lines). Reads resolver functions from `resolvers`. Returns `{ consumer, selected, assertAttempt, stateFor, assertOwner, createSelection, install, connectionOption, currentSelection }`. `SharedSignInSteps` = `ReturnType<typeof createSharedSignInSteps>`.
  4. HELPER `beginSharedConnect({ scope, input }: BeginSharedConnectInput): Promise<ExternalMcpConnectStart>` ← body of prop `beginConnect` (input type = the prop's existing inline param type, named `SharedBeginConnectRequest`). `scope` = `{ deps, shared, ports, ...resolvers, ...steps }` typed `SharedSignInScope`.
  5. HELPER `pollSharedDeviceAuthorization({ scope, input }: PollSharedDeviceAuthorizationInput)` (return type inferred as today) ← body of prop `pollDeviceAuthorization`.
  6. `createSharedExternalMcpOAuth` keeps: the two destructures, `const resolvers = createSharedSignInResolvers(...)`, `const steps = createSharedSignInSteps(...)`, then destructures the names its remaining props use (so prop bodies are unchanged) and the `return {` with `beginConnect: (input) => beginSharedConnect({ scope, input })`, `pollDeviceAuthorization: (input) => pollSharedDeviceAuthorization({ scope, input })`.
- **Importers to update:** none (no export moves; `index.ts` export unchanged).
- **After:** file ~325; `createSharedExternalMcpOAuth` ~85; `createSharedSignInSteps` ~88; `createSharedSignInResolvers` ~47; others < 30.
- **Risks / notes:** keep the order of statements inside each helper (the `refreshers` Map must be created once per service, so it lives in `createSharedSignInResolvers` which is called once). The `// Site-specific bindings…` doc comment stays on `createSharedExternalMcpOAuth`. Methods using `this`? none — the props use closure names only.
