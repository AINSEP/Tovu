import { containAgentPluginStatePath } from "#src/features/agent-plugins/lifecycle";
import type { Request, Response } from "express";

import { pluginMemory } from "#src/features/agent-plugins/memory";
import { listInstalledPlugins } from "../../../../../features/agent-plugins/lifecycle.js";
import { DEFAULT_PLUGIN_MEMORY_LIMITS } from "@jini-ai/agent-plugins/persistent-state";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "./deps.js";

/** A note write: exactly `entryPath` and `text`, both strings. */
interface NoteWrite {
  readonly entryPath: string;
  readonly text: string;
}

/**
 * True only for an object whose keys are exactly `entryPath` and `text`, both strings.
 * @complexity O(k) in the body's key count.
 */
function isNoteWrite(body: unknown): body is NoteWrite {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (Object.keys(body).some(key => key !== "entryPath" && key !== "text")) return false;
  if (!("entryPath" in body) || typeof body.entryPath !== "string") return false;
  return "text" in body && typeof body.text === "string";
}

/**
 * Validates and writes one user note, answering the refusal itself.
 * @returns false when a refusal was sent.
 * @complexity O(k) validation plus one note write.
 */
async function writeNoteOrRespond(required: { body: unknown; memory: ReturnType<typeof pluginMemory>; res: Response }): Promise<boolean> {
  const { body, memory, res } = required;
  if (!isNoteWrite(body)) {
    res.status(400).json({ error: "entryPath and text are required", code: "VALIDATION_ERROR" }); return false;
  }
  try { await memory.writeNote({ entryPath: body.entryPath, text: body.text }); }
  catch { res.status(422).json({ error: "note path, text or size is invalid", code: "PLUGIN_MEMORY_INVALID" }); return false; }
  return true;
}

/** @complexity O(p) in installed plugin count. */
async function isInstalled(deps: AgentPluginsRouteDeps, pluginId: string): Promise<boolean> {
  const workspace = deps.agentPluginLayout.forWorkspace(deps.workspaceId);
  return (await listInstalledPlugins(workspace.root)).some(plugin => plugin.pluginId === pluginId);
}

/** The user's notes editor writes notes only; learned knowledge stays separately readable. */
export const registerAgentPluginMemoryRoutes: AgentPluginsRouteRegistrar = (app, deps) => {
  const url = "/api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId/memory";
  const handle = (write: boolean) => async (req: Request, res: Response) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id,
        permission: write ? "admin.plugins.enable" : "admin.plugins.read", workspaceId: deps.workspaceId }))) return;
      const pluginId = String(req.params.pluginId);
      if (!(await isInstalled(deps, pluginId))) {
        res.status(404).json({ error: "agent plugin was not found", code: "AGENT_PLUGIN_NOT_FOUND" }); return;
      }
      const memory = pluginMemory({ contain: containAgentPluginStatePath, workspaceId: deps.workspaceId, pluginId }, { layout: deps.agentPluginLayout });
      if (write && !(await writeNoteOrRespond({ body: req.body, memory, res }))) return;
      const [learned, notes] = await Promise.all([memory.list({ kind: "learned" }), memory.list({ kind: "notes" })]);
      res.json({ pluginId, learned, notes, limits: DEFAULT_PLUGIN_MEMORY_LIMITS });
    } catch { res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" }); }
  };
  app.get(url, handle(false));
  app.put(url, handle(true));
};
