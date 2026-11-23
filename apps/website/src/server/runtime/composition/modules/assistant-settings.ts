import { deleteExecutionCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/delete-execution-credential";
import { deleteSiteCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/delete-site-credential";
import { getExecutionCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/get-execution-credential";
import { getAssistantSettingsRoute } from "@jini-ai/cms/admin-http/routes/assistant/get-settings";
import { getSiteCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/get-site-credential";
import { putExecutionCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/put-execution-credential";
import { putAssistantSettingsRoute } from "@jini-ai/cms/admin-http/routes/assistant/put-settings";
import { putSiteCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/put-site-credential";
import type { AssistantCredentialErrorKind } from "@jini-ai/cms/admin-http/routes/assistant/shared";
import {
  ADMIN_ASSISTANT_PERMISSION, ExecutionCredentialSecretStoreUnconfiguredError, ExecutionCredentialValidationError,
  PublicAssistantSettingsValidationError, SiteAssistantCredentialValidationError, SiteAssistantSecretStoreUnconfiguredError,
  deleteExecutionCredential, deleteSiteAssistantCredential, getExecutionCredential, getPublicAssistantSettings,
  getSiteAssistantCredential, setExecutionCredential, setPublicAssistantSettings, setSiteAssistantCredential,
} from "#src/assistant/index";
import { ValueValidationFailedError } from "#src/features/settings/index";
import { configureVisitorToolsRoute, listVisitorToolsRoute, type VisitorToolsErrorKind } from "@jini-ai/cms/admin-http/routes/assistant/visitor-tools";
import type { Express } from "express";
import { VisitorToolPolicyValidationError } from "#src/contracts/site-assistant/visitor-tools";
import type { VisitorToolsManagementPort } from "#src/contracts/site-assistant/visitor-tools-management";
import { VisitorToolsRevisionConflictError } from "#src/features/settings/index";
import type { RouteDeps } from "#src/server/routes/types";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 / ADR-058 / admin-BYOK-keystore design — the `assistant-settings` server
 * module: the admin routes backing the AI Assistant section — the public on/off switch (2 routes),
 * the SITE's encrypted provider credential since ADR-058 (3 more: GET/PUT/DELETE
 * `.../assistant/site-credential`), and now the ADMIN's OWN encrypted BYOK credential (3 more:
 * GET/PUT/DELETE `.../assistant/execution-credential`, design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved). Folded
 * into this same module rather than a new one — see `AssistantSettingsRouteDeps`'s doc below for
 * why (same "AI Assistant admin section" concern; the execution-credential trio's auth gate is
 * narrower — self-scoped by session identity rather than `ADMIN_ASSISTANT_PERMISSION` — but that is
 * a per-route difference, not a reason for a separate module).
 *
 * The 8 settings/credential routes are Jini route specs (`@jini-ai/cms/admin-http/routes/assistant/*`)
 * mounted behind the admin ports; the registrars below bind Tovu's services, permission name and
 * `TOVU_SITE_KEY` copy into each spec's small deps. Visitor tools (GET/PUT) is a pair of Jini specs too;
 * its registrar binds the service and classifies Tovu's typed visitor-tools errors.
 *
 * Distinct from `modules/assistant.ts`, which is the session-gated reverse proxy in front of the
 * agent-daemon process. The two share a word and nothing else: this one holds repos and serves
 * ordinary JSON CRUD, that one holds no repo and streams SSE from another process. See
 * `AssistantSettingsRouteDeps` below for the same note next to the dependency slice.
 *
 * All 9 registrations live under `/api/admin/v1/...`, inside the `/api/admin` session gate
 * `createCoreModule` mounts, so registration order relative to the site's `GET /:slug` catch-all is
 * not load-bearing the way `modules/seo.ts`'s public sitemap/robots routes are.
 */

/**
 * ADR-046 Phase 3 — narrow `RouteDeps` slice for the `assistant-settings` server module.
 *
 * Covers the 2 public-switch registrars in this directory (`get-settings.ts`, `put-settings.ts`),
 * which await `deps.assistantSettingsReady`, read `deps.workspaceId`/`deps.settingsRepo`, call
 * `deps.getEffective` (GET), and call `deps.authorize`; the PUT additionally needs
 * `deps.clock`/`deps.idGen`/`deps.principalRepo`/`deps.set` to drive the settings write chokepoint.
 * `deps.adminAssistantEnabled` (`routes/types.ts`'s field doc) is read only by `get-settings.ts`,
 * folded into its response alongside the (unrelated) public-assistant switch — this module is one of
 * exactly two admin-assistant modules mounted unconditionally, so its response is the one place the
 * admin SPA can learn `TOVU_ADMIN_ASSISTANT=off` without the request itself 404ing.
 * `getEffective`/`set` are here because `assistant/public-assistant-settings.ts`'s deps bags now take
 * them by injection rather than static import (module-cycle avoidance, see that file's header) — this
 * Pick is how the real functions reach these 2 routes without either route importing
 * `features/settings` itself. A genuine narrowing (mirrors `apps/website/src/server/inbound/admin-http/routes/seo/deps.ts`'s identical
 * rationale for the same settings shape), not a `RouteDeps` widening.
 *
 * ADR-058 folded the 3 site-credential registrars (`get-site-credential.ts`,
 * `put-site-credential.ts`, `delete-site-credential.ts`) into this SAME deps slice and module rather
 * than a new one: they share the identical auth gate (`ADMIN_ASSISTANT_PERMISSION`) and workspace
 * scoping, and both concerns are "the AI Assistant admin section's server surface" — the same reason
 * this file gives, one paragraph up, for not sharing with `modules/assistant.ts`'s proxy instead.
 * The 3 new fields (`siteAssistantCredentialRepo`/`siteAssistantSecretSealer`/
 * `siteAssistantSecretKeyring`) need no matching `*Ready` promise — see their own doc comments on
 * `RouteDeps` for why.
 *
 * The admin-BYOK-keystore design (`ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-
 * design.md`, owner-approved) folds its own 3 registrars (`get-execution-credential.ts`,
 * `put-execution-credential.ts`, `delete-execution-credential.ts`) in here too, for the identical
 * reason. Those 3 routes need no `authorize()`/`ADMIN_ASSISTANT_PERMISSION` check — the row is
 * scoped to `(workspaceId, getAuthedPrincipal(res).id)`, so there is no OTHER admin's data a session
 * could reach even without an extra permission gate — but they still need `adminExecutionCredentialRepo`
 * for the same reason the site-credential trio needs `siteAssistantCredentialRepo`.
 *
 * Deliberately NOT folded into `apps/website/src/server/runtime/composition/modules/assistant.ts`. That module is the session-gated
 * reverse proxy in front of the agent-daemon process and shares none of these dependencies — it
 * holds no repo at all. Sharing a module would couple a settings CRUD pair to a streaming proxy's
 * lifetime for no reason beyond both having "assistant" in the name.
 */
export type AssistantSettingsRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "settingsRepo"
  | "getEffective"
  | "set"
  | "principalRepo"
  | "assistantSettingsReady"
  | "visitorToolsManagement"
  | "siteAssistantCredentialRepo"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
  | "adminExecutionCredentialRepo"
  | "adminAssistantEnabled"
>;

export type AssistantSettingsRouteRegistrar = (required: { app: Express; deps: AssistantSettingsRouteDeps }, optional?: Record<string, never>) => void;

/** The visitor-tools routes' host bag: the workspace and the management service (absent ⇒ 500). */
export interface VisitorToolsRouteDeps { workspaceId: string; visitorToolsManagement?: VisitorToolsManagementPort }

/** Tovu's typed visitor-tools errors, as the spec's error kinds. @complexity O(1). */
function visitorToolsErrorKind(error: unknown): VisitorToolsErrorKind | undefined {
  if (error instanceof VisitorToolsRevisionConflictError) return "revision-conflict";
  return error instanceof VisitorToolPolicyValidationError ? "policy-validation" : undefined;
}

/** GET/PUT require visitor-tools.manage through the service; the enclosing admin module requires a session.
 * Neither spec calls `authorize`, so the port's authorizer fails closed if one ever does.
 * @complexity O(1) setup.
 * @example registerAdminVisitorToolsRoutes({app, deps});
 */
export function registerAdminVisitorToolsRoutes({ app, deps }: { app: Express; deps: VisitorToolsRouteDeps }, _options = {}): void {
  const routeDeps = {
    workspaceId: deps.workspaceId,
    authorize: () => Promise.reject(new Error("visitor-tools routes authorize inside the service")),
    visitorToolsManagement: deps.visitorToolsManagement,
    visitorToolsErrorKind,
  };
  const options = { authorization: "direct" as const, failure: { operation: "routes/assistant/visitor-tools", code: "INTERNAL_ERROR" } };
  mountAdminJsonRoute({ app, spec: listVisitorToolsRoute, deps: routeDeps }, options);
  mountAdminJsonRoute({ app, spec: configureVisitorToolsRoute, deps: routeDeps }, options);
}

/** The two port fields every mount passes; `authorize` is read per request, as the hand-written routes did. */
function portDeps({ deps }: { deps: AssistantSettingsRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** None of these routes consulted the publishing-credential override (`authorizeDirectOrRespond` or none). */
const mountOptions = (operation: string, message?: string) =>
  ({ authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR", ...(message === undefined ? {} : { message }) } });

const secretStoreUnconfigured = (subject: string) =>
  `${subject} is not configured — set TOVU_SITE_KEY (a hex-encoded site key) in the server environment`;

/** Tovu's typed execution-credential errors, as the spec's error kinds. */
function executionCredentialErrorKind(error: unknown): AssistantCredentialErrorKind | undefined {
  if (error instanceof ExecutionCredentialValidationError) return "validation";
  return error instanceof ExecutionCredentialSecretStoreUnconfiguredError ? "secret-store-unconfigured" : undefined;
}

/** Tovu's typed site-credential errors, as the spec's error kinds. */
function siteCredentialErrorKind(error: unknown): AssistantCredentialErrorKind | undefined {
  if (error instanceof SiteAssistantCredentialValidationError) return "validation";
  return error instanceof SiteAssistantSecretStoreUnconfiguredError ? "secret-store-unconfigured" : undefined;
}

export const registerAdminAssistantGetSettingsRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: getAssistantSettingsRoute, deps: {
    ...portDeps({ deps }), adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    assistantSettingsReady: deps.assistantSettingsReady, adminAssistantEnabled: deps.adminAssistantEnabled,
    getPublicAssistantSettings: () => getPublicAssistantSettings({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
  } }, mountOptions("routes/assistant/get-settings", "Assistant settings could not be loaded."));
};

export const registerAdminAssistantPutSettingsRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: putAssistantSettingsRoute, deps: {
    ...portDeps({ deps }), adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION, assistantSettingsReady: deps.assistantSettingsReady,
    setPublicAssistantSettings: ({ patch, callerPrincipalId }) => setPublicAssistantSettings({
      settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: deps.set, clock: deps.clock,
      ids: deps.idGen, authorize: deps.authorize, principals: deps.principalRepo,
    }, { workspaceId: deps.workspaceId, patch: patch as Parameters<typeof setPublicAssistantSettings>[1]["patch"], callerPrincipalId }),
    isSettingsValidationError: (error) => error instanceof PublicAssistantSettingsValidationError || error instanceof ValueValidationFailedError,
  } }, mountOptions("routes/assistant/put-settings"));
};

export const registerAdminAssistantGetSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: getSiteCredentialRoute, deps: {
    ...portDeps({ deps }), adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    getSiteCredential: () => getSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId }),
  } }, mountOptions("routes/assistant/get-site-credential"));
};

