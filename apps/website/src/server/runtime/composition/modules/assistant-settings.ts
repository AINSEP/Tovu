import type { Express } from "express";
import { ForbiddenError, ValueValidationFailedError as CoreValueValidationFailedError } from "@jini-ai/core/settings";

import { assistantDeleteExecutionCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/delete-execution-credential";
import { assistantDeleteSiteCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/delete-site-credential";
import { assistantGetExecutionCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/get-execution-credential";
import { assistantGetSettingsRoute } from "@jini-ai/cms/admin-http/routes/assistant/get-settings";
import { assistantGetSiteCredentialRoute } from "@jini-ai/cms/admin-http/routes/assistant/get-site-credential";
import { assistantPutExecutionCredentialRoute, EXECUTION_CREDENTIAL_VALIDATION_CODE } from "@jini-ai/cms/admin-http/routes/assistant/put-execution-credential";
import { assistantPutSettingsRoute } from "@jini-ai/cms/admin-http/routes/assistant/put-settings";
import { assistantPutSiteCredentialRoute, SITE_CREDENTIAL_VALIDATION_CODE } from "@jini-ai/cms/admin-http/routes/assistant/put-site-credential";
import type { AssistantErrorMapping } from "@jini-ai/cms/admin-http/routes/assistant/shared";
import {
  assistantVisitorToolsConfigureRoute, assistantVisitorToolsListRoute,
} from "@jini-ai/cms/admin-http/routes/assistant/visitor-tools";
import {
  ADMIN_ASSISTANT_PERMISSION, ExecutionCredentialSecretStoreUnconfiguredError, ExecutionCredentialValidationError,
  PublicAssistantSettingsValidationError, SiteAssistantCredentialValidationError, SiteAssistantSecretStoreUnconfiguredError,
  deleteExecutionCredential, deleteSiteAssistantCredential, getExecutionCredential, getPublicAssistantSettings, getSiteAssistantCredential,
  setExecutionCredential, setPublicAssistantSettings, setSiteAssistantCredential,
} from "#src/assistant/index";
import { VisitorToolPolicyValidationError } from "#src/contracts/site-assistant/visitor-tools";
import type { VisitorToolsManagementPort } from "#src/contracts/site-assistant/visitor-tools-management";
import { ValueValidationFailedError, VisitorToolsRevisionConflictError } from "#src/features/settings/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { FailureOptions } from "#src/server/inbound/shared/admin-failure";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 / ADR-058 / admin-BYOK-keystore design — the `assistant-settings` server
 * module: the admin routes backing the AI Assistant section — the public on/off switch (2 routes),
 * the visitor-tools pair, the SITE's encrypted provider credential since ADR-058 (3 more: GET/PUT/DELETE
 * `.../assistant/site-credential`), and the ADMIN's OWN encrypted BYOK credential (3 more:
 * GET/PUT/DELETE `.../assistant/execution-credential`, design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved). Folded
 * into this same module rather than a new one — see `AssistantSettingsRouteDeps` below for why (same
 * "AI Assistant admin section" concern; the execution-credential trio's auth gate is narrower —
 * self-scoped by session identity rather than `ADMIN_ASSISTANT_PERMISSION` — but that is a per-route
 * difference, not a reason for a separate module).
 *
 * K1 (RT-K1-adm-assistant): every route here is a Jini route spec
 * (`@jini-ai/cms/admin-http/routes/assistant/*`) mounted behind the admin ports; each mount builds that
 * route's own small deps from the slice below. The Tovu-owned pieces are injected here: the settings
 * ledger read/write, the sealed credential stores, `ADMIN_ASSISTANT_PERMISSION`, the visitor-tools
 * service, and every error class with its refusal copy (the `TOVU_SITE_KEY` operator hints).
 *
 * Distinct from `modules/assistant.ts`, which is the session-gated reverse proxy in front of the
 * agent-daemon process. The two share a word and nothing else: this one holds repos and serves
 * ordinary JSON CRUD, that one holds no repo and streams SSE from another process.
 *
 * All routes live under `/api/admin/v1/...`, inside the `/api/admin` session gate
 * `createCoreModule` mounts, so registration order relative to the site's `GET /:slug` catch-all is
 * not load-bearing the way `modules/seo.ts`'s public sitemap/robots routes are.
 */

/**
 * ADR-046 Phase 3 — narrow `RouteDeps` slice for this module (moved here from the deleted
 * `admin-http/routes/assistant/deps.ts`; it describes the host's bag, so it stays host-side).
 *
 * The 2 public-switch routes await `assistantSettingsReady`, read `workspaceId`/`settingsRepo`, call
 * `getEffective` (GET) and `authorize`; the PUT additionally needs `clock`/`idGen`/`principalRepo`/`set`
 * to drive the settings write chokepoint. `adminAssistantEnabled` (`routes/types.ts`'s field doc) is read
 * only by the GET, folded into its response alongside the (unrelated) public-assistant switch — this
 * module is one of exactly two admin-assistant modules mounted unconditionally, so its response is the
 * one place the admin SPA can learn `TOVU_ADMIN_ASSISTANT=off` without the request itself 404ing.
 * `getEffective`/`set` are here because `assistant/public-assistant-settings.ts`'s deps bags take them by
 * injection rather than static import (module-cycle avoidance, see that file's header). A genuine
 * narrowing (mirrors `modules/seo.ts`'s identical rationale for the same settings shape), not a
 * `RouteDeps` widening.
 *
 * ADR-058 folded the 3 site-credential routes into this SAME slice and module rather than a new one:
 * they share the identical auth gate (`ADMIN_ASSISTANT_PERMISSION`) and workspace scoping, and both
 * concerns are "the AI Assistant admin section's server surface". The 3 fields
 * (`siteAssistantCredentialRepo`/`siteAssistantSecretSealer`/`siteAssistantSecretKeyring`) need no
 * matching `*Ready` promise — see their own doc comments on `RouteDeps` for why.
 *
 * The admin-BYOK-keystore design folds its own 3 execution-credential routes in here too, for the
 * identical reason. Those 3 routes need no `authorize()`/`ADMIN_ASSISTANT_PERMISSION` check — the row
 * is scoped to `(workspaceId, session principal id)`, so there is no OTHER admin's data a session could
 * reach even without an extra permission gate — but they still need `adminExecutionCredentialRepo` for
 * the same reason the site-credential trio needs `siteAssistantCredentialRepo`.
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

/** The visitor-tools pair's own slice: the service is optional on the host bag (absent ⇒ redacted 500). */
export interface VisitorToolsRouteDeps { workspaceId: string; visitorToolsManagement?: VisitorToolsManagementPort }

/** The two port fields every mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function assistantPortDeps({ deps }: { deps: Pick<AssistantSettingsRouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Each route's `sendAdminFailure` options. Every RBAC-gated route here used `authorizeDirectOrRespond`
 *  (`"direct"`); the self-scoped and service-authorized routes asked nothing, so `"direct"` also keeps
 *  them from consulting the publish-credential override they never read. */
function mountOptions(operation: string, extra: Pick<FailureOptions, "message"> = {}) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR", ...extra } };
}

