### jini:packages/core/src/settings/express/http.ts
- **Over:** `registerSettingsRoutes` 112
- **Phase:** now · **Batch:** size-13
- **Package entry:** `./settings/express` → `src/settings/express/index.ts`; `registerSettingsRoutes` stays here, so nothing changes there.
- **Tests:** `src/settings/express/__tests__/settings-http.test.ts`, `settings-http.pins.test.ts`, `settings-http-request.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements in `registerSettingsRoutes` | job |
|---|---|---|
| A (stays) | destructure, `streams`, `disposed`, `wrap`, `check`, `readTarget`, value/reset/events routes, return | lifecycle, guards, writes, change feed |
| B | `app.get(routes.definitions…`, `app.get(routes.effective…`, `app.get(routes.raw…`, `app.post(routes.definitions…` | read + register-definition routes |
| C | `const mutate = (operation: ValueMutationOperation): Handler => …` | value set/clear handler |

- **Splits:**
  0. Move local `type Handler` to module level as `type SettingsRouteHandler` (same shape) — both new helpers and `wrap` use it.
  1. HELPER `mountDefinitionAndReadRoutes({ app, routes, wrap, check, readTarget, permissions, service, workspaceId }: MountDefinitionAndReadRoutesInput): void` — module level above `registerSettingsRoutes` ← the four route statements of unit B verbatim, same order. Type `wrap`/`check`/`readTarget` with their inferred signatures written out (`(handler: SettingsRouteHandler, mappings?: readonly SettingsErrorMapping[]) => RequestHandler` etc.); no `any`.
  2. HELPER `createValueMutationHandler({ workspaceId, permissions, check, service }: CreateValueMutationHandlerInput): (operation: ValueMutationOperation) => SettingsRouteHandler` ← unit C body verbatim; `registerSettingsRoutes` keeps `const mutate = createValueMutationHandler({ … });` at the same position.
- **Importers to update:** none.
- **After:** `registerSettingsRoutes` ~70; helpers ~38 / ~17; file ~175.
- **Risks / notes:** route registration order on `app` must not change (B stays between `readTarget` and `mutate`). `wrap` reads the mutable `disposed` — it stays in the main function, so no getter is needed.
