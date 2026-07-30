/**
 * @file Database's half of ADR-049 Decision 4 (SPEC-017/ADR-041): maps the wireable subset of
 * `agent-tools.ts`'s nine catalog entries onto the timeline/restore-point reads and the one
 * clearly-reversible write, as `ToolRegistration`s.
 *
 * Risk framing: this domain is meaningfully higher-risk than Forms/Identity/content-types — a
 * migrate-forward can rewrite schema and data across every other domain at once, sometimes
 * irreversibly — so the surface is deliberately reads plus one write rather than full parity with
 * the admin UI. Five of the nine entries are declared unwired, each with its reason recorded on
 * {@link UNWIRED_DATABASE_TOOL_IDS}; `features/database/agent-tools.ts` carries the per-entry half
 * of the same reasoning.
 *
 * Authorization shape: none of the underlying read functions (`getTimeline`, `listRestorePoints`,
 * `createRestorePoint`) call `authorize()` internally — the admin routes gate inline — so those
 * handlers call the kit's `requireToolPermission` themselves. The one exception is
 * `database_plan_migrate_forward`, documented at its own handler.
 */
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireNoInput,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../../assistant/tool-registration-kit";
import { plan as gatewayPlan, type GatedMutationHooks } from "../../core/gated-mutations/gateway";
import { buildMigrateForwardHooks } from "../../server/gated-mutations-composition";
import type { RouteDeps } from "../../server/routes/types";
import { getDatabaseAgentToolCatalog } from "./agent-tools";
import { createRestorePoint as createDatabaseRestorePoint, listRestorePoints } from "./restore-points";
import { getTimeline } from "./timeline";

const CATALOG_BY_ID = indexCatalogById(getDatabaseAgentToolCatalog());

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration — and note that the two token-gated tools appear NOWHERE here, which is
 * itself the strongest of the guards: an unclassified id cannot be wired at all.
 */
export const databaseDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> getTimeline (timeline.ts): one LedgerReadPort.query() read.
  ["database_query_timeline", "none"],
  // -> listRestorePoints (restore-points.ts): one RestorePointListPort.list() read.
  ["database_list_restore_points", "none"],
  // -> gateway.ts's plan() via buildMigrateForwardHooks: authorizes, then recomputes a plan and
  //    returns it — verified directly against plan()'s own body, which persists nothing.
  ["database_plan_migrate_forward", "none"],
  // -> createRestorePoint (restore-points.ts) + dbOps.captureRestorePoint() +
  //    restorePointsRepo.save(): a real file snapshot plus a persisted row. The canonical wiring for
  //    this tool id — see `features/recovery/tool-registrations.ts` for why Recovery's own catalog
  //    entry of the same name is deliberately left unwired instead of double-registered.
  ["backup_create_restore_point", "mutates-durable-state"],
]);

/** Database catalog entries this pass does not wire, and why — see `features/database/agent-tools.ts`'s own per-entry comments for the full reasoning. */
const UNWIRED_DATABASE_TOOL_IDS = new Set([
  // No backend adapter is composed into `RouteDeps` yet for any of these three.
  "database_get_health",
  "database_get_schema_state",
  "database_list_pending_migrations",
  // No envelope-minting function exists (only the receiving side, `resolveDeepLinkContext`, does),
  // and minting one honestly needs a schema-drift computation this pass has no adapter for.
  "database_get_restore_guidance",
  // EXCLUDED BY DESIGN: token-gated, and `assertToolIsWirable` refuses to build it anyway
  // (`actorClassRule: 'confirmer-must-equal-own-delegatedBy'` has no confirmation transport yet).
  // A bad agent-triggered forward migration can rewrite schema and data across every domain in this
  // system at once, with no per-domain undo — the default here is exclude, mirroring
  // `identity/agent-tools.ts`'s exclusion of `resetUserPassword`.
  "database_execute_migrate_forward",
]);

export function buildDatabaseRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    database_query_timeline: async (ctx) => {
      if (ctx.input !== undefined && !isRecord(ctx.input)) throw new Error("input must be an object");
      const input = isRecord(ctx.input) ? ctx.input : {};
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "database.read", entityType: "database-ledger" });

      return getTimeline({
        ledger: routeDeps.databaseLedgerRepo,
        filter: {
          kind: optionalString(input, "kind"),
          outcome: optionalString(input, "outcome"),
          fromDate: optionalString(input, "fromDate"),
          toDate: optionalString(input, "toDate"),
          cursor: optionalString(input, "cursor"),
          limit: optionalNumber(input, "limit"),
        },
      });
    },

    database_list_restore_points: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "database.read", entityType: "restore-point" });
      return listRestorePoints({ repo: routeDeps.restorePointsRepo });
    },

    database_plan_migrate_forward: async (ctx) => {
      requireNoInput(ctx.input);
      // No explicit pre-check here: `gateway.ts`'s plan() calls authorize() unconditionally,
      // BEFORE hooks.computePlan() ever runs — verified directly against its body (see
      // `databaseDerivedRisk`'s comment for this tool). Adding a second check here would be the
      // duplicate evaluator ADR-021 §2 forbids.
      const hooks = buildMigrateForwardHooks({
        workspaceId: routeDeps.workspaceId,
        actorId: ctx.principal.id,
        clock: routeDeps.clock,
        idGen: routeDeps.idGen,
        dbOps: routeDeps.dbOps,
        restorePointsRepo: routeDeps.restorePointsRepo,
        databaseLedgerRepo: routeDeps.databaseLedgerRepo,
      });

      return gatewayPlan({
        deps: routeDeps.gatedMutations.gatewayDeps,
        principalId: ctx.principal.id,
        principalKind: AGENT_TOOL_PRINCIPAL_KIND,
        hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
      });
    },

    backup_create_restore_point: async (ctx) => {
      if (ctx.input !== undefined && !isRecord(ctx.input)) throw new Error("input must be an object");
      const input = isRecord(ctx.input) ? ctx.input : {};
      const costAck = optionalBoolean(input, "costAck");

      // `createRestorePoint` (restore-points.ts) has no authorize() call of its own — the real HTTP
      // route (`routes/admin/database/restore-points.ts`) authorizes inline before calling it, so
      // this handler does the identical inline check.
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.create", entityType: "restore-point" });

      const capabilities = await routeDeps.dbOps.getCapabilities();
      let captured: { artifactRef: string; watermarkAtCapture: number } | undefined;

      const summary = await createDatabaseRestorePoint({
        costClass: capabilities.restorePoint.costClass,
        costAck: costAck ?? false,
        capture: async () => {
          captured = await routeDeps.dbOps.captureRestorePoint({ scopeId: routeDeps.workspaceId });
          return captured;
        },
      });

      await routeDeps.restorePointsRepo.save({
        restorePointId: summary.id,
        idempotencyKey: routeDeps.idGen.newId(),
        // Always 'manual' — an agent call is never the system's own pre-migration/template-upgrade
        // auto-snapshot, regardless of what a caller might ask for, so provenance in the ledger can
        // never be mislabeled (see `features/database/agent-tools.ts`'s own schema comment).
        trigger: "manual",
        createdAt: routeDeps.clock.nowIso(),
        createdBy: ctx.principal.id,
        costClass: summary.costClass,
        kind: summary.kind,
        watermarkAtCapture: captured?.watermarkAtCapture ?? null,
        artifactRef: captured?.artifactRef,
      });

      return { restorePoint: summary };
    },
  };

  return buildDomainRegistrations({
    domain: "database",
    catalogModule: "features/database/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: databaseDerivedRisk,
    unwiredToolIds: UNWIRED_DATABASE_TOOL_IDS,
  });
}
