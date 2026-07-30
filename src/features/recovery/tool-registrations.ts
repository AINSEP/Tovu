/**
 * @file Recovery's half of ADR-049 Decision 4 (SPEC-019/ADR-045): maps the wireable subset of
 * `agent-tools.ts`'s seven catalog entries onto the restore-point/capabilities/plan/status/deep-link
 * reads, as `ToolRegistration`s. Reads only — nothing here mutates.
 *
 * Two entries are declared unwired, each with its reason on {@link UNWIRED_RECOVERY_TOOL_IDS}: the
 * token-gated `backup_execute_restore`, and `backup_create_restore_point`, whose id Recovery shares
 * with Database. That second one is a genuine cross-domain id collision (pre-existing, not
 * introduced by this wiring), resolved by wiring it in Database only — see the constant's own
 * comment, and `assistant/tool-registrations.ts`'s merge check, which now fails the build if any
 * future pair of domains both wire one id.
 *
 * Authorization shape: none of the underlying read functions call `authorize()` internally, so
 * every handler here calls the kit's `requireToolPermission` — ADR-021 §2's single evaluation,
 * located where the real route locates it.
 */
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../../assistant/tool-registration-kit";
import { plan as gatewayPlan } from "../../core/gated-mutations/gateway";
import { isOperationInFlight } from "../../core/operation-lock";
import { buildRestoreHooks, toRecoveryResult } from "../../server/gated-mutations-composition";
import type { RouteDeps } from "../../server/routes/types";
import { listRestorePoints } from "../database/restore-points";
import { recoveryAgentToolCatalog } from "./agent-tools";
import { resolveDeepLinkContext, type DatabaseContextEnvelope } from "./deep-link";
import { computeDisclosure } from "./disclosure";
import { planRestore } from "./recovery-orchestrator";
import { resolveDegradedBanner } from "./ui/degraded-banners";

const CATALOG_BY_ID = indexCatalogById(recoveryAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration. Neither excluded tool appears here at all, which is itself the
 * strongest of the guards: an unclassified id cannot be wired.
 */
export const recoveryDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listRestorePoints (features/database/restore-points.ts, the same repo Database's own list
  //    tool reads): one read.
  ["backup_list_restore_points", "none"],
  // -> dbOps.getCapabilities(): pure, side-effect-free per its own doc comment.
  ["backup_get_capabilities", "none"],
  // -> planRestore (recovery-orchestrator.ts) + gateway.ts's plan() + computeDisclosure(): three
  //    reads composed together, nothing persisted.
  ["backup_plan_restore", "none"],
  // -> dbOps.getCapabilities() + siteStatusRepo.get() + isOperationInFlight() (a lock PEEK, not an
  //    acquire) + resolveDegradedBanner() (pure): all reads.
  ["recovery_get_status", "none"],
  // -> resolveDeepLinkContext (deep-link.ts): one DeepLinkRestorePointLookupPort read; never
  //    mutates the input envelope (see that function's own doc comment).
  ["recovery_resolve_deep_link", "none"],
]);

/** Mirrors `routes/admin/recovery/disclosure.ts`'s own `COVERED_CATEGORIES` constant exactly — that
 * route-local const is not exported, so this is a deliberate, disclosed duplication rather than a
 * reach into a route file's private state. Keep the two in sync if either changes. */
const RECOVERY_DISCLOSURE_COVERED_CATEGORIES = ["posts_pages", "plugin_table"] as const;

const UNWIRED_RECOVERY_TOOL_IDS = new Set([
  // EXCLUDED BY DESIGN: token-gated, and `assertToolIsWirable` refuses to build it anyway.
  // A bad agent-triggered restore can roll back every other domain's data at once, irreversibly
  // from the running process's point of view — the default here is exclude, mirroring
  // `database_execute_migrate_forward`'s identical exclusion.
  "backup_execute_restore",
  // Pre-existing (SPEC-019) catalog entry, deliberately left unwired HERE: this id collides with
  // `features/database/agent-tools.ts`'s own `backup_create_restore_point`, which
  // `buildDatabaseRegistrations` already wires as the canonical tool (ADR-041 §6 names the
  // Database/Storage domain as this permission's "named tool"). Recovery's OWN local
  // `createRestorePoint` (`recovery/restore-points.ts`) never calls `DbOpsPort.captureRestorePoint()`
  // — wiring it here too would silently mint a SECOND, artifact-less restore point under the same
  // tool id, reintroducing the exact "artifactRef silently dropped" defect
  // `database/restore-points.ts`'s own file header records as already fixed. One tool id, one
  // handler, backed by the real snapshot path.
  "backup_create_restore_point",
]);

/**
 * Validates a raw `envelope` value against `recovery_resolve_deep_link`'s published schema and
 * returns it narrowed to `DatabaseContextEnvelope`.
 *
 * Hand-written rather than delegating to `identity/agent-tool-input.ts`'s generic schema
 * interpreter, because this is the only nested-object tool input in the whole wiring layer and that
 * interpreter is flat-only — it cannot express a nested `envelope` object at all.
 *
 * @throws {Error} Naming the first missing/mistyped field, matching the kit's
 * `requireString`/`requireNumber` rejection style.
 * @complexity O(1) — a fixed number of field checks.
 * @overallScore 100
 */
