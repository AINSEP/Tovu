import { detectAgents, type DetectedAgent as RuntimeDetectedAgent } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps.js";

/**
 * Maps `@jini-ai/agent-runtime`'s `DetectedAgent` onto the `@jini-ai/ui`
 * `ExecutionTab`'s own `DetectedAgent`.
 *
 * This used to narrow the payload to `{id,label,installed,version?,path?}` on
 * the theory that the picker rendered nothing else. It does: the tab's agent
 * cards show the model list and its provenance, the auth status, and the
 * binary path, and every one of those fields already exists on the runtime
 * shape (`types.ts`, the `models` / `modelsSource` / `authStatus` /
 * `authMessage` intersection). Dropping them here left the UI unable to render
 * what detection had already paid to discover.
 *
 * `diagnostics` is still not forwarded — the tab has no affordance for the
 * fix-actions they describe, so it would be dead weight on the wire rather
 * than data the client can use.
 *
 * Both reasoning-effort fields were the same omission a second time, found
 * 2026-09-02 and fixed here. `LocalCliAgentCard` has rendered a "Reasoning
 * effort" control for any agent reporting `reasoningOptions` since it was
 * ported, and `claude`/`codex` have declared those options for just as long —
 * but this projection dropped them, so the control was unreachable in Tovu for
 * every runtime, with nothing failing anywhere to say so.
 * `reasoningInModelId` is the second shape (a runtime whose effort rides as a
 * suffix on the model id, antigravity being the only declarer); the card
 * derives its per-base-model levels from `models`, which this projection
 * already carries, so the vocabulary is all it additionally needs.
 *
 * Exported for `__tests__/detect-agents-projection.test.ts`, which pins both
 * fields so the next narrowing fails there rather than silently in the UI.
 */
export function toExecutionTabAgent(agent: RuntimeDetectedAgent): {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  path?: string;
  models?: Array<{ id: string; label: string }>;
  modelsSource?: "live" | "fallback";
  reasoningOptions?: Array<{ id: string; label: string }>;
  reasoningInModelId?: { levels: Array<{ id: string; label: string }> };
  authStatus?: "ok" | "missing" | "unknown";
  authMessage?: string;
} {
  return {
    id: agent.id,
    label: agent.name,
    installed: agent.available,
    ...(agent.version ? { version: agent.version } : {}),
    ...(agent.path ? { path: agent.path } : {}),
    ...(agent.models?.length
      ? { models: agent.models.map((model) => ({ id: model.id, label: model.label })) }
      : {}),
    ...(agent.modelsSource ? { modelsSource: agent.modelsSource } : {}),
    ...(agent.reasoningOptions?.length
      ? { reasoningOptions: agent.reasoningOptions.map((option) => ({ id: option.id, label: option.label })) }
      : {}),
    ...(agent.reasoningInModelId?.levels.length
      ? {
          reasoningInModelId: {
            levels: agent.reasoningInModelId.levels.map((level) => ({ id: level.id, label: level.label })),
          },
        }
      : {}),
    ...(agent.authStatus ? { authStatus: agent.authStatus } : {}),
    // Auth guidance is operator-facing text from the adapter ("run `x login`"),
    // not provider output, so it carries no credential material.
    ...(agent.authMessage ? { authMessage: agent.authMessage } : {}),
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
