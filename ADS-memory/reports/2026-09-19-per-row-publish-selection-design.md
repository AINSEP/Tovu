# Per-row publish selection (design)

Author: Codex gpt-5.6-sol, xhigh, read-only, 2026-09-19.
Owner rulings this designs to: skipping a row means KEEP THE PRODUCTION VERSION (not "do not send");
deleting on production is a separate explicit action; a local delete never deletes live.
Design bar: ZERO CONCEPTS - no "baseline", "conflict", "force" or "adopt" in anything the user sees.

---

Codex(Direct): Use opt-in row checkboxes backed by a server-validated, exact-version selection manifest. Every row starts unselected. Selecting means “publish the version shown”; leaving it unselected means “keep the live version.” Never expose “baseline,” “conflict,” “force,” or “adopt” to the user.

The audit’s three choices safely collapse to two only if “keep live” is an active, version-pinned decision that records the accepted live revision. Merely omitting the row would not satisfy the owner’s ruling. Internally:

- `adopt local` becomes `publish_source`.
- `adopt destination` and `skip` become one `keep_destination` action.
- Blocked rows are not choices.

## Row-model change

The current planner row exposes only identity, outcome, `writes`, and a reason; it drops the source hash and the destination hash/version ([planner.ts:88-96](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/planner.ts:88)). The UI then converts that directly into publish/unchanged/skipped labels ([report-rows.ts:31-45](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/ui/report-rows.ts:31)).

Replace that decision-by-outcome model with comparison facts plus a separate user choice:

```ts
interface PublishCandidateRow {
  key: string;                    // entityType + entityId
  entityType: string;
  entityId: string;
  displayName: string;

  state: "new" | "same" | "different" | "blocked";

  sourceRevision: {
    contentHash: string;
    schemaVersion: number;
  };

  destinationRevision: {
    contentHash: string;
    version: number;
  } | null;

  fingerprint: string;
  differences: readonly {
    field: string;
    label: string;
    yourValue: string | null;
    liveValue: string | null;
    change: "added" | "removed" | "changed";
  }[];

  blockedReason: string | null;
  requiredRowKeys: readonly string[];
}

interface PublishRowChoice {
  key: string;
  action: "publish_source" | "keep_destination";
  reviewedFingerprint: string;
}
```

The fingerprint must cover the key, source hash/schema version, destination hash/version, eligibility, and required rows.

The planner currently possesses incoming `state` and `contentHash`, but the handler’s destination inspection returns only `{version, hash}` ([type-registry.ts:131-156](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/type-registry.ts:131), [type-registry.ts:188-204](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/type-registry.ts:188)). Therefore the planner cannot currently produce a field diff or a human-readable name. Add a read-only, type-specific comparison method to `PublishContentHandler` that returns a sanitized display name and display-safe field values in the same read as the destination revision. Do not send arbitrary stored state to the browser.

In `report-rows.ts`, add:

- `selectable`
- `selected`
- `uncheckedLabel`
- `checkedLabel`
- `differences`
- `fingerprint`
- `requiredRowKeys`

Stop deriving execution from the planner’s old `writes` boolean. It currently does exactly that ([report-rows.ts:99-112](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/ui/report-rows.ts:99)).

## Confirmation change

`PublishContentPhase` must retain both the plan and a choice map:

```ts
{
  kind: "planned";
  plan: PublishContentPlanResult;
  choices: ReadonlyMap<string, PublishRowChoice>;
  changedSinceReview: ReadonlySet<string>;
}
```

`canConfirmPlan` must no longer ask whether the planner produced any writing row, as it does now ([phase.ts:60-73](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/ui/phase.ts:60)). It should return true only when:

1. At least one current, publishable row is explicitly selected.
2. Every selected row’s `reviewedFingerprint` matches the current row.
3. No selected row is blocked.
4. Every required row is either already live and matching or explicitly selected.
5. No row is awaiting renewed review after changing.

