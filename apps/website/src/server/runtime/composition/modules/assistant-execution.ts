import type { Express } from "express";
import { detectAgents, listProviderModels, testProviderConnection } from "@jini-ai/agent-runtime";
import { assistantDetectAgentsRoute, type DetectAgentsFn } from "@jini-ai/cms/admin-http/routes/assistant/detect-agents";
import { assistantListModelsRoute, type ListModelsFn } from "@jini-ai/cms/admin-http/routes/assistant/list-models";
import { assistantTestAgentRoute, type TestAgentFn } from "@jini-ai/cms/admin-http/routes/assistant/test-agent";
import { assistantTestConnectionRoute, type TestConnectionFn } from "@jini-ai/cms/admin-http/routes/assistant/test-connection";
import type { ResolveProbeCredentialFn } from "@jini-ai/cms/admin-http/routes/assistant/execution-shared";

import { createAssistantDetectionCache, listDetectedAssistantAgents, assistantAgentDiscoveryPending } from "#src/assistant/agent-discovery";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { resolveProbeCredential } from "#src/server/inbound/admin-http/routes/assistant/stored-credential-probe";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `assistant-execution` server module: the 4 admin routes backing
 * the "Execution mode" tab's `ExecutionPort` (Local CLI detection, per-agent
 * CLI check, BYOK connection test, BYOK model discovery — `@jini-ai/ui`'s
 * `ExecutionTab`, wired to these routes by
 * `apps/admin/src/lib/execution-settings.ts`).
 *
 * K1 (RT-K1-adm-assistant): the 4 routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/assistant/{detect-agents,list-models,test-agent,test-connection}`)
 * mounted behind the admin ports. Every probe that touches the agent runtime, a subprocess or the
 * network is bound here as the spec's required deps function; so are the Tovu-owned pieces: the
 * `ADMIN_ASSISTANT_PERMISSION` name, the no-server-key copy, and the stored-credential chokepoint
 * (`routes/assistant/stored-credential-probe.ts`, which reads Tovu's sealed credential stores).
 *
 * Distinct from `modules/assistant-settings.ts` (the public assistant
 * on/off-switch CRUD pair) for the reason `AssistantExecutionRouteDeps`
 * below documents: these are stateless egress probes, not
 * settings reads/writes. Both modules happen to gate on the same
 * `ADMIN_ASSISTANT_PERMISSION` and live in the same route directory because
 * they are both part of the AI Assistant admin section, not because they
 * share dependencies.
 */

/**
 * Narrow `RouteDeps` slice for the 4 "Execution mode" probe routes (moved here from the deleted
 * `admin-http/routes/assistant/execution-deps.ts`; it describes the host's bag, so it stays host-side).
 *
 * Deliberately separate from `deps.ts`'s `AssistantSettingsRouteDeps`, even though both gate on
 * `ADMIN_ASSISTANT_PERMISSION`: these routes hold no settings repo and await no settings-ready
 * promise. They are stateless egress probes — detect local agent CLIs on the server host, or make a
 * single outbound smoke-test/model-list request to a BYOK provider the caller names in the request
 * body — not settings CRUD. The API key these routes receive is passed straight through to
 * `@jini-ai/agent-runtime` and is never written to `settingsRepo` or any other store (ADR-028 §6;
 * see `assistant/execution-mode-settings.ts`'s header for the full rationale).
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
 * SITE's key. See the list-models spec's note on why that opt-in must not be relaxed to "empty key
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
export const NO_SERVER_KEY_MESSAGE = "No API key saved on the server. Save one first.";

/** The port fields plus the permission every execution mount passes. `authorize` is read per request,
 *  as the hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function executionPortDeps({ deps }: { deps: AssistantExecutionRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps & { manageAssistantPermission: string } {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params), manageAssistantPermission: ADMIN_ASSISTANT_PERMISSION };
}

/** Every execution route used `authorizeDirectOrRespond` (`"direct"`) and `sendAdminFailure` with its own operation. */
function mountOptions(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The stored-credential chokepoint, bound to this bag (`principalId` arrives from the session via the spec). */
function probeCredentialFor({ deps }: { deps: AssistantExecutionRouteDeps }, _optional: Record<string, never> = {}): ResolveProbeCredentialFn {
  return (request) => resolveProbeCredential(deps, request);
}

/**
 * The detection boundary for detect-agents. Read the host snapshot before sampling its pending state;
 * discovery stays with the cache. Rejections propagate to the route's existing internal-error response.
 * The cache is created once at registration when a detector is injected, as the hand-written route did.
 * @complexity O(1) transport work; inventory discovery is delegated.
 */
function detectionSnapshotFor({ deps }: { deps: AssistantExecutionRouteDeps }, _optional: Record<string, never> = {}): DetectAgentsFn {
  const inventory = deps.detectAgents ? createAssistantDetectionCache({ detector: deps.detectAgents, ...(deps.assistantAgentInventory ? { runtime: deps.assistantAgentInventory.runtime } : {}) }) : undefined;
  return async (input) => {
    const agents = await (inventory ? inventory.read(input) : (deps.assistantAgentInventory?.listDetectedAssistantAgents ?? listDetectedAssistantAgents)(input));
    const discoveryPending = inventory ? inventory.isPending({}) : (deps.assistantAgentInventory?.assistantAgentDiscoveryPending ?? assistantAgentDiscoveryPending)();
    return { agents, discoveryPending };
  };
}

/**
 * POST detects code-agent CLIs installed on the server host — the "Execution
 * mode" tab's Local CLI probe (`ExecutionPort.detectLocalAgents` /
 * `.rescanLocalAgents`, both wired to this one route by
 * `apps/admin/src/lib/execution-settings.ts`). Delegates entirely to
 * `@jini-ai/agent-runtime`'s `detectAgents()` (the same spawn-`--version`-and-
 * classify probe traced from Open Design's `apps/daemon/src/runtimes/
 * detection.ts` — see the dispatch trace, Q4).
 *
 * A strict `force:true` body is explicit Rescan. Ordinary reads return the previous
 * inventory immediately while one background scan refreshes it; no per-caller configuration.
 */
export const registerAdminAssistantDetectAgentsRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: assistantDetectAgentsRoute, deps: { ...executionPortDeps({ deps }), detectAgents: detectionSnapshotFor({ deps }) } },
    mountOptions("routes/assistant/detect-agents"),
  );
};

/**
 * Calls `testProviderConnection` with the host's DNS/dispatcher seams, enforcing redirect refusal here.
 * @complexity O(1) plus the outbound probe.
 */
function connectionProbeFor({ deps }: { deps: AssistantExecutionRouteDeps }, _optional: Record<string, never> = {}): TestConnectionFn {
  return (request, optional = {}) => {
    // The runtime validates only the initial base URL. A provider redirect must not send
    // this probe (and its credentials) to a destination that never passed that guard.
    // The current runtime types put requestInit in optional argument two and require its dispatcher
    // key; undefined uses fetch's default.
    const requestInit = { ...deps.probeRequestInit, redirect: "error", dispatcher: deps.probeRequestInit?.dispatcher } satisfies
      RequestInit & NonNullable<NonNullable<Parameters<typeof testProviderConnection>[1]>["requestInit"]>;
    return (deps.testProviderConnection ?? testProviderConnection)(request, { dnsLookup: deps.probeDnsLookup, requestInit, ...optional });
  };
}

/**
 * POST probes a BYOK provider endpoint with the caller-supplied credentials
 * — the "Execution mode" tab's `ExecutionPort.testConnection`, wired by
 * `apps/admin/src/lib/execution-settings.ts`. Delegates to
 * `@jini-ai/agent-runtime`'s `testProviderConnection` (dispatch trace Q2/Q6):
 * this server makes the real outbound request to the provider so the key
 * never has to leave the admin's own browser via a cross-origin fetch, and
 * so the SSRF guard (`validateBaseUrlResolved`) runs against a base URL the
 * SERVER resolves, not one a hostile client could steer client-side.
 *
 * That guard bounds which ADDRESS SPACE a probe may reach (it rejects
 * loopback/RFC1918/link-local/CGNAT), and deliberately not which HOST — every
 * real provider is a public host. It is therefore not what keeps the stored
 * site credential from being sent somewhere it shouldn't go; see
 * `stored-credential-probe.ts` for the separate rule that does.
 *
 * The request body's `apiKey` is used for exactly this one outbound call and
 * is never persisted anywhere on this server — no settings write, no log
 * line includes it (`testProviderConnection` redacts it out of any upstream
 * error text it surfaces). See `assistant/execution-mode-settings.ts` for why
 * that constraint exists (ADR-028 §6) and where the key lives instead
 * (the browser's own localStorage).
 */
export const registerAdminAssistantTestConnectionRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: assistantTestConnectionRoute, deps: { ...executionPortDeps({ deps }), resolveProbeCredential: probeCredentialFor({ deps }), testConnection: connectionProbeFor({ deps }) } },
    mountOptions("routes/assistant/test-connection"),
  );
};

/** Calls `listProviderModels`; host DNS/dispatcher dependencies flow through the runtime's existing guarded transport seams. */
function modelListProbeFor({ deps }: { deps: AssistantExecutionRouteDeps }, _optional: Record<string, never> = {}): ListModelsFn {
  return (request, optional = {}) => listProviderModels(request, { dnsLookup: deps.probeDnsLookup, requestInit: deps.probeRequestInit, ...optional });
}

/**
 * POST live-discovers a BYOK provider's model catalog — the "Execution mode"
 * tab's optional `ExecutionPort.listModels`, wired by
 * `apps/admin/src/lib/execution-settings.ts`. Delegates to
 * `@jini-ai/agent-runtime`'s `listProviderModels` (dispatch trace Q5/Q6): the
 * same reasons the test-connection route makes its outbound call server-side
 * apply here — the key stays out of the browser's cross-origin fetch and the
 * SSRF guard runs against a server-resolved base URL.
 *
 * An earlier revision of this header answered the wrong threat here, and it is worth leaving the
 * correction visible: it argued the stored credential was safe because "the key still never reaches
 * the browser — decrypted, used for one outbound call, and only model IDs come back". Every clause
 * of that is true, and none of it was the exposure. The key did not need to reach the browser; the
 * SERVER sent it wherever the request body's `baseUrl` pointed, so a principal who may never read
 * that key could have it delivered to a host they controlled. `stored-credential-probe.ts` is what
 * actually holds the boundary now. A correct sentence about the wrong boundary reads like a safety
 * argument and audits like one too.
 */
export const registerAdminAssistantListModelsRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: assistantListModelsRoute, deps: {
      ...executionPortDeps({ deps }), noServerKeyMessage: NO_SERVER_KEY_MESSAGE,
      resolveProbeCredential: probeCredentialFor({ deps }), listModels: modelListProbeFor({ deps }),
    } },
    mountOptions("routes/assistant/list-models"),
  );
};

/**
 * POST re-probes ONE detected code-agent CLI — the Local CLI counterpart of test-connection, backing
 * `ExecutionPort.testAgent`. Implemented as a fresh `detectAgents()` run scoped to the requested id
 * rather than a new probing mechanism: that run already spawns each CLI's `--version` and its
 * declared auth probe (`probeAgentAuthStatus`), which is exactly the question the button asks, so it
 * adds no new subprocess surface beyond what detect-agents already exposes on this same permission.
 * `force: true` bypasses the process detection cache; the detector is read per request.
 */
export const registerAdminAssistantTestAgentRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  const testAgent: TestAgentFn = ({ agentId }) =>
    (deps.detectAgents ?? deps.assistantAgentInventory?.runtime.detectAgents ?? detectAgents)({ agentIds: [agentId] }, { force: true });
  mountAdminJsonRoute(
    { app, spec: assistantTestAgentRoute, deps: { ...executionPortDeps({ deps }), testAgent } },
    mountOptions("routes/assistant/test-agent"),
  );
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
