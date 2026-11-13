### jini:packages/agent-plugins/src/lifecycle/update.ts
- **Over:** `createUpdateModule` 204
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/update.unit.test.ts`, `.../lifecycle-reconciliation.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in. (here the closure is the exported `createUpdateModule(ports, optional)`.)
- **Splits:**
  1. MODULE-LEVEL pure verbatim above: `admissionWarnings`, `isPluginStateRoot`, `errorCode` (+ `disableBeforeSwitch`/`rollBackAfterFailure` only if their bodies read no factory locals) (~16-30).
  2. SUB-FACTORY `createUpdateRecovery({ ports, activation, removal, index, persistent }: CreateUpdateRecoveryInput): { setActivation; restoreUpdate; reconcileAgentPluginUpdates }` ← `setActivation`, `restoreUpdate`, `restoreOldBytes`, `reprovisionOld`, `reconcileAgentPluginUpdates`, `listPluginStateIds`, `reconcilePlugin`, `switchOffUnrecovered` (~78). Job: idempotent boot/rollback recovery.
  3. SUB-FACTORY `createUpdateSwitch({ ports, removal, recovery }: CreateUpdateSwitchInput): { performUpdate }` ← `performUpdate`, `beginJournal`, `switchRevision`, `freezeRollback` (+ `disableBeforeSwitch`, `rollBackAfterFailure` if not moved in 1) (~60). Job: journaled revision switch.
  4. `createUpdateModule` keeps wiring, `updateAgentPlugin`, `updateLocked`, `readTarget`, return (same two names).
- **Importers to update:** none.
- **After:** `createUpdateModule` ~60; sub-factories ~78 / ~60; file ~265.
- **Risks / notes:** `switchRevision` / `rollBackAfterFailure` call recovery functions (hoisted) — take them from `recovery`.
