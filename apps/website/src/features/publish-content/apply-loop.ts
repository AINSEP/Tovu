import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";

import { PostConflictError, PostNotFoundError } from "../post/post.js";
import { PublishContentApplyRowError } from "./apply-errors.js";
import { loadActiveBundle } from "./bundle-staging.js";
import type { PublishContentBundleRepoPort } from "./bundle-staging.js";
import type { PublishContentBaselineRepoPort } from "./baseline-repo.js";
import type { PublishContentRunRepoPort, PublishContentRunRecord } from "./run-repo.js";
import { PublishContentBundleNotFoundError } from "./gated-hooks.js";
import type { PublishContentApplyPort } from "./gated-hooks.js";
import { entityKey } from "./planner.js";
import type { PublishContentOutcomeRow, PublishContentReport } from "./planner.js";
import { listPublishContentContributors } from "./type-registry.js";
import type { PublishContentDeps, PublishContentHandler, PackedEntity } from "./type-registry.js";

/**
 * @file Task 8 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 8 / §5 risks
 * #1–#3, #6, #7, #9.
 *
 * `createPublishContentApplyPort` builds the real {@link PublishContentApplyPort} — the
 * implementation `gated-hooks.ts#createNotYetImplementedPublishContentApplyPort` stood in for until
 * now. Wired at both composition roots in place of that throwing default; nothing in `gated-hooks.ts`
 * itself changes beyond the seam widening its own "Task 8 addendum" note describes.
 *
 * ## Why chunking is an ITERATION unit here, not one SQL transaction per chunk
 *
 * The plan's own words ("chunks of ~200 entities, each chunk one transaction") cannot be followed
 * literally: `createPost`/`updatePost` each open their OWN `repo.transaction()`
 * (`repo.sqlite.ts:429`'s `BEGIN IMMEDIATE`/`COMMIT`), and SQLite refuses a second `BEGIN` inside an
 * already-open transaction on the same connection — confirmed empirically (`better-sqlite3`, in
 * memory: `db.exec('BEGIN IMMEDIATE')` twice throws `cannot start a transaction within a
 * transaction`), not assumed. Wrapping N such calls in one outer transaction would crash on the
 * second entity in any non-trivial chunk. `SAVEPOINT` nesting works, but retrofitting
 * `SqlitePostRepo.transaction()` into a depth-counter + `SAVEPOINT` reentrant method touches a file
 * under active concurrent edit by other agents this session, for a benefit that is purely
 * lock-duration (this feature's own measured scale is 115 KB across 54 posts — plan §6 item 7), not
 * correctness: per-entity atomicity is ALREADY guaranteed without any chunk-level transaction —
 * `createPost`/`updatePost`'s own internal transaction covers [row write + revision-ledger append]
 * atomically, and `executeCommand`'s own `changeSets.insert()` covers the change-set record
 * atomically with a compensating `mutation.rollback()` on failure (verified by reading
 * `@jini-ai/cms`'s `command.js` directly — `execute()` runs OUTSIDE any transaction `executeCommand`
 * itself opens; there isn't one). Plan §5 risk #7 states the safety property this relies on directly:
 * "partial application is safe because nothing is deleted and the restore point exists; the run row
 * records exactly which change sets landed" — a chunk boundary crash is explicitly tolerated by
 * design, not merely an accepted gap. `chunkSize` below is therefore a plain iteration/grouping unit
 * (readable batching, and a natural point to persist a baseline upsert), never a spanning SQL
 * transaction. Disclosed deviation from the plan's literal wording, not a silent one — if a reviewer
 * wants the literal reading, the fix is the `SAVEPOINT`-reentrant `transaction()` described above.
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
 * lives outside `type-registry.ts` and why post's two classes keep a named special case.
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

/** Default iteration/grouping unit for {@link createPublishContentApplyPort}'s `chunkSize` — see
 *  this file's header for why it is not a spanning SQL transaction boundary. */
const DEFAULT_CHUNK_SIZE = 200;

/**
 * Every port some registered type's `apply()` needs, with the ones a `pack`-only caller may omit
 * made REQUIRED — the apply bag is the one bag that has to be complete.
 *
 * They are optional on {@link PublishContentDeps} because an export/plan caller genuinely has no use
 * for them, and each type degrades quietly when its own ports are absent. That is right for `pack`
 * and catastrophic for `apply`: an incomplete bag reaches a handler's `apply()` and throws a bare
 * `Error`, which `applyOneRow` cannot downgrade to a row outcome, so it aborts the whole run.
 *
 * This type exists so that failure is impossible to ship. A composition root that forgets a port
 * now fails to COMPILE at {@link toPublishContentApplyDeps} instead of failing at run time — which
 * is what happened when `media` landed: both roots kept building a bag from the three fields `post`
 * needed, media's `pack()` silently returned nothing, and the type could not travel at all.
 */
