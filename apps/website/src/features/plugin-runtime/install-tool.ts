import type { AgentToolDefinition, ToolContributor, ToolRegistration } from '@jini-ai/core';
import type { PluginsToolDeps } from './tool-registrations.js';
import { PLUGIN_INSTALL_SOURCE_SCHEMA, type InstallAttachmentReader } from '#src/contracts/headless/index';
import { buildPluginInstallRegistrations, pluginInstallDerivedRiskFor } from './host-tools/install.js';
import { bindPluginInstallTools } from './install-tool-binding.js';


/**
 * @file `plugins_install` — the assistant's way to install a SITE plugin (`.tovu-plugin`, the family
 * `content_read.plugin` lists) from a folder or ZIP on the machine Tovu runs on.
 *
 * It calls the SAME `PluginInstallerPort` the admin Install Plugin dialog's routes call
 * (`routes/plugins/install.ts`, bound in `composition/plugin-runtime.ts`), in the same two steps:
 * preview (inspects bytes, computes the consent digest) -> install with `expectedDigest`, which
 * re-inspects and refuses a package that changed since the preview. The same
 * `TOVU_PLUGIN_LOCAL_INSTALL=1` opt-in gates it, and the same `admin.plugins.enable` permission.
 * Updated 2026-10-09: the injected deployment policy keeps that opt-in on hosted servers;
 * desktop/dev sites install directly. The permission and byte-digest ordering still apply.
 *
 * No confirmation card (owner 2026-10-07: ordinary installs run directly; trash/delete/publish ask; it shipped with one in
 * 444e9dfca and was dropped the same day). The digest pin still matters without a human in between:
 * it refuses bytes swapped between the inspection and the write. The trust disclosure the card showed
 * (`install-consent.ts`, which the CLI prompt still uses) comes back as the result's `warning`.
 *
 * Its own domain and module (not a 4th entry in `agent-tools.ts`'s catalog): installing writes
 * third-party code to disk, a different blast radius from enable/uninstall, and the risk map is
 * keyed per tool id. Installing never turns the plugin on — `plugins_set_enabled` does that. Agent Plugins use their own admin upload service and `agent_plugins_install` tool; this tool does not take a `family`.
 */

export type PluginsInstallToolDeps = Pick<PluginsToolDeps, "workspaceId" | "authorize" | "pluginInstaller" | "pluginSourcePolicy" | "tracker"> & {
  readonly hostSignals: import("../../contracts/core/host-signals.js").HostSignals;
  readonly readInstallAttachment?: InstallAttachmentReader;
  /** Defaults to `process.env`; read per call so the switch matches the admin route's. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};


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
export const derivedRisk = pluginInstallDerivedRiskFor({ toolId: PLUGINS_INSTALL_TOOL_ID });
export function buildRegistrations(deps: PluginsInstallToolDeps, _optional: Record<string, never> = {}): ToolRegistration[] { return buildPluginInstallRegistrations(bindPluginInstallTools(deps)); }


/** Contributes `plugins_install` as its own domain — see this file's header. */
export function contributePluginsInstallTools(required: { readInstallAttachment?: InstallAttachmentReader } = {}, _optional: Record<string, never> = {}): ToolContributor<PluginsInstallToolDeps, unknown> {
  return { domain: "plugins-install", build: deps => buildRegistrations({ ...deps, ...required }), risk: derivedRisk };
}
