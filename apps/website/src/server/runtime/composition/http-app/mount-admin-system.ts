import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
/**
 * @file The system-admin registrations of `createApp`: analytics + the public site assistant, observability, mail, site administration,
 * and credentials/files. Registration order is behaviour, so `mountAdminSystem` calls the five sub-mounts in the original statement
 * order. Statements moved verbatim out of `app.ts`.
 */

import type { ErrorReporter } from "@jini-ai/core/errors/reporter";
import { bindSiteConsentService } from '../site-consent.js';
import { registerAdminConsentRoutes } from '../modules/consent.js';
import { registerAdminSiteShareRoutes } from "#src/server/runtime/composition/modules/system-site-shares";
import { registerSiteImportRoutes } from "@jini-ai/cms/admin-http/routes/system/site-imports";
import { ImportHistoryUnavailable, mapSqliteError } from "@jini-ai/devops/backup/site/import-index/errors";
import { parseSiteImportInput } from "@jini-ai/devops/backup/site/import-backend";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { SHARE_LIMITS } from "#src/features/site-backup/share-policy";
import { formatByteSize } from "@jini-ai/devops/backup/site/sources";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import express from "express";
import { registerAdminSiteBackupRoutes } from "#src/server/runtime/composition/modules/system-site-backups";
import { toolGapsRoute } from "@jini-ai/cms/admin-http/routes/system/tool-gaps";
import type { ToolGapsToolDeps } from "@jini-ai/core/contracts/site/assistant-host-ports";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { ensureSiteKeyForSite } from "#src/features/webhooks/site-key-ensure";
import { createAnalyticsModule } from "../modules/analytics.js";
import type { Express } from "express";
import { moduleStatusRoute } from "@jini-ai/cms/admin-http/routes/system/module-status";
import { getReadinessSnapshot } from "#src/server/runtime/lifecycle/readiness-state";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import { observabilityStatusRoute, observabilityTestErrorRoute } from "@jini-ai/cms/admin-http/routes/system/observability-status";
import { registerAdminBrowserTelemetryRoute } from "../modules/system-telemetry.js";
import { serverLogsRoute } from "@jini-ai/cms/admin-http/routes/system/server-logs";
import { processServerLogSource } from "#src/features/server-logs/process-source";
import { parseServerLogFilters, readServerLogs, ServerLogFilterError, type ServerLogSourcePort } from "@jini-ai/diagnostics/server-logs/read-server-logs";
import type { ServerLogFilters } from "@jini-ai/core/contracts/site/platform-server-logs";
import { registerAdminMailStatusRoute, registerAdminMailProviderRoutes, registerAdminMailDnsRoutes, registerAdminMailTestSendRoute, registerAdminMailActivityRoutes } from "../modules/system-mail.js";
import { createDnsChangeDepsFactory } from "../dns-change-deps.js";
import { DOMAIN_DNS_EGRESS_POLICY } from "../domain-dns-adapters.js";
import { assistantDaemonRestartRoute, type AdminAssistantDaemonDeps } from "@jini-ai/cms/admin-http/routes/system/assistant-daemon";
import { restartAssistantDaemon as restartAssistantDaemonReal } from "#src/server/runtime/lifecycle/daemon-supervisor";
import { registerAdminAssistantPermanentDeletesRoutes, registerAdminAssistantSubagentsRoutes } from "../modules/system-assistant.js";
import { registerAdminDeploymentOverviewRoute, registerAdminExportSiteRoutes, registerAdminPublishSiteRoutes } from "../modules/system-deploy.js";
import { registerAdminSitesRoutes } from "../modules/sites.js";
import { registerAdminSiteProfileRoute } from "../modules/site.js";
import { registerAdminDockerfileSourceRoute } from "../../../inbound/admin-http/routes/system/dockerfile-source.js";
import { registerAdminCustomCredentialsRoutes, registerAdminPublishCredentialsRoutes, registerAdminSourceControlCredentialsRoutes } from "../modules/system-credentials.js";
import { registerAdminCredentialCopyRoutes } from "../modules/system-credential-copy.js";
import { registerAdminSiteKeyRoutes } from "../../../inbound/admin-http/routes/system/site-key.js";
import { siteUpdateStatusRoute, type SiteUpdateStatusRouteDeps } from "@jini-ai/devops/deploy/admin-http/site-update-status";
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";
import { readSiteUpdateStatus, type ReadSiteUpdateStatusRequired, type SiteUpdateStatusPorts } from "#src/features/site-update/read-status";
import type { SiteUpdateCheckRuntime } from "#src/features/site-update/tools";
import { sendAdminFailure, reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { siteKeyRecovery } from "../site-key-recovery.js";
import { registerAdminFsFilesCustomRootRoutes } from "../../../inbound/admin-http/routes/fs-files/custom-root.js";
import { registerAdminFsFilesFolderPickerRoutes } from "../../../inbound/admin-http/routes/fs-files/folder-picker.js";
import { createNativeFolderPicker } from "@jini-ai/cms/fs-files/native-folder-picker";
import { isLocalTovuHost } from "../registered-sites.js";
import { createSiteAssistantModule } from "../modules/site-assistant.js";
import { mountRoutes, startModule } from "./module-handles.js";
import type { ErrorBoundMountInput } from "./module-handles.js";
import type { CreateAppOptions } from "../create-app-options.js";
import { mountStorageRoutes, storageOwnerFrom, type SiteStoragePort } from "../modules/storage-routes.js";
import { adminSameOriginWrites } from "#src/server/inbound/admin-http/admin-json-route-ports";

/** `GET .../system/module-status` (Jini spec) over this process's boot readiness snapshot; direct
 * authorization and the route's own failure copy, as the hand-written route answered.
 * @complexity O(1) setup.
 */
export function registerAdminModuleStatusRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ errors, app, spec: moduleStatusRoute, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, getReadinessSnapshot } },
    { authorization: "direct", failure: { operation: "routes/system/module-status", code: "INTERNAL_ERROR" } });
}

