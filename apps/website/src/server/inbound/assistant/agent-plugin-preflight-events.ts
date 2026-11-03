/** Site-owned plugin consent/state events enter only the daemon's live, principal-bound log. */
import { json, type Express } from "express";
import type { RunLifecycle } from "@jini-ai/daemon";
import { isTerminalRunState, type RunAgentPayload } from "@jini-ai/protocol";
import { z } from "zod";
import { requireAgentDaemonToken } from "#src/assistant/daemon-access";

const pluginEvent = z.object({
  runId: z.string().min(1), principalId: z.string().min(1),
  payload: z.object({ type: z.enum(["mcp-ui", "a2ui", "user_message", "agent_plugins"]) }).passthrough(),
}).strict();

/** Mount before the public parser; only the full server credential can append plugin events.
 * The bridge credential cannot reach this path. Bodies are bounded and a terminal/foreign run
 * always fails closed. The server remains the consent owner; this only appends its wire payload.
 * @complexity O(payload bytes), bounded to 1 MiB; one indexed lifecycle/owner lookup.
 * @example registerAgentPluginEvents({ app, lifecycle, principalFor });
 */
export function registerAgentPluginEvents({ app, lifecycle, principalFor }: {
  app: Express; lifecycle: Pick<RunLifecycle, "get" | "emit">;
  principalFor: (required: { runId: string }) => string | undefined;
}, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): void {
  app.post("/internal/agent-plugin-events", requireAgentDaemonToken({ env }, {}), json({ limit: "1mb" }), (req, res, next) => {
    const parsed = pluginEvent.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid plugin event" }); return; }
    const { runId, principalId, payload } = parsed.data;
    void (async () => {
      const run = await lifecycle.get({ runId });
      if (!run || isTerminalRunState({ state: run.state }) || principalFor({ runId }) !== principalId) {
        res.status(404).json({ error: "a live owning run is required" }); return;
      }
      await lifecycle.emit({ runId, input: { event: "agent", data: payload as RunAgentPayload } });
      res.status(202).end();
    })().catch(next);
  });
}
