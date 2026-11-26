import { toolMetadata } from '@jini-ai/core/tool-metadata/recovery';
import type { Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { refuseUnexpectedKeys } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { GatewayDeps } from "../../contracts/core/gated-mutations/gateway.js";
import { confirm as gatewayConfirm, execute as gatewayExecute, plan as gatewayPlan } from "../../contracts/core/gated-mutations/gateway.js";
import type { DbOpsPort } from "@jini-ai/core/contracts/site/gated-mutations-ports";
import { acquireOperationLock, isOperationInFlight, releaseOperationLock } from "../../contracts/core/operation-lock.js";
import { humanConfirmedToolHandler } from "#src/contracts/core/human-confirm";
import { buildRestoreHooks, toRecoveryResult } from "./gated-hooks.js";
import type { MigrationRunsRepoPort } from "@jini-ai/db/recovery/reconcile-interrupted-migration";
import type { SiteStatusPort } from "@jini-ai/core/contracts/site/recovery-reconcile-interrupted-migration";
import type { LedgerAppendPort } from "@jini-ai/db/recovery/migrate-forward-hooks";
import type { RestorePointListPort } from "@jini-ai/db/tools";
import { createRecoveryAgentToolCatalog } from "@jini-ai/db/recovery/agent-tools";
import type { DeepLinkRestorePointLookupPort } from "@jini-ai/db/recovery/deep-link";
import type { DisclosureWatermarkSourcePort } from "@jini-ai/db/recovery/disclosure";
import { bindRecoveryTools } from "@jini-ai/db/recovery/tool-registrations";

/** Host binding (K3): the catalog's guidance names this host's own backup tools, its `.tovu.zip`
 * export screen and its restore-point read tools, which the engine catalog cannot know. */
export const recoveryAgentToolCatalog = createRecoveryAgentToolCatalog({
  backupWorkflowGuidance: "For private full-site repository backups, call source_control_get_capabilities to discover installed hosts (including disabled ones), then site_backup_plan → site_backup_push. Portable .tovu.zip exports are available under Admin → Sites → Export.",
  restorePointIdSource: "content_read.backup_restore_point or content_read.database_restore_point",
}, { resolveDeepLinkCitation: "INV-04" });

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
  clock: Clock;
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

/** Mirrors `apps/website/src/server/inbound/admin-http/routes/recovery/disclosure.ts`'s own `COVERED_CATEGORIES` constant exactly — that
 * route-local const is not exported, so this is a deliberate, disclosed duplication rather than a
 * reach into a route file's private state. Keep the two in sync if either changes. */
const RECOVERY_DISCLOSURE_COVERED_CATEGORIES = ["posts_pages", "plugin_table"] as const;

export const { buildRecoveryRegistrations, contributeRecoveryTools } = bindRecoveryTools<RecoveryToolDeps>({
  catalog: recoveryAgentToolCatalog, metadata: toolMetadata, catalogModule: "@jini-ai/db/recovery/agent-tools.ts",
  readPermission: "backup.read", restorePermission: "backup.restore", coveredCategories: RECOVERY_DISCLOSURE_COVERED_CATEGORIES,
  capabilityGuidance: {
    fullSiteBackup: {
      discoveryTool: "source_control_get_capabilities", planTool: "site_backup_plan", pushTool: "site_backup_push",
      guidance: "Discover installed source-control hosts, including disabled hosts, before choosing a private repository. Enable the chosen plugin and configure its connection through the secure card. Plan and review the private full-site backup before pushing; rendered static output commits are separate.",
    },
    portableExport: { href: "/admin/sites", guidance: "Admin → Sites → Export creates a portable .tovu.zip." },
  },
  authorize: ({ deps: routeDeps, ctx, permission, entityType }) => requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission }, { entityType }),
  operationLock: { acquireOperationLock, releaseOperationLock }, isOperationInFlight,
  refuseUnexpectedKeys, buildRestoreHooks, gatewayPlan, gatewayConfirm, gatewayExecute, toRecoveryResult, humanConfirmedToolHandler,
  dialog: {
    errorCode: "RECOVERY", title: "Restore the site's data?", restorePointLabel: "Restore point",
    warning:
      "Your current data will be replaced with this restore point. Anything changed since then is lost. " +
      "No restore point is taken first, so this can't be undone.",
    confirmLabel: "Replace current data",
  },
});
