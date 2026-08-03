import { detectAgents } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/public-assistant-settings";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps";

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
      if (agent.authStatus === "missing") {
        res.json({
          ok: false,
          message: agent.authMessage ?? `${agent.name} is installed but not authenticated.`,
        });
        return;
      }
      if (agent.authStatus === "unknown") {
        // Not a failure: the adapter declares no auth probe, or its probe
        // could not be classified. Saying "ready" would overstate what was
        // checked, so the message says exactly what was and was not verified.
        res.json({
          ok: true,
          message: `${agent.name} ${agent.version ?? ""}`.trim() + " responded, but its sign-in status could not be verified.",
        });
        return;
      }

      // The caller sends the operator's current per-agent model pick, so check
      // it. A saved selection survives a model list changing under it (the card
      // deliberately keeps a stale pick selectable rather than silently
      // snapping to another model), which means "the CLI is authenticated" and
      // "the model you chose still exists" are different questions. Answering
      // only the first with a green result would tell the operator a run will
      // work when it cannot.
      if (model && agent.models?.length && !agent.models.some((option) => option.id === model)) {
        res.json({
          ok: false,
          message:
            `${agent.name} is installed and authenticated, but it no longer offers the model '${model}'. ` +
            "Pick a different model, or Rescan to refresh the list.",
        });
        return;
      }

      res.json({
        ok: true,
        message:
          `${agent.name} ${agent.version ?? ""}`.trim() +
          (model ? ` is installed and authenticated, and offers '${model}'.` : " is installed and authenticated."),
      });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
