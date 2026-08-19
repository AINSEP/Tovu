import { detectAgents } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps.js";
import { resolveTestAgentOutcome } from "./resolve-test-agent-outcome.js";

/**
 * POST re-probes ONE detected code-agent CLI and reports whether it is usable
 * — the Local CLI counterpart of `test-connection.ts`, backing
 * `ExecutionPort.testAgent` (the per-agent Test button on an agent card).
 *
 * Implemented as a fresh `detectAgents()` run filtered to the requested id
 * rather than a new probing mechanism. That run already spawns each CLI's
 * `--version` and its declared auth probe (`probeAgentAuthStatus`), which is
 * exactly the question the button asks: is this CLI present, and is it signed
 * in *right now*? Reusing it adds no new subprocess surface beyond what
 * `detect-agents.ts` already exposes on this same permission.
 *
 * What this deliberately does NOT do is dispatch a real prompt through the
 * agent. The origin's Test did (it had a daemon dispatcher to hand), but a
 * settings screen that silently bills the operator for a model call is a
 * different and more expensive promise than "check this is set up", and Tovu
 * has no such dispatcher wired here. The response says which check ran so the
 * result cannot be over-read.
 *
 * Outcome split follows the error-reporting contract §3.1, matching
 * `test-connection.ts`:
 *  - **200 `{ok:false}`** — the probe RAN and the CLI is not usable (missing,
 *    or reporting that it needs authentication). That verdict is the answer,
 *    so it is a value.
 *  - **5xx** — the probe itself could not run. There is no verdict to report.
 */
export const registerAdminAssistantTestAgentRoute: AssistantExecutionRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/assistant/execution/test-agent", async (req, res) => {
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

      const body = req.body as { agentId?: unknown; model?: unknown } | undefined;
      const agentId = String(body?.agentId ?? "").trim();
      if (!agentId) {
        res.status(400).json({ error: "'agentId' is required", code: "BAD_REQUEST" });
        return;
      }
      const model = String(body?.model ?? "").trim();

      const agents = await detectAgents();
      const agent = agents.find((candidate) => candidate.id === agentId);

      if (!agent || !agent.available) {
        res.json({ ok: false, message: `'${agentId}' was not found on this server's PATH.` });
        return;
      }

      // Branch logic (installed/authenticated/model-mismatch/success) lives in
      // `resolveTestAgentOutcome` — a pure function so it can be unit-tested against fabricated
      // `DetectedAgent` objects instead of depending on which CLIs happen to be installed and
      // authenticated on the host running the suite. See that file's doc for why.
      res.json(resolveTestAgentOutcome(agent, model));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
