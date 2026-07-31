import { detectAgents, type DetectedAgent as RuntimeDetectedAgent } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "../../../../assistant/public-assistant-settings";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps";

/** The `@jini-ai/ui` `ExecutionTab`'s `DetectedAgent` shape (`{id,label,installed,version?,path?}`)
 *  — narrower than `@jini-ai/agent-runtime`'s own `DetectedAgent`, which also carries model lists,
 *  auth status, and diagnostics the execution-mode picker doesn't render. */
function toExecutionTabAgent(agent: RuntimeDetectedAgent): {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  path?: string;
} {
  return {
    id: agent.id,
    label: agent.name,
    installed: agent.available,
    ...(agent.version ? { version: agent.version } : {}),
    ...(agent.path ? { path: agent.path } : {}),
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
 * No request body — detection runs against whatever CLIs are on THIS
 * server's PATH, not per-caller configuration.
 */
export const registerAdminAssistantDetectAgentsRoute: AssistantExecutionRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/assistant/execution/detect-agents", async (req, res) => {
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

      const agents = await detectAgents();
      res.json({ data: agents.map(toExecutionTabAgent) });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