A row absent from `choices` resolves to:

- Existing live item: `keep_destination`.
- New item: do not create it.
- Same item: no content action.
- Blocked item: no content action and no baseline adoption.

Confirmation sends a complete manifest for all displayed rows, not merely selected keys. This prevents a server-side default or newly recomputed planner outcome from turning an untouched row into a publish.

The selected manifest must become part of the resolved report and therefore part of `planHash`. The current confirm port accepts only `planId` and `planHash` ([publish-content-port.hooks.ts:49-65](/Users/la/Programming/Tovu/apps/admin/src/features/publish-content/hooks/publish-content-port.hooks.ts:49)); extend the flow so the same staged `bundleId` is replanned with the complete manifest before confirmation.

For an eligible existing row resolved as `keep_destination`, execution should record its pinned destination hash as the accepted baseline. Today conflicts receive no baseline update, while only unchanged rows do ([apply-loop.ts:201-228](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/apply-loop.ts:201)). Without that metadata update, “keep live” would still be only omission and the audit’s three choices would remain genuinely distinct.

## Re-plan safety

Maintain choices in a map keyed by `entityType:entityId`, but never preserve a publish choice based on that key alone.

After every re-plan:

```text
same key + same fingerprint  → preserve the choice
same key + new fingerprint   → reset to keep live; mark “review again”
new key                      → default to keep live
missing key                  → remove the choice
```

Unselected rows always remain unselected, even if their newly computed planner outcome would normally write. Array position and `writes` must never participate in reconciliation.

The full selection manifest and its fingerprints are included in the hashed resolved plan. Existing infrastructure already hashes the complete plan details ([composition.ts:120-125](/Users/la/Programming/Tovu/apps/website/src/contracts/core/gated-mutations/composition.ts:120)) and rejects a changed hash before mutation ([gateway.ts:287-303](/Users/la/Programming/Tovu/apps/website/src/contracts/core/gated-mutations/gateway.ts:287)). However, `buildReport()` currently does not pass any row choices into `planImport` ([gated-hooks.ts:217-233](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/gated-hooks.ts:217)), so the existing `forcedEntityKeys` primitive is not reachable through this path despite existing in the planner ([planner.ts:136-147](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/planner.ts:136)).

## Exact-version guarantee

Every publish choice pins:

- Staged source `contentHash` and schema version.
- Destination content hash.
- Destination numeric version.
- The resulting row fingerprint.

Those values must appear in the report, selection manifest, and plan hash. Otherwise one differing live version can be replaced by another differing live version without changing today’s generic conflict reason.

At apply time:

1. Re-inspect every selected row and every `keep_destination` row.
2. Reject the resolved plan if any pinned hash/version differs.
3. For a selected row, pass the reviewed destination version as `expectedVersion`.
4. Never substitute the latest version read immediately before writing.

Today forced rows bypass the baseline comparison and `apply()` receives the freshly read current version ([apply-loop.ts:247-275](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/apply-loop.ts:247), [apply-loop.ts:295-310](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/apply-loop.ts:295)). That permits “force” to mean “overwrite whatever is there now.” The new contract must mean “replace exactly what I reviewed.”

If anything moved before execution, perform no writes and refresh the review. If it moves after the global check, the per-row pinned compare-and-swap must reject that row rather than overwrite it.

## Literal user-facing copy

Title:

> Choose what goes live

Introduction:

> Select the items you want to publish. Existing items you leave unchecked keep the live version. New items you leave unchecked stay unpublished.

Deletion notice:

> Items deleted here stay on the live site. Removing something from the live site is a separate action.

Table columns:

> Publish  
> Item  
> Status  
> Changes

Row copy:

- New, unchecked: **Not selected — won’t be added to the live site**
- New, checked: **Add to live site**
- Different, unchecked: **Keep live version**
- Different, checked: **Replace live version with your version**
- Same: **Already matches live site**
- Blocked: **Can’t publish: {reason}**
- Diff control: **View changes** / **Hide changes**
- Diff headings: **Your version** / **Live version**

