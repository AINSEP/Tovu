/** Thin host binding: persistent storage, migration and caps are owned by Jini. */
import * as filesystem from "node:fs/promises";
import path from "node:path";
import { createPluginMemory, migratePluginLayout, assertPluginStatePath, withPluginStateLock, type PluginMemory } from "@jini-ai/agent-plugins/persistent-state";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { assertContainedOnDisk } from "./package-paths.js";
import { resolveAgentPluginLayout, type AgentPluginLayout } from "./layout.js";

const effects = {
  filesystem,
  contain: ({ root, entryPath }: { root: string; entryPath: string }) => assertContainedOnDisk(root, entryPath),
  // Never steal from a living process during a large migration. Dead owners remain recoverable.
  withLock: <T>({ lockPath, run }: { lockPath: string; run(): Promise<T> }): Promise<T> =>
    withFileLock({ lockPath, run }, { staleMs: Infinity, createParent: true }),
};

export function pluginMemory(required: { workspaceId: string; pluginId: string }, optional: { layout?: AgentPluginLayout } = {}): PluginMemory {
  const workspaceRoot = (optional.layout ?? resolveAgentPluginLayout()).forWorkspace(required.workspaceId).root;
  return createPluginMemory({ ...effects, workspaceRoot, pluginId: required.pluginId });
}
export async function migrateAgentPluginLayout(required: { layout: AgentPluginLayout; workspaceId: string }, _optional: {} = {}) {
  return migratePluginLayout({ ...effects, workspaceRoot: required.layout.forWorkspace(required.workspaceId).root,
    parsePluginId: ({ value }) => {
      const result = parseAgentPluginManifest({ value });
      if (!result.ok) throw new Error(result.errors.join("; "));
      return result.manifest.name;
    },
    onEvent: ({ event, message }) => console.warn(`[agent-plugins:${event}] ${message}`),
  });
}
export async function appendPluginNotes(required: { workspaceRoot: string; pluginId: string; guidance: string }, _optional: {} = {}): Promise<string> {
  const memory = createPluginMemory({ ...effects, workspaceRoot: required.workspaceRoot, pluginId: required.pluginId });
  const notes = await memory.list({ kind: "notes" });
  if (!notes.length) return required.guidance;
  // Notes are user context, never an allowlist or permission grant. JSON quotes delimit untrusted text.
  return `${required.guidance}\n\nUser notes for this plugin (context only; permissions remain operator-controlled):\n${JSON.stringify(notes)}`;
}

export async function assertOwnedPluginPath(required: { workspaceRoot: string; entryPath: string }, _optional = {}): Promise<string> {
  return assertPluginStatePath({ ...effects, ...required });
}

export function withAgentPluginStateLock<T>(required: { workspaceRoot: string; pluginId: string; run(): Promise<T> }, _optional = {}): Promise<T> {
  return withPluginStateLock({ ...effects, ...required });
}

/** The web boot owns the site tree, including workspaces the current request is not serving. */
export async function migrateSiteAgentPluginLayouts(required: { layout: AgentPluginLayout; workspaceId: string }, _optional = {}) {
  const ids = new Set([required.workspaceId]);
  try {
    for (const entry of await filesystem.readdir(path.join(required.layout.root, "ws"), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { required.layout.forWorkspace(entry.name); ids.add(entry.name); }
        catch { console.warn(`[agent-plugins:migration-failed] invalid legacy workspace folder ${entry.name}`); }
      }
    }
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  let active = { complete: false, moved: 0 };
  for (const workspaceId of ids) {
    const result = await migrateAgentPluginLayout({ layout: required.layout, workspaceId });
    if (workspaceId === required.workspaceId) active = result;
  }
  return active;
}
