/**
 * @file Recovery's half of ADR-049 Decision 4 (SPEC-019/ADR-045): maps the wireable subset of
 * `agent-tools.ts`'s seven catalog entries onto the restore-point/capabilities/plan/status/deep-link
 * reads, as `ToolRegistration`s, plus `backup_execute_restore` (2026-09-24), which asks the human in
 * chat first and only runs on their click — see `contracts/core/human-confirm.ts`'s
 * `humanConfirmedToolHandler`.
 *
 * One entry is declared unwired, with its reason on {@link UNWIRED_RECOVERY_TOOL_IDS}:
 * `backup_create_restore_point`, whose id Recovery shares with Database. That is a genuine cross-domain id collision (pre-existing, not
 * introduced by this wiring), resolved by wiring it in Database only — see the constant's own
 * comment, and `assistant/tool-registrations.ts`'s merge check, which now fails the build if any
 * future pair of domains both wire one id.
 *
 * Authorization shape: none of the underlying read functions call `authorize()` internally, so
 * every handler here calls the kit's `requireToolPermission` — ADR-021 §2's single evaluation,
 * located where the real route locates it.
 */
import {
  type AuthorizeFn,
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
} from "@jini-ai/cms/core";
// `ToolInputError` specifically — see `features/post/tool-registrations.ts`'s identical import
// for why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather
// than redacting it into a message-stripped 500.
import { ToolInputError } from "@jini-ai/core";
import type { GatewayDeps } from "../../contracts/core/gated-mutations/gateway.js";
import { confirm as gatewayConfirm, execute as gatewayExecute, plan as gatewayPlan } from "../../contracts/core/gated-mutations/gateway.js";
import type { DbOpsPort } from "../../contracts/core/gated-mutations/ports.js";
import { acquireOperationLock, isOperationInFlight, releaseOperationLock } from "../../contracts/core/operation-lock.js";
import { humanConfirmedToolHandler, refuseUnexpectedKeys } from "#src/contracts/core/human-confirm";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "#src/contracts/core/tool-surface-exchanges";
import type { ToolContributor } from "#src/assistant/index";
import { buildRestoreHooks, toRecoveryResult } from "./gated-hooks.js";
import type {
  MigrationRunsRepoPort,
  SiteStatusPort,
} from "../database/boot/reconcile-interrupted-migration.js";
// `LedgerAppendPort` is Database-owned — Recovery already imports several other Database ports
// this same way (`RestorePointListPort` below, `MigrationRunsRepoPort`/`SiteStatusPort` above), so
// sourcing this one type from `features/database/gated-hooks.ts` too is the established "Recovery
// depends on Database, never the reverse" direction, not a new cross-domain edge.
import type { LedgerAppendPort } from "../database/gated-hooks.js";
import { listRestorePoints, type RestorePointListPort } from "../database/restore-points.js";
import { recoveryAgentToolCatalog } from "./agent-tools.js";
import {
  resolveDeepLinkContext,
  type DatabaseContextEnvelope,
  type DeepLinkRestorePointLookupPort,
} from "./deep-link.js";
import { computeDisclosure, type DisclosureWatermarkSourcePort } from "./disclosure.js";
import { confirmRestore, executeRestore, planRestore } from "./recovery-orchestrator.js";
import { resolveDegradedBanner } from "./ui/degraded-banners.js";

const CATALOG_BY_ID = indexCatalogById(recoveryAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Recovery's tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root for the `RouteDeps` god type. This domain's `buildRestoreHooks`/
 * `toRecoveryResult` now live in this module's own `gated-hooks.ts` (moved out of
 * `server/gated-mutations-composition.ts`, closing the back-edge into `server/` that file's import
 * previously required), so `server/routes/*` satisfies this interface structurally by passing its
 * existing `RouteDeps` object; nothing there changes.
 */
export interface RecoveryToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  dbOps: DbOpsPort;
  restorePointsRepo: RestorePointListPort;
  databaseLedgerRepo: LedgerAppendPort;
  migrationRunsRepo: Pick<MigrationRunsRepoPort, "findNonTerminalForSite" | "markResolved">;
  siteStatusRepo: SiteStatusPort;
  disclosureWatermarkSource: DisclosureWatermarkSourcePort;
  deepLinkRestorePointLookup: DeepLinkRestorePointLookupPort;
  gatedMutations: { gatewayDeps: GatewayDeps };
}

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
  // -> gateway confirm() (as the human, after their click) + execute() via buildRestoreHooks,
  //    inside executeRestore's operation lock: swaps the site's data for the restore point's.
  ["backup_execute_restore", "mutates-durable-state"],
]);

const RESTORE_TOOL_ID = "backup_execute_restore";

