import { pluginMemory } from "#src/features/agent-plugins/memory";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { listInstalledPlugins } from "../../../../../features/agent-plugins/lifecycle.js";
import { DEFAULT_PLUGIN_MEMORY_LIMITS } from "@jini-ai/agent-plugins/persistent-state";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteRegistrar } from "./deps.js";

/** The user's notes editor writes notes only; learned knowledge stays separately readable. */
export const registerAgentPluginMemoryRoutes: AgentPluginsRouteRegistrar = (app, deps) => {
  const url = "/api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId/memory";
  const handle = (write: boolean) => async (req: import("express").Request, res: import("express").Response) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id,
        permission: write ? "admin.plugins.enable" : "admin.plugins.read", workspaceId: deps.workspaceId }))) return;
      const pluginId = String(req.params.pluginId);
      const workspace = resolveAgentPluginLayout().forWorkspace(deps.workspaceId);
      if (!(await listInstalledPlugins(workspace.root)).some(plugin => plugin.pluginId === pluginId)) {
        res.status(404).json({ error: "agent plugin was not found", code: "AGENT_PLUGIN_NOT_FOUND" }); return;
      }
      const memory = pluginMemory({ workspaceId: deps.workspaceId, pluginId });
      if (write) {
        const body: unknown = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).some(key => key !== "entryPath" && key !== "text") ||
          !("entryPath" in body) || typeof body.entryPath !== "string" || !("text" in body) || typeof body.text !== "string") {
          res.status(400).json({ error: "entryPath and text are required", code: "VALIDATION_ERROR" }); return;
        }
        try { await memory.writeNote({ entryPath: body.entryPath, text: body.text }); }
        catch { res.status(422).json({ error: "note path, text or size is invalid", code: "PLUGIN_MEMORY_INVALID" }); return; }
      }
      const [learned, notes] = await Promise.all([memory.list({ kind: "learned" }), memory.list({ kind: "notes" })]);
      res.json({ pluginId, learned, notes, limits: DEFAULT_PLUGIN_MEMORY_LIMITS });
    } catch { res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" }); }
  };
  app.get(url, handle(false));
  app.put(url, handle(true));
};
