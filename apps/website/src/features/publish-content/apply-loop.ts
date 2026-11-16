import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import { readBackstopMetadata } from "./backstop-service.js";
import type { BackstopInverse, BackstopAuditRecord } from "./backstop-audit.js";
import { CONTENT_HASH_VERSION, contentHash } from "./content-hash.js";
import { createHash } from "node:crypto";

import { type Clock as ClockPort, type IdGenerator as IdGeneratorPort } from "@jini-ai/core/primitives";
import { ForbiddenError } from "@jini-ai/cms/core";

import { PluginHookFailedError } from "../../contracts/core/plugin-hook-failed-error.js";

import { PublishContentApplyRowError } from "./apply-errors.js";
import { loadActiveBundle } from "./bundle-staging.js";
import type { PublishContentBundleRepoPort } from "./bundle-staging.js";
import type { PublishContentBaselineRepoPort } from "./baseline-repo.js";
import type {
  PublishContentRunItemState,
  PublishContentRunRepoPort,
  PublishContentRunRecord,
} from "./run-repo.js";
import { PublishContentBundleNotFoundError } from "./gated-hooks.js";
import type { PublishContentApplyPort } from "./gated-hooks.js";
import { entityKey } from "./planner.js";
import { NO_PUBLISH_CONTENT_SEED_HASH } from "./seed-hash.js";
import type { PublishContentSeedHashFn } from "./seed-hash.js";
import type { PublishContentOutcomeRow, PublishContentReport } from "./planner.js";
import { buildPublishContentCatalog } from "./type-registry.js";
import type {
  EntityReplacement,
  PublishContentDeps,
  PublishContentHandler,
  PackedEntity,
} from "./type-registry.js";
import type { TovuPublishPorts } from "./tovu-publish-ports.js";

/**
 * @file Task 8 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 8 / §5 risks
 * #1–#3, #6, #7, #9.
 *
 * `createPublishContentApplyPort` builds the real {@link PublishContentApplyPort} — the
 * implementation of the seam declared by `gated-hooks.ts`, wired at both composition roots.
 *
 * ## The property this file exists to hold — read before changing the per-row loop
 *
 * A destination edit landing in the narrow window between `gated-hooks.ts`'s own fresh
 * `buildReport()` (called twice already — once by `gateway.execute()`'s `PLAN_STALE` re-check, once
 * again inside `executeMutation()` right before this port is called) and THIS function's own
 * per-row write must downgrade that ONE row to `conflict`, never overwrite it and never abort the
 * whole run. Three checks close that window, in order, per writing row: (1) `created` + a row now
 * existing at apply time -> `conflict` (a true "someone else created it first" race — `save()`'s
 * `INSERT … ON CONFLICT DO UPDATE` has NO version/existence guard of its own, so this loop's own
 * `inspect()` re-check is the only thing standing between an import and a silent overwrite of a
 * concurrently-created row); (2) `applied`/`forced` + the row now GONE -> `conflict`; (3) `applied`
 * specifically (never `forced` — an operator forcing past a conflict already accepted overriding
 * whatever is there) + the destination's hash no longer matching its recorded baseline -> `conflict`.
 * Beyond those, `handler.apply()` itself is called with a freshly re-read `expectedVersion`, so
 * `updatePost`'s own `saveIfVersion` (`UPDATE … WHERE version = ?`) is a second, authoritative guard
 * against the same class of race: a `PostConflictError`/`PostNotFoundError` thrown from inside
 * `handler.apply()` is caught here and ALSO downgrades to `conflict` rather than aborting the run.
 *
 * This loop's per-row failure handling was originally scoped to `post`'s own error hierarchy
 * (`PostConflictError` and its `PostVersionConflictError` subclass, `PostNotFoundError`) with a
 * disclosed note that "a future non-post type either reuses these classes or this catch needs
 * widening when that type lands". `media` was that type, and the catch was widened rather than
 * reusing post's classes from an unrelated feature: any type may now raise
 * `PublishContentApplyRowError` (`apply-errors.ts`) to downgrade ONE row instead of aborting the run,
 * and a new content type needs no edit here at all. See that file's header for why the base class
 * lives outside `type-registry.ts`. Post's two classes keep their special case, but the post handler
 * names them (`PublishContentHandler.isApplyConflict`), so this loop imports no content type.
 *
 * The two sides are phrased differently on purpose: a `PublishContentApplyRowError`'s message is the
 * row's `reason` VERBATIM (the type owns its own operator-facing wording), while post's legacy
 * errors — whose messages are terse and contextless — keep the "changed on the destination during
 * apply" prefix they have always had.
 *
 * ## Authorship — `principalId` passed to every `handler.apply()` call is ALWAYS the operator
 *
 * This loop never swaps `principalId` for the source entity's own author before calling
 * `handler.apply()` — that would also hand the source author's (frequently non-existent-on-this-
 * instance) id to `executeCommand`'s own `authorize()` check as `command.actor.id` inside the
 * handler, which is a live authorization bug, not a style choice. Task 15's "the importer must copy
 * the source's author, never the operator's" rule is instead satisfied entirely INSIDE
 * `features/post/publish-content.ts`'s own `apply()` — it reads `entity.state.createdByPrincipalId`
 * directly for the `created` case, decoupled from whatever `principalId` this loop passes. See that
 * function's own doc for the full explanation, including the plan's own draft wording this disclosed
 * deviation corrects.
 */

/** Stable command key for one source version; reviewed file reverts also bind the destination version. */
export function publishContentItemIdempotencyKey(input: {
  workspaceId: string;
  sourcePrincipalId: string;
  entity: PackedEntity;
  sourceReplacement?: PublishContentOutcomeRow["sourceReplacement"];
}): string {
  const exactVersion = JSON.stringify([
    input.workspaceId,
    input.sourcePrincipalId,
    input.entity.entityType,
    input.entity.id,
    input.entity.schemaVersion,
    input.entity.hashVersion,
    input.entity.contentHash,
  ]);
  return `publish-content:v1:${createHash("sha256").update(exactVersion).digest("hex")}` +
    (input.sourceReplacement ? `:${input.sourceReplacement.version}` : "");
}

/**
 * Every port some registered type's `apply()` needs, with `ports` made EXHAUSTIVE (every registered
 * type's own port, not just the ones a particular caller happens to use) — the apply bag is the one
 * bag that has to be complete.
 *
 * `ports` stays `Partial` on {@link PublishContentDeps} because an export/plan caller genuinely has
 * no use for every type's ports, and each type degrades quietly when its own port is absent. That is
 * right for `pack` and catastrophic for `apply`: an incomplete bag reaches a handler's `apply()` and
 * throws a bare `Error`, which `applyOneRow` cannot downgrade to a row outcome, so it aborts the
 * whole run.
 *
 * This type exists so that failure is impossible to ship. A composition root that forgets a type's
 * port now fails to COMPILE at {@link toPublishContentApplyDeps} instead of failing at run time —
 * which is what happened when `media` landed: both roots kept building a bag from the fields `post`
 * needed, media's `pack()` silently returned nothing, and the type could not travel at all.
 */
