### tovu:apps/website/src/server/runtime/composition/provider-plugins.ts
- **Over:** `bootProviderPlugins` 147 (file 365, under)
- **Phase:** now (label ?) · **Batch:** size-09
- **Tests:** `apps/website/src/server/runtime/composition/__tests__/provider-plugins.unit.test.ts`, `.../__tests__/plugin-runtime.provider-plugins.test.ts`, `.../__tests__/boot-settings-rejection.integration.test.ts`. Check `rg -n "mock.*provider-plugins" apps/website/src` before starting (none found at design time).
- **Responsibility map** (inside `bootProviderPlugins`):

| unit | statements | job |
|---|---|---|
| A | nested `replaceSlot` | (re)initialize one slot's lease from saved settings, retiring the old one |
| B | nested `applySlots` | apply a plugin's selected slots and report initialization outcomes |
| C | nested `ensureLoaded` | admit a configured plugin through the runtime once |
| D | nested `selectSlots` | find (or admit new form-collection) slots for a plugin |
| E (stays) | settings decls, `initialization`, `closed`, `apply`, `reapply`, `leases` loop, boot apply, port composition, returned handle | boot + live reapply lifecycle (owns the mutable `tracker`, `closed`, `formCollectionRegistry`, `disposal`) |

- **Splits:** HELPERS at module level directly above `bootProviderPlugins` (after `isTelemetrySlot`), in this order; every comment/JSDoc inside moves with its body:
  1. `replaceProviderSlot({ slot, saved, initialization, host, required, release, exportOptions, delivery, info }: ReplaceProviderSlotInput): Promise<void>` ← `replaceSlot` body (`info` = `optional.info`, keep the `?? ((message) => console.info(message))` fallback inside). Types: `host: ReturnType<typeof createPluginProviderHost>`, `delivery: ReturnType<typeof createTelemetryDeliveryMonitor>`, `exportOptions: (contract: ProviderSlotContract) => …` (copy the inferred type or use `ReturnType`), `initialization: (input: { slot: ProviderSlot; outcome: …; reasonClass: string }) => void` (copy from source).
  2. `applyProviderSlots({ selected, saved, replaceSlot, initialization }: ApplyProviderSlotsInput): Promise<void>` ← `applySlots` body.
  3. `ensureProviderPluginLoaded({ pluginId, selected, saved, loaded, runtime, timeoutMs }: EnsureProviderPluginLoadedInput): Promise<void>` ← `ensureLoaded` (`runtime` = `required.runtime`).
  4. `selectProviderSlots({ pluginId, slots, runtime }: SelectProviderSlotsInput): Promise<ProviderSlot[]>` ← `selectSlots` (still `slots.push(...)` on the SAME array).
  In `bootProviderPlugins` replace the four nested functions with one-line locals at the same spot, e.g. `const replaceSlot = (slot: ProviderSlot, saved: ProviderPluginConfig | null) => replaceProviderSlot({ slot, saved, initialization, host, required, release, exportOptions, delivery, info: optional.info });`, `const applySlots = …`, `const ensureLoaded = …`, `const selectSlots = …` — `apply` keeps calling them by the same names.
- **Importers to update:** none (no export moves).
- **After:** `bootProviderPlugins` ~92; `replaceProviderSlot` ~33; file ~390.
- **Risks / notes:** `initialization` closes over the `let tracker` (assigned after boot) — pass the function, never `tracker` itself. Nested function declarations were hoisted; the replacement `const` locals must be declared before `reapply`'s first call (`await Promise.all([...].map(... reapply(...)))`) — placing them where the nested functions were satisfies that.