export type PublishContentApplyDeps = PublishContentDeps &
  Required<Pick<PublishContentDeps, "outbox" | "changeSets" | "authorize" | "mediaRepo" | "assetBlobRepo" | "blobStore">>;

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
  /** See this file's header — an iteration unit, not a transaction boundary. Defaults to {@link
   *  DEFAULT_CHUNK_SIZE}. */
  readonly chunkSize?: number;
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
  readonly clock: ClockPort;
}

/**
 * How {@link applyOneRow} should report a failure raised by `handler.apply()` — the row's downgraded
 * outcome plus its operator-facing reason — or `null` for a genuine failure that must abort the run.
 *
 * Any type may opt one of its own failures into a downgrade by raising
 * {@link PublishContentApplyRowError}; `post`'s two pre-existing classes keep a named special case
 * (`PostVersionConflictError` is covered via its `extends PostConflictError`, `post.ts:667`, not
 * named separately). See this file's header for why the two are phrased differently.
 *
 * @complexity O(1).
 */
function classifyApplyRowFailure(
  error: unknown,
  row: PublishContentOutcomeRow
): { outcome: "conflict" | "blocked"; reason: string } | null {
  if (error instanceof PublishContentApplyRowError) {
    return { outcome: error.rowOutcome, reason: error.message };
  }
  if (error instanceof PostConflictError || error instanceof PostNotFoundError) {
    return {
      outcome: "conflict",
      reason: `${row.entityType} '${row.entityId}' changed on the destination during apply: ${error.message}`,
    };
  }
  return null;
}

/**
 * Applies exactly one report row, mutating nothing — returns the row as it actually resolved (which
 * may differ from the plan's own prediction, see this file's header) plus the `changeSetId` a write
 * produced, or `null` for a row that wrote nothing.
 *
 * @complexity O(1) plus whatever `handler.inspect`/`handler.apply`/`baselineRepo` I/O costs — no
 * loop; {@link createPublishContentApplyPort} is what iterates a report's rows.
 */
async function applyOneRow(
  row: PublishContentOutcomeRow,
  ctx: ApplyRowContext
): Promise<{ row: PublishContentOutcomeRow; changeSetId: string | null }> {
  const key = entityKey(row.entityType, row.entityId);

  if (!row.writes) {
    // `conflict`/`blocked` pass through untouched — no baseline write (plan §4 task 8: baselines are
    // upserted for created/unchanged/applied/forced ONLY). `unchanged` is the one non-writing outcome
    // that still refreshes the baseline: the destination already matches the source, so there is
    // nothing to apply, but recording that agreement is exactly what lets FUTURE runs tell "still
    // agrees" apart from "diverged since we last looked".
    if (row.outcome === "unchanged") {
      const entity = ctx.entityByKey.get(key);
      if (entity) {
        await ctx.baselineRepo.upsert({
          workspaceId: ctx.workspaceId,
          peerPrincipalId: ctx.sourcePrincipalId,
          entityType: row.entityType,
          entityId: row.entityId,
          hashAtLastSync: entity.contentHash,
          hashVersion: entity.hashVersion,
          syncedAt: ctx.clock.nowIso(),
          runId: ctx.runId,
        });
      }
    }
    return { row, changeSetId: null };
  }

  const entity = ctx.entityByKey.get(key);
  const handler = ctx.handlerByType.get(row.entityType);
  if (!entity || !handler) {
    // Internal inconsistency (the bundle/registry moved between planning and apply in a way that
    // should not be reachable through normal use) — downgrade, do not crash the whole run over it.
    return {
      row: {
        ...row,
        outcome: "blocked",
        writes: false,
        reason: `internal inconsistency: no packed entity/handler for ${row.entityType} '${row.entityId}' at apply time`,
      },
      changeSetId: null,
    };
  }

  const current = await handler.inspect(entity.id);

  if (row.outcome === "created" && current !== null) {
    return {
      row: {
        ...row,
        outcome: "conflict",
        writes: false,
        reason: `${row.entityType} '${row.entityId}' was created on the destination between plan and apply`,
      },
      changeSetId: null,
    };
  }
  if (row.outcome !== "created" && current === null) {
    return {
      row: {
        ...row,
        outcome: "conflict",
        writes: false,
        reason: `${row.entityType} '${row.entityId}' was removed from the destination between plan and apply`,
      },
      changeSetId: null,
    };
  }
  if (row.outcome === "applied" && current) {
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
    if (!baseline || current.hash !== baseline.hashAtLastSync) {
      return {
        row: {
          ...row,
          outcome: "conflict",
          writes: false,
          reason: `${row.entityType} '${row.entityId}' was edited on the destination again after this run's own plan was built`,
        },
        changeSetId: null,
      };
    }
  }

  try {
    const { changeSetId } = await handler.apply({
      entity,
      expectedVersion: current?.version, // `created` -> undefined (current is null); applied/forced -> fresh version just read above.
      principalId: ctx.principalId, // always the operator — see this file's header.
    });
    await ctx.baselineRepo.upsert({
      workspaceId: ctx.workspaceId,
      peerPrincipalId: ctx.sourcePrincipalId,
      entityType: row.entityType,
      entityId: row.entityId,
      hashAtLastSync: entity.contentHash,
      hashVersion: entity.hashVersion,
      syncedAt: ctx.clock.nowIso(),
      runId: ctx.runId,
    });
    return { row, changeSetId };
  } catch (error) {
    const downgrade = classifyApplyRowFailure(error, row);
    if (downgrade) {
      return {
        row: { ...row, outcome: downgrade.outcome, writes: false, reason: downgrade.reason },
        changeSetId: null,
      };
    }
    throw error; // genuine failure — the caller's own try/catch persists a `failed` run row and rethrows.
  }
}

