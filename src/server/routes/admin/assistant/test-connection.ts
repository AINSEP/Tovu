import { testProviderConnection, type ConnectionTestResponse } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps.js";
import { resolveProbeCredential } from "./stored-credential-probe.js";

const SUPPORTED_PROTOCOLS = ["anthropic", "openai", "azure", "google"] as const;

interface TestConnectionRequestBody {
  protocol?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
  apiVersion?: unknown;
  /** Opt in to testing with the workspace's STORED site credential instead of a key in this body. */
  useStoredCredential?: unknown;
}

function renderMessage(result: ConnectionTestResponse): string {
  if (result.ok) return result.detail?.trim() ? result.detail : "Connection succeeded";
  return result.detail?.trim() ? result.detail : `Connection failed (${result.kind})`;
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
export const registerAdminAssistantTestConnectionRoute: AssistantExecutionRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/assistant/execution/test-connection", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: ADMIN_ASSISTANT_PERMISSION,
        workspaceId: deps.workspaceId,
        entityType: "assistant-execution",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${ADMIN_ASSISTANT_PERMISSION}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: ADMIN_ASSISTANT_PERMISSION, reason: authResult.reason },
        });
        return;
      }

      const body = (req.body ?? {}) as TestConnectionRequestBody;
      const protocol = typeof body.protocol === "string" ? body.protocol : "";
      const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
      const model = typeof body.model === "string" ? body.model : "";
      const apiVersion = typeof body.apiVersion === "string" ? body.apiVersion : undefined;

      if (!SUPPORTED_PROTOCOLS.includes(protocol as (typeof SUPPORTED_PROTOCOLS)[number])) {
        res.status(400).json({
          error: `protocol must be one of ${SUPPORTED_PROTOCOLS.join("|")}`,
          code: "VALIDATION_ERROR",
        });
        return;
      }
      if (!baseUrl.trim() || !model.trim()) {
        res.status(400).json({ error: "baseUrl and model are required", code: "VALIDATION_ERROR" });
        return;
      }

      // Which key probes, and WHERE it is allowed to go — one chokepoint shared with
      // `list-models.ts`. A typed key wins and travels to the endpoint its owner named; the stored
      // site credential travels only to the endpoint the server already recorded for it, never to
      // one this request body chose. See `stored-credential-probe.ts`'s header.
      const credential = await resolveProbeCredential(deps, {
        requestedBaseUrl: baseUrl,
        typedKey: typeof body.apiKey === "string" ? body.apiKey : "",
        useStoredCredential: body.useStoredCredential === true,
      });
      if (!credential.ok) {
        res.status(400).json(credential.failure);
        return;
      }

      const result = await testProviderConnection({
        protocol: protocol as (typeof SUPPORTED_PROTOCOLS)[number],
        baseUrl: credential.baseUrl,
        apiKey: credential.apiKey,
        model,
        ...(apiVersion ? { apiVersion } : {}),
      });
      res.json({ ok: result.ok, message: renderMessage(result) });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