/** The `RouteDeps` fields the observability routes read (`tracker` only for the failure report). */
export type AdminObservabilityStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "observability" | "observabilityEnabled" | "telemetryStatus" | "sendTelemetryTest" | "tracker">;

/** `GET .../system/observability-status` + `POST .../system/observability/test-error` (Jini specs),
 * reported under this product's service name. Both authorize directly (no publish-credential
 * override), as the hand-written routes did; the POST answers its own 403 copy.
 * @complexity O(1) setup.
 */
export function registerAdminObservabilityStatusRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: AdminObservabilityStatusDeps }, _optional: Record<string, never> = {}): void {
  const options = { authorization: "direct", failure: { operation: "routes/system/observability-status", code: "INTERNAL_ERROR" } } as const;
  const { workspaceId, authorize, sendTelemetryTest } = deps;
  mountAdminJsonRoute({ errors, app, spec: observabilityStatusRoute, deps: { workspaceId, authorize, sendTelemetryTest, observability: deps.observability,
    observabilityEnabled: deps.observabilityEnabled, telemetryStatus: deps.telemetryStatus, serviceName: "tovu" } }, options);
  mountAdminJsonRoute({ errors, app, spec: observabilityTestErrorRoute, deps: { workspaceId, authorize, sendTelemetryTest } }, options);
}

// Tool gaps are owner-only, never RBAC-gated: the spec compares the session principal with the
// owner and never calls the authorize port, so this authorizer exists only to fail closed if it ever did.
const toolGapsNeverAuthorizes: RouteDeps["authorize"] = async () => ({ allowed: false, reason: "tool gaps are owner-only" });

/** `GET .../system/tool-gaps` (Jini spec) over the tool audit store; the route's own 500 copy.
 * @complexity O(1) setup.
 */
export function registerAdminToolGapsRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: ToolGapsToolDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ errors, app, spec: toolGapsRoute, deps: { workspaceId: deps.workspaceId, ownerPrincipalId: deps.ownerPrincipalId, toolGaps: deps.toolGaps, authorize: toolGapsNeverAuthorizes } },
    { authorization: "direct", failure: { operation: "routes/system/tool-gaps", code: "INTERNAL_ERROR", message: "Could not read tool gaps." } });
}

/** `GET .../system/server-logs` (Jini spec) over this process's captured log buffer; a test injects
 * its own `logs` source. The filter parser and reader are the server-logs feature's.
 * @complexity O(1) setup.
 */
export function registerAdminServerLogsRoute(
  { errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize"> },
  optional: { logs?: ServerLogSourcePort } = {},
): void {
  const logs = optional.logs ?? processServerLogSource;
  mountAdminJsonRoute({ errors, app, spec: serverLogsRoute, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize,
    parseServerLogFilters, readServerLogs: (filters) => readServerLogs({ logs }, filters as ServerLogFilters),
    serverLogFilterReply: ({ error }) => (error instanceof ServerLogFilterError ? error.message : undefined) } },
  { authorization: "direct", failure: { operation: "routes/system/server-logs", code: "INTERNAL_ERROR" } });
}

