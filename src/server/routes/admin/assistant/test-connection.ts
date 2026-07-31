import { testProviderConnection, type ConnectionTestResponse } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "../../../../assistant/public-assistant-settings";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps";

const SUPPORTED_PROTOCOLS = ["anthropic", "openai", "azure", "google"] as const;

interface TestConnectionRequestBody {
  protocol?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
  apiVersion?: unknown;
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
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
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

      const result = await testProviderConnection({
        protocol: protocol as (typeof SUPPORTED_PROTOCOLS)[number],
        baseUrl,
        apiKey,
        model,
        ...(apiVersion ? { apiVersion } : {}),
      });
      res.json({ ok: result.ok, message: renderMessage(result) });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