export type PublishContentApplyDeps = Omit<PublishContentDeps, "ports"> &
  Required<Pick<PublishContentDeps, "outbox" | "changeSets" | "authorize">> & {
    readonly ports: TovuPublishPorts;
  };

/**
 * The composition roots' one way to build {@link createPublishContentApplyPort}'s deps bag.
 *
 * Identity in behaviour, load-bearing in TYPE: it is the single place the apply bag's completeness
 * contract is stated, so `server/runtime/composition/deps.ts` (SQLite) and
 * `server/runtime/composition/app.ts` (in-memory) cannot drift apart or silently skip a type's
 * ports. Adding a port to {@link PublishContentApplyDeps} makes every root that has not supplied it
 * a compile error — the whole point.
 *
 * @complexity O(1) — no work; the type checking is the function.
 */
export function toPublishContentApplyDeps(required: PublishContentApplyDeps): PublishContentApplyDeps {
  return required;
}

export interface CreatePublishContentApplyPortInput {
  readonly workspaceId: string;
  readonly bundleRepo: PublishContentBundleRepoPort;
  readonly baselineRepo: PublishContentBaselineRepoPort;
  readonly runRepo: PublishContentRunRepoPort;
  /** Must include `changeSets`/`authorize` populated — this factory is the one caller responsible
   *  for supplying them (`features/post/publish-content.ts`'s `apply()` throws loudly if they are
   *  missing when it is actually reached). Composition roots build this through
   *  {@link toPublishContentApplyDeps}, which makes the completeness requirement a compile-time one;
   *  the parameter itself stays the wider {@link PublishContentDeps} so focused apply-loop tests can
   *  still supply only the ports the type under test actually reads. */
  readonly publishContentDeps: PublishContentDeps;
  readonly clock: ClockPort;
  readonly idGen: IdGeneratorPort;
  /** D1 — the SAME seed-version lookup the plan was built with (`seed-hash.ts`). The apply-time
   *  re-verification below must accept the seed as a virtual baseline exactly where the planner
   *  did, or every seed-matched `applied` row is silently downgraded to `conflict` at execute.
   *  Omitted means "no seed", the pre-D1 behaviour; both composition roots pass
   *  `RouteDeps.publishContentSeedHash`. */
  readonly getSeedHash?: PublishContentSeedHashFn;
}

/** The mutable, per-call working state {@link applyOneRow} needs — grouped into one object so that
 *  function's own signature stays a single required-input-object parameter (this codebase's own
 *  convention for exported/boundary functions) despite the number of fields involved.
 *  @complexity N/A — a plain data grouping, no behavior. */
interface ApplyRowContext {
  readonly workspaceId: string;
  readonly runId: string;
  readonly sourcePrincipalId: string;
  readonly principalId: string;
  readonly entityByKey: ReadonlyMap<string, PackedEntity>;
  readonly handlerByType: ReadonlyMap<string, PublishContentHandler>;
  readonly baselineRepo: PublishContentBaselineRepoPort;
  readonly getSeedHash: PublishContentSeedHashFn;
  readonly clock: ClockPort;
  readonly recordContentApplied: (input: {
    itemKey: string;
    changeSetId: string;
    /** The retire half's own change set, for a `retires` row whose retire and create both landed. */
    retiredChangeSetId?: string;
  }) => Promise<void>;
}

/**
 * How {@link applyOneRow} should report a failure raised by `handler.apply()` — the row's downgraded
 * outcome plus its operator-facing reason — or `null` for a genuine failure that must abort the run.
 *
 * Any type may opt one of its own failures into a downgrade by raising
 * {@link PublishContentApplyRowError}; a handler whose errors predate it (`post`/`page`) names them
 * through its own `isApplyConflict`. See this file's header for why the two are phrased differently.
 *
 * A permission refusal from `executeCommand` (`ForbiddenError`) is `blocked` for every type: the
 * gateway authorizes before it writes, so the refused command wrote nothing, and one row the
 * operator (or a publishing grant) may not write must not abort everything else.
 *
 * @complexity O(1).
 */
function classifyApplyRowFailure(
  { error, row, handler }: { error: unknown; row: PublishContentOutcomeRow; handler: PublishContentHandler },
  _optional = {}
): { outcome: "conflict" | "blocked"; reason: string } | null {
  if (error instanceof PublishContentApplyRowError) {
    return { outcome: error.rowOutcome, reason: error.message };
  }
  if (error instanceof ForbiddenError) {
    return { outcome: "blocked", reason: error.message };
  }
  if (handler.isApplyConflict?.(error)) {
    return {
      outcome: "conflict",
      reason: `${row.entityType} '${row.entityId}' changed on the destination during apply: ${error.message}`,
    };
  }
  return null;
}

/**
 * Names the item a plugin save hook refused when it aborts a row-by-row run, so the caller can say
 * that the items before it stay saved (`PluginHookFailedError.refusedItemRef`). Any other error, or
 * a failure outside a row, is returned unchanged.
 * @complexity O(1).
 */
function withRefusedItem({ error, itemKey }: { error: unknown; itemKey: string | null }, _optional = {}): unknown {
  if (!(error instanceof PluginHookFailedError) || itemKey === null) return error;
  return new PluginHookFailedError(error.pluginId, error.message, { cause: error, refusedItemRef: itemKey });
}

/**
 * R5 (`plan-publish-repoint-menus-2026-09-24.md` §2.3) — capitalizes a handler's own `entityType`
 * for the one generic, type-agnostic operator-facing prefix the repoint pass produces when a whole
 * `repointReferences()` call throws (as opposed to a per-holder line, which the handler itself
 * already phrases — see {@link createPublishContentApplyPort}'s repoint pass, below).
 * @complexity O(1).
 */
function capitalize({ value }: { value: string }, _optional = {}): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

type ApplyRowResult = { row: PublishContentOutcomeRow; changeSetId: string | null; retiredChangeSetId: string | null };
type InspectedRow = NonNullable<Awaited<ReturnType<PublishContentHandler["inspect"]>>>;
type RetiringRow = PublishContentOutcomeRow & { retires: NonNullable<PublishContentOutcomeRow["retires"]> };

/** What the per-row checks and writes of ONE report row read. `applyOneRow` builds it once, after it
 *  read `current` (the destination row as it is right now, `null` when absent), and every step below
 *  takes it as `{ step }`, so a value one step needs (a later lost-update observation, say) is a field
 *  here and not a new argument to each step. */