Summary:

> {N} selected · {M} keeping the live version · {K} already up to date

Primary action:

> Publish {N} selected

With nothing selected:

> Select at least one item

Final confirmation:

> You’re about to publish {N} items to {site}. {M} other items will keep the live version.

Buttons:

> Back  
> Publish {N} items

When re-planning finds movement:

> The live site changed while you were reviewing. We refreshed the list. Check the changed items and select them again.

Changed-row status:

> Changed on live site — review again

The separate production-removal flow should say:

> Remove “{name}” from the live site? It will stop appearing immediately and can be restored for 60 days. After 60 days it will be permanently deleted.

Buttons:

> Cancel  
> Remove from live site

A local delete must never be converted into this action implicitly. The existing audit identifies deletion as currently undefined ([codex-report.md:170](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex-publish-audit/codex-report.md:170)).

## Ordered implementation

1. Extend the comparison contract in [type-registry.ts](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/type-registry.ts) and implement sanitized comparison data in each publishing contributor.

2. Refactor candidate facts and selection resolution in [planner.ts](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/planner.ts). Include source/destination pins, fingerprints, differences, and required-row keys.

3. Mirror the wire shapes in [ui/contract.ts](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/ui/contract.ts) and its compile-time contract check.

4. Add selection-aware rendering and summaries in [report-rows.ts](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/ui/report-rows.ts), then add the choice-bearing phases and strict `canConfirmPlan` validation in [phase.ts](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/ui/phase.ts).

5. Thread the complete selection manifest through [gated-hooks.ts](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/gated-hooks.ts), [import.ts](/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts), the two peer-transport files, and [publish-content-port.hooks.ts](/Users/la/Programming/Tovu/apps/admin/src/features/publish-content/hooks/publish-content-port.hooks.ts). Re-plan the same staged bundle with the manifest before issuing a token.

6. Update [apply-loop.ts](/Users/la/Programming/Tovu/apps/website/src/features/publish-content/apply-loop.ts) to enforce pinned hashes/versions, use the reviewed version for compare-and-swap, and persist `keep_destination` baselines only after verifying the destination still matches.

7. Add the checkbox, diff expansion, stale-row reset, and literal copy in [use-publish-content-confirm.hooks.ts](/Users/la/Programming/Tovu/apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts) and [PublishContentDialog.tsx](/Users/la/Programming/Tovu/apps/admin/src/features/publish-content/PublishContentDialog.tsx).

8. Build tests first in the existing planner, report-row, phase, gated-hook, apply-loop, route, transport, and dialog test files. This follows the repository’s required spec/test/vertical-slice progression ([14-meta-coding-framework…:8-16](/Users/la/Programming/Tovu/ADS-memory/docs/architecture/sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md:8)) and keeps the comparison behavior behind the existing swappable handler boundary ([13-user-friction…:29-40](/Users/la/Programming/Tovu/ADS-memory/docs/architecture/sections/13-user-friction-coverage-living-backlog.md:29)).

## Risks

- Type-specific field diffs can expose sensitive or very large values; adapters must whitelist, redact, and truncate fields.
- Partial selection can break content dependencies. `requiredRowKeys` must be validated server-side, not merely hinted in the UI.
- Recording “keep live” changes future comparison ancestry. It must be audited with the exact accepted destination revision.
- A race after the global recheck can still produce a partial multi-row run; per-row pinned compare-and-swap, durable item status, and the existing restore point remain necessary.
- Protocol changes require old-peer rejection or capability negotiation; silently treating a missing manifest as “publish everything” is forbidden.
- Production removal needs a separate tombstone and purge mechanism; it must not share the publish checkbox or infer removal from an absent local entity.

No files were changed and no tests were run.