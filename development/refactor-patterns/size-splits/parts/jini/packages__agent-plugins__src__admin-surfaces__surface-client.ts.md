### jini:packages/agent-plugins/src/admin-surfaces/surface-client.ts
- **Over:** `createAdminSurfaceClient` 101
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/admin-surfaces/__tests__/surface-client.unit.test.ts`, `.../theme-and-size.unit.test.ts`, `.../admin-surfaces.vertical-slice.test.ts`, `packages/agent-plugins/src/__tests__/exports.contract.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `function onResponse(event, data)` (match a host response to its pending call and settle it) ; B = rest (connect, theme, size, send, close) — client.
- **Splits:**
  1. HELPER `settleResponse({ init, pending, event, data }: SettleResponseInput): void` (module level, above `createAdminSurfaceClient`, after `isWellFormedResponse`) ← body of `onResponse` verbatim; `init` is passed as the current value (`Init | undefined`), `pending: Map<string, Pending>`.
  2. In the client, `function onResponse(event, data): void { settleResponse({ init, pending, event, data }); }` — keep the name so the `required.listen` callback is unchanged. (Alternatively call `settleResponse` directly at the one call site and delete `onResponse`; prefer that if `onResponse` has no other use — saves 3 more lines.)
- **Importers to update:** none (no export moves; `./admin-surfaces/surface-client` export map entry untouched).
- **After:** `createAdminSurfaceClient` ~93-96; file ~212.
- **Risks / notes:** `init` must be read at call time (it is assigned in `onInit`), so pass it per call, never capture once. Thin margin — run `--check`.