interface ApplyRowStep {
  readonly row: PublishContentOutcomeRow;
  readonly ctx: ApplyRowContext;
  readonly key: string;
  readonly entity: PackedEntity;
  readonly handler: PublishContentHandler;
  readonly current: InspectedRow | null;
}
type RetiringRowStep = ApplyRowStep & { readonly row: RetiringRow };

/** The row with its outcome downgraded: nothing was written, so no change set id. */
function downgradedRow(
  { row, outcome, reason }: { row: PublishContentOutcomeRow; outcome: "conflict" | "blocked"; reason: string },
  _optional = {}
): ApplyRowResult {
  return { row: { ...row, outcome, writes: false, reason }, changeSetId: null, retiredChangeSetId: null };
}

/** The downgrade a failure from `handler.apply()` calls for, or the failure itself rethrown. */
function downgradeOrRethrow(
  { error, row, handler }: { error: unknown; row: PublishContentOutcomeRow; handler: PublishContentHandler },
  _optional = {}
): ApplyRowResult {
  const downgrade = classifyApplyRowFailure({ error, row, handler });
  if (!downgrade) throw error; // genuine failure — the caller's own try/catch persists a `failed` run row and rethrows.
  return downgradedRow({ row, outcome: downgrade.outcome, reason: downgrade.reason });
}

/**
 * Applies exactly one report row, mutating nothing — returns the row as it actually resolved (which
 * may differ from the plan's own prediction, see this file's header) plus the `changeSetId` a write
 * produced (or `null` for a row that wrote nothing), and `retiredChangeSetId` — the SEPARATE change
 * set a {@link PublishContentOutcomeRow.retires} row's retire half produced (`null` for every other
 * row, including a `retires` row that never reached the write, e.g. because it was downgraded to
 * `conflict` before either write was attempted). It stays apart from `changeSetId` rather than
 * collapsing into one list, so a caller counting "one change set per row" is never off by one for a
 * row that produced two.
 *
 * @complexity O(1) plus whatever `handler.inspect`/`handler.planRetire`/`handler.retire`/
 * `handler.apply`/`baselineRepo` I/O costs — no loop; {@link createPublishContentApplyPort} is what
 * iterates a report's rows.
 */
async function applyOneRow({ row, ctx }: { row: PublishContentOutcomeRow; ctx: ApplyRowContext }, _optional = {}): Promise<ApplyRowResult> {
  const key = entityKey({ entityType: row.entityType, entityId: row.entityId });

  if (!row.writes) {
    return refreshNonWritingRow({ row, ctx });
  }
  const entity = ctx.entityByKey.get(key);
  const handler = ctx.handlerByType.get(row.entityType);
  if (!entity || !handler) {
    // Internal inconsistency (the bundle/registry moved between planning and apply in a way that
    // should not be reachable through normal use) — downgrade, do not crash the whole run over it.
    return downgradedRow({
      row,
      outcome: "blocked",
      reason: `internal inconsistency: no packed entity/handler for ${row.entityType} '${row.entityId}' at apply time`,
    });
  }

  const current = await handler.inspect({ id: entity.id });
  const step: ApplyRowStep = { row, ctx, key, entity, handler, current };

  if (row.retires) {
    return applyRetiringRow({ step: { ...step, row: { ...row, retires: row.retires } } });
  }
  const raced = checkExistence({ step });
  if (raced) return raced;
  if (row.outcome === "applied" && current) {
    const conflict = await checkAgreement({ step, current });
    if (conflict) return conflict;
  }
  return applyOrdinaryRow({ step });
}

/** publish-overwrite-live-plan §4/S5 — an address-clash overwrite. This row's own entity id must
 *  still be free at the destination (unlike a slug clash, "someone already holds THIS id" here
 *  would mean a genuine create race, not the live holder this row is about to retire), and the
 *  live row row.retires named at plan time must still be exactly what a FRESH planRetire() sees —
 *  closing the same plan/apply window this file's header requires for every other outcome, just
 *  applied to a target that lives outside this row's own id. Both checks run BEFORE either write,
 *  so a stale retire target never reaches handler.retire()/apply() at all. */
async function validateRetire({ step }: { step: RetiringRowStep }, _optional: Record<string, never> = {}): Promise<ApplyRowResult | null> {
  const { row, entity, handler, current } = step;
  if (current !== null) {
    return downgradedRow({ row, outcome: "conflict", reason: `${row.entityType} '${row.entityId}' was created on the destination between plan and apply` });
  }
  if (!handler.planRetire || !handler.retire) {
    return downgradedRow({
      row,
      outcome: "blocked",
      reason: `internal inconsistency: no planRetire()/retire() on the ${row.entityType} handler for a retire-offered row at apply time`,
    });
  }
  const freshTarget = await handler.planRetire({ entity });
  if (!freshTarget || freshTarget.entityId !== row.retires.entityId || freshTarget.hash !== row.retires.hash) {
    return downgradedRow({ row, outcome: "conflict", reason: `the live ${row.entityType} at this address changed after this run's plan was built` });
  }
  return null;
}

async function applyRetiringRow({ step }: { step: RetiringRowStep }, _optional: Record<string, never> = {}): Promise<ApplyRowResult> {
  const { row, ctx, key, entity, handler } = step;
  const refused = await validateRetire({ step });
  if (refused) return refused;
  const itemIdempotencyKey = publishContentItemIdempotencyKey({
    workspaceId: ctx.workspaceId,
    sourcePrincipalId: ctx.sourcePrincipalId,
    entity,
  });
  let retireResult: { changeSetId: string; undo(): Promise<void> } | undefined;
  let changeSetId: string;
  try {
    if (!handler.retire) throw new Error("Publish content handler has no retire operation");
    retireResult = await handler.retire({
      target: row.retires,
      principalId: ctx.principalId,
      // Scoped to this run: `undo()` restores forward and leaves the retire's change set (and its
      // key) in the ledger, so a key shared across runs would make every retry after an undone
      // retire fail as "already executed".
      idempotencyKey: `${itemIdempotencyKey}:retire:${ctx.runId}`,
    });
    ({ changeSetId } = await handler.apply({
      entity,
      expectedVersion: undefined, // current === null (checked above) — this is always a create.
      principalId: ctx.principalId, // always the operator — see this file's header.
      idempotencyKey: itemIdempotencyKey,
    }));
  } catch (error) {
    await undoRetire({ error, retireResult, row });
    return downgradeOrRethrow({ error, row, handler });
  }
  // Both writes landed. A failure from here on is accounting only, so it fails the run (keeping
  // `content_applied` and both change-set ids) instead of undoing anything.
  await ctx.recordContentApplied({ itemKey: key, changeSetId, retiredChangeSetId: retireResult.changeSetId });
  await refreshBaseline({ row, entity, ctx });
  return { row, changeSetId, retiredChangeSetId: retireResult.changeSetId };
}

