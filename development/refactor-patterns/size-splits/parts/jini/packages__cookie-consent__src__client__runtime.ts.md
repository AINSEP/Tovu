### jini:packages/cookie-consent/src/client/runtime.ts
- **Over:** `createCookieConsent` 133
- **Phase:** now (JINI 133) · **Batch:** size-22
- **Tests:** `src/__tests__/client.test.ts`, `src/__tests__/client-dom.test.ts`, `src/__tests__/render.test.ts`, `src/__tests__/scripts.unit.test.ts`, `src/__tests__/frames.unit.test.ts` (package `@jini-ai/cookie-consent`; confirm with `rg -l "runtime|createCookieConsent|client/index" packages/cookie-consent --glob '*.test.*'`). No test mocks the module.
- **Responsibility map:**

| unit | statements in `createCookieConsent` | job |
|---|---|---|
| A state | `const { doc }` … `let state = compute();`, `compute`, `persist`, `apply` (except its `reconcile(next)` call), `confirm`, `set`, `adopt` | consent state, cookie and receipts (stays) |
| B adapter slots | `const slots`, `const ran`, `start`, `stop`, `reconcile`, `addSlot`, `syncSlots` | adapter lifecycle: start/stop/revoke per category, inert tags |
| C wiring | `const api` … `return api;` | public API + event wiring (stays) |

- **Splits:**
  1. HELPER in the same file, module level, directly above `createCookieConsent`: `function createAdapterSlots({ ports, anonymous, getState }: CreateAdapterSlotsInput): AdapterSlots`, with `interface CreateAdapterSlotsInput { ports: ClientPorts; anonymous: boolean; getState: () => ConsentState }` and `interface AdapterSlots { reconcile(next: ConsentState): void; syncSlots(items: readonly Contribution[]): void }`. Body: `const { doc } = ports;`, then `const slots = new Map<string, Slot>();`, `const ran = new Set<Optional>();` (keep its `// categories whose raw inert tags executed` comment), then `start`, `stop`, `reconcile`, `addSlot`, `syncSlots` moved verbatim with their doc comments, then `return { reconcile, syncSlots };`. In the moved code, each bare read of `state` becomes `getState()` **at the same spot** (inside `start`'s `.then(...)` callbacks it must stay a lazy read: `adapter.onState?.({ state: getState() })`, `getState().analyticsLevel`, `grant({ …, state: getState(), … })`; in `addSlot`: `getState().allowed[...]`, `{ state: getState() }`).
  2. In `createCookieConsent`: delete `const slots` and `const ran`. Right after `let state = compute();` add `const adapterSlots = createAdapterSlots({ ports, anonymous, getState: () => state });`. Replace `reconcile(next);` in `apply` with `adapterSlots.reconcile(next);` (keep its trailing comment), and the two `syncSlots` uses in the wiring with `adapterSlots.syncSlots` (`plugins.subscribe({ kind: ADAPTER_KIND, listener: adapterSlots.syncSlots })`, `adapterSlots.syncSlots(plugins.list(...))`, keeping the trailing comment).
- **Importers to update:** none (nothing new is exported).
- **After:** `createCookieConsent` ~80; `createAdapterSlots` ~58; file ~275 lines (counted ~225).
- **Risks / notes:** this is the browser bundle `dist/client.min.js`, built by a bundler and not serialized with `toString` (no `toString()` in `src/`), so a module-level helper is safe. `state` is a `let` that `apply`/`set`/`adopt` reassign, so the getter keeps the "read the current value later" semantics, and none of the moved code captures `state` by value. Creating the factory has no side effects, so the start/stop order the wiring sees doesn't change. `stop`'s existing `slot.run!` stays as is (moved code, not new).
