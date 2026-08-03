import { listProviderModels } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/public-assistant-settings";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps";

const SUPPORTED_PROTOCOLS = ["anthropic", "openai", "azure", "google"] as const;

interface ListModelsRequestBody {
  protocol?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  apiVersion?: unknown;
}

/**
 * POST live-discovers a BYOK provider's model catalog — the "Execution mode"
 * tab's optional `ExecutionPort.listModels`, wired by
 * `apps/admin/src/lib/execution-settings.ts`. Delegates to
 * `@jini-ai/agent-runtime`'s `listProviderModels` (dispatch trace Q5/Q6): the
 * same reasons `test-connection.ts` makes its outbound call server-side
 * apply here — the key stays out of the browser's cross-origin fetch and the
 * SSRF guard runs against a server-resolved base URL.
 *
 * Same never-persisted `apiKey` contract as `test-connection.ts` — see that
 * file's header.
 */
export const registerAdminAssistantListModelsRoute: AssistantExecutionRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/assistant/execution/models", async (req, res) => {
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

      const body = (req.body ?? {}) as ListModelsRequestBody;
      const protocol = typeof body.protocol === "string" ? body.protocol : "";
      const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
      const apiVersion = typeof body.apiVersion === "string" ? body.apiVersion : undefined;

      if (!SUPPORTED_PROTOCOLS.includes(protocol as (typeof SUPPORTED_PROTOCOLS)[number])) {
        res.status(400).json({
          error: `protocol must be one of ${SUPPORTED_PROTOCOLS.join("|")}`,
          code: "VALIDATION_ERROR",
        });
        return;
      }
      if (!baseUrl.trim()) {
        res.status(400).json({ error: "baseUrl is required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = await listProviderModels({
        protocol: protocol as (typeof SUPPORTED_PROTOCOLS)[number],
        baseUrl,
        apiKey,
        ...(apiVersion ? { apiVersion } : {}),
      });
      res.json({
        ok: result.ok,
        models: (result.models ?? []).map((model) => model.id),
        ...(result.detail ? { message: result.detail } : {}),
      });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