/** Mirrors `routes/admin/recovery/disclosure.ts`'s own `COVERED_CATEGORIES` constant exactly — that
 * route-local const is not exported, so this is a deliberate, disclosed duplication rather than a
 * reach into a route file's private state. Keep the two in sync if either changes. */
const RECOVERY_DISCLOSURE_COVERED_CATEGORIES = ["posts_pages", "plugin_table"] as const;

const UNWIRED_RECOVERY_TOOL_IDS = new Set([
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

/** One field's "must be typeof number" check for {@link requireDeepLinkEnvelope} — same rejection
 *  style as the kit's own `requireNumber`, just scoped to a nested envelope field path. */
function requireEnvelopeNumber(value: unknown, fieldPath: string): number {
  if (typeof value !== "number") throw new ToolInputError(`'${fieldPath}' (number) is required`);
  return value;
}

/** One field's "must be typeof string" check for {@link requireDeepLinkEnvelope}. */
function requireEnvelopeString(value: unknown, fieldPath: string): string {
  if (typeof value !== "string") throw new ToolInputError(`'${fieldPath}' (string) is required`);
  return value;
}

/** One field's "must be a string, or explicitly null" check — `ledgerEventId`/`restorePointId`
 *  are the only two nullable fields on the envelope. */
function requireEnvelopeStringOrNull(value: unknown, fieldPath: string): string | null {
  if (value !== null && typeof value !== "string") throw new ToolInputError(`'${fieldPath}' must be a string or null`);
  return value;
}

/**
 * Validates a raw `envelope` value against `recovery_resolve_deep_link`'s published schema and
 * returns it narrowed to `DatabaseContextEnvelope`.
 *
 * Hand-written rather than delegating to `identity/agent-tool-input.ts`'s generic schema
 * interpreter, because this is the only nested-object tool input in the whole wiring layer and that
 * interpreter is flat-only — it cannot express a nested `envelope` object at all.
 *
 * @throws {ToolInputError} Naming the first missing/mistyped field, matching the kit's
 * `requireString`/`requireNumber` rejection style.
 * @complexity O(1) — a fixed number of field checks.
 * @overallScore 100
 */
function requireDeepLinkEnvelope(value: unknown): DatabaseContextEnvelope {
  if (!isRecord(value)) throw new ToolInputError("'envelope' (object) is required");

  return {
    v: requireEnvelopeNumber(value.v, "envelope.v"),
    correlationId: requireEnvelopeString(value.correlationId, "envelope.correlationId"),
    siteId: requireEnvelopeString(value.siteId, "envelope.siteId"),
    ledgerEventId: requireEnvelopeStringOrNull(value.ledgerEventId, "envelope.ledgerEventId"),
    restorePointId: requireEnvelopeStringOrNull(value.restorePointId, "envelope.restorePointId"),
    drift: requireEnvelopeString(value.drift, "envelope.drift"),
    intent: requireEnvelopeString(value.intent, "envelope.intent"),
    issuedAt: requireEnvelopeString(value.issuedAt, "envelope.issuedAt"),
  };
}

export function buildRecoveryRegistrations(
  routeDeps: RecoveryToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const restoreHooks = (actorId: string, restorePointId: string) =>
    buildRestoreHooks({
      workspaceId: routeDeps.workspaceId,
      actorId,
      restorePointId,
      clock: routeDeps.clock,
      idGen: routeDeps.idGen,
      restorePointsRepo: routeDeps.restorePointsRepo,
      databaseLedgerRepo: routeDeps.databaseLedgerRepo,
      dbOps: routeDeps.dbOps,
      migrationRunsRepo: routeDeps.migrationRunsRepo,
      siteStatus: routeDeps.siteStatusRepo,
    }) as never;

  // Plans a restore as the agent and folds in the discarded-write-window disclosure — shared by
  // `backup_plan_restore` and the confirm dialog of `backup_execute_restore`.
  const planRestoreWithDisclosure = async (actorId: string, restorePointId: string) => {
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
                hooks: restoreHooks(actorId, input.restorePointId),
              }),
            ),
        },
      },
      input: { principalId: actorId, principalKind: AGENT_TOOL_PRINCIPAL_KIND, restorePointId },
    });

    if (!result.ok) throw new Error(result.error.message ?? result.error.code);

    const disclosure = await computeDisclosure({
      deps: { watermarkSource: routeDeps.disclosureWatermarkSource, coveredCategories: RECOVERY_DISCLOSURE_COVERED_CATEGORIES },
      input: { restorePointId },
    });
    return { plan: result.value, disclosure };
  };

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

      // Folds in the discarded-write-window disclosure, matching this tool's own catalog
      // description ("including the discarded-write-window disclosure") — the human admin UI reads
      // this from a separate `/recovery/disclosure` request; a tool call composes both in one turn.
      return planRestoreWithDisclosure(ctx.principal.id, restorePointId);
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
      if (!isRecord(ctx.input)) throw new ToolInputError("'envelope' (object) is required");
      const envelope = requireDeepLinkEnvelope(ctx.input.envelope);

      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.read", entityType: "restore-point" });

      return resolveDeepLinkContext({
        deps: { lookup: routeDeps.deepLinkRestorePointLookup },
        input: { principalId: ctx.principal.id, principalKind: AGENT_TOOL_PRINCIPAL_KIND, envelope },
      });
    },

    // Plans as the agent, asks the human, then confirms as the human and executes as the agent
    // inside the same operation lock the admin execute route uses. No restore point is taken
    // first, so the dialog says the current data is replaced and it can't be undone. The human's
    // confirm click is the disclosure acknowledgment (CIC U-002).
    [RESTORE_TOOL_ID]: humanConfirmedToolHandler(surfaces, {
      flag: "restored",
      prepare: async (ctx) => {
        const input = requireInputRecord(ctx.input);
        refuseUnexpectedKeys(input, ["restorePointId"]);
        const restorePointId = requireString(input, "restorePointId");
        await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "backup.restore", entityType: "restore-point" });
        const { plan } = await planRestoreWithDisclosure(ctx.principal.id, restorePointId);
        const { items } = await listRestorePoints({ repo: routeDeps.restorePointsRepo });
        const createdAt = items.find((item) => item.id === restorePointId)?.createdAt;
        return { restorePointId, plan: plan as { planId: string; planHash: string }, createdAt };
      },
      dialog: ({ restorePointId, createdAt }) => ({
        toolId: RESTORE_TOOL_ID,
        errorCode: "RECOVERY",
        title: "Restore the site's data?",
        details: [{ label: "Restore point", value: createdAt ? `${restorePointId} (${createdAt})` : restorePointId }],
        warning:
          "Your current data will be replaced with this restore point. Anything changed since then is lost. " +
          "No restore point is taken first, so this can't be undone.",
        danger: true,
        confirmLabel: "Replace current data",
      }),
      run: async (ctx, { restorePointId, plan }, confirmer) => {
        const hooks = restoreHooks(ctx.principal.id, restorePointId);
        const confirmed = await confirmRestore({
          deps: {
            gateway: {
              confirm: (params) =>
                toRecoveryResult(async () => {
                  const record = await gatewayConfirm({
                    deps: routeDeps.gatedMutations.gatewayDeps,
                    principalId: confirmer.id,
                    principalKind: confirmer.kind,
                    hooks,
                    planId: params.planId,
                    planHash: params.planHash,
                  });
                  return { confirmationToken: record.confirmationToken };
                }),
            },
          },
          input: { principalId: confirmer.id, principalKind: confirmer.kind, planId: plan.planId, planHash: plan.planHash, disclosureAcknowledged: true },
        });
        if (!confirmed.ok) throw new Error(confirmed.error.message ?? confirmed.error.code);
        const { confirmationToken } = confirmed.value as { confirmationToken: string };

        const executed = await executeRestore({
          deps: {
            gateway: {
              execute: (params) =>
                toRecoveryResult(() =>
                  gatewayExecute({
                    deps: routeDeps.gatedMutations.gatewayDeps,
                    principalId: ctx.principal.id,
                    principalKind: AGENT_TOOL_PRINCIPAL_KIND,
                    hooks,
                    confirmationToken: params.confirmationToken,
                  }),
                ),
            },
            operationLock: { acquireOperationLock, releaseOperationLock },
            clock: routeDeps.clock,
          },
          input: {
            principalId: ctx.principal.id,
            principalKind: AGENT_TOOL_PRINCIPAL_KIND,
            confirmationToken,
            siteId: routeDeps.workspaceId,
            delegatedByPrincipalId: confirmer.id,
          },
        });
        if (!executed.ok) throw new Error(executed.error.message ?? executed.error.code);
        return { restored: true, ...executed.value };
      },
    }),
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

/**
 * Contributes Recovery's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildRecoveryRegistrations`/
 * `recoveryDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2).
 * Unlike `database` (tried and reverted earlier in this same batch — see
 * `features/database/tool-registrations.ts`'s trailing comment), Recovery's only imports of
 * `features/database` (`../database/boot/reconcile-interrupted-migration`, `../database/gated-hooks`)
 * are both `import type` — erased from the runtime-only graph `check:architecture` uses for module
 * cycles/SCC — so this domain does not carry `database`'s `db`-hub round-trip risk.
 */
export function contributeRecoveryTools(): ToolContributor {
  return { domain: "recovery", build: buildRecoveryRegistrations, risk: recoveryDerivedRisk };
}
