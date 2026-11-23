/**
 * @file The system-admin registrations of `createApp`: analytics + the public site assistant, observability, mail, site administration,
 * and credentials/files. Registration order is behaviour, so `mountAdminSystem` calls the five sub-mounts in the original statement
 * order. Statements moved verbatim out of `app.ts`.
 */

import { bindSiteConsentService } from '../site-consent.js';
import { registerAdminConsentRoutes } from '../../../inbound/admin-http/routes/consent/routes.js';
import { registerAdminSiteShareRoutes } from "#src/server/inbound/admin-http/routes/system/site-shares";
import { registerAdminSiteImportRoutes } from "#src/server/inbound/admin-http/routes/system/site-imports";
import { registerAdminSiteBackupRoutes } from "#src/server/inbound/admin-http/routes/system/site-backups";
import { registerAdminToolGapsRoute } from "../../../inbound/admin-http/routes/system/tool-gaps.js";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { ensureSiteKeyForSite } from "#src/features/webhooks/site-key-ensure";
import { createAnalyticsModule } from "../modules/analytics.js";
import type { Express } from "express";
import { moduleStatusRoute } from "@jini-ai/cms/admin-http/routes/system/module-status";
import { getReadinessSnapshot } from "#src/server/runtime/lifecycle/readiness-state";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import { registerAdminObservabilityStatusRoute } from "../../../inbound/admin-http/routes/system/observability-status.js";
import { registerAdminBrowserTelemetryRoute } from "../../../inbound/admin-http/routes/system/browser-telemetry.js";
import { registerAdminServerLogsRoute } from "../../../inbound/admin-http/routes/system/server-logs.js";
import { registerAdminMailStatusRoute, registerAdminMailProviderRoutes, registerAdminMailDnsRoutes, registerAdminMailTestSendRoute, registerAdminMailActivityRoutes } from "../modules/system-mail.js";
import { createDnsChangeDepsFactory } from "../dns-change-deps.js";
import { DOMAIN_DNS_EGRESS_POLICY } from "../domain-dns-adapters.js";
import { assistantDaemonRestartRoute, type AdminAssistantDaemonDeps } from "@jini-ai/cms/admin-http/routes/system/assistant-daemon";
import { restartAssistantDaemon as restartAssistantDaemonReal } from "#src/server/runtime/lifecycle/daemon-supervisor";
import { registerAdminAssistantPermanentDeletesRoutes, registerAdminAssistantSubagentsRoutes } from "../modules/system-assistant.js";
import { registerAdminDeploymentOverviewRoute, registerAdminExportSiteRoutes, registerAdminPublishSiteRoutes } from "../modules/system-deploy.js";
import { registerAdminSitesRoutes } from "../modules/sites.js";
import { registerAdminSiteProfileRoute } from "../../../inbound/admin-http/routes/site/profile.js";
import { registerAdminDockerfileSourceRoute } from "../../../inbound/admin-http/routes/system/dockerfile-source.js";
import { registerAdminCustomCredentialsRoutes, registerAdminPublishCredentialsRoutes, registerAdminSourceControlCredentialsRoutes } from "../modules/system-credentials.js";
import { registerAdminCredentialCopyRoutes } from "../../../inbound/admin-http/routes/system/credential-copy.js";
import { registerAdminSiteKeyRoutes } from "../../../inbound/admin-http/routes/system/site-key.js";
import { siteKeyRecovery } from "../site-key-recovery.js";
import { registerAdminFsFilesCustomRootRoutes } from "../../../inbound/admin-http/routes/fs-files/custom-root.js";
import { registerAdminFsFilesFolderPickerRoutes } from "../../../inbound/admin-http/routes/fs-files/folder-picker.js";
import { createNativeFolderPicker } from "#src/features/fs-files/native-folder-picker";
import { isLocalTovuHost } from "../registered-sites.js";
import { createSiteAssistantModule } from "../modules/site-assistant.js";
import { mountRoutes, startModule } from "./module-handles.js";
import type { MountInput } from "./module-handles.js";

/** `GET .../system/module-status` (Jini spec) over this process's boot readiness snapshot; direct
 * authorization and the route's own failure copy, as the hand-written route answered.
 * @complexity O(1) setup.
 */
export function registerAdminModuleStatusRoute({ app, deps }: { app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ app, spec: moduleStatusRoute, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, getReadinessSnapshot } },
    { authorization: "direct", failure: { operation: "routes/system/module-status", code: "INTERNAL_ERROR" } });
}

