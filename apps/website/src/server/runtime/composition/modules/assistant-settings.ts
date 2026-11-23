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
import { registerAdminVisitorToolsRoutes } from "#src/server/inbound/admin-http/routes/assistant/visitor-tools";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { AssistantSettingsRouteDeps, AssistantSettingsRouteRegistrar } from "#src/server/inbound/admin-http/routes/assistant/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 / ADR-058 / admin-BYOK-keystore design — the `assistant-settings` server
 * module: the admin routes backing the AI Assistant section — the public on/off switch (2 routes),
 * the SITE's encrypted provider credential since ADR-058 (3 more: GET/PUT/DELETE
 * `.../assistant/site-credential`), and now the ADMIN's OWN encrypted BYOK credential (3 more:
 * GET/PUT/DELETE `.../assistant/execution-credential`, design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved). Folded
 * into this same module rather than a new one — see `apps/website/src/server/inbound/admin-http/routes/assistant/deps.ts`'s header for
 * why (same "AI Assistant admin section" concern; the execution-credential trio's auth gate is
 * narrower — self-scoped by session identity rather than `ADMIN_ASSISTANT_PERMISSION` — but that is
 * a per-route difference, not a reason for a separate module).
 *
 * The 8 settings/credential routes are Jini route specs (`@jini-ai/cms/admin-http/routes/assistant/*`)
 * mounted behind the admin ports; the registrars below bind Tovu's services, permission name and
 * `TOVU_SITE_KEY` copy into each spec's small deps. Visitor tools is still a hand-written route.
 *
 * Distinct from `modules/assistant.ts`, which is the session-gated reverse proxy in front of the
 * agent-daemon process. The two share a word and nothing else: this one holds repos and serves
 * ordinary JSON CRUD, that one holds no repo and streams SSE from another process. See
 * `apps/website/src/server/inbound/admin-http/routes/assistant/deps.ts` for the same note next to the dependency slice.
 *
 * All 9 registrations live under `/api/admin/v1/...`, inside the `/api/admin` session gate
 * `createCoreModule` mounts, so registration order relative to the site's `GET /:slug` catch-all is
 * not load-bearing the way `modules/seo.ts`'s public sitemap/robots routes are.
 */

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