function checkExistence({ step }: { step: ApplyRowStep }, _optional: Record<string, never> = {}): ApplyRowResult | null {
  const { row, current } = step;
  if (row.outcome === "created" && current !== null) {
    return downgradedRow({ row, outcome: "conflict", reason: `${row.entityType} '${row.entityId}' was created on the destination between plan and apply` });
  }
  if (row.outcome !== "created" && current === null) {
    return downgradedRow({ row, outcome: "conflict", reason: `${row.entityType} '${row.entityId}' was removed from the destination between plan and apply` });
  }
  return null;
}

async function checkAgreement(
  { step, current }: { step: ApplyRowStep; current: InspectedRow },
  _optional: Record<string, never> = {}
): Promise<ApplyRowResult | null> {
  const { row, ctx, entity, handler } = step;
  // Never for `forced` — an operator forcing past a conflict already accepted overriding whatever
  // is there. Re-derives the SAME baseline `planEntity` (`planner.ts`) compared against, rather
  // than reusing any value carried on `row` (the report never carries one) — this IS the
  // apply-time re-verification this file's header calls "the single most important property".
  const baseline = await ctx.baselineRepo.findOne({
    workspaceId: ctx.workspaceId,
    peerPrincipalId: ctx.sourcePrincipalId,
    entityType: row.entityType,
    entityId: row.entityId,
  });
  // Missing or obsolete history falls back to the current seed, exactly as the planner does.
  // An old hash generation cannot authorize an overwrite or veto a current seed match.
  // S-F4: then the handler's own seed (`handler.seedHash`), exactly as `planEntity` falls back.
  const agreedHash = baseline?.hashVersion === CONTENT_HASH_VERSION
    ? baseline.hashAtLastSync
    : ((await ctx.getSeedHash({ entityType: row.entityType, entityId: row.entityId })) ??
      (await handler.seedHash?.({ id: entity.id })) ??
      null);
  if (agreedHash === null || current.hash !== agreedHash) {
    return downgradedRow({
      row,
      outcome: "conflict",
      reason: `${row.entityType} '${row.entityId}' was edited on the destination again after this run's own plan was built`,
    });
  }
  return null;
}

async function applyOrdinaryRow({ step }: { step: ApplyRowStep }, _optional: Record<string, never> = {}): Promise<ApplyRowResult> {
  const { row, ctx, key, entity, handler, current } = step;
  try {
    const { changeSetId } = await handler.apply({
      entity,
      // This row is the server-verified report, not bundle flags or writes:true.
      ...(row.outcome === "forced" && row.canOverwrite && row.sourceReplacement
        ? { sourceReplacement: row.sourceReplacement } : {}),
      expectedVersion: current?.version, // `created` -> undefined (current is null); applied/forced -> fresh version just read above.
      principalId: ctx.principalId, // always the operator — see this file's header.
      idempotencyKey: publishContentItemIdempotencyKey({
        workspaceId: ctx.workspaceId,
        sourcePrincipalId: ctx.sourcePrincipalId,
        entity, sourceReplacement: row.sourceReplacement,
      }) + (handler.idempotencyScope === "run" ? `:${ctx.runId}` : ""),
    });
    // Persist the change-set id BEFORE the baseline write. If that next write fails, status lookup
    // still proves exactly which content mutation landed and a retry can use the same command key.
    await ctx.recordContentApplied({ itemKey: key, changeSetId });
    await refreshBaseline({ row, entity, ctx });
    return { row, changeSetId, retiredChangeSetId: null };
  } catch (error) {
    return downgradeOrRethrow({ error, row, handler });
  }
}

/** The ids and principals that name one `applyReport` call: fixed before anything is written. */
interface ApplyRunIdentity {
  readonly runId: string;
  readonly startedAt: string;
  readonly sourcePrincipalId: string;
  readonly principalId: string;
  readonly restorePointId: string;
}

/** The ONE owner of what an `applyReport` call mutates. Written only by the steps that say so:
 *  `prepareRunAudit` (`report`, `auditRecord`), `initializeRunItems`, `recordContentApplied`,
 *  `recordRowOutcome` (`activeItemKey`, `effectiveRowsByKey`, `itemByKey`), `recordRawRollback` and
 *  `recordFailedItem`. */
interface RunProgress {
  report: PublishContentReport;
  readonly effectiveRowsByKey: Map<string, PublishContentOutcomeRow>;
  readonly itemByKey: Map<string, PublishContentRunItemState>;
  auditRecord: BackstopAuditRecord | undefined;
  activeItemKey: string | null;
}

/** One `applyReport` call: what is fixed for the call, plus its {@link RunProgress}. */
interface ApplyRun extends ApplyRunIdentity {
  readonly input: CreatePublishContentApplyPortInput;
  readonly entities: readonly PackedEntity[];
  readonly entityByKey: ReadonlyMap<string, PackedEntity>;
  readonly handlerDeps: PublishContentDeps;
  readonly handlerByType: ReadonlyMap<string, PublishContentHandler>;
  /** Only a raw-row/raw-file run is all-or-nothing; every other run writes row by row, so an abort
   *  leaves the rows before it saved. */
  readonly transactional: boolean;
  readonly progress: RunProgress;
}

type ApplyReportInput = Parameters<PublishContentApplyPort["applyReport"]>[0];
type ApplyReportResult = Awaited<ReturnType<PublishContentApplyPort["applyReport"]>>;

async function saveRunRecord(
  { input, identity, fields }: {
    input: CreatePublishContentApplyPortInput;
    identity: ApplyRunIdentity;
    fields: {
      phase: PublishContentRunRecord["phase"];
      changeSetIds: readonly string[];
      report: PublishContentReport;
      items: readonly PublishContentRunItemState[];
      finishedAt: string | null;
    };
  },
  _optional = {}
): Promise<void> {
  await input.runRepo.save({
    id: identity.runId,
    workspaceId: input.workspaceId,
    direction: "import",
    peerPrincipalId: identity.sourcePrincipalId,
    peerLabel: null,
    phase: fields.phase,
    restorePointId: identity.restorePointId,
    changeSetIdsJson: JSON.stringify(fields.changeSetIds),
    actorId: identity.principalId,
    startedAt: identity.startedAt,
    finishedAt: fields.finishedAt,
    reportJson: JSON.stringify(fields.report),
    itemsJson: JSON.stringify(fields.items),
  });
}

/** Loads the staged bundle this run applies, or says it is gone. */
async function loadStagedBundle(
  { input, bundleId, startedAt }: { input: CreatePublishContentApplyPortInput; bundleId: string; startedAt: string },
  _optional = {}
) {
  const staged = await loadActiveBundle({
    repo: input.bundleRepo,
    workspaceId: input.workspaceId,
    id: bundleId,
    now: startedAt,
  });
  if (!staged) {
    throw new PublishContentBundleNotFoundError({ message: `publish-content: bundle '${bundleId}' was not found, or has expired, for workspace '${input.workspaceId}'` });
  }
  return staged;
}