const SETTINGS_ERRORS: readonly AssistantErrorMapping[] = [{
  matches: ({ err }) => err instanceof PublicAssistantSettingsValidationError || err instanceof ValueValidationFailedError,
  status: 400, code: "ASSISTANT_SETTINGS_VALIDATION_ERROR",
}];

// ADR-058 §4: a missing `TOVU_SITE_KEY` is a distinct, actionable operator error (503), not a generic
// 500 and not a validation problem with the request body.
const SITE_CREDENTIAL_ERRORS: readonly AssistantErrorMapping[] = [
  { matches: ({ err }) => err instanceof SiteAssistantCredentialValidationError, status: 400, code: SITE_CREDENTIAL_VALIDATION_CODE },
  {
    matches: ({ err }) => err instanceof SiteAssistantSecretStoreUnconfiguredError, status: 503, code: "SECRET_STORE_UNCONFIGURED",
    error: "site assistant secret store is not configured — set TOVU_SITE_KEY (a hex-encoded site key) in the server environment",
  },
];

const EXECUTION_CREDENTIAL_ERRORS: readonly AssistantErrorMapping[] = [
  { matches: ({ err }) => err instanceof ExecutionCredentialValidationError, status: 400, code: EXECUTION_CREDENTIAL_VALIDATION_CODE },
  {
    matches: ({ err }) => err instanceof ExecutionCredentialSecretStoreUnconfiguredError, status: 503, code: "SECRET_STORE_UNCONFIGURED",
    error: "the execution credential secret store is not configured — set TOVU_SITE_KEY (a hex-encoded site key) in the server environment",
  },
];