/** `POST .../system/assistant-daemon/restart` (Jini spec). `restartAssistantDaemon` defaults to the
 * real `daemon-supervisor.ts` singleton; a route test injects it through the deps object.
 * @complexity O(1) setup.
 */
export function registerAdminAssistantDaemonRoutes(
  { errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize"> & Partial<AdminAssistantDaemonDeps> },
  _optional: Record<string, never> = {},
): void {
  const restartAssistantDaemon = deps.restartAssistantDaemon ?? restartAssistantDaemonReal;
  mountAdminJsonRoute({ errors, app, spec: assistantDaemonRestartRoute, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, restartAssistantDaemon } },
    { authorization: "direct", failure: { operation: "routes/system/assistant-daemon", code: "INTERNAL_ERROR" } });
}

/** The system-admin registrations of `createApp`, as five sub-mounts called in the original statement order. `reporter` is the site's one reporter (the visitor assistant's routes record through it). */
export function mountAdminSystem({ app, routeDeps, errors, reporter }: ErrorBoundMountInput & { reporter: ErrorReporter }, options: Pick<CreateAppOptions, "onShutdown" | "siteStorage"> = {}): void {
  mountAnalyticsAndSiteAssistant({ app, routeDeps, errors, reporter }, options);
  mountStorageRoutes({ app, storage: options.siteStorage, authorizeOwner: storageOwnerFrom({ ownerPrincipalId: async () => routeDeps.ownerPrincipalId }),
    adminPorts: { errors, mount: mountAdminJsonRoute, deps: { workspaceId: routeDeps.workspaceId, authorize: routeDeps.authorize }, origin: adminSameOriginWrites } }, {});
  mountObservability({ app, routeDeps, errors });
  mountMail({ app, routeDeps, errors });
  mountSiteAdmin({ app, routeDeps, errors, reporter });
  mountCredentialsAndFiles({ app, routeDeps, errors });
}

/** The analytics admin module, then the public site-assistant module (started BEFORE it is mounted). */
function mountAnalyticsAndSiteAssistant({ app, routeDeps, errors, reporter }: ErrorBoundMountInput & { reporter: ErrorReporter }, options: Pick<CreateAppOptions, "onShutdown"> = {}): void {
  // ADR-046 Phase 3 (SPEC-041): the `analytics` server module — the single admin "recent hits"
  // read route (ADR-035/ADR-PIPE-014).
  mountRoutes({ app, errors, mod: createAnalyticsModule(routeDeps) });
  // ADR-054: the PUBLIC visitor assistant. Deliberately NOT behind `requireAdminSession` — it is
  // the one assistant surface anonymous traffic may reach, which is why it runs on its own
  // in-process provider relay with a read-only published-content tool surface rather than the
  // admin's process-spawning agent daemon. `start()` logs the demo-gate state at boot.
  const siteAssistantModule = createSiteAssistantModule({ deps: routeDeps, reporter });
  startModule(siteAssistantModule);
  // Parked visitor approvals hold a running provider call; shutdown denies and ends each one.
  options.onShutdown?.({ shutdown: siteAssistantModule.shutdown });
  mountRoutes({ app, errors, mod: siteAssistantModule });
}

/** Module status, observability, browser telemetry, tool gaps and server logs routes. */
function mountObservability({ app, routeDeps, errors }: ErrorBoundMountInput, _optional = {}): void {
  registerAdminModuleStatusRoute({ errors, app, deps: routeDeps });
  // Observability admin page, Overview tab (`development/todos.md` 2026-09-09 owner ask) — same
  // `system.read`-gated shape as the module-status route just above.
  registerAdminObservabilityStatusRoute({ errors, app, deps: routeDeps });
  // The admin browser's own errors and page views, relayed to the same provider-plugin ports.
  registerAdminBrowserTelemetryRoute({ errors, app, deps: routeDeps });
  registerAdminToolGapsRoute({ errors, app, deps: routeDeps });
  registerAdminServerLogsRoute({ errors, app, deps: routeDeps });
}