/** Reachable per `gated-hooks.ts`'s own doc: a plan confirmed while ALREADY refused stays
 *  refused at execute time too (same hash both times), so `PLAN_STALE` never intercepts it —
 *  `executeMutation()` still calls this port. Nothing to apply; record it and stop. */
async function abandonRefusedRun(
  { input, identity, report }: { input: CreatePublishContentApplyPortInput; identity: ApplyRunIdentity; report: PublishContentReport },
  _optional = {}
): Promise<ApplyReportResult> {
  await saveRunRecord({
    input,
    identity,
    fields: { phase: "abandoned", changeSetIds: [], report, items: [], finishedAt: clockNowIso({ clock: input.clock }) },
  });
  return {
    runId: identity.runId,
    changeSetIds: [],
    retiredChangeSetIds: [],
    repointChangeSetIds: [],
    menuLinksUpdated: 0,
    menuLinksNotUpdated: [],
    verificationProblems: [],
  };
}

/** Send by hand: records the pending audit row (with each item's hash before the run) and puts the
 *  backstop metadata on the report. Only a run whose bundle carries that metadata has one. */
async function prepareRunAudit({ run }: { run: ApplyRun }, _optional: Record<string, never> = {}): Promise<void> {
  const { progress, handlerDeps, handlerByType, input, runId, startedAt, entities } = run;
  const metadata = readBackstopMetadata({ entities });
  const backstopAudit = handlerDeps.backstop?.audit;
  if (!metadata) return;
  if (!backstopAudit || !(await backstopAudit.ready())) throw new Error("Send by hand needs its audit storage installed before it can send anything.");
  progress.report = { ...progress.report, backstop: metadata };
  progress.auditRecord = {
    id: runId, workspaceId: input.workspaceId, direction: "destination", actorId: metadata.sourceActor,
    destination: metadata.destinationHost, reason: metadata.reason, at: startedAt, gapLabels: metadata.gapLabels,
    items: await Promise.all(entities.map(async (e) => ({
      entityType: e.entityType, id: e.id,
      beforeHash: (await handlerByType.get(e.entityType)?.inspect({ id: e.id }))?.hash ?? null, afterHash: e.contentHash
    }))),
    result: "pending", runId, details: {}, inverses: []
  };
  await backstopAudit.save({ record: progress.auditRecord });
}

function initializeRunItems({ run }: { run: ApplyRun }, _optional: Record<string, never> = {}): void {
  const { progress, entityByKey, input, sourcePrincipalId, startedAt } = run;
  for (const row of progress.report.rows) {
    const key = entityKey({ entityType: row.entityType, entityId: row.entityId });
    const entity = entityByKey.get(key);
    const missingIdentity = `${input.workspaceId}:${sourcePrincipalId}:${key}`;
    const idempotencyKey = entity
      ? publishContentItemIdempotencyKey({ workspaceId: input.workspaceId, sourcePrincipalId, entity, sourceReplacement: row.sourceReplacement })
      : `publish-content:v1:missing:${createHash("sha256").update(missingIdentity).digest("hex")}`;
    progress.itemByKey.set(key, {
      entityType: row.entityType,
      entityId: row.entityId,
      idempotencyKey,
      phase: "pending",
      outcome: row.outcome,
      writes: row.writes,
      reason: row.reason,
      changeSetId: null,
      retiredChangeSetId: null,
      errorSummary: null,
      updatedAt: startedAt,
    });
  }
}

function runItemStates({ run }: { run: ApplyRun }, _optional = {}): PublishContentRunItemState[] {
  return run.progress.report.rows.map((row) => {
    const item = run.progress.itemByKey.get(entityKey({ entityType: row.entityType, entityId: row.entityId }));
    if (item === undefined) throw new Error(`Publish content run has no state for ${row.entityType} ${row.entityId}`);
    return item;
  });
}

function currentChangeSetIds({ run }: { run: ApplyRun }, _optional = {}): string[] {
  return Array.from(
    new Set(runItemStates({ run }).flatMap((item) => (item.changeSetId === null ? [] : [item.changeSetId])))
  );
}

function currentRetiredChangeSetIds({ run }: { run: ApplyRun }, _optional = {}): string[] {
  return runItemStates({ run }).flatMap((item) => (item.retiredChangeSetId === null ? [] : [item.retiredChangeSetId]));
}

function currentReport({ run }: { run: ApplyRun }, _optional = {}): PublishContentReport {
  const { report, effectiveRowsByKey } = run.progress;
  return {
    ...report,
    rows: report.rows.map((row) => effectiveRowsByKey.get(entityKey({ entityType: row.entityType, entityId: row.entityId })) ?? row),
  };
}

async function saveRunSnapshot(
  { run, phase, finishedAt }: { run: ApplyRun; phase: PublishContentRunRecord["phase"]; finishedAt: string | null },
  _optional = {}
): Promise<void> {
  await saveRunRecord({
    input: run.input,
    identity: run,
    fields: {
      phase,
      changeSetIds: currentChangeSetIds({ run }),
      report: currentReport({ run }),
      items: runItemStates({ run }),
      finishedAt,
    },
  });
}

/** Opens the run: reads the registry fresh, prepares the audit, and persists the run and every
 *  pending item before the first content write. */
async function openRun(
  { input, identity, staged, report, authorize, backstop }: {
    input: CreatePublishContentApplyPortInput;
    identity: ApplyRunIdentity;
    staged: { entitiesJson: string };
    report: PublishContentReport;
    authorize: ApplyReportInput["authorize"];
    backstop: ApplyReportInput["backstop"];
  },
  _optional = {}
): Promise<ApplyRun> {
  const entities = JSON.parse(staged.entitiesJson) as readonly PackedEntity[];
  const entityByKey = new Map(entities.map((entity) => [entityKey({ entityType: entity.entityType, entityId: entity.id }), entity] as const));
  // Registry read fresh, at apply time, every call — same rule `planner.ts`'s own header pins
  // for planning; a handler built once and cached across calls would go stale the moment a
  // contributor re-registers (e.g. a hot-reloaded dev process).
  // The caller's authorize wins when it supplies one: this port is built once per process and
  // closes over RBAC, which is the wrong authority for a publishing credential. See
  // `PublishContentApplyPort.applyReport`'s own doc.
  const handlerDeps = {
    ...input.publishContentDeps,
    ...(authorize === undefined ? {} : { authorize }), ...(backstop === undefined ? {} : { backstop })
  };
  const { handlerByType } = buildPublishContentCatalog(handlerDeps);
  const run: ApplyRun = {
    ...identity,
    input,
    entities,
    entityByKey,
    handlerDeps,
    handlerByType,
    transactional: entities.some((entity) => entity.entityType === "raw-row" || entity.entityType === "raw-file"),
    progress: { report, effectiveRowsByKey: new Map(), itemByKey: new Map(), auditRecord: undefined, activeItemKey: null },
  };
  await prepareRunAudit({ run });
  for (const row of run.progress.report.rows) {
    run.progress.effectiveRowsByKey.set(entityKey({ entityType: row.entityType, entityId: row.entityId }), row);
  }
  initializeRunItems({ run });
  // Persist the run and every pending item before the first content write.
  await saveRunSnapshot({ run, phase: "applying", finishedAt: null });
  return run;
}

