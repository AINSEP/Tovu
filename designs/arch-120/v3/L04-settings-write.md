# L04 — settings write port (2 edges, I + S)

- `features/theme/preview-switcher-tools.ts:8,16` already receives `set` through deps
  (`set: typeof set`). Replace `typeof set` with a local function type naming exactly the argument
  object this file passes and the result it reads (S). Composition keeps passing the real `set`;
  `tsc` checks assignability at that call site (`server/runtime/composition/**` — see inventory).
- `features/site-search/settings.ts:18,81` imports `set` as a value (I). Add a **required**
  `writeSetting` field to the deps object this function already takes (`required.deps`), typed with
  the same local shape, and pass `set` from composition
  (`server/runtime/composition/modules/site-search.ts`). Update the tests that build those deps.

No new interface file: the function type is declared once in each consumer (two different arg
subsets — not one shared abstraction).

**Characterization (named risk: the write goes nowhere or skips the visitor-tools policy that
`set` enforces):** existing `features/site-search/__tests__/settings*.test.ts` drives a real `set`
through the injected field; add one case that the composed deps from `modules/site-search.ts`
persist the value (`getEffective` reads it back). Theme preview: existing
`features/theme/__tests__/preview-switcher*.test.ts`.

**Gates:** shared gate, `LANE=L04`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L04.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L04`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `site-search/settings.ts` -> `settings/index.ts` [I] set -> SiteSearchSettingsDeps.writeSetting, wired by composition
- `theme/preview-switcher-tools.ts` -> `settings/index.ts` [S] typeof set -> local WriteSetting function type (already injected)

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/site-search/settings.ts`
    - prod: server/runtime/composition/deps.ts, server/runtime/composition/modules/site-search.ts
    - tests: features/site-search/__tests__/settings.test.ts, server/runtime/composition/modules/__tests__/site-search.unit.test.ts
- `features/theme/preview-switcher-tools.ts`
    - prod: features/theme/tool-registrations.ts
    - tests: assistant/__tests__/tool-registrations.contracts.test.ts, features/theme/__tests__/preview-switcher.integration.test.ts, features/theme/__tests__/preview-switcher.lost-update.test.ts
