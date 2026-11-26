import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
/** Thin host binding: persistent storage, migration and caps are owned by Jini. */
import * as filesystem from "node:fs/promises";
import path from "node:path";
import { bindAgentPluginMemory } from "@jini-ai/agent-plugins/site/plugin-memory";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "./identity-read-policy.js";

export const {
  pluginMemory, migrateAgentPluginLayout, withAgentPluginWorkspaceLock, appendPluginNotes,
  assertOwnedPluginPath, withAgentPluginStateLock, migrateSiteAgentPluginLayouts, migrateSiblingAgentPluginLayouts,
} = bindAgentPluginMemory({
  filesystem,
  // Never steal from a living process during a large migration. Dead owners remain recoverable.
  withLock: ({ lockPath, run }) =>
    withFileLock({ lockPath, run }, { staleMs: Infinity, createParent: true }),
  workspaceDirectory: ({ layout }) => path.join(layout.root, "ws"),
  parseManifest: required => parseAgentPluginManifest(required, TOVU_AGENT_PLUGIN_IDENTITY_READ),
  onEvent: ({ event, message }) => console.warn(`[agent-plugins:${event}] ${message}`),
  invalidWorkspace: ({ workspaceId, error }) => console.warn(`[agent-plugins:migration-failed] invalid legacy workspace folder ${workspaceId} ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`),
  siblingFailure: ({ workspaceId, error }) => console.warn(`[agent-plugins:migration-failed] workspace ${workspaceId} ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`),
});