/** `POST .../system/assistant-daemon/restart` (Jini spec). `restartAssistantDaemon` defaults to the
 * real `daemon-supervisor.ts` singleton; a route test injects it through the deps object.
 * @complexity O(1) setup.
 */
export function registerAdminAssistantDaemonRoutes(
  { app, deps }: { app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize"> & Partial<AdminAssistantDaemonDeps> },
  _optional: Record<string, never> = {},
): void {
  const restartAssistantDaemon = deps.restartAssistantDaemon ?? restartAssistantDaemonReal;
  mountAdminJsonRoute({ app, spec: assistantDaemonRestartRoute, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, restartAssistantDaemon } },
    { authorization: "direct", failure: { operation: "routes/system/assistant-daemon", code: "INTERNAL_ERROR" } });
}

/** The system-admin registrations of `createApp`, as five sub-mounts called in the original statement order. */
export function mountAdminSystem({ app, routeDeps }: MountInput, _optional = {}): void {
  mountAnalyticsAndSiteAssistant({ app, routeDeps });
  mountObservability({ app, routeDeps });
  mountMail({ app, routeDeps });
  mountSiteAdmin({ app, routeDeps });
  mountCredentialsAndFiles({ app, routeDeps });
}

/** The analytics admin module, then the public site-assistant module (started BEFORE it is mounted). */
function mountAnalyticsAndSiteAssistant({ app, routeDeps }: MountInput, _optional = {}): void {
  // ADR-046 Phase 3 (SPEC-041): the `analytics` server module — the single admin "recent hits"
  // read route (ADR-035/ADR-PIPE-014).
  mountRoutes({ app, mod: createAnalyticsModule(routeDeps) });
  // ADR-054: the PUBLIC visitor assistant. Deliberately NOT behind `requireAdminSession` — it is
  // the one assistant surface anonymous traffic may reach, which is why it runs on its own
  // in-process provider relay with a read-only published-content tool surface rather than the
  // admin's process-spawning agent daemon. `start()` logs the demo-gate state at boot.
  const siteAssistantModule = createSiteAssistantModule(routeDeps);
  startModule(siteAssistantModule);
  mountRoutes({ app, mod: siteAssistantModule });
}

/** Module status, observability, browser telemetry, tool gaps and server logs routes. */
function mountObservability({ app, routeDeps }: MountInput, _optional = {}): void {
  registerAdminModuleStatusRoute({ app, deps: routeDeps });
  // Observability admin page, Overview tab (`development/todos.md` 2026-09-09 owner ask) — same
  // `system.read`-gated shape as the module-status route just above.
  registerAdminObservabilityStatusRoute({ app, deps: routeDeps });
  // The admin browser's own errors and page views, relayed to the same provider-plugin ports.
  registerAdminBrowserTelemetryRoute({ app, deps: routeDeps });
  registerAdminToolGapsRoute({ app, deps: routeDeps });
  registerAdminServerLogsRoute({ app, deps: routeDeps });
}

/** Mail status, provider, DNS, test-send and activity routes. */
function mountMail({ app, routeDeps }: MountInput, _optional = {}): void {
  // Whether outbound mail really sends (not the console fallback) — the form editor greys out its
  // notification settings when it does not.
  registerAdminMailStatusRoute({ app, deps: routeDeps });
  registerAdminMailProviderRoutes({ app, deps: routeDeps });
  // Email page: Sender and DNS (same operations as `mail_dns_status`/`mail_dns_verify`) and
  // Send test email (same operation as `mail_send_test`).
  registerAdminMailDnsRoutes({ app, deps: { workspaceId: routeDeps.workspaceId, dns: createDnsChangeDepsFactory({ httpClient: createDefaultHttpClient({ policy: DOMAIN_DNS_EGRESS_POLICY }, { observability: routeDeps.observability }) })(routeDeps) } });
  registerAdminMailTestSendRoute({ app, deps: routeDeps });
  // Email page: What uses email and Recent sends and failures (same operations as
  // `mail_get_readiness`, `mail_list_activity`, `mail_get_activity`).
  registerAdminMailActivityRoutes({ app, deps: routeDeps });
}

