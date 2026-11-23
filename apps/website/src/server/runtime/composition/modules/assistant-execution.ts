import type { Express } from "express";
import { detectAgents, listProviderModels, testProviderConnection } from "@jini-ai/agent-runtime";
import { detectAgentsRoute } from "@jini-ai/cms/admin-http/routes/assistant/detect-agents";
import { listModelsRoute } from "@jini-ai/cms/admin-http/routes/assistant/list-models";
import type { ProbeCredentialResolvers } from "@jini-ai/cms/admin-http/routes/assistant/stored-credential-probe";
import { testAgentRoute } from "@jini-ai/cms/admin-http/routes/assistant/test-agent";
import { testConnectionRoute } from "@jini-ai/cms/admin-http/routes/assistant/test-connection";
import { createAssistantDetectionCache, listDetectedAssistantAgents, assistantAgentDiscoveryPending } from "#src/assistant/agent-discovery";
import { ADMIN_ASSISTANT_PERMISSION, resolveExecutionCredential, resolveSiteAssistantApiKey } from "#src/assistant/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `assistant-execution` server module: the 4 admin routes backing
 * the "Execution mode" tab's `ExecutionPort` (Local CLI detection, per-agent
 * CLI check, BYOK connection test, BYOK model discovery — `@jini-ai/ui`'s
 * `ExecutionTab`, wired to these routes by
 * `apps/admin/src/lib/execution-settings.ts`).
 *
 * Distinct from `modules/assistant-settings.ts` (the public assistant
 * on/off-switch CRUD pair) for the reason `routes/admin/assistant/
 * execution-deps.ts` documents: these are stateless egress probes, not
 * settings reads/writes. Both modules happen to gate on the same
 * `ADMIN_ASSISTANT_PERMISSION` and live in the same route directory because
 * they are both part of the AI Assistant admin section, not because they
 * share dependencies.
 *
 * All 4 routes are Jini route specs (`@jini-ai/cms/admin-http/routes/assistant/*`) mounted behind the
 * admin ports. The per-agent check's registrar binds the detection boundary: an injected
 * `deps.detectAgents`, else the assistant inventory's runtime, else Jini's PATH/process probe —
 * resolved per request, as before. The probe registrars bind the stored-credential readers, the
 * runtime's DNS/transport seams and Tovu's empty-key copy.
 */
/**
 * Narrow `RouteDeps` slice for the 3 "Execution mode" probe routes
 * (`detect-agents.ts`, `test-connection.ts`, `list-models.ts`).
 *
 * Deliberately separate from `deps.ts`'s `AssistantSettingsRouteDeps` in this
 * same directory, even though both live under `routes/admin/assistant/` and
 * both gate on `ADMIN_ASSISTANT_PERMISSION`: these three routes hold no
 * settings repo and await no settings-ready promise. They are stateless
 * egress probes — detect local agent CLIs on the server host, or make a
 * single outbound smoke-test/model-list request to a BYOK provider the
 * caller names in the request body — not settings CRUD. The API key these
 * routes receive is passed straight through to `@jini-ai/agent-runtime` and
 * is never written to `settingsRepo` or any other store (ADR-028 §6; see
 * `assistant/execution-mode-settings.ts`'s header for the full rationale).
 *
 * ## The one read this slice now carries, and why it does not break the above
 *
 * `siteAssistantCredentialRepo` + `siteAssistantSecretSealer` were added so a probe can OPTIONALLY
 * run against the workspace's stored site credential (`useStoredCredential: true`) instead of a key
 * in the request body. That is still not settings CRUD and still writes nothing — it is a read of
 * the credential the probe is about to use, in the one case where the caller genuinely cannot
 * supply it: the AI Assistant tab's key is encrypted server-side and write-only, so an operator
 * returning to a screen with a saved key has an empty field and no way to discover models or test
 * the connection. Before this, both controls sat permanently disabled next to a working key.
 *
 * The "never persisted" contract is untouched — nothing here writes — and the fallback is opt-in
 * per request, never implicit, so Settings → Execution mode can never silently probe with the
 * SITE's key. See `list-models.ts`'s own note on why that opt-in must not be relaxed to "empty key
 * ⇒ use the stored one".
 *
 * `adminExecutionCredentialRepo` is the same read for the OTHER write-only credential — the calling
 * admin's own `admin_execution_credentials` row, reached by the separate `useAdminStoredCredential`
 * opt-in. It was added for the same symptom on the other screen: the admin's own key moved
 * server-side (2026-08-05) while its probes still only knew how to send a key from the browser, so
 * the AI Assistant tab's Model field reported "No API key — model discovery needs the key from this
 * browser" beside a key the server holds and uses on every turn. Two stored credentials, two
 * separate opt-ins, deliberately never one flag: they are different keys belonging to different
 * subjects, and `stored-credential-probe.ts` keeps them apart.
 */
export type AssistantExecutionRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "assistantAgentInventory"
  | "authorize"
  | "siteAssistantCredentialRepo"
  | "siteAssistantSecretSealer"
  | "adminExecutionCredentialRepo"
> & {
  /** Host detection boundary; defaults to Jini's PATH/process probe. */
  readonly detectAgents?: typeof detectAgents;
  /** Forward Jini's existing DNS seam so the real SSRF guard can be exercised without DNS I/O. */
  readonly probeDnsLookup?: NonNullable<Parameters<typeof listProviderModels>[1]>["dnsLookup"];
  /** Provider connection probe; defaults to Jini's `testProviderConnection` (real outbound request). */
  readonly testProviderConnection?: typeof testProviderConnection;
  /** Native fetch dispatcher seam; redirects remain forbidden by the probe adapter. */
  readonly probeRequestInit?: NonNullable<Parameters<typeof testProviderConnection>[1]>["requestInit"];
};

