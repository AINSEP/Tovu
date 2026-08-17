/**
 * @file Database's half of ADR-049 Decision 4 (SPEC-017/ADR-041): maps the wireable subset of
 * `agent-tools.ts`'s nine catalog entries onto the timeline/restore-point/introspection reads and
 * the one clearly-reversible write, as `ToolRegistration`s.
 *
 * Risk framing: this domain is meaningfully higher-risk than Forms/Identity/content-types — a
 * migrate-forward can rewrite schema and data across every other domain at once, sometimes
 * irreversibly — so the surface is deliberately reads plus one write rather than full parity with
 * the admin UI. Two of the nine entries are still declared unwired, each with its reason recorded
 * on {@link UNWIRED_DATABASE_TOOL_IDS}; `features/database/agent-tools.ts` carries the per-entry
 * half of the same reasoning.
 *
 * Authorization shape: none of the underlying read functions (`getTimeline`, `listRestorePoints`,
 * `createRestorePoint`, `DatabaseIntrospectionPort`'s three methods) call `authorize()` internally
 * — the admin routes gate inline (or, for the introspection trio, there is no admin route to
 * mirror yet, so this file's own inline check is the only gate) — so those handlers call the kit's
 * `requireToolPermission` themselves. The one exception is `database_plan_migrate_forward`,
 * documented at its own handler.
 */
import {
  type AuthorizeFn,
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
} from "@jini-ai/cms/core";
import {
  plan as gatewayPlan,
  type GatedMutationHooks,
  type GatewayDeps,
} from "../../core/gated-mutations/gateway";
import type { DbOpsPort } from "../../core/gated-mutations/ports";
import { buildMigrateForwardHooks, type LedgerAppendPort } from "./gated-hooks";
import { getDatabaseAgentToolCatalog } from "./agent-tools";
import type { DatabaseIntrospectionPort } from "./adapter.sqlite";
import {
  createRestorePoint as createDatabaseRestorePoint,
  listRestorePoints,
  type RestorePointListPort,
  type RestorePointSavePort,
} from "./restore-points";
import { getTimeline, type LedgerReadPort } from "./timeline";

/**
 * The exact slice of the route-deps bag Database's tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root for the `RouteDeps` god type. This domain's `buildMigrateForwardHooks`/
 * `LedgerAppendPort` now live in this module's own `gated-hooks.ts` (moved out of
 * `server/gated-mutations-composition.ts`, closing the back-edge into `server/` that file's import
 * previously required), so `server/routes/*` satisfies this interface structurally by passing its
 * existing `RouteDeps` object; nothing there changes.
 */
export interface DatabaseToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  databaseLedgerRepo: LedgerReadPort & LedgerAppendPort;
  restorePointsRepo: RestorePointListPort & RestorePointSavePort;
  databaseIntrospection: DatabaseIntrospectionPort;
  dbOps: DbOpsPort;
  gatedMutations: { gatewayDeps: GatewayDeps };
}

/**
 * Widened this dispatch (ADR-041 §3, closing `agent-tools.ts`'s own disclosed gap) with the three
 * `DatabaseIntrospectionPort`-backed reads below — `database_get_health`, `database_get_schema_state`,
 * `database_list_pending_migrations`. All three are pure passthroughs to `routeDeps.databaseIntrospection`
 * (`features/database/adapter.sqlite.ts`); none of that port's methods call `authorize()`
 * internally, so each handler runs the identical inline `requireToolPermission` check every other
 * read handler in this file already runs.
 */

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
  // -> routeDeps.databaseIntrospection.getHealth() (adapter.sqlite.ts): read-only queries against
  //    an already-open connection plus one `.site-meta.json` file read. No write of any kind.
  ["database_get_health", "none"],
  // -> routeDeps.databaseIntrospection.getSchemaState(): same read-only shape as getHealth() above.
  ["database_get_schema_state", "none"],
  // -> routeDeps.databaseIntrospection.listPendingMigrations(): one bundled-journal file read plus
  //    one bounded `__drizzle_migrations` query. No write of any kind.
  ["database_list_pending_migrations", "none"],
]);

/** Database catalog entries this pass does not wire, and why — see `features/database/agent-tools.ts`'s own per-entry comments for the full reasoning. */
const UNWIRED_DATABASE_TOOL_IDS = new Set([
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

export function buildDatabaseRegistrations(routeDeps: DatabaseToolDeps): ToolRegistration[] {
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

    database_get_health: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "database.read", entityType: "database" });
      return routeDeps.databaseIntrospection.getHealth();
    },

    database_get_schema_state: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "database.read", entityType: "database" });
      return routeDeps.databaseIntrospection.getSchemaState();
    },

    database_list_pending_migrations: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "database.read", entityType: "database" });
      return routeDeps.databaseIntrospection.listPendingMigrations();
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

// 2026-08-17: Database was briefly converted to the tool-contribution registry
// (`contributeDatabaseTools`, registered via `#src/assistant/index`'s `registerToolContributor`)
// in the same Stage 2 batch 2 that converted widgets/content-types/forms/menus, then reverted the
// same night — `check:architecture --list` showed it opened a NEW, much larger module cycle than
// the `themes`/`post` near-misses in the prior batch: adding `database -> assistant` closed a
// 16-module SCC: `assistant, db, export, features/database, features/deployments, features/entries,
// features/pages, features/plugin-runtime, features/post, features/presentation, features/recovery,
// features/settings, features/source-control, features/vendor-credentials, features/workspace, seo`.
// A plain relative-path/`#src/*` importer grep on `features/database` alone (server/* and
// `db/sqlite/*` only) did not surface this — the cycle runs through the shared low-level `db`
// module and the still-static `deployments`/`source-control`/`recovery`/`settings`/`workspace`/
// `entries`/`post`/`pages`/`plugin-runtime`/`seo` `DOMAIN_SLICES` entries collectively, not through
// any single direct importer. Database cannot convert safely until enough of that still-static
// cluster converts (or the `db` hub's cross-domain imports are narrowed) to break every path back
// from `assistant`'s remaining static domains through `db` into `features/database`. Left as a
// normal `DOMAIN_SLICES` entry; see `assistant/tool-registrations.ts`'s own header for the current
// authoritative list of what has and hasn't converted.
