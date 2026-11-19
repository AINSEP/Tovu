# L04 — settings write port (2 edges, I + S) — one repo (Tovu), Codex-ready; merge before L10

- **Theme (S), binding pinned.** `features/theme/preview-switcher-tools.ts:8,16`: the deps field
  `set: typeof set` becomes `set: PreviewSwitcherSetSetting`. That is a local function type naming
  exactly the call at `:57`: input `{ deps: { repo; clock; ids; authorize; principals }; input: { namespace; key; scope; workspaceId; callerPrincipalId; value } }`
  (member types copied from `@jini-ai/core/settings` `SetValueRequired`, which the file may import,
  because it is Jini), and the result fields `:57-60` read. **Binding:** unchanged. The deps reach the tool through
  `contributePreviewSwitcherTools()` (`server/runtime/composition/tool-catalog-manifest.ts:643`)
  from the tool-deps bag, whose `set` member the roots already fill with settings' `set`. `tsc`
  checks the assignment there. Fixture: `features/theme/__tests__/preview-switcher.integration.test.ts:90,99,113`
  spreads `f.deps`, which already carries the real `set`. No edit.
- **Site search (I), binding pinned.** `features/site-search/settings.ts:18` (value import of `set`) is
  deleted. `writeSearchProviderSetting(required)` (`:75`) takes `required: { deps: SetValueRequired["deps"]; writeSetting: SearchSettingWriter }`,
  where `SearchSettingWriter = (required: { deps: SetValueRequired["deps"]; input: SetValueRequired["input"] }) => Promise<{ value: JsonValue; revisionSeq: number }>`
  is local. The returned writer keeps its input (`{ workspaceId, callerPrincipalId, providerId }`),
  its result (`{ value, revisionSeq }`, passed through) and its **rejection order**:
  `isSearchProviderId` → `rejection(...)` is thrown before `writeSetting` is called. Errors from
  `writeSetting` propagate unchanged. **Binding:** `server/runtime/composition/modules/site-search.ts:439`
  becomes `writeSearchProviderSetting({ deps: required.settingsWriteDeps, writeSetting: set })`, with
  `set` imported from `#src/features/settings/index`. Fixtures: `features/site-search/__tests__/settings.test.ts:38,47` add `writeSetting: set`.
- **Sequencing with L10 (judge 3 F4):** L10 edits `modules/site-search.ts` too (document-source deps).
  L04 merges first. L10's executor starts from the tip that contains L04.

No new interface file: the function type is declared once in each consumer (two different arg
subsets — not one shared abstraction).

**Characterization (named risk: the write goes nowhere or skips the visitor-tools policy that
`set` enforces):** existing `features/site-search/__tests__/settings*.test.ts` drives a real `set`
through the injected field; add one case that the composed deps from `modules/site-search.ts`
persist the value (`getEffective` reads it back). Theme preview: existing
`features/theme/__tests__/preview-switcher*.test.ts`.

**Verify:** INDEX-v4 § Gate — run by the verifier on parent and candidate; the executor runs nothing. Named test files = the characterization files above plus the list at the end of this sheet.

Base: Tovu `2d82735a` (integ/merge-3 tip). Expected edge removals: `designs/arch-120/v4/edges/L04.txt` (every line absent from the candidate's `check:architecture` output). Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L04`.

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

#### Named test files (verifier runs them; every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 5 files

```text
  apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  apps/website/src/features/site-search/__tests__/settings.test.ts
  apps/website/src/features/theme/__tests__/preview-switcher.integration.test.ts
  apps/website/src/features/theme/__tests__/preview-switcher.lost-update.test.ts
  apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts
```
The verifier runs every file above plus the new characterization tests this sheet names, on the parent and on the candidate (INDEX-v4 § Gate).