/** The per-row context `applyOneRow` reads, with the one write-back it needs: recording the change
 *  set a row landed, durably, before anything else about that row can fail. */
function applyRowContext({ run }: { run: ApplyRun }, _optional = {}): ApplyRowContext {
  const { input, progress } = run;
  return {
    workspaceId: input.workspaceId,
    runId: run.runId,
    sourcePrincipalId: run.sourcePrincipalId,
    principalId: run.principalId,
    entityByKey: run.entityByKey,
    handlerByType: run.handlerByType,
    baselineRepo: input.baselineRepo,
    getSeedHash: input.getSeedHash ?? NO_PUBLISH_CONTENT_SEED_HASH,
    clock: input.clock,
    recordContentApplied: async ({ itemKey, changeSetId, retiredChangeSetId }) => {
      const item = progress.itemByKey.get(itemKey);
      if (!item) return;
      progress.itemByKey.set(itemKey, {
        ...item,
        phase: "content_applied",
        changeSetId,
        ...(retiredChangeSetId === undefined ? {} : { retiredChangeSetId }),
        updatedAt: clockNowIso({ clock: input.clock }),
      });
      await saveRunSnapshot({ run, phase: "applying", finishedAt: null });
    },
  };
}

interface RepointOutcome {
  repointChangeSetIds: string[];
  menuLinksUpdated: number;
  menuLinksNotUpdated: string[];
}

/** The retired-holder -> new-id pairs of every overwrite row whose retire actually landed.
 *  `retiredChangeSetId === null` covers both "never reached the retire" and "the create that
 *  followed it failed and was undone" (§2.3 step 1) — either way, nothing was actually
 *  replaced, so there is nothing here for a repoint pass to act on. */
function landedReplacements({ run }: { run: ApplyRun }, _optional = {}): EntityReplacement[] {
  const replacements: EntityReplacement[] = [];
  for (const row of run.progress.report.rows) {
    if (!row.retires) continue;
    const item = run.progress.itemByKey.get(entityKey({ entityType: row.entityType, entityId: row.entityId }));
    if (item && item.retiredChangeSetId !== null) {
      replacements.push({ entityType: row.retires.entityType, oldId: row.retires.entityId, newId: row.entityId });
    }
  }
  return replacements;
}

async function repointHandlers(
  { run, replacements, skipIds }: { run: ApplyRun; replacements: EntityReplacement[]; skipIds: Set<string> },
  _optional: Record<string, never> = {}
): Promise<RepointOutcome> {
  let repointChangeSetIds: string[] = [];
  let menuLinksUpdated = 0;
  const menuLinksNotUpdated: string[] = [];
  for (const handler of run.handlerByType.values()) {
    if (!handler.repointReferences) continue;
    try {
      const repointed = await handler.repointReferences({ replacements, skipIds, principalId: run.principalId, runId: run.runId });
      repointChangeSetIds = repointChangeSetIds.concat(repointed.changeSetIds);
      menuLinksUpdated += repointed.linksUpdated;
      menuLinksNotUpdated.push(...repointed.notUpdated);
    } catch (error) {
      // The content this run published already landed — a repoint failure is reported, never
      // thrown back to fail the run (§2.3 step 4). A handler's own per-holder failures (a
      // denied grant, a concurrent edit) are already caught inside that handler and returned
      // via `notUpdated` above; reaching this catch means the WHOLE call failed (e.g. a
      // required port was never wired for this composition root).
      const message = error instanceof Error ? error.message : String(error);
      menuLinksNotUpdated.push(`${capitalize({ value: handler.entityType })} links were not updated: ${message}`);
    }
  }
  return { repointChangeSetIds, menuLinksUpdated, menuLinksNotUpdated };
}

// R5 (`plan-publish-repoint-menus-2026-09-24.md` §2.3), extended by R6 (2026-09-24 follow-up)
// — repoints every live reference that still points at an address-clash overwrite's retired
// holder. Reads `itemByKey` as it stands AT THE MOMENT IT IS CALLED, so it is safe to call
// after every row has landed (the normal path) OR from inside the loop's own `catch`, mid-run,
// over whatever happened to land before an abort — either way it stays type-agnostic, calling
// every registered handler that implements the optional `repointReferences` hook, generically,
// and never importing navigation or any other reference-holding feature by name.
//
// R6's own property: an overwrite row whose retire+create BOTH landed (`item.retiredChangeSetId`
// set — the same signal the success path already gated on) must still be repointed even when a
// LATER accounting-only failure (e.g. this row's own baseline write, or an unrelated row's own
// write) aborts the whole run — otherwise a live menu is left pointing at a holder this run
// already moved to Trash. A row that never reached a landed retire (never got there, or the
// create half failed and was undone) contributes nothing, aborted run or not.
async function runRepointPass({ run }: { run: ApplyRun }, _optional: Record<string, never> = {}): Promise<RepointOutcome> {
  const replacements = landedReplacements({ run });
  // Every id written THIS run, across every type — a holder in this set already carries the
  // source's own intent (its own row wrote), so repointing it would fight that intent (§2.5).
  const skipIds = new Set<string>(
    runItemStates({ run })
      .filter((item) => item.changeSetId !== null)
      .map((item) => item.entityId)
  );
  if (replacements.length === 0) return { repointChangeSetIds: [], menuLinksUpdated: 0, menuLinksNotUpdated: [] };
  return repointHandlers({ run, replacements, skipIds });
}

// Post-publish safety check (2026-09-26) — after every row landed, each handler that can
// confirms its entities are servable here (`PublishContentHandler.verifyApplied`). Rows that
// ended `blocked`/`conflict` are left out: they carry their own reason already. A failing check
// is reported, never thrown: the content already landed.
async function runVerifyPass({ run }: { run: ApplyRun }, _optional: Record<string, never> = {}): Promise<string[]> {
  const problems: string[] = [];
  for (const handler of run.handlerByType.values()) {
    if (!handler.verifyApplied) continue;
    const entities = run.progress.report.rows.flatMap((row) => {
      if (row.entityType !== handler.entityType) return [];
      const key = entityKey({ entityType: row.entityType, entityId: row.entityId });
      const outcome = run.progress.effectiveRowsByKey.get(key)?.outcome ?? row.outcome;
      const entity = run.entityByKey.get(key);
      return entity && outcome !== "blocked" && outcome !== "conflict" ? [entity] : [];
    });
    if (entities.length > 0) {
      problems.push(...(await verifyPublishedEntities({ handler, entities })));
    }
  }
  return problems;
}

