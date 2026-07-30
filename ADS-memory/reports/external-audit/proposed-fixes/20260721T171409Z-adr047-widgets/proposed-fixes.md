# External Audit Proposed Fixes

**Date:** 2026-07-21T17:14:09Z
**Scope:** custom (ADR-047 + SPEC-043 + implementation outline/report + real `src/widgets/`,
`src/core/entry-refs/` implementation + shared-module diff)
**Focus:** ADR-047 widgets domain-layer implementation correctness ahead of ACCEPTED status
**Suggested Changes Mode:** notes (escalated to grounded snippets by both auditors for several findings)
**Source Audit Report:** `ADS-memory/reports/external-audit/runs/20260721T171409Z-adr047-widgets-external-audit-report.md`
**Auditors With Suggestions:** codex (gpt-5.5, high), agy (Gemini 3.1 Pro High)

## Summary

Both external auditors, converging with an internal falsification-framed verifier pass and the
Coordinator's own pre-dispatch read, independently found the same three highest-value gaps and
proposed near-identical fixes:
1. `src/widgets/embed-service.ts` (the server-side/AI embed-mutation path, REQ-44/45, ADR-047
   Debate Fold-In Amendment 6) does not exist — needs to be built.
2. `trashWidgetInstance`/`purgeWidgetInstance` in `write-service.ts` omit the `onWritten` hook that
   every other widget-instance mutation passes, leaving a force-purged widget's own outgoing
   `entry_refs` rows stale forever.
3. No `widgets.read`-gated read/list accessor exists in the domain layer at all (REQ-04).

Plus two lower-severity, non-blocking findings both auditors flagged: `CORE_RESOLVERS`'s
`resolverId`-to-`WidgetTypeKey` cast (type-safety smell, currently harmless), and the total absence
of SQLite-backed contract tests for the two new ports.

## Coordinator Handling Guidance

- These are proposal artifacts only.
- **Per this project's standing rule and this dispatch's explicit instruction, the audit agent did
  NOT implement any of these fixes.** Every item below is dispositioned `agree-defer` (not
  `agree-implement`) specifically because implementing audit findings is reserved for the
  owner/Coordinator in a follow-up session, never applied unilaterally by the audit agent itself.
- The owner/Coordinator may accept, adapt, or reject them in a fix round, then re-run `/audit-work`
  round 2 (diff-only compliance pass) against the same `TM-adr047-widgets-audit-001` threat model.

## File Suggestions

| Path | Suggestion Type | Auditor(s) | Notes |
|---|---|---|---|
| `src/widgets/embed-service.ts` (new file) | snippet | codex, agy | Both proposed near-identical shapes: `insertWidgetEmbed`/`removeWidgetEmbed`/`reorderWidgetEmbeds`, gated by `widgets.place`/`widgets.update`, calling `validateWidgetEmbedMutation` before persisting via `updateEntry`'s `bodyJson` + `onWritten` extraction. Full agy snippet reproduced below (illustrative — validate field/permission names against the actual `write-service.ts` conventions before use, e.g. agy's snippet gates on `widgets.update`, but the ADR/spec's own §5 language suggests `widgets.place` for placement-shaped mutations; the Coordinator should resolve this before implementing, not the auditor). |
| `src/widgets/write-service.ts` (`trashWidgetInstance`, `purgeWidgetInstance`) | snippet | codex, agy | Add the same `onWritten: (entry) => extractAndStoreInstanceRefs(deps, workspaceId, entry)` hook already used by `createWidgetInstance`/`updateWidgetInstance`, to the `updateEntry` calls inside both functions. |
| `src/widgets/write-service.ts` (new `getWidgetInstance`/`listWidgetInstances`) | snippet | codex, agy | Add `widgets.read`-gated read/list accessors. Agy's snippet below is illustrative; align the actual signature/return shape with `toWidgetInstanceEntry`'s existing conventions in `entry-payload.ts` rather than the ad hoc `mapEntryToWidgetInstance` name agy invented. |
| `src/widgets/resolvers/index.ts` (`CORE_RESOLVERS` typing) | snippet | codex, agy | Re-key `CORE_RESOLVERS` by `resolverId` (a plain `string`) rather than casting `resolverId as WidgetTypeKey` into a `WidgetTypeKey`-keyed map. Low priority — currently fails safe. |
| `src/widgets/__tests__/`, `src/core/entry-refs/__tests__/` (new contract-test files) | notes | codex, agy, internal verifier | Add a shared contract-test suite exercising `EntryRefsRepoPort`/`WidgetRegionBindingRepoPort` against both `repo.memory.ts` and `repo.sqlite.ts`, per the implementation outline's own "Test Expectations" promise. |
| `src/widgets/resolvers/recent-entries.ts` | notes | codex, internal verifier (agy did not raise this one — a "missed by one" case) | Bound the `listByWorkspace` scan with a type/status filter and a query-layer limit instead of an unbounded full-workspace scan filtered/sorted in application code. |