export type AssistantExecutionRouteRegistrar = (required: { app: Express; deps: AssistantExecutionRouteDeps }, optional?: Record<string, never>) => void;

/**
 * Replaces the runtime's host-neutral empty-key refusal ("No API key saved. Save one to load
 * models.") with one that says where Tovu keeps keys. Also a key in the admin's i18n dictionaries.
 */
const NO_SERVER_KEY_MESSAGE = "No API key saved on the server. Save one first.";

/** The two port fields every mount passes; `authorize` is read per request, as the hand-written routes did. */
function executionPortDeps({ deps }: { deps: AssistantExecutionRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Every execution route asked `authorizeDirectOrRespond` (never the publishing-credential override). */
function executionMountOptions({ operation }: { operation: string }, _options: Record<string, never> = {}) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The two stored-credential readers the probe chokepoint opens. One sealing capability app-wide —
 * `siteAssistantSecretSealer` is the same sealer `assistant-byok.ts` and `live-model-cache.ts` open
 * the admin row with. See `routes/types.ts`'s `adminExecutionCredentialRepo` doc. */
function probeCredentialResolvers({ deps }: { deps: AssistantExecutionRouteDeps }, _options: Record<string, never> = {}): ProbeCredentialResolvers {
  return {
    resolveStoredSiteCredential: () => resolveSiteAssistantApiKey(
      { deps: { repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer }, input: { workspaceId: deps.workspaceId } },
    ),
    resolveStoredAdminCredential: ({ principalId }) => resolveExecutionCredential(
      { deps: { repo: deps.adminExecutionCredentialRepo, sealer: deps.siteAssistantSecretSealer }, input: { workspaceId: deps.workspaceId, principalId } },
    ),
  };
}

/** The connection probe with Tovu's transport seams. Host DNS/dispatcher dependencies are forwarded
 * while redirect refusal is enforced here. @complexity O(1). */
function boundConnectionProbe({ deps }: { deps: AssistantExecutionRouteDeps }, _options: Record<string, never> = {}) {
  return (required: Parameters<typeof testProviderConnection>[0], optional: { apiVersion?: string }) => {
    // The runtime validates only the initial base URL. A provider redirect must not send
    // this probe (and its credentials) to a destination that never passed that guard.
    // The current runtime types put requestInit in optional argument two and require its dispatcher
    // key; undefined uses fetch's default.
    const requestInit = { ...deps.probeRequestInit, redirect: "error", dispatcher: deps.probeRequestInit?.dispatcher } satisfies
      RequestInit & NonNullable<NonNullable<Parameters<typeof testProviderConnection>[1]>["requestInit"]>;
    return (deps.testProviderConnection ?? testProviderConnection)(required, { dnsLookup: deps.probeDnsLookup, requestInit, ...optional });
  };
}

/** POST `.../execution/detect-agents`. The detection cache is built once, at registration, from an
 * injected detector; without one, the inventory (or the process compatibility inventory) answers. */
export const registerAdminAssistantDetectAgentsRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  const inventory = deps.detectAgents ? createAssistantDetectionCache({ detector: deps.detectAgents, ...(deps.assistantAgentInventory ? { runtime: deps.assistantAgentInventory.runtime } : {}) }) : undefined;
  mountAdminJsonRoute({ app, spec: detectAgentsRoute, deps: {
    ...executionPortDeps({ deps }),
    adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    readDetectedAgents: (input) => (inventory ? inventory.read(input) : (deps.assistantAgentInventory?.listDetectedAssistantAgents ?? listDetectedAssistantAgents)(input)),
    isDiscoveryPending: () => (inventory ? inventory.isPending({}) : (deps.assistantAgentInventory?.assistantAgentDiscoveryPending ?? assistantAgentDiscoveryPending)()),
  } }, executionMountOptions({ operation: "routes/assistant/detect-agents" }));
};

/** POST `.../execution/test-connection`: the BYOK connection probe. */
export const registerAdminAssistantTestConnectionRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: testConnectionRoute, deps: {
    ...executionPortDeps({ deps }),
    ...probeCredentialResolvers({ deps }),
    adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    testProviderConnection: boundConnectionProbe({ deps }),
  } }, executionMountOptions({ operation: "routes/assistant/test-connection" }));
};

/** POST `.../execution/models`: BYOK model discovery through the runtime's guarded transport seams. */
export const registerAdminAssistantListModelsRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: listModelsRoute, deps: {
    ...executionPortDeps({ deps }),
    ...probeCredentialResolvers({ deps }),
    adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    listProviderModels: (required, optional) => listProviderModels(required, { dnsLookup: deps.probeDnsLookup, requestInit: deps.probeRequestInit, ...optional }),
    noServerKeyMessage: NO_SERVER_KEY_MESSAGE,
  } }, executionMountOptions({ operation: "routes/assistant/list-models" }));
};

export const registerAdminAssistantTestAgentRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: testAgentRoute, deps: {
    ...executionPortDeps({ deps }),
    adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    detectAgents: (required, optional) => (deps.detectAgents ?? deps.assistantAgentInventory?.runtime.detectAgents ?? detectAgents)(required, optional),
  } }, executionMountOptions({ operation: "routes/assistant/test-agent" }));
};

export function createAssistantExecutionModule(deps: AssistantExecutionRouteDeps): ServerModuleHandle {
  return {
    name: "assistant-execution",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminAssistantDetectAgentsRoute({ app, deps });
      registerAdminAssistantTestConnectionRoute({ app, deps });
      registerAdminAssistantListModelsRoute({ app, deps });
      registerAdminAssistantTestAgentRoute({ app, deps });
    },
  };
}