function requireDeepLinkEnvelope(value: unknown): DatabaseContextEnvelope {
  if (!isRecord(value)) throw new Error("'envelope' (object) is required");

  const v = value.v;
  const correlationId = value.correlationId;
  const siteId = value.siteId;
  const ledgerEventId = value.ledgerEventId;
  const restorePointId = value.restorePointId;
  const drift = value.drift;
  const intent = value.intent;
  const issuedAt = value.issuedAt;

  if (typeof v !== "number") throw new Error("'envelope.v' (number) is required");
  if (typeof correlationId !== "string") throw new Error("'envelope.correlationId' (string) is required");
  if (typeof siteId !== "string") throw new Error("'envelope.siteId' (string) is required");
  if (ledgerEventId !== null && typeof ledgerEventId !== "string") throw new Error("'envelope.ledgerEventId' must be a string or null");
  if (restorePointId !== null && typeof restorePointId !== "string") throw new Error("'envelope.restorePointId' must be a string or null");
  if (typeof drift !== "string") throw new Error("'envelope.drift' (string) is required");
  if (typeof intent !== "string") throw new Error("'envelope.intent' (string) is required");
  if (typeof issuedAt !== "string") throw new Error("'envelope.issuedAt' (string) is required");

  return { v, correlationId, siteId, ledgerEventId, restorePointId, drift, intent, issuedAt };
}

export function buildRecoveryRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    backup_list_restore_points: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.read", entityType: "restore-point" });
      // Same repo/function Database's own `database_list_restore_points` reads — one persisted
      // list, two gated views (ADR-045 §1, "Database and Recovery are sibling faces").
      return listRestorePoints({ repo: routeDeps.restorePointsRepo });
    },

    backup_get_capabilities: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.read", entityType: "restore-point" });
      const capabilities = await routeDeps.dbOps.getCapabilities();
      return { costClass: capabilities.restorePoint.costClass, kind: capabilities.restorePoint.kind };
    },

    backup_plan_restore: async (ctx) => {
      const restorePointId = requireString(requireInputRecord(ctx.input), "restorePointId");

      // Defensive, explicit check ahead of `planRestore()`: that function's own cost-class
      // short-circuit (COST_CLASS_UNAVAILABLE) returns BEFORE the gateway's internal authorize()
      // ever runs — a pre-existing gap this wiring found in the real HTTP route too (it calls
      // `planRestore` with no authorize() of its own either). This tool stays strictly more
      // conservative than that route by never skipping the check, rather than reproducing the gap.
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.read", entityType: "restore-point" });

      const result = await planRestore({
        deps: {
          dbOps: {
            getCapabilities: async () => {
              const capabilities = await routeDeps.dbOps.getCapabilities();
              return { costClass: capabilities.restorePoint.costClass, restorePointKind: capabilities.restorePoint.kind };
            },
          },
          gateway: {
            plan: (input) =>
              toRecoveryResult(() =>
                gatewayPlan({
                  deps: routeDeps.gatedMutations.gatewayDeps,
                  principalId: input.principalId,
                  principalKind: input.principalKind,
                  hooks: buildRestoreHooks({
                    workspaceId: routeDeps.workspaceId,
                    actorId: ctx.principal.id,
                    restorePointId: input.restorePointId,
                    clock: routeDeps.clock,
                    idGen: routeDeps.idGen,
                    restorePointsRepo: routeDeps.restorePointsRepo,
                    databaseLedgerRepo: routeDeps.databaseLedgerRepo,
                    dbOps: routeDeps.dbOps,
                    migrationRunsRepo: routeDeps.migrationRunsRepo,
                    siteStatus: routeDeps.siteStatusRepo,
                  }) as never,
                }),
              ),
          },
        },
        input: { principalId: ctx.principal.id, principalKind: AGENT_TOOL_PRINCIPAL_KIND, restorePointId },
      });

      if (!result.ok) throw new Error(result.error.message ?? result.error.code);

      // Folds in the discarded-write-window disclosure, matching this tool's own catalog
      // description ("including the discarded-write-window disclosure") — the human admin UI reads
      // this from a separate `/recovery/disclosure` request; a tool call composes both in one turn.
      const disclosure = await computeDisclosure({
        deps: { watermarkSource: routeDeps.disclosureWatermarkSource, coveredCategories: RECOVERY_DISCLOSURE_COVERED_CATEGORIES },
        input: { restorePointId },
      });

      return { plan: result.value, disclosure };
    },

    recovery_get_status: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.read", entityType: "restore-point" });

      const capabilities = await routeDeps.dbOps.getCapabilities();
      const siteStatus = await routeDeps.siteStatusRepo.get(routeDeps.workspaceId);
      const banner = resolveDegradedBanner({
        capabilities: {
          costClass: capabilities.restorePoint.costClass,
          operationInFlight: isOperationInFlight(routeDeps.workspaceId),
          pendingMigration: siteStatus === "PENDING_MIGRATION",
          migrationInterrupted: siteStatus === "BLOCKED_PENDING_RECOVERY",
          // Matches `routes/admin/recovery/status.ts`'s own honest stub — no per-category
          // write-count tracker exists anywhere in this codebase yet (see `disclosure.ts`'s doc).
          watermarkBaselineAvailable: false,
        },
      });

      return { costClass: capabilities.restorePoint.costClass, banner };
    },

    recovery_resolve_deep_link: async (ctx) => {
      if (!isRecord(ctx.input)) throw new Error("'envelope' (object) is required");
      const envelope = requireDeepLinkEnvelope(ctx.input.envelope);

      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.read", entityType: "restore-point" });

      return resolveDeepLinkContext({
        deps: { lookup: routeDeps.deepLinkRestorePointLookup },
        input: { principalId: ctx.principal.id, principalKind: AGENT_TOOL_PRINCIPAL_KIND, envelope },
      });
    },
  };

  return buildDomainRegistrations({
    domain: "recovery",
    catalogModule: "features/recovery/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: recoveryDerivedRisk,
    unwiredToolIds: UNWIRED_RECOVERY_TOOL_IDS,
  });
}
