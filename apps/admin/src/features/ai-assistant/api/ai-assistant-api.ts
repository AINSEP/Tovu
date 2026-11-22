import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { ApiError, authenticatedAdminRequest, fetchOrThrowUnreachable } from "../../../lib/admin-http/request";
import type { AdminExecutionCredential, AdminExecutionCredentialPatch, AdminExecutionDetectedAgent, PublicAssistantSettings, SiteAssistantCredential, SiteAssistantCredentialPatch } from "./ai-assistant-api.types";

/** The admin API calls of the ai-assistant feature. */
export const aiAssistantApi = {
  // "Execution mode" tab (`@jini-ai/ui`'s `ExecutionTab`) — Local CLI detection + BYOK connection
  // test/model discovery. Deliberately separate from the settings.* methods above: these are
  // stateless egress probes (`apps/website/src/server/runtime/composition/modules/assistant-execution.ts`), not ledger CRUD, and the
  // `apiKey` field these two POST bodies carry is used for exactly one outbound request server-side
  // and never persisted (ADR-028 §6 — see `apps/admin/src/lib/execution-settings.ts`'s header).
  detectExecutionAgents: (_input: Record<string, never> = {}, { force = false }: { force?: boolean } = {}) =>
    authenticatedAdminRequest<{ data: AdminExecutionDetectedAgent[] }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/detect-agents`, body: force ? { force: true } : {} }),
  // `useStoredCredential` opts a probe into the workspace's encrypted server-side SITE credential
  // when `apiKey` is empty — for the AI Assistant tab's visitor form, whose key is write-only and so
  // genuinely absent from the browser. `useAdminStoredCredential` is the same opt-in for the OTHER
  // write-only key: the calling admin's own execution credential, which moved server-side on
  // 2026-08-05 and left these probes with nothing to send on the admin's own screens.
  //
  // Two flags, never one. Each is opt-in per request and never implicit, so neither screen can fall
  // through to the other's key — see `stored-credential-probe.ts`'s header on the server.
  testExecutionConnection: (input: {
    protocol: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    apiVersion?: string;
    useStoredCredential?: boolean;
    useAdminStoredCredential?: boolean;
  }) =>
    authenticatedAdminRequest<{ ok: boolean; message: string }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/test-connection`, body: input }),
  testExecutionAgent: (input: { agentId: string; model?: string }) =>
    authenticatedAdminRequest<{ ok: boolean; message: string }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/test-agent`, body: input }),
  listExecutionModels: (input: {
    protocol: string;
    baseUrl: string;
    apiKey: string;
    apiVersion?: string;
    useStoredCredential?: boolean;
    useAdminStoredCredential?: boolean;
  }) =>
    authenticatedAdminRequest<{ ok: boolean; models: string[]; message?: string }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/models`, body: input }),

  // AI Assistant — the visitor-facing assistant's master switch. Same `{ data }` envelope and same
  // partial-PUT shape as Jini's SEO settings adapter, because the two routes are deliberately
  // identical in contract (see `apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts`).
  //
  // GET's response also carries a sibling `adminAssistantEnabled` — the UNRELATED admin assistant's
  // own `TOVU_ADMIN_ASSISTANT=off` switch, piggy-backed onto this response rather than a new
  // endpoint (`apps/website/src/server/inbound/admin-http/routes/assistant/get-settings.ts`'s own doc explains why: this module is
  // one of exactly two admin-assistant server modules mounted unconditionally, so it is reachable
  // even with that flag off). `apps/admin/src/App.hooks.ts`'s `useAdminAssistantAvailability` is the one reader.
  getAssistantSettings: () =>
    authenticatedAdminRequest<{ data: PublicAssistantSettings; adminAssistantEnabled: boolean }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/assistant/settings` }),
  setAssistantSettings: (patch: Partial<PublicAssistantSettings>) =>
    authenticatedAdminRequest<{ data: PublicAssistantSettings }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/assistant/settings`, body: patch }),
  // The ADMIN's own agent daemon (Local CLI execution) — manual restart action for
  // `features/ai-assistant/AiAssistant.tsx`'s "Admin AI Assistant" tab. `server/routes/admin/system/
  // assistant-daemon.ts`'s route is synchronous and answers as soon as a restart is INITIATED, never
  // once it's healthy (no such signal exists in the daemon supervisor — see that route's own doc), so
  // this never throws for the ordinary "refused right now" outcome (e.g. `{reason: "shutting down"}`,
  // `POST` answers `409`) — only a genuinely unexpected failure (network, 403, 500) still throws,
  // exactly like every other route in this file. Callers read live health separately, via
  // `getAssistantDaemonReadyz` below.
  restartAssistantDaemon: async (): Promise<{ ok: boolean; reason?: string }> => {
    try {
      return await authenticatedAdminRequest<{ ok: true }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/system/assistant-daemon/restart` });
    } catch (e) {
      if (e instanceof ApiError && typeof e.body?.reason === "string") return { ok: false, reason: e.body.reason };
      throw e;
    }
  },
  // `/readyz` (root-level, NOT under `/api/admin/v1` — see `apps/website/src/server/inbound/public-http/routes/ops/health.ts`) is
  // deliberately unauthenticated and carries `assistantDaemonKnownFailed: true` only while a fresh
  // agent-daemon failure is latched (`readiness-state.ts`). Read directly rather than through
  // `request()`: both `200` (ready) and `503` (not ready) are ordinary, meaningful bodies here, not
  // error cases to throw on — the whole point of this call is telling the two apart after a restart.
  getAssistantDaemonReadyz: async (): Promise<{ ready: boolean; assistantDaemonKnownFailed?: true }> => {
    // Raw response, but through the same bounded fetch as `request()`: a bare `fetch` here queued
    // forever once long-lived SSE connections had used up the origin's connection budget.
    const res = await fetchOrThrowUnreachable({ url: "/readyz", init: { credentials: "same-origin" } });
    // `/readyz` (`apps/website/src/server/inbound/public-http/routes/ops/health.ts`'s `registerReadyzRoute`) always answers JSON, on both
    // its `200` and `503` branches — so a non-JSON response here means something ELSE answered
    // instead of the real route: a dev-server proxy gap (fixed 2026-08-17 in `vite.config.ts`, but
    // this guard is not just a workaround for that — the same class of failure is possible in
    // production from a reverse proxy's own error page or a captive portal), a stale build, etc.
    // Calling `res.json()` unconditionally used to let a plain-text 404 throw a raw
    // `Unexpected token 'T', "The server"... is not valid JSON` straight into the UI (live-verified
    // finding, 2026-08-17) — the least informative thing a STATUS CHECK could possibly show.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Could not check the assistant's status (unexpected response, HTTP ${res.status}).`);
    }
    try {
      return (await res.json()) as { ready: boolean; assistantDaemonKnownFailed?: true };
    } catch (cause) {
      throw new Error(`Could not check the assistant's status (malformed response, HTTP ${res.status}).`, { cause });
    }
  },
  // The SITE's encrypted provider credential (ADR-058) — a DIFFERENT key from the browser-local one
  // `lib/execution-settings.ts` keeps for this admin's own assistant, and the whole reason these three
  // routes exist. All three return the same write-only `{ data: SiteAssistantCredential }` view;
  // none of them can return key material. `PUT` additionally answers `503 SECRET_STORE_UNCONFIGURED`
  // when the server has no `TOVU_SITE_KEY` — a fail-closed operator error, not a bug,
  // and one screens must translate rather than show raw (see `features/ai-assistant/AiAssistant.tsx`).
  getAssistantSiteCredential: () =>
    authenticatedAdminRequest<{ data: SiteAssistantCredential }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/assistant/site-credential` }),
  setAssistantSiteCredential: (patch: SiteAssistantCredentialPatch) =>
    authenticatedAdminRequest<{ data: SiteAssistantCredential }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/assistant/site-credential`, body: patch }),
  deleteAssistantSiteCredential: () =>
    authenticatedAdminRequest<{ data: SiteAssistantCredential }>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/assistant/site-credential` }),
  // The ADMIN's own encrypted provider credential — a DIFFERENT key from the site one directly
  // above, scoped to this admin rather than the workspace. Same write-only `{ data }` envelope and
  // the same `503 SECRET_STORE_UNCONFIGURED` PUT failure mode. See `lib/execution-settings.ts` for
  // the caller-facing wrapper (explicit save only — never called from the debounced ledger-slice
  // auto-save path a typed key would otherwise ride along with).
  getAdminExecutionCredential: () =>
    authenticatedAdminRequest<{ data: AdminExecutionCredential }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/assistant/execution-credential` }),
  setAdminExecutionCredential: (patch: AdminExecutionCredentialPatch) =>
    authenticatedAdminRequest<{ data: AdminExecutionCredential }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/assistant/execution-credential`, body: patch }),
  deleteAdminExecutionCredential: () =>
    authenticatedAdminRequest<{ data: AdminExecutionCredential }>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/assistant/execution-credential` }),
};