/**
 * Builds the real {@link PublishContentApplyPort} — Task 8's apply loop. See this file's header for
 * the chunking decision, the apply-time race guards, and the authorship-id disclosed deviation.
 *
 * @complexity O(n) in the report's row count (one `inspect`/`apply`/baseline call per writing row,
 * one baseline call per `unchanged` row), plus one bundle reload and one contributor-registry read
 * per call — dominated by whatever I/O those individually cost, not by this function's own control
 * flow.
 */
export function createPublishContentApplyPort(input: CreatePublishContentApplyPortInput): PublishContentApplyPort {
  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;

  async function saveRun(fields: {
    runId: string;
    startedAt: string;
    sourcePrincipalId: string;
    principalId: string;
    restorePointId: string;
    phase: PublishContentRunRecord["phase"];
    changeSetIds: readonly string[];
    report: PublishContentReport;
  }): Promise<void> {
    await input.runRepo.save({
      id: fields.runId,
      workspaceId: input.workspaceId,
      direction: "import",
      peerPrincipalId: fields.sourcePrincipalId,
      peerLabel: null,
      phase: fields.phase,
      restorePointId: fields.restorePointId,
      changeSetIdsJson: JSON.stringify(fields.changeSetIds),
      actorId: fields.principalId,
      startedAt: fields.startedAt,
      finishedAt: input.clock.nowIso(),
      reportJson: JSON.stringify(fields.report),
    });
  }

  return {
    async applyReport({ report, principalId, bundleId, restorePointId }) {
      const startedAt = input.clock.nowIso();
      const staged = await loadActiveBundle({
        repo: input.bundleRepo,
        workspaceId: input.workspaceId,
        id: bundleId,
        now: startedAt,
      });
      if (!staged) {
        throw new PublishContentBundleNotFoundError(
          `publish-content: bundle '${bundleId}' was not found, or has expired, for workspace '${input.workspaceId}'`
        );
      }
      const sourcePrincipalId = staged.sourcePrincipalId;
      const runId = input.idGen.newId();

      if (report.refused) {
        // Reachable per `gated-hooks.ts`'s own doc: a plan confirmed while ALREADY refused stays
        // refused at execute time too (same hash both times), so `PLAN_STALE` never intercepts it —
        // `executeMutation()` still calls this port. Nothing to apply; record it and stop.
        await saveRun({
          runId,
          startedAt,
          sourcePrincipalId,
          principalId,
          restorePointId,
          phase: "abandoned",
          changeSetIds: [],
          report,
        });
        return { changeSetIds: [] };
      }

      const entities = JSON.parse(staged.entitiesJson) as readonly PackedEntity[];
      const entityByKey = new Map(entities.map((entity) => [entityKey(entity.entityType, entity.id), entity] as const));
      // Registry read fresh, at apply time, every call — same rule `planner.ts`'s own header pins
      // for planning; a handler built once and cached across calls would go stale the moment a
      // contributor re-registers (e.g. a hot-reloaded dev process).
      const handlerByType = new Map(
        listPublishContentContributors().map((contributor) => [contributor.entityType, contributor.build(input.publishContentDeps)] as const)
      );
      const ctx: ApplyRowContext = {
        workspaceId: input.workspaceId,
        runId,
        sourcePrincipalId,
        principalId,
        entityByKey,
        handlerByType,
        baselineRepo: input.baselineRepo,
        clock: input.clock,
      };

      const finalRows: PublishContentOutcomeRow[] = [];
      const changeSetIds: string[] = [];

      try {
        for (let offset = 0; offset < report.rows.length; offset += chunkSize) {
          const chunk = report.rows.slice(offset, offset + chunkSize);
          for (const row of chunk) {
            const result = await applyOneRow(row, ctx);
            finalRows.push(result.row);
            if (result.changeSetId) changeSetIds.push(result.changeSetId);
          }
        }
      } catch (error) {
        // A non-conflict error aborted the run partway through — the run row must still record
        // exactly which change sets landed before the failure (plan §5 risk #7's own words), never
        // silently drop that trail just because the whole run did not complete.
        await saveRun({
          runId,
          startedAt,
          sourcePrincipalId,
          principalId,
          restorePointId,
          phase: "failed",
          changeSetIds,
          report: { ...report, rows: finalRows },
        });
        throw error;
      }

      await saveRun({
        runId,
        startedAt,
        sourcePrincipalId,
        principalId,
        restorePointId,
        phase: "applied",
        changeSetIds,
        report: { ...report, rows: finalRows },
      });
      return { changeSetIds };
    },
  };
}
