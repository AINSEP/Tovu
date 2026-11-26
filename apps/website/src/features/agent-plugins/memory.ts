import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
/** Thin host binding: persistent storage, migration and caps are owned by Jini. */
import * as filesystem from "node:fs/promises";
import path from "node:path";
import { createPluginMemory, migratePluginLayout, assertPluginStatePath, withPluginStateLock, withWorkspaceMigrationLock, type PluginMemory, type PluginStateEffects, type WorkspaceMigrationOwnership } from "@jini-ai/agent-plugins/persistent-state";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import type { AgentPluginLayout } from "@jini-ai/core/contracts/headless/plugin-host";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "./identity-read-policy.js";

const effects = {
  filesystem,
  // Never steal from a living process during a large migration. Dead owners remain recoverable.
  withLock: <T>({ lockPath, run }: { lockPath: string; run(): Promise<T> }): Promise<T> =>
    withFileLock({ lockPath, run }, { staleMs: Infinity, createParent: true }),
};

export function pluginMemory(required: Pick<PluginStateEffects, "contain"> & { workspaceId: string; pluginId: string; layout: AgentPluginLayout }, _optional: Record<string, never> = {}): PluginMemory {
  const workspaceRoot = required.layout.forWorkspace({ workspaceId: required.workspaceId }).root;
  return createPluginMemory({ ...effects, contain: required.contain, workspaceRoot, pluginId: required.pluginId });
}
/** `ownership`: the caller holds this workspace's migration lock (`withAgentPluginWorkspaceLock`); run under it. */
export async function migrateAgentPluginLayout(required: Pick<PluginStateEffects, "contain"> & { layout: AgentPluginLayout; workspaceId: string }, optional: { ownership?: WorkspaceMigrationOwnership } = {}) {
  return migratePluginLayout({ ...effects, contain: required.contain, workspaceRoot: required.layout.forWorkspace({ workspaceId: required.workspaceId }).root,
    parsePluginId: ({ value }) => {
      const result = parseAgentPluginManifest({ value }, TOVU_AGENT_PLUGIN_IDENTITY_READ);
      if (!result.ok) throw new Error(result.errors.join("; "));
      return result.manifest.name;
    },
    onEvent: ({ event, message }) => console.warn(`[agent-plugins:${event}] ${message}`),
  }, optional.ownership ? { ownership: optional.ownership } : {});
}

/** Holds one workspace's layout-migration lock (the outermost lock; Jini owns the ordering) with this host's real file lock. */
export function withAgentPluginWorkspaceLock<T>(required: { workspaceRoot: string; run(held: { ownership: WorkspaceMigrationOwnership }): Promise<T> }, _optional = {}): Promise<T> {
  return withWorkspaceMigrationLock({ ...effects, ...required });
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
      try { required.layout.forWorkspace({ workspaceId: entry.name }); ids.add(entry.name); }
      catch (error) { console.warn(`[agent-plugins:migration-failed] invalid legacy workspace folder ${entry.name} ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`); }
    }
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  return ids;
}

/** The web boot owns the site tree, including workspaces the current request is not serving.
 * With `ownership` (the active workspace's lock is already held) only the active workspace migrates,
 * under that lock: its siblings ran first through {@link migrateSiblingAgentPluginLayouts}, because
 * holding one workspace's lock while acquiring another's could deadlock two boots. */
export async function migrateSiteAgentPluginLayouts(required: Pick<PluginStateEffects, "contain"> & { layout: AgentPluginLayout; workspaceId: string }, optional: { ownership?: WorkspaceMigrationOwnership } = {}) {
  if (optional.ownership) return migrateAgentPluginLayout({ contain: required.contain, layout: required.layout, workspaceId: required.workspaceId }, { ownership: optional.ownership });
  const ids = await discoverSiteWorkspaceIds(required);
  let active = { complete: false, moved: 0 };
  for (const workspaceId of ids) {
    const result = await migrateAgentPluginLayout({ contain: required.contain, layout: required.layout, workspaceId });
    if (workspaceId === required.workspaceId) active = result;
  }
  return active;
}

/** Migrates every other site workspace, one lock at a time and with no lock held across them. A
 * sibling's fault is logged and never blocks the active workspace's seed. */
export async function migrateSiblingAgentPluginLayouts(required: Pick<PluginStateEffects, "contain"> & { layout: AgentPluginLayout; workspaceId: string }, _optional = {}): Promise<void> {
  for (const workspaceId of await discoverSiteWorkspaceIds(required)) {
    if (workspaceId === required.workspaceId) continue;
    try { await migrateAgentPluginLayout({ contain: required.contain, layout: required.layout, workspaceId }); }
    catch (error) { console.warn(`[agent-plugins:migration-failed] workspace ${workspaceId} ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`); }
  }
}
