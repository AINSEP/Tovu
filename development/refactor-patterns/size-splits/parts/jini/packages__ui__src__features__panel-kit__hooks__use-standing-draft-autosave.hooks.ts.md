### jini:packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts
- **Over:** `useStandingDraftAutosave` 175 (file 229)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/panel-kit/hooks/__tests__/use-standing-draft-autosave.hooks.test.tsx`, `packages/ui/src/features/panel-kit/hooks/__tests__/admin-lifecycles.test.tsx`, `packages/ui/src/features/panel-kit/helpers/__tests__/standing-draft-local-backup.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `staleBasis` state, `staleBasisRef`, `backupEntryIdRef`, `markStaleBasis`, `liftStaleGate`, `dropLocalBackup` | stale-basis gate + local-backup mirror |
| B | `recoverableDraft` state + mount/entry recovery `useEffect` (~L239) + `dismissRecoverable` + `comparedDraft` | recover a draft on entry open |
| C | `idleTimerRef`, `firstPendingAtRef`, `pendingDraftRef`, `clearPendingTimer` | pending debounce timer |
| D | `useEffect(() => () => flushPendingAutosave(false)…`, `pagehide` `useEffect` (~L410) | flush on exit |
| E | `writes`, `enqueue`, `preserveFailedSave`, `writeAutosave`, `scheduleAutosave`, `flushPendingAutosave`, `clearStandingDraft`, `supersedeBasis` | write pipeline (stays) |

- **Splits** (same file, above the hook, in this order):
  1. SUB-HOOK `useStaleBasisGate({ backup, entryId, backupPrincipalId }: UseStaleBasisGateInput): { staleBasis, setStaleBasis, staleBasisRef, backupEntryIdRef, markStaleBasis, liftStaleGate, dropLocalBackup }` ← unit A with all its comments.
  2. SUB-HOOK `usePendingAutosaveTimer(): { idleTimerRef, firstPendingAtRef, pendingDraftRef, clearPendingTimer }` ← unit C (keep the `pendingDraftRef` comment).
  3. SUB-HOOK `useDraftRecovery({ enabled, entryId, port, backup, backupPrincipalId, staleBasisRef, setStaleBasis, backupEntryIdRef, minBaseVersionRef, latestDraftRef }: UseDraftRecoveryInput): { recoverableDraft, setRecoverableDraft }` ← `recoverableDraft` `useState` + the recovery `useEffect` (comment + deps verbatim). `dismissRecoverable`/`comparedDraft` stay in the main hook.
  4. SUB-HOOK `useFlushAutosaveOnExit({ enabled, entryId, flushPendingAutosave }: UseFlushAutosaveOnExitInput): void` ← both unit-D effects with their long comments.
- **Importers to update:** none.
- **After:** `useStandingDraftAutosave` ~92; file ~250.
- **Risks / notes:** HOOK ORDER changes (state/refs created in a different order) — harmless on mount, but effect order must stay: recovery effect must still run before the flush effects; call `useDraftRecovery` where the recovery effect was (after `dropLocalBackup`), `useFlushAutosaveOnExit` after `flushPendingAutosave`. `minBaseVersionRef`/`latestDraftRef` must be declared before `useDraftRecovery` is called.