/** Records what one row resolved to, durably, before the next row starts. */
async function recordRowOutcome(
  { run, key, result }: { run: ApplyRun; key: string; result: ApplyRowResult },
  _optional = {}
): Promise<void> {
  const { progress } = run;
  progress.effectiveRowsByKey.set(key, result.row);
  const item = progress.itemByKey.get(key);
  if (item) {
    progress.itemByKey.set(key, {
      ...item,
      phase: "completed",
      outcome: result.row.outcome,
      writes: result.row.writes,
      reason: result.row.reason,
      changeSetId: result.changeSetId ?? item.changeSetId,
      retiredChangeSetId: result.retiredChangeSetId ?? item.retiredChangeSetId,
      errorSummary: null,
      updatedAt: clockNowIso({ clock: run.input.clock }),
    });
  }
  await saveRunSnapshot({ run, phase: "applying", finishedAt: null });
}

async function applyRows({ run, ctx }: { run: ApplyRun; ctx: ApplyRowContext }, _optional = {}): Promise<void> {
  const { progress, handlerDeps } = run;
  for (const row of progress.report.rows) {
    progress.activeItemKey = entityKey({ entityType: row.entityType, entityId: row.entityId });
    const result = await applyOneRow({ row, ctx });
    await recordRowOutcome({ run, key: progress.activeItemKey, result });
    progress.activeItemKey = null;
  }
  const { auditRecord } = progress;
  if (auditRecord) {
    const backstopAudit = handlerDeps.backstop?.audit;
    if (!backstopAudit) throw new Error("Send by hand has no audit storage");
    await backstopAudit.save({
      record: {
        ...auditRecord, result: "success",
        inverses: handlerDeps.backstop?.inverses ?? [], details: { report: currentReport({ run }) },
        items: backstopAuditItems({ items: auditRecord.items, inverses: handlerDeps.backstop?.inverses })
      }
    });
  }
}

async function rollbackRawRun(
  { run, error, rollbackErrors }: { run: ApplyRun; error: unknown; rollbackErrors: string[] },
  _optional: Record<string, never> = {}
): Promise<void> {
  for (const rollback of [...(run.handlerDeps.backstop?.fileRollbacks ?? [])].reverse()) {
    try { await rollback(); } catch (failure) { rollbackErrors.push(failure instanceof Error ? failure.message : "A file could not be rolled back."); }
  }
  recordRawRollback({ run, error, rollbackErrors });
}

function recordRawRollback(
  { run, error, rollbackErrors }: { run: ApplyRun; error: unknown; rollbackErrors: string[] },
  _optional: Record<string, never> = {}
): void {
  const { progress } = run;
  // All raw writes, change sets and baselines rolled back together. Do not report the
  // tentative per-item snapshots as writes that landed.
  const reason = [error instanceof Error ? error.message : "This send was rolled back.", ...rollbackErrors].join(" ");
  for (const row of progress.report.rows) {
    const key = entityKey({ entityType: row.entityType, entityId: row.entityId });
    const item = progress.itemByKey.get(key);
    if (!item) continue;
    const mayRemain = row.entityType === "raw-file" && item.changeSetId !== null && rollbackErrors.length > 0;
    progress.effectiveRowsByKey.set(key, { ...row, outcome: "blocked", writes: mayRemain, reason });
    progress.itemByKey.set(key, {
      ...item, phase: "failed", outcome: "blocked", writes: mayRemain,
      changeSetId: null, retiredChangeSetId: null, errorSummary: reason, reason
    });
  }
}

function recordFailedItem({ run, error }: { run: ApplyRun; error: unknown }, _optional: Record<string, never> = {}): void {
  const { progress } = run;
  // A non-conflict error aborted the run partway through — the run row must still record
  // exactly which change sets landed before the failure (plan §5 risk #7's own words), never
  // silently drop that trail just because the whole run did not complete.
  if (!progress.activeItemKey) return;
  const item = progress.itemByKey.get(progress.activeItemKey);
  if (item) {
    progress.itemByKey.set(progress.activeItemKey, {
      ...item,
      // Preserve `content_applied`: that is the recovery signal for a baseline/status write
      // failing after the domain command and its change set already landed.
      phase: item.phase === "content_applied" ? "content_applied" : "failed",
      errorSummary: error instanceof Error ? error.message : "unknown apply failure",
      updatedAt: clockNowIso({ clock: run.input.clock }),
    });
  }
}

/** The audit row of a run that aborted: what failed, and (when a file could not be put back) the
 *  file inverses an operator still needs. */
async function saveFailureAudit(
  { run, error, rollbackErrors }: { run: ApplyRun; error: unknown; rollbackErrors: string[] },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { auditRecord } = run.progress;
  if (!auditRecord) return;
  const backstopAudit = run.handlerDeps.backstop?.audit;
  if (!backstopAudit) throw new Error("Send by hand has no audit storage");
  await backstopAudit.save({
    record: {
      ...auditRecord, result: "failure",
      inverses: rollbackErrors.length > 0 ? (run.handlerDeps.backstop?.inverses ?? []).filter((i) => i.kind === "raw-file") : [],
      details: { error: error instanceof Error ? error.message : "This send was rolled back.", rollbackErrors }
    }
  });
}

async function failRun({ run, error }: { run: ApplyRun; error: unknown }, _optional: Record<string, never> = {}): Promise<never> {
  const { progress, transactional } = run;
  const rollbackErrors: string[] = [];
  if (transactional) await rollbackRawRun({ run, error, rollbackErrors });
  recordFailedItem({ run, error });
  // R6 — whatever landed before this abort (an overwrite row's retire+create both done) still
  // gets repointed; see `runRepointPass`'s own doc above for why this is safe to call here too.
  await runRepointPass({ run });
  await saveRunSnapshot({ run, phase: "failed", finishedAt: clockNowIso({ clock: run.input.clock }) });
  await saveFailureAudit({ run, error, rollbackErrors });
  throw transactional ? error : withRefusedItem({ error, itemKey: progress.activeItemKey });
}

async function executeRows({ run, ctx }: { run: ApplyRun; ctx: ApplyRowContext }, _optional: Record<string, never> = {}): Promise<void> {
  const { handlerDeps } = run;
  try {
    if (run.transactional) {
      if (!handlerDeps.backstop?.rows) throw new Error("The raw-row transaction port is not wired.");
      await handlerDeps.backstop.rows.transaction({ work: () => applyRows({ run, ctx }) });
    } else await applyRows({ run, ctx });
  } catch (error) {
    await failRun({ run, error });
  }
}

