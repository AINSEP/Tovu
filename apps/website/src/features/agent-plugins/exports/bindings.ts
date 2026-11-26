import { readFile } from "node:fs/promises";
import { createPluginExportSource as createWithPorts } from "@jini-ai/agent-plugins/site/exports/source";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/manifest";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "../identity-read-policy.js";

export const PLUGIN_EXPORT_FILES_PREFIX = "/api/agent-plugin-exports/v1";
export const createPluginExportSource = (required: Pick<Parameters<typeof createWithPorts>[0], "lifecycle">, _options = {}) => createWithPorts({
  ...required,
  parseAgentPluginManifest: input => parseAgentPluginManifest(input, TOVU_AGENT_PLUGIN_IDENTITY_READ),
  readAssetFile: readFile,
});
