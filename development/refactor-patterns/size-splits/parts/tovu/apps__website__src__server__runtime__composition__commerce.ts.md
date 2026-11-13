### tovu:apps/website/src/server/runtime/composition/commerce.ts
- **Over:** `composeCommerce` 280 (file 336, under)
- **Phase:** after-move (MIXED: MOVE sharedDeps/alerts payments pipeline; STAY-PRODUCT runtime binding) · **Batch:** size-58
- **Tests:** `apps/website/src/server/runtime/composition/__tests__/commerce-composition.unit.test.ts`, `.../__tests__/commerce-attention.unit.test.ts`, `.../__tests__/commerce.integration.test.ts`, `.../__tests__/commerce-data-retention.integration.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `CommerceServer`, `CommerceRuntime`, `ComposeCommerceRequired`, `Binding`, `providerRegistry`, `providerContexts` | types + provider ports (stay) |
| B | `const enabled = …`, `let activationUnreadable`, `async function isActive()` | read commerce plugin activation |
| C | `const sharedDeps = …` through `const operator = …` (alerted, alerts, sharedPayments, settle, inbox, projector, relay) | payments settlement pipeline (the part the survey moves) |
| D | `quarantinedOrder` | one quarantined-payment lookup (uses only `required`) |
| E | the 10 mutable `let`s (`schema`, `paymentSchema`, `binding`, `closed`, `storageReady`, `catalogReady`, `configurationProblem`, `configurationChecked`, `warnedConfiguration`, `lastReconcile`) + `reportConfiguration`, `ensurePaymentSchema`, `ensureSchema`, `reusable`, `resolve`, `readyServer`, `checkoutServer`, `worker`, `warm`, `needsAttention`, `readStatus`, `commerce`, `catalogAvailable`, returned object | lazy binding state machine |

- **Splits (steps 1-3 are safe pure lifts; step 4 is the wide one):**
  1. HELPER `createCommerceActivationCheck({ required, warn }: CreateCommerceActivationCheckInput): () => Promise<boolean>` (module level, above `composeCommerce`) ← `const enabled = …` (L75), `let activationUnreadable = false;`, `async function isActive()` (L77-85); returns `isActive`. `composeCommerce` keeps `const isActive = createCommerceActivationCheck({ required, warn });` (`enabled`/`activationUnreadable` have no other readers — rg confirmed).
  2. HELPER `composeCommercePayments({ required, ledger, providers, orders, orderPayments, warn }: ComposeCommercePaymentsInput): { sharedDeps; alerts; sharedPayments; inbox; relay; operator }` (types inferred from the creators) ← statements from `const sharedDeps = { ledger, providers,` (with its "Inbox application and durable projection need no currently selected merchant" comment) through `const operator = createPaymentsOperator(` (~L119-154); `settle`/`projector`/`alerted` stay internal. `composeCommerce` destructures the six names.
  3. HELPER `quarantinedOrder({ required, tx, scope, row }: QuarantinedOrderInput): Promise<…same…>` (module level) ← inner `async function quarantinedOrder({ tx, scope, row }` body; its call site(s) in `needsAttention` pass `required`.
  4. STATE + HELPERS (needed to get under 100; mechanical but wide): replace the 10 `let`s with one record `const state: CommerceState = { schema: undefined, paymentSchema: undefined, binding: undefined, closed: false, storageReady: false, catalogReady: false, configurationProblem: null, configurationChecked: false, warnedConfiguration: null, lastReconcile: 0 };` (interface `CommerceState` above `composeCommerce`, field types copied from the `let` annotations) and rewrite every read/write of those names in `composeCommerce` to `state.<name>` (incl. `??=`, the `.then(([payments, products]) => { state.storageReady = …; state.catalogReady = … })` probe, `close: async () => { state.closed = true; …}`). Then lift, each taking one input object `{ required, state, … }` with exactly the locals it reads per the outline:
     - `createSchemaEnsurers({ required, state }): { ensurePaymentSchema; ensureSchema }` ← L109-116.
     - `resolveCommerceBinding({ required, state, storageProbe, warn, isActive, sharedDeps, orders, prices, priceRefs, orderPayments, catalog, providers, … }): Promise<Binding | null>` ← `async function resolve()` with `reportConfiguration`/`reusable` moved in as inner functions (L104-108, L156-205).
     - `startCommerceWorker({ required, state, warn, isActive, ledger, ensureSchema, ensurePaymentSchema, resolve, inbox, relay, sharedDeps, operator })` ← `const worker = createCommerceWorker(` (L214-231).
     - `buildCommerceRuntime({ … })` ← `const commerce: CommerceRuntime = {` (L285-324) plus `readStatus`/`needsAttention` as its inner functions.
     `composeCommerce` then holds setup (warn, isActive, repos, state, probes, payments) + the lifted calls + `warm`, `catalogAvailable` and the final `return {`.
- **Importers to update:** none (only `composeCommerce` and types are exported).
- **After:** file ~360; `composeCommerce` ~95; `resolveCommerceBinding` ~52; `buildCommerceRuntime` ~68; others ≤ 45.
- **Risks / notes:** Step 4 turns closures over `let`s into a shared mutable record — every read must stay a live read at call time (never destructure `state` fields into locals). Order of `const warming = warm();` (kicked off at compose time) must not move earlier than the worker/resolve it needs. Survey MOVE of the payments pipeline maps 1:1 onto step 2's helper (it can move whole). Recommend Opus/Fable for step 4.