/** Mail status, provider, DNS, test-send and activity routes. */
function mountMail({ app, routeDeps, errors }: ErrorBoundMountInput, _optional = {}): void {
  // Whether outbound mail really sends (not the console fallback) — the form editor greys out its
  // notification settings when it does not.
  registerAdminMailStatusRoute({ errors, app, deps: routeDeps });
  registerAdminMailProviderRoutes({ errors, app, deps: routeDeps });
  // Email page: Sender and DNS (same operations as `mail_dns_status`/`mail_dns_verify`) and
  // Send test email (same operation as `mail_send_test`).
  registerAdminMailDnsRoutes({ errors, app, deps: { workspaceId: routeDeps.workspaceId, dns: createDnsChangeDepsFactory({ httpClient: createDefaultHttpClient({ policy: DOMAIN_DNS_EGRESS_POLICY }, { observability: routeDeps.observability }) })(routeDeps) } });
  registerAdminMailTestSendRoute({ errors, app, deps: routeDeps });
  // Email page: What uses email and Recent sends and failures (same operations as
  // `mail_get_readiness`, `mail_list_activity`, `mail_get_activity`).
  registerAdminMailActivityRoutes({ errors, app, deps: routeDeps });
}

/** Assistant daemon/subagents/permanent deletes, deployment, sites, profile, export, share, import and backup routes. */
function mountSiteAdmin({ app, routeDeps, errors, reporter }: ErrorBoundMountInput & { reporter: ErrorReporter }, _optional = {}): void {
  // Admin "Restart assistant" action (`system.write`-gated) — the manual recovery seam for the
  // locally-spawned agent daemon, sibling to the on-demand recovery `apps/website/src/server/runtime/composition/modules/assistant.ts`'s
  // daemon-proxy code now triggers automatically on a known-failed request. See that route file's
  // own header for why its response never claims the daemon is healthy again.
  registerAdminAssistantDaemonRoutes({ errors, app, deps: routeDeps });
  registerAdminAssistantSubagentsRoutes({ errors, app, deps: routeDeps });
  registerAdminAssistantPermanentDeletesRoutes({ errors, app, deps: routeDeps });
  // Admin Deployment panel (Overview + Dockerfile tabs) — same `system.read`-gated shape as the
  // module-status route just above; see each route file's own header for why they share it.
  registerAdminDeploymentOverviewRoute({ errors, app, deps: routeDeps });
  registerAdminDockerfileSourceRoute({ errors, app, deps: routeDeps });
  // Admin "Sites" screen (2026-09-04 sites-switcher decision) — list/create/activate the sites
  // under `sites/<name>/`. `system.read`/`system.write`-gated, same shape as the routes just
  // above; Create/Activate additionally refuse when `TOVU_ENABLE_SITE_SWITCHER` is off (default),
  // which List does not — see that route file's own header for the full split.
  registerAdminSitesRoutes({ errors, app, deps: routeDeps });
  // The admin frontend's door to `buildSiteProfile()` — the SAME function the `site_get_profile`
  // agent tool calls, because `apps/admin` is a browser bundle and cannot invoke an agent tool.
  // Deliberately NOT gated by one `authorize()` call here: it authorizes each section against that
  // section's own domain permission. See that route file's header for why that difference matters.
  registerAdminSiteProfileRoute({ errors, app, deps: routeDeps });
  // Deployment panel → Static Site tab: trigger + poll the static exporter (`src/features/site-export/`).
  // `system.export`-gated for the trigger (a disk write), `system.read` for the status poll — see
  // that file's own header for the split.
  registerAdminExportSiteRoutes({ errors, app, deps: routeDeps });
  registerAdminSiteShareRoutes({ errors, app, deps: routeDeps });
  registerAdminSiteImportRoutes({ errors, app, deps: routeDeps });
  registerAdminSiteBackupRoutes({ errors, app, deps: routeDeps });
  // Admin site-update notice: the same read as `site_update_check`, below the authenticated shell.
  registerAdminSiteUpdateStatusRoute({ errors, app, deps: routeDeps, reporter });
}

/** The read half of the platform runtime, copied port by port so the write ports never travel with it. */
function siteUpdateReadPorts(runtime: SiteUpdateCheckRuntime | null | undefined, _optional = {}): SiteUpdateStatusPorts | null {
  if (!runtime) return null;
  return { runningVersion: () => runtime.runningVersion(), feed: runtime.feed, ids: runtime.ids };
}

/** The runtime's read-only journal read alone, so no other supervisor port travels with it. */
function lastAttemptReader(runtime: SiteUpdateCheckRuntime | null | undefined, _optional = {}): ReadSiteUpdateStatusRequired["readLastAttempt"] {
  const read = runtime?.readLastAttempt;
  return read && ((required, optional) => read(required, optional));
}