## Notes And Snippets

### Fix 1 — `trashWidgetInstance`/`purgeWidgetInstance` missing `onWritten` (codex + agy converged, both HIGH CONFIDENCE)

Both auditors independently proposed the same minimal fix: pass the same `onWritten` callback
`createWidgetInstance`/`updateWidgetInstance` already pass, to the `updateEntry` calls inside
`trashWidgetInstance` and `purgeWidgetInstance` in `src/widgets/write-service.ts`. Codex additionally
suggested this could instead be modeled as "define purged entries as retained reference sources and
update `findByTarget`/where-used semantics to exclude or label purged sources consistently" as an
alternative to blind re-extraction — worth the owner's explicit choice between "retract on
trash/purge" vs. "retain and label" before implementing, since they have different where-used-display
implications.

### Fix 2 — `embed-service.ts` (codex + agy converged on shape, HIGH CONFIDENCE on the gap, MEDIUM on exact shape)

agy's full illustrative snippet (NOT reviewed/endorsed line-by-line by the Coordinator — see caveats
in the File Suggestions table above; in particular its permission string choice and its
`mapEntryToWidgetInstance`/`getWidgetInstanceOrThrow` helper names do not exist in the real codebase
and would need to be reconciled with `write-service.ts`'s actual helpers before use):

```typescript
// src/widgets/embed-service.ts (agy's proposed shape — needs reconciliation with real helpers)
export async function insertWidgetEmbed(
  deps: EmbedServiceDeps,
  actor: PrincipalActor,
  input: { workspaceId: UUID; hostEntryId: UUID; widgetEntryId: UUID; placementId: UUID; baseVersion?: number }
): Promise<void> {
  await requireWidgetPermission(deps, actor, input.workspaceId, "widgets.update");
  const hostEntry = await deps.entryRepo.findById(input.workspaceId, input.hostEntryId);
  if (!hostEntry) throw new Error(`Host entry ${input.hostEntryId} not found`);
  const newEmbedNode: WidgetEmbedNode = { type: "widgetEmbed", placementId: input.placementId, widgetEntryId: input.widgetEntryId };
  const currentBody = (hostEntry.bodyJson as { content?: unknown[] }) || { type: "doc", content: [] };
  const updatedBody = { ...currentBody, content: [...(currentBody.content || []), newEmbedNode] };
  const validation = validateWidgetEmbedMutation({ hostEntryType: hostEntry.type, resultingBodyJson: updatedBody });
  if (!validation.valid) throw new WidgetEmbedGuardrailError(validation.reason);
  await updateEntry(deps.entryRepo, {
    actor, workspaceId: input.workspaceId, entryId: input.hostEntryId, expectedVersion: input.baseVersion,
    bodyJson: updatedBody,
    onWritten: async (entry) => { await extractAndStoreInstanceRefs(deps, entry); },
  });
}
```

Codex's guidance (prose, no full snippet): "Add `src/widgets/embed-service.ts` with
`insertWidgetEmbed`/`removeWidgetEmbed`/`reorderWidgetEmbeds`, require `widgets.place`, validate
host/target workspace/type/status, apply `validateWidgetEmbedMutation`, and persist through an
entries chokepoint that can version `bodyJson`" — codex additionally flagged that this "likely needs
one more additive entries-chokepoint change to update `bodyJson` under version precondition,"
i.e. confirm `features/entries/write-service.ts`'s `updateEntry` can actually accept a `bodyJson`
parameter today (the implementation report's own disclosed gap #1 suggests it currently cannot — this
needs to be resolved as part of implementing this fix, not assumed away).

### Fix 3 — `widgets.read` accessors (codex + agy converged, HIGH CONFIDENCE)

Both proposed `getWidgetInstance`/`listWidgetInstances` functions gated by `requireWidgetPermission`.
agy's illustrative snippet again uses non-existent helper names (`mapEntryToWidgetInstance`) that
need reconciling with the real `toWidgetInstanceEntry` in `entry-payload.ts`.

### Fix 4 — `CORE_RESOLVERS` re-keying (codex + agy converged on the fix, DISAGREE on severity — see report's Cross-Auditor Synthesis)

```typescript
export const CORE_RESOLVERS: Readonly<Record<string, WidgetResolver>> = { /* keyed by resolverId */ };
export function getCoreResolver(resolverId: string): WidgetResolver | undefined {
  return CORE_RESOLVERS[resolverId];
}
```

## Raw Auditor Extract

Full raw JSON + prose from both auditors preserved at:
- `ADS-memory/reports/external-audit/offloads/20260721T171409Z/codex/final-answer.txt`
- `ADS-memory/reports/external-audit/offloads/20260721T171409Z/agy/dispatch-output-retry3.txt`
