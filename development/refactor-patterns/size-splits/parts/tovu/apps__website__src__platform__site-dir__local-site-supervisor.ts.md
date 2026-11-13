### tovu:apps/website/src/platform/site-dir/local-site-supervisor.ts
- **Over:** `createLocalSiteSupervisor` 218 (file 298, under)
- **Phase:** now (STAY-PRODUCT — blocked on site …) · **Batch:** size-14
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/sites/local-sites.unit.test.ts`, `.../routes/sites/__tests__/local-sites.pins.unit.test.ts`, `.../routes/sites/sites-wiring.unit.test.ts`, `.../routes/sites/site-previews-listing.unit.test.ts`, `apps/website/src/server/inbound/admin-http/routes/system/__tests__/sites.tw4.pins.test.ts`; plus any `rg -l "local-site-supervisor" apps/website/src --glob '*.test.*'` hit under `platform/site-dir/__tests__`. No test mocks this module.
- **Responsibility map** (inside the factory; four mutable `let`s — `closed`, `resumed`, `opened`, `lane` — are read by most nested functions):

| unit | nested functions | job |
|---|---|---|
| A ports | `allocate`, `allocateSitePort`, `preferredPort` | pick/reserve a port for a site child |
| B lifecycle | `reap`, `crash`, `canProbe`, `probe`, `scheduleProbe`, `reapRetiredSite`, `makeRoom`, `start`, `launch` | start/observe/stop children within the concurrency cap |
| C intent | `updateIntent`, `resumeSite`, `currentState` | remember/resume what the dev session had running |
| D (stays) | `serial`, `checkName`, the `supervisor` object | the port's public surface |

- **Splits:**
  1. In the factory, replace the four `let`s with ONE record `const state: SupervisorState = { closed: false, resumed: false, opened: 0, lane: Promise.resolve() as Promise<unknown> };` and build `const ctx: SupervisorContext = { state, entries, reserved, apiPorts, processPort, servingName, scheme, maxConcurrent, readyAttempts, devSession, evictIdle, intentPort };` (types declared at module level above the factory; `entries: Map<string, Entry>`, `reserved: Set<number>`, `apiPorts` = return type of `rememberedApiPorts`). Every `closed`/`resumed`/`opened`/`lane` read/write becomes `state.<name>` — mechanical, no logic change.
  2. HELPERS at module level above the factory, each `name({ ctx, …ownArgs })` with the old params folded into the object (e.g. `crash({ ctx, entry })`, `allocate({ ctx }, { preferred })`, `reap({ ctx, entry, status })`, `start({ ctx, name }, { preferred })`), bodies word for word, in the source order: `serial`, `checkName`, `allocate`, `reap`, `crash`, `canProbe`, `probe`, `scheduleProbe`, `reapRetiredSite`, `makeRoom`, `start`, `currentState`, `allocateSitePort`, `launch`, `updateIntent`, `preferredPort`, `resumeSite`. Every internal call gains `ctx`. All comments (failed-reap, admission lane, public-URL identity, Stop-wins) move with their function.
  3. The factory keeps: `assertSiteLimit`, the `entries`/`apiPorts`/`reserved` decls, `state`, `ctx`, and the `supervisor` object (its methods now call the module helpers with `ctx`), `return supervisor`.
- **Importers to update:** none (exports unchanged).
- **After:** `createLocalSiteSupervisor` ~60; largest helper `start` ~23; file ~330.
- **Risks / notes:** state that was a closed-over `let` is now a shared record — every write must go through `state.` (grep the moved bodies for bare `closed`/`resumed`/`opened`/`lane` before running tests). `lane` chaining in `serial` must keep `state.lane = next.catch(() => {})`. Executor: Opus/Fable preferred (concurrency + timer ordering).