/** Assistant daemon/subagents/permanent deletes, deployment, sites, profile, export, share, import and backup routes. */
function mountSiteAdmin({ app, routeDeps }: MountInput, _optional = {}): void {
  // Admin "Restart assistant" action (`system.write`-gated) — the manual recovery seam for the
  // locally-spawned agent daemon, sibling to the on-demand recovery `apps/website/src/server/runtime/composition/modules/assistant.ts`'s
  // daemon-proxy code now triggers automatically on a known-failed request. See that route file's
  // own header for why its response never claims the daemon is healthy again.
  registerAdminAssistantDaemonRoutes({ app, deps: routeDeps });
  registerAdminAssistantSubagentsRoutes({ app, deps: routeDeps });
  registerAdminAssistantPermanentDeletesRoutes({ app, deps: routeDeps });
  // Admin Deployment panel (Overview + Dockerfile tabs) — same `system.read`-gated shape as the
  // module-status route just above; see each route file's own header for why they share it.
  registerAdminDeploymentOverviewRoute({ app, deps: routeDeps });
  registerAdminDockerfileSourceRoute({ app, deps: routeDeps });
  // Admin "Sites" screen (2026-09-04 sites-switcher decision) — list/create/activate the sites
  // under `sites/<name>/`. `system.read`/`system.write`-gated, same shape as the routes just
  // above; Create/Activate additionally refuse when `TOVU_ENABLE_SITE_SWITCHER` is off (default),
  // which List does not — see that route file's own header for the full split.
  registerAdminSitesRoutes({ app, deps: routeDeps });
  // The admin frontend's door to `buildSiteProfile()` — the SAME function the `site_get_profile`
  // agent tool calls, because `apps/admin` is a browser bundle and cannot invoke an agent tool.
  // Deliberately NOT gated by one `authorize()` call here: it authorizes each section against that
  // section's own domain permission. See that route file's header for why that difference matters.
  registerAdminSiteProfileRoute({ app, deps: routeDeps });
  // Deployment panel → Static Site tab: trigger + poll the static exporter (`src/features/site-export/`).
  // `system.export`-gated for the trigger (a disk write), `system.read` for the status poll — see
  // that file's own header for the split.
  registerAdminExportSiteRoutes({ app, deps: routeDeps });
  registerAdminSiteShareRoutes({ app, deps: routeDeps });
  registerAdminSiteImportRoutes({ app, deps: routeDeps });
  registerAdminSiteBackupRoutes({ app, deps: routeDeps });
}

/** Consent, publish, credential-set, site-key and fs-files routes. */
function mountCredentialsAndFiles({ app, routeDeps }: MountInput, _optional = {}): void {
  // Deployment panel → publish to a static host: trigger + poll a one-shot static publish
  // (`features/deployments/static-publish/`, wrapping `@jini-ai/devops/deploy`). `system.publish`-
  // gated for BOTH the trigger and the status poll — see that route file's own header for why.
  registerAdminConsentRoutes({ app, deps: routeDeps, service: routeDeps.siteConsent ?? bindSiteConsentService({ deps: routeDeps }) });
  registerAdminPublishSiteRoutes({ app, deps: routeDeps });
  // Deployment panel → Static Site tab's credential form: CRUD over saved provider connections
  // (`publish_credential_sets`). `system.publish`-gated on every verb — see that route file's own
  // header for why this doesn't split trigger/read the way `publish-site.ts` does.
  registerAdminPublishCredentialsRoutes({ app, deps: routeDeps });
  // Admin Source Control page: CRUD over saved plugin-provided source-control identities
  // (`source_control_credential_sets`). `source-control.credentials.write`-gated on every verb —
  // see that route file's own header for why this is NOT `system.publish`.
  registerAdminSourceControlCredentialsRoutes({ app, deps: routeDeps });
  // Access Tokens page's "Add custom provider" form: CRUD over saved user-defined provider
  // connections (`custom_credential_sets`). `custom-credentials.write`-gated on every verb.
  registerAdminCustomCredentialsRoutes({ app, deps: routeDeps });
  registerAdminCredentialCopyRoutes({ app, deps: routeDeps });
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
  registerAdminFsFilesCustomRootRoutes({ app, deps: routeDeps });
  // Chat composer's folder button: opens the OS folder dialog on this machine and returns the path.
  // Exists only on a local Tovu (`isLocalTovuHost`, the same decision credential copy uses) and only
  // for a request from this machine — see that route file's own header.
  registerAdminFsFilesFolderPickerRoutes({ app, deps: { workspaceId: routeDeps.workspaceId, authorize: routeDeps.authorize,
    localHost: isLocalTovuHost({}, {}), folderPicker: createNativeFolderPicker({}) } });
}
