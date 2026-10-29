/** Thin host binding: persistent storage, migration and caps are owned by Jini. */
import * as filesystem from "node:fs/promises";
import path from "node:path";
import { createPluginMemory, migratePluginLayout, assertPluginStatePath, withPluginStateLock, type PluginMemory, type PluginStateEffects } from "@jini-ai/agent-plugins/persistent-state";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import type { AgentPluginLayout } from "./layout.js";

const effects = {
  filesystem,
  // Never steal from a living process during a large migration. Dead owners remain recoverable.
  withLock: <T>({ lockPath, run }: { lockPath: string; run(): Promise<T> }): Promise<T> =>
    withFileLock({ lockPath, run }, { staleMs: Infinity, createParent: true }),
};

export function pluginMemory(required: Pick<PluginStateEffects, "contain"> & { workspaceId: string; pluginId: string }, optional: { layout: AgentPluginLayout }): PluginMemory {
  const workspaceRoot = optional.layout.forWorkspace(required.workspaceId).root;
  return createPluginMemory({ ...effects, contain: required.contain, workspaceRoot, pluginId: required.pluginId });
}
export async function migrateAgentPluginLayout(required: Pick<PluginStateEffects, "contain"> & { layout: AgentPluginLayout; workspaceId: string }, _optional: {} = {}) {
  return migratePluginLayout({ ...effects, contain: required.contain, workspaceRoot: required.layout.forWorkspace(required.workspaceId).root,
    parsePluginId: ({ value }) => {
      const result = parseAgentPluginManifest({ value });
      if (!result.ok) throw new Error(result.errors.join("; "));
      return result.manifest.name;
    },
    onEvent: ({ event, message }) => console.warn(`[agent-plugins:${event}] ${message}`),
  });
}
export async function appendPluginNotes(required: Pick<PluginStateEffects, "contain"> & { workspaceRoot: string; pluginId: string; guidance: string }, _optional: {} = {}): Promise<string> {
  const memory = createPluginMemory({ ...effects, contain: required.contain, workspaceRoot: required.workspaceRoot, pluginId: required.pluginId });
  const notes = await memory.list({ kind: "notes" });
  if (!notes.length) return required.guidance;
  // Notes are user context, never an allowlist or permission grant. JSON quotes delimit untrusted text.
  return `${required.guidance}\n\nUser notes for this plugin (context only; permissions remain operator-controlled):\n${JSON.stringify(notes)}`;
}

export async function assertOwnedPluginPath(required: Pick<PluginStateEffects, "contain"> & { workspaceRoot: string; entryPath: string }, _optional = {}): Promise<string> {
  return assertPluginStatePath({ ...effects, ...required });
}

export function withAgentPluginStateLock<T>(required: Pick<PluginStateEffects, "contain"> & { workspaceRoot: string; pluginId: string; run(): Promise<T> }, _optional = {}): Promise<T> {
  return withPluginStateLock({ ...effects, ...required });
}

async function discoverSiteWorkspaceIds(required: Pick<PluginStateEffects, "contain"> & { layout: AgentPluginLayout; workspaceId: string }, _optional = {}) {
  const ids = new Set([required.workspaceId]);
  try {
    for (const entry of await filesystem.readdir(path.join(required.layout.root, "ws"), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try { required.layout.forWorkspace(entry.name); ids.add(entry.name); }
      catch { console.warn(`[agent-plugins:migration-failed] invalid legacy workspace folder ${entry.name}`); }
    }
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  return ids;
}

/** The web boot owns the site tree, including workspaces the current request is not serving. */
export async function migrateSiteAgentPluginLayouts(required: Pick<PluginStateEffects, "contain"> & { layout: AgentPluginLayout; workspaceId: string }, _optional = {}) {
  const ids = await discoverSiteWorkspaceIds(required);
  let active = { complete: false, moved: 0 };
  for (const workspaceId of ids) {
    const result = await migrateAgentPluginLayout({ contain: required.contain, layout: required.layout, workspaceId });
    if (workspaceId === required.workspaceId) active = result;
  }
  return active;
}