/** Admin site-update status: a `system.read` GET, session credentials only, never cached.
 * `siteUpdateRuntime` is read per request because the composition binds it after the routes mount.
 * A failed check is reported here under a fixed label; the reply carries only `check-failed`.
 * @complexity O(1) setup; per request one version read plus one feed request.
 */
export function registerAdminSiteUpdateStatusRoute(
  required: { errors: RouteErrorPorts; app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize" | "siteUpdateRuntime">; reporter: Pick<ErrorReporter, "record"> },
  _optional = {},
): void {
  const { app, deps, reporter } = required;
  const reportFailure = ({ error }: { error: unknown }) => void reportServerFailure({ error, operation: "site-update:status" }, { reporter });
  mountAdminJsonRoute<Record<string, never>, SiteUpdateStatusReply, SiteUpdateStatusRouteDeps>({ errors: required.errors,
    app,
    spec: {
      ...siteUpdateStatusRoute,
      // The Jini spec takes no principal context: the operator record stays with the admin ports.
      handle: (args, options) => siteUpdateStatusRoute.handle({ input: args.input, deps: args.deps, authorize: args.authorize }, options),
      responseHeaders: { "Cache-Control": "no-store" },
    },
    deps: {
      workspaceId: deps.workspaceId,
      authorize: deps.authorize,
      getStatus: (_input, options) => readSiteUpdateStatus({ runtime: siteUpdateReadPorts(deps.siteUpdateRuntime), reportFailure, readLastAttempt: lastAttemptReader(deps.siteUpdateRuntime) }, { signal: options?.signal }),
    },
  }, { authorization: "direct", sessionCredentialOnly: { permission: "system.read", message: "Sign in to check for site updates." } });
}

/** Consent, publish, credential-set, site-key and fs-files routes. */
function mountCredentialsAndFiles({ app, routeDeps, errors }: ErrorBoundMountInput, _optional = {}): void {
  // Deployment panel → publish to a static host: trigger + poll a one-shot static publish
  // (`features/deployments/static-publish/`, wrapping `@jini-ai/devops/deploy`). `system.publish`-
  // gated for BOTH the trigger and the status poll — see that route file's own header for why.
  registerAdminConsentRoutes({ errors, app, deps: routeDeps, service: routeDeps.siteConsent ?? bindSiteConsentService({ deps: routeDeps }) });
  registerAdminPublishSiteRoutes({ errors, app, deps: routeDeps });
  // Deployment panel → Static Site tab's credential form: CRUD over saved provider connections
  // (`publish_credential_sets`). `system.publish`-gated on every verb — see that route file's own
  // header for why this doesn't split trigger/read the way `publish-site.ts` does.
  registerAdminPublishCredentialsRoutes({ errors, app, deps: routeDeps });
  // Admin Source Control page: CRUD over saved plugin-provided source-control identities
  // (`source_control_credential_sets`). `source-control.credentials.write`-gated on every verb —
  // see that route file's own header for why this is NOT `system.publish`.
  registerAdminSourceControlCredentialsRoutes({ errors, app, deps: routeDeps });
  // Access Tokens page's "Add custom provider" form: CRUD over saved user-defined provider
  // connections (`custom_credential_sets`). `custom-credentials.write`-gated on every verb.
  registerAdminCustomCredentialsRoutes({ errors, app, deps: routeDeps });
  registerAdminCredentialCopyRoutes({ errors, app, deps: routeDeps });
  // Security panel → site key tab: view/generate the TOVU_SITE_KEY site key's
  // generated-file fallback. `admin.security.site-key.manage`-gated on both verbs — see that route
  // file's own header for exactly what this does and does not cover (since 2026-09-09 it seals
  // every stored credential and can satisfy a production boot, but webhook signing / newsletter
  // tokens still need the env var). Generate runs the one site-key writer boot runs
  // (`ensureSiteKeyForSite`), handed in here because the route itself may not import it; the
  // recovery verbs (import, start fresh) get `siteKeyRecovery` the same way.
  registerAdminSiteKeyRoutes({ app, deps: routeDeps, siteKey: { ensureSiteKeyForSite, ...siteKeyRecovery } });
  // Chat composer's folder control: GET/PUT/DELETE the fs-files `custom` root — the operator-set
  // folder `fs_list_files`/`fs_read_file` may reach outside `repo`/`site`. `content.read`-gated, the
  // same permission that gates those two tools themselves — see that route file's own header.
  registerAdminFsFilesCustomRootRoutes({ errors, app, deps: routeDeps });
  // Chat composer's folder button: opens the OS folder dialog on this machine and returns the path.
  // Exists only on a local Tovu (`isLocalTovuHost`, the same decision credential copy uses) and only
  // for a request from this machine — see that route file's own header.
  registerAdminFsFilesFolderPickerRoutes({ errors, app, deps: { workspaceId: routeDeps.workspaceId, authorize: routeDeps.authorize,
    localHost: isLocalTovuHost({}, {}), folderPicker: createNativeFolderPicker({ platform: process.platform, env: process.env }) } });
}

/** Upload stall limits: a whole-upload deadline and a per-socket idle timeout, either of which
 * destroys the request so a stalled client cannot hold the single upload lane. */
const UPLOAD_DEADLINE_MS = 120_000;
const UPLOAD_IDLE_MS = 30_000;


/** Authenticated uploads/history and principal-bound password setup, shared with tools.
 * GET returns the setup contract for the separately-owned UI; no source markup enters admin.
 * `uploadDeadlineMs`/`uploadIdleMs` default to the production stall limits; tests shorten them.
 * @complexity O(body bytes), bounded raw parsing AFTER authorization and concurrency admission.
 */
export function registerAdminSiteImportRoutes(
  { app, deps, errors }: { app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize" | "siteImportBackend" | "tracker">; errors: RouteErrorPorts },
  { uploadDeadlineMs = UPLOAD_DEADLINE_MS, uploadIdleMs = UPLOAD_IDLE_MS }: { uploadDeadlineMs?: number; uploadIdleMs?: number } = {},
): void {
  registerSiteImportRoutes({
    workspaceId: deps.workspaceId, backend: () => deps.siteImportBackend, parseInput: parseSiteImportInput,
    refusal: required => new SiteShareRefusal(required), historyUnavailable: ImportHistoryUnavailable,
    mapHistoryError: error => mapSqliteError({ error, messages: {
      busy: "Import history is busy. Try again in a moment.",
      storage: "There is not enough free disk space to record the import. Free up space and try again.",
      damaged: "Import history could not be read. Imports are paused and nothing was changed. Contact support with this error ID.",
    } }),
    failureCollaborators: { asRefusal: ({ error }) => (error instanceof SiteShareRefusal ? error : undefined), formatByteSize },
    steps: { list: "Import history", import: "Archive verification", upload: "ZIP upload", ownerGet: "Import owner setup", ownerPost: "Imported site creation" },
    ownerSessionMessage: "Open owner setup in your signed-in browser; passwords are never submitted through an agent tool.",
    originRefusalMessage: "Import owner setup failed: submit this form from the same signed-in Tovu site.",
    maxArchiveBytes: SHARE_LIMITS.maxArchiveBytes, uploadDeadlineMs, uploadIdleMs, setTimeout, clearTimeout,
    mount: ({ method, path, handle }) => { app[method](path, (req, res) => handle({
      workspaceId: () => String(req.params.workspaceId), principalId: () => getAuthedPrincipal(res).id,
      authorize: params => authorizeOrRespond({ res, authorize: deps.authorize, params }),
      requireSession: options => rejectUnlessSessionCredential({ res, ...options }),
      noStore: headers => { res.set(headers); }, json: (body, status) => res.status(status).json(body),
      failure: (error, options) => sendAdminFailure({ res, error, tracker: deps.tracker, reporter: errors.reporter }, options),
      body: () => req.body, query: () => req.query, importId: () => String(req.params.importId),
      origin: () => req.get("origin"), protocol: () => req.protocol, host: () => req.get("host"),
      parseZip: options => new Promise<void>((resolve, reject) => express.raw(options)(req, res, error => error ? reject(error) : resolve())),
      parseForm: options => new Promise<void>((resolve, reject) => express.urlencoded(options)(req, res, error => error ? reject(error) : resolve())),
      isBuffer: Buffer.isBuffer, onClose: callback => { res.once("close", callback); }, onAborted: callback => { req.once("aborted", callback); },
      writableEnded: () => res.writableEnded, destroy: () => { req.destroy(); }, setIdleTimeout: (milliseconds, callback) => { req.setTimeout(milliseconds, callback); },
    })); },
  });
}
