### jini:packages/daemon/src/surface-exchanges.ts
- **Over:** `createSurfaceExchangeStore` 119 (its `store` literal 109; the `open` method alone ~85)
- **Phase:** now · **Batch:** size-17
- **Package entry:** IS the `./surface-exchanges` exports target; no export moves.
- **Tests:** `src/__tests__/surface-exchanges.run-lifetime.test.ts`, `src/__tests__/injected-ports.test.ts`, `src/http/__tests__/surface-callback.test.ts`, `src/tool-recovery/__tests__/recovery.test.ts`, `recovery-branches.test.ts`, `src/agent-executor/__tests__/access-approval-transport.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `open({ binding, emit }, _optional = {})` method body | one exchange: inbox, waiters, idle/lifetime timers, send/receive/close |
| B (stays) | validation, `openExchanges`, `restoration`, `restore`, `deliver`, `findTypedAnswerTarget`, `size` | the store |

- **Splits:**
  1. HELPER `openSurfaceExchange({ binding, emit, deps, openExchanges, restoration, idleTtlMs, maxLifetimeMs }: OpenSurfaceExchangeInput): SurfaceExchange` (use the existing return type of `SurfaceExchangeStore['open']`; export it from its declaring module if it is not exported) — module level above `createSurfaceExchangeStore` ← the `open` body verbatim, incl. all inner comments. The method becomes `open({ binding, emit }, _optional = {}) { return openSurfaceExchange({ binding, emit, deps, openExchanges, restoration, idleTtlMs, maxLifetimeMs }); }`.
- **Importers to update:** none.
- **After:** `createSurfaceExchangeStore` ~35; `openSurfaceExchange` ~86; file ~200.
- **Risks / notes:** the pre-existing `waiters.shift()!` and `lifetime!.runId` non-null assertions move verbatim (not new). `deps` type: name the existing parameter type (inline object) as `SurfaceExchangeStoreDeps` in the same file.
