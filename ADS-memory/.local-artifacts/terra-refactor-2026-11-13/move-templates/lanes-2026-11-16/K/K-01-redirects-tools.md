# K-01 redirects agent tools -> `@jini-ai/cms/redirects` (one run, est 170k)
files: `K-01.files.tsv` (`redirects/agent-tools.ts` 231, `redirects/tool-registrations.ts` 286). tools: `K-01.tools.tsv` = 7 (`redirects_list, _get, _get_hits, _create, _update, _tombstone, _import`), all `inline`, longest 28 code lines. THIRD_PARTY_ALLOWED: none. pkg: cms.
writes (bookkeeping, COMMON-KT rule 4): `development/scripts/size-exceptions.json` row for `buildRedirectsRegistrations` (line 26 on merge-final), deleted in S1 (the 123-line builder becomes a table, so the accepted exception no longer matches anything). tests: `apps/website/src/features/redirects/**/*.test.ts apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts`.
over the limit (`K-01.fnsize.tsv`): `buildRedirectsRegistrations` 123 (S1 turns it into a 7-row table), `getRedirectsAgentToolCatalog` 55: the schema constants are ALREADY module-level (lines 59-168); the function is one array literal of 7 entries. Split in S1: each entry becomes a module const (`REDIRECTS_LIST_TOOL` ...), the function returns `[...]` of them in the same order.
target files: `packages/cms/src/redirects/agent-tools.ts` (about 235 lines), `tool-registrations.ts` (about 260). Guard: neither exists; `rg -n "buildRedirectsRegistrations|redirectsDerivedRisk" packages/*/src` prints nothing.
BINDINGS (imports of `redirects/tool-registrations.ts`):
| import | class | action |
|---|---|---|
| `toolMetadata` (`contracts/core/tool-metadata/redirects.js`; holds the `redirects_tombstone` confirmation policy) | host | stays; bound with `withToolMetadata` |
| `@jini-ai/cms/core` (`adaptLegacyAuthorize`, `requireToolPermission`, `ForbiddenError`) | own | leaf file found with `rg -n "export .*requireToolPermission" packages/cms/src/core` |
| `@jini-ai/cms/redirects` (services, errors, types, constants) | own | leaf files |
| `@jini-ai/core`, `@jini-ai/core/*` | core | as is |
| `@jini-ai/daemon/surface-exchanges`, `@jini-ai/daemon/scheduler`, `@jini-ai/platform/system` | host | used only by the default `surfaces` value, which STAYS as the default of Tovu `buildRedirectsRegistrations(routeDeps, surfaces = ...)` (identity rule; `agent-tools.tombstone-confirmation.test.ts:81` passes `{ surfaceExchanges }`, `tool-registrations.model-facing-errors.test.ts:68` passes nothing). Handlers never read `surfaces` -> Jini signature `buildRedirectsToolRegistrations({ deps }, optional = {})` |
| `./agent-tools.js` | own | moves |
`REDIRECTS_MODEL_FACING_RULES` uses only cms/core + core classes: moves with the builder.
S0 extra: (f) `redirects_list` leaves out a rule whose `isInTrash` is true; (g) `redirects_tombstone` descriptor metadata equals the golden (confirmation policy). changeset: cms minor "redirect agent tools and catalog".
