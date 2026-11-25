import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";
import { ForbiddenError } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import { PUSH_POLL_WAIT_MS, siteBackupPlanRoute, siteBackupPushRoute, type SiteBackupRouteDeps } from "@jini-ai/cms/admin-http/routes/system/site-backups";
import { mountAdminRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import type { AdminJsonRouteMountOptions } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { adminPublishTrustFor } from "#src/server/inbound/admin-http/admin-request-facts";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { CustomCredentialValidationError } from "#src/features/custom-credentials/index";
import { planSiteBackup, pushSiteBackup, type SiteBackupToolDeps } from "#src/features/site-backup/backup-service";

/**
 * @file K1 (RT-K1-adm-system-15): the admin Git backup screen's two calls are the Jini raw specs
 * `siteBackupPlanRoute` / `siteBackupPushRoute`, mounted behind the admin ports. The registrar binds
 * what the specs cannot import: the backup service (`backup-service.ts`, the assistant tools' own code
 * path), its error ladder and the publish-trust lookup. Wire kept from the hand-written route
 * (`site-backups.wire.test.ts`): the workspace refusal is `res.sendStatus(404)`'s text
 * (`workspaceRefusal`), the publish-trust refusal the spec's `Forbidden` text, and an unmapped failure
 * the route's own redacted `BACKUP_FAILED` line.
 */

const SITE_BACKUP_MOUNT: AdminJsonRouteMountOptions = {
  workspaceRefusal: () => ({ status: 404 }),
  failure: { operation: "routes/system/site-backups", code: "BACKUP_FAILED", field: "message", message: "Git backup failed. Try again." },
};

/** The service's thrown errors as HTTP. Validation and permission errors carry no secret (see
 *  `tool-registrations.ts`'s model-facing rules); anything else gets a fixed line, never its text.
 * @complexity O(1). */
function siteBackupErrorReply({ error }: { error: unknown }, _optional: Record<string, never> = {}): { status: number; body: unknown } | undefined {
  if (error instanceof ForbiddenError) return { status: 403, body: { code: "FORBIDDEN", message: "You do not have permission to back up this site." } };
  if (error instanceof CustomCredentialValidationError || error instanceof ToolInputError) return { status: 400, body: { code: "INVALID_INPUT", message: error.message } };
  return undefined;
}

/**
 * Mounts the two routes under the admin session gate.
 * @complexity O(1) per request besides the service's own cost.
 */
export function registerAdminSiteBackupRoutes(required: { errors: RouteErrorPorts; app: Express; deps: SiteBackupToolDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const routeDeps: SiteBackupRouteDeps & { authorize: SiteBackupToolDeps["authorize"] } = {
    workspaceId: deps.workspaceId,
    // Read per request, as the hand-written route read `deps.authorize` (the specs never authorize
    // themselves; the service checks its own two permissions).
    authorize: (params) => deps.authorize(params),
    plan: ({ call }) => planSiteBackup({ deps, call }),
    push: ({ call }) => pushSiteBackup({ deps, call }, { waitMs: PUSH_POLL_WAIT_MS }),
    // The mount hands the spec the principal its own ports authenticated (`OperatorPrincipalRecord`).
    isPublishTrusted: ({ context }: { context: OperatorPrincipalRecord }) => adminPublishTrustFor({ context }) !== null,
    mapBackupError: siteBackupErrorReply,
  };
  mountAdminRawRoute({ errors: required.errors, app, spec: siteBackupPlanRoute, deps: routeDeps }, SITE_BACKUP_MOUNT);
  mountAdminRawRoute({ errors: required.errors, app, spec: siteBackupPushRoute, deps: routeDeps }, SITE_BACKUP_MOUNT);
}