/** Reports what the run did: the repoint and verification passes, the final snapshot, and the
 *  actual outcomes. */
async function closeRun({ run }: { run: ApplyRun }, _optional: Record<string, never> = {}): Promise<ApplyReportResult> {
  const { repointChangeSetIds, menuLinksUpdated, menuLinksNotUpdated } = await runRepointPass({ run });
  const verificationProblems = await runVerifyPass({ run });

  await saveRunSnapshot({ run, phase: "applied", finishedAt: clockNowIso({ clock: run.input.clock }) });
  return {
    report: currentReport({ run }),
    runId: run.runId,
    changeSetIds: currentChangeSetIds({ run }),
    retiredChangeSetIds: currentRetiredChangeSetIds({ run }),
    repointChangeSetIds,
    menuLinksUpdated,
    menuLinksNotUpdated,
    verificationProblems,
  };
}

/**
 * Builds the real {@link PublishContentApplyPort} — Task 8's apply loop. See this file's header for
 * the apply-time race guards and the authorship-id disclosed deviation.
 *
 * @complexity O(n) in the report's row count (one `inspect`/`apply`/baseline call per writing row,
 * one baseline call per `unchanged` row), plus one bundle reload and one contributor-registry read
 * per call — dominated by whatever I/O those individually cost, not by this function's own control
 * flow.
 */
export function createPublishContentApplyPort(input: CreatePublishContentApplyPortInput): PublishContentApplyPort {
  return {
    async applyReport({ report, principalId, bundleId, restorePointId, authorize, backstop }) {
      const startedAt = clockNowIso({ clock: input.clock });
      const staged = await loadStagedBundle({ input, bundleId, startedAt });
      const identity: ApplyRunIdentity = { runId: input.idGen.newId(), startedAt, sourcePrincipalId: staged.sourcePrincipalId, principalId, restorePointId };
      if (report.refused) return abandonRefusedRun({ input, identity, report });

      const run = await openRun({ input, identity, staged, report, authorize, backstop });
      await executeRows({ run, ctx: applyRowContext({ run }) });
      return closeRun({ run });
    },
  };
}

/** Replacement sanitizing may normalize source metadata; remember what actually landed.
 * One indexed inspect per replaced row, with no additional reads on ordinary imports. */
async function refreshBaseline({ row, entity, ctx }: { row: PublishContentOutcomeRow; entity: PackedEntity; ctx: ApplyRowContext }, _optional: Record<string, never> = {}): Promise<void> {
  const destination = row.sourceReplacement ? await ctx.handlerByType.get(row.entityType)?.inspect({ id: row.entityId }) : null;
  return ctx.baselineRepo.upsert({
    workspaceId: ctx.workspaceId,
    peerPrincipalId: ctx.sourcePrincipalId,
    entityType: row.entityType,
    entityId: row.entityId,
    hashAtLastSync: destination?.hash ?? entity.contentHash,
    hashVersion: entity.hashVersion,
    syncedAt: clockNowIso({ clock: ctx.clock }),
    runId: ctx.runId,
  });
}

async function undoRetire({ error, retireResult, row }: {
  error: unknown; retireResult: { undo(): Promise<void> } | undefined;
  row: PublishContentOutcomeRow & { retires: NonNullable<PublishContentOutcomeRow["retires"]> };
}, _optional: Record<string, never> = {}): Promise<void> {
  // The retire already landed but the create it was clearing the address FOR did not — put the
  // holder back rather than leaving it retired with nothing to show for it (this handler's own
  // `retire()` doc: the apply loop is the one caller besides its own gateway rollback that calls
  // `undo()` directly). Only here: once the create has landed, the new row holds the address and
  // putting the holder back would collide with it.
  if (retireResult) {
    try {
      await retireResult.undo();
    } catch (undoError) {
      const cause = error instanceof Error ? error.message : String(error);
      const undoCause = undoError instanceof Error ? undoError.message : String(undoError);
      throw new Error(
        `${row.entityType} '${row.entityId}' was not created (${cause}), and putting the retired ` +
        `${row.retires.entityType} '${row.retires.entityId}' back failed too (${undoCause}) — restore it from Trash`
      );
    }
  }
}

async function refreshNonWritingRow({ row, ctx }: { row: PublishContentOutcomeRow; ctx: ApplyRowContext }, _optional: Record<string, never> = {}): Promise<ApplyRowResult> {
  const key = entityKey({ entityType: row.entityType, entityId: row.entityId });
  // `conflict`/`blocked` pass through untouched — no baseline write (plan §4 task 8: baselines are
  // upserted for created/unchanged/applied/forced ONLY). `unchanged` is the one non-writing outcome
  // that still refreshes the baseline: the destination already matches the source, so there is
  // nothing to apply, but recording that agreement is exactly what lets FUTURE runs tell "still
  // agrees" apart from "diverged since we last looked".
  if (row.outcome === "unchanged") {
    const entity = ctx.entityByKey.get(key);
    if (entity) {
      await refreshBaseline({ row, entity, ctx });
    }
  }
  return { row, changeSetId: null, retiredChangeSetId: null };
}

/** Match each audited item to the inverse captured by its gateway mutation. */
function backstopAuditItems(
  { items, inverses }: { items: BackstopAuditRecord["items"]; inverses: readonly BackstopInverse[] | undefined },
  _optional: Record<string, never> = {},
): BackstopAuditRecord["items"] {
  return items.map((item) => {
    const inverse = inverses?.find((candidate) => candidate.entity.id === item.id && candidate.entity.entityType === item.entityType);
    if (!inverse) return item;
    let beforeHash: string | null = null;
    if (inverse.kind === "raw-row") {
      if (inverse.before !== null) beforeHash = contentHash({ entityType: "raw-row", state: inverse.before as unknown as Record<string, unknown> });
    } else {
      if (inverse.before.sha256 !== null) beforeHash = contentHash({ entityType: "raw-file", state: {
        path: item.id, sha256: inverse.before.sha256, size: inverse.before.size, mode: inverse.before.mode,
      } });
    }
    return { ...item, beforeHash };
  });
}

/** Verification reports a problem after committed writes; it never aborts the published run. */
async function verifyPublishedEntities(
  { handler, entities }: { handler: PublishContentHandler; entities: readonly PackedEntity[] },
  _optional: Record<string, never> = {},
): Promise<readonly string[]> {
  try {
    if (!handler.verifyApplied) throw new Error("Publish content handler has no verification operation");
    return await handler.verifyApplied({ entities });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`${capitalize({ value: handler.entityType })} could not be checked after publishing: ${message}`];
  }
}