export const registerAdminAssistantPutSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: putSiteCredentialRoute, deps: {
    ...portDeps({ deps }), adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    setSiteCredential: ({ patch }) => setSiteAssistantCredential({
      repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock,
    }, { workspaceId: deps.workspaceId, ...patch }),
    siteCredentialErrorKind, secretStoreUnconfiguredError: secretStoreUnconfigured("site assistant secret store"),
  } }, mountOptions("routes/assistant/put-site-credential"));
};

export const registerAdminAssistantDeleteSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: deleteSiteCredentialRoute, deps: {
    ...portDeps({ deps }), adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    deleteSiteCredential: () => deleteSiteAssistantCredential({ deps: { repo: deps.siteAssistantCredentialRepo, clock: deps.clock }, workspaceId: deps.workspaceId }),
  } }, mountOptions("routes/assistant/delete-site-credential"));
};

export const registerAdminAssistantGetExecutionCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: getExecutionCredentialRoute, deps: {
    ...portDeps({ deps }),
    getExecutionCredential: ({ principalId }) => getExecutionCredential({ repo: deps.adminExecutionCredentialRepo, sealer: deps.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId, principalId }),
  } }, mountOptions("routes/assistant/get-execution-credential"));
};

export const registerAdminAssistantPutExecutionCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: putExecutionCredentialRoute, deps: {
    ...portDeps({ deps }),
    setExecutionCredential: ({ principalId, patch }) => setExecutionCredential({
      repo: deps.adminExecutionCredentialRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock,
    }, { workspaceId: deps.workspaceId, principalId, ...patch }),
    executionCredentialErrorKind, secretStoreUnconfiguredError: secretStoreUnconfigured("the execution credential secret store"),
  } }, mountOptions("routes/assistant/put-execution-credential"));
};

export const registerAdminAssistantDeleteExecutionCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: deleteExecutionCredentialRoute, deps: {
    ...portDeps({ deps }),
    deleteExecutionCredential: ({ principalId }) => deleteExecutionCredential({ deps: { repo: deps.adminExecutionCredentialRepo, clock: deps.clock }, workspaceId: deps.workspaceId, principalId }),
  } }, mountOptions("routes/assistant/delete-execution-credential"));
};

export function createAssistantSettingsModule(deps: AssistantSettingsRouteDeps): ServerModuleHandle {
  return {
    name: "assistant-settings",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminAssistantGetSettingsRoute({ app, deps });
      registerAdminVisitorToolsRoutes({ app, deps });
      registerAdminAssistantPutSettingsRoute({ app, deps });
      registerAdminAssistantGetSiteCredentialRoute({ app, deps });
      registerAdminAssistantPutSiteCredentialRoute({ app, deps });
      registerAdminAssistantDeleteSiteCredentialRoute({ app, deps });
      registerAdminAssistantGetExecutionCredentialRoute({ app, deps });
      registerAdminAssistantPutExecutionCredentialRoute({ app, deps });
      registerAdminAssistantDeleteExecutionCredentialRoute({ app, deps });
    },
  };
}
