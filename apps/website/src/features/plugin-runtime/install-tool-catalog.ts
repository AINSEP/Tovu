import type { AgentToolDefinition } from '@jini-ai/core';
import { PLUGIN_INSTALL_SOURCE_SCHEMA } from '#src/contracts/headless/index';

export const PLUGINS_INSTALL_TOOL_ID = "plugins_install";


export const catalog: AgentToolDefinition[] = [{
  name: PLUGINS_INSTALL_TOOL_ID,
  description:
    "Installs a SITE plugin (.tovu-plugin, the kind content_read.plugin lists) from a local folder or .zip on the machine Tovu runs on, or a chat ZIP source.attachmentRef (get it from chat_list_pending_attachments). " +
    "Use when the user asks to install or add a plugin from a folder or zip. The package is inspected and an invalid one is refused before " +
    "anything is written; the result names its trust tier and carries a warning saying whether it runs code — tell the user. Set replace:true to replace an installed version (refused while that plugin is on). The plugin is " +
    "installed OFF in every workspace — turn it on afterwards with plugins_set_enabled (family 'site-runtime'). Hosted servers refuse installs " +
    "without TOVU_PLUGIN_LOCAL_INSTALL=1; desktop and dev sites install directly. To AUTHOR a site plugin use plugin_source_create/open, write/edit files, seal, then enable. Does not install Agent Plugins, " +
    "themes or skills, and does not download anything.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: "admin.plugins.enable" },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["source"],
    properties: {
      source: PLUGIN_INSTALL_SOURCE_SCHEMA,
      replace: { type: "boolean", description: "true to replace an installed version of the same plugin id. Default false." },
    },
  },
}];
