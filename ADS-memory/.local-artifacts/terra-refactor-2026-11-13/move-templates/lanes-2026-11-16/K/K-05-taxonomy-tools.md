# K-05 taxonomy agent tool handlers -> `@jini-ai/cms/taxonomy` (one run, est 240k; hand off at 200k after a pushed step)
files: `K-05.files.tsv` (`taxonomy/tool-registrations.ts` 450). The catalog is ALREADY in Jini (`packages/cms/src/taxonomy/agent-tools.ts`); Tovu `taxonomy/agent-tools.ts` (39-line binding) stays. So `K-05.tools.tsv` shows `NOT-IN-CATALOG` for the Tovu-side check: expected; S0 (a) compares against the Jini catalog names instead. tools = 10 (round 1 said 12); one wrapped by `humanConfirmedToolHandler` (key `MERGE_TOOL_ID`, 66 code lines). pkg: cms.
writes: `development/scripts/size-debt.json` entry `buildTaxonomyRegistrations#1`, deleted in S1. tests: `apps/website/src/features/taxonomy/**/*.test.ts`.
over the limit: `buildTaxonomyRegistrations` 223; the merge handler 66: S1 splits it into `mergePrepare`, `mergeDialog` (stays in Tovu if it reads host wording), `mergeRun` (each <= 50).
prerequisite (revision 3, coordinator decision 1): S1a's T1 pushed (lane S; both touch importers of `taxonomy/index.ts`
and Jini `packages/cms/src/taxonomy/index.ts`). Check, from the Tovu root; prints `ok`:
```bash
test ! -e apps/website/src/features/taxonomy/repo.ts && echo ok
```
Then regenerate the `K-05.*` sidecars on that commit before step S0. K-05 never runs at the same time as S1a.
BINDINGS:
| import | class | action |
|---|---|---|
| `toolMetadata` (`tool-metadata/taxonomy.js`) | host | `withToolMetadata` |
| `plan/confirm/execute` + types (`contracts/core/gated-mutations/gateway.js`) | port | that Tovu file BINDS the core gateway to Tovu's token policy and storage ports (its header says so), so the handlers must keep calling the bound functions: `deps.mergeGateway: { plan, confirm, execute }` typed with `@jini-ai/core` gated-mutations types (`packages/core/src/gated-mutations/{gateway,ports}.ts`); Tovu passes its three bound functions unchanged |
| `humanConfirmedToolHandler`, `refuseUnexpectedKeys` | port | `deps.humanConfirmedHandler` typed from the real signature `(surfaces, { flag, prepare, dialog, run })`; `deps.refuseUnexpectedKeys` |
| `toSlug` (`platform/html/slug.js`) | port | `deps.toSlug: (value: string) => string` (slug output is a saved format; no Jini slug helper is substituted) |
| `PostRepoPort` | structural | members called only |
| `./collection-term-policy.js`, `./gated-hooks.js`, `./index.js` names | port | fields of `TaxonomyToolDeps` holding the BUILT objects (`collectionTermPolicy`, `mergeTermHooks`, ...); the contributor builds them as the handler does today. K-05b (design queue) moves their generic parts later |
| `Clock`, `OutboxPort`, `TransactionalRepoPort`, `@jini-ai/core*` | core | as is |
| daemon/platform default surfaces | host | stays as the default of Tovu `buildTaxonomyRegistrations` (identity rule); `surfaces` REQUIRED in Jini |
S0 extra: (f) merge: plan -> confirm with a stale token is refused with the same code; execute after confirm calls the outbox fake with the same events in the same order; declined -> no repo write, no outbox call; (g) assign to a content type off the allow-list is refused.
changeset: cms minor.