/** Map typed service errors without leaking settings/provider failures; the 403 copy never names the caller. */
const VISITOR_TOOLS_ERRORS: readonly AssistantErrorMapping[] = [
  { matches: ({ err }) => err instanceof VisitorToolsRevisionConflictError, status: 409, code: "VISITOR_TOOLS_REVISION_CONFLICT", extra: { reload: true } },
  { matches: ({ err }) => err instanceof ForbiddenError, status: 403, code: "FORBIDDEN", error: "visitor-tools.manage is required" },
  {
    matches: ({ err }) => err instanceof VisitorToolPolicyValidationError || err instanceof CoreValueValidationFailedError,
    status: 400, code: "VISITOR_TOOLS_VALIDATION_ERROR",
  },
];

/** The settings readiness gate and permission both public-switch routes read. */
function settingsGate({ deps }: { deps: AssistantSettingsRouteDeps }, _optional: Record<string, never> = {}) {
  return { ...assistantPortDeps({ deps }), assistantSettingsReady: deps.assistantSettingsReady, managePermission: ADMIN_ASSISTANT_PERMISSION };
}

export const registerAdminAssistantGetSettingsRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const readAssistantSettings = (input: { workspaceId: string }) => getPublicAssistantSettings({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, input);
  mountAdminJsonRoute(
    { app, spec: assistantGetSettingsRoute, deps: { ...settingsGate({ deps }), readAssistantSettings, adminAssistantEnabled: deps.adminAssistantEnabled } },
    mountOptions("routes/assistant/get-settings", { message: "Assistant settings could not be loaded." }),
  );
};

/** GET/PUT require visitor-tools.manage through the service; the enclosing admin module requires a session.
 * PUT body is {toolId, expectedRevisionSeq, mode?, limits?}; both return {data: VisitorToolsView}.
 * @example registerAdminVisitorToolsRoutes({app, deps});
 */
export function registerAdminVisitorToolsRoutes({ app, deps }: { app: Express; deps: VisitorToolsRouteDeps }, _options = {}): void {
  // No RBAC port is consulted (the service authorizes); `authorize` is present only to satisfy the port shape.
  const routeDeps = {
    workspaceId: deps.workspaceId, authorize: async () => ({ allowed: false, reason: "visitor-tools routes authorize in the service" }),
    visitorToolsManagement: () => deps.visitorToolsManagement, errorMappings: VISITOR_TOOLS_ERRORS,
  } satisfies AdminJsonRoutePortDeps & Record<string, unknown>;
  mountAdminJsonRoute({ app, spec: assistantVisitorToolsListRoute, deps: routeDeps }, mountOptions("routes/assistant/visitor-tools"));
  mountAdminJsonRoute({ app, spec: assistantVisitorToolsConfigureRoute, deps: routeDeps }, mountOptions("routes/assistant/visitor-tools"));
}

export const registerAdminAssistantPutSettingsRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const writeAssistantSettings = (input: { workspaceId: string; patch: unknown; callerPrincipalId: string }) => setPublicAssistantSettings(
    {
      settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: deps.set, clock: deps.clock, ids: deps.idGen,
      authorize: deps.authorize, principals: deps.principalRepo,
    },
    { workspaceId: input.workspaceId, patch: input.patch as Parameters<typeof setPublicAssistantSettings>[1]["patch"], callerPrincipalId: input.callerPrincipalId },
  );
  mountAdminJsonRoute(
    { app, spec: assistantPutSettingsRoute, deps: { ...settingsGate({ deps }), writeAssistantSettings, errorMappings: SETTINGS_ERRORS } },
    mountOptions("routes/assistant/put-settings"),
  );
};

export const registerAdminAssistantGetSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const readSiteCredential = (input: { workspaceId: string }) => getSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer }, input);
  mountAdminJsonRoute(
    { app, spec: assistantGetSiteCredentialRoute, deps: { ...assistantPortDeps({ deps }), managePermission: ADMIN_ASSISTANT_PERMISSION, readSiteCredential } },
    mountOptions("routes/assistant/get-site-credential"),
  );
};

export const registerAdminAssistantPutSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const writeSiteCredential = (input: Parameters<typeof setSiteAssistantCredential>[1]) => setSiteAssistantCredential(
    { repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
    input,
  );
  const putDeps = { ...assistantPortDeps({ deps }), managePermission: ADMIN_ASSISTANT_PERMISSION, writeSiteCredential, errorMappings: SITE_CREDENTIAL_ERRORS };
  mountAdminJsonRoute({ app, spec: assistantPutSiteCredentialRoute, deps: putDeps }, mountOptions("routes/assistant/put-site-credential"));
};

export const registerAdminAssistantDeleteSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const clearSiteCredential = ({ workspaceId }: { workspaceId: string }) => deleteSiteAssistantCredential({
    deps: { repo: deps.siteAssistantCredentialRepo, clock: deps.clock }, workspaceId,
  });
  mountAdminJsonRoute(
    { app, spec: assistantDeleteSiteCredentialRoute, deps: { ...assistantPortDeps({ deps }), managePermission: ADMIN_ASSISTANT_PERMISSION, clearSiteCredential } },
    mountOptions("routes/assistant/delete-site-credential"),
  );
};

export const registerAdminAssistantGetExecutionCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const readExecutionCredential = (input: { workspaceId: string; principalId: string }) => getExecutionCredential(
    { repo: deps.adminExecutionCredentialRepo, sealer: deps.siteAssistantSecretSealer }, input,
  );
  mountAdminJsonRoute(
    { app, spec: assistantGetExecutionCredentialRoute, deps: { ...assistantPortDeps({ deps }), readExecutionCredential } },
    mountOptions("routes/assistant/get-execution-credential"),
  );
};

export const registerAdminAssistantPutExecutionCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const writeExecutionCredential = (input: Parameters<typeof setExecutionCredential>[1]) => setExecutionCredential(
    { repo: deps.adminExecutionCredentialRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
    input,
  );
  const putDeps = { ...assistantPortDeps({ deps }), writeExecutionCredential, errorMappings: EXECUTION_CREDENTIAL_ERRORS };
  mountAdminJsonRoute({ app, spec: assistantPutExecutionCredentialRoute, deps: putDeps }, mountOptions("routes/assistant/put-execution-credential"));
};

export const registerAdminAssistantDeleteExecutionCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const clearExecutionCredential = (input: { workspaceId: string; principalId: string }) => deleteExecutionCredential({
    deps: { repo: deps.adminExecutionCredentialRepo, clock: deps.clock }, ...input,
  });
  mountAdminJsonRoute(
    { app, spec: assistantDeleteExecutionCredentialRoute, deps: { ...assistantPortDeps({ deps }), clearExecutionCredential } },
    mountOptions("routes/assistant/delete-execution-credential"),
  );
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
