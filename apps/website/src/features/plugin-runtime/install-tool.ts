import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';

import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import {
  buildDomainRegistrations,
  indexCatalogById,
  ToolInputError,
  type AgentToolDefinition,
  type DerivedRiskByToolId,
  type ToolRegistration,
} from "@jini-ai/core";

import type { ToolContributor } from "@jini-ai/core";
import { PluginInstallError, type PluginInstallerPort, type PluginInstallInput, type PluginInstallPreview } from "@jini-ai/plugins/host/node";
import { sitePluginLocalInstallEnabled } from "./install.js";
import { MAX_PLUGIN_ARCHIVE_BYTES } from "./install-archive.js";
import { pluginInstallRiskSentence } from "./install-consent.js";
import { PLUGIN_INSTALL_SOURCE_SCHEMA, readPluginInstallRequest, readPluginInstallArchive, type InstallAttachmentReader, type PluginInstallRequest } from "./install-source.js";
import type { PluginsToolDeps } from "./tool-registrations.js";

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

export const derivedRisk: DerivedRiskByToolId = new Map([
  // -> pluginInstaller.install (installSitePlugin): copies the package into the site's plugin
  //    directory (replacing a version on replace:true). Durable file writes; nothing is executed and
  //    no network is used. Uninstalling (plugins_uninstall) is the inverse.
  [PLUGINS_INSTALL_TOOL_ID, "mutates-durable-state"],
]);

/** An installer refusal after the preview (lost race, busy lock, changed bytes) is relayable, not a crash. */
function refusedResult(error: PluginInstallError, pluginId: string): unknown {
  const retry = error.code === "PLUGIN_CHANGED_SINCE_PREVIEW" ? " Call plugins_install again to install what is there now." : "";
  return { installed: false, pluginId, reason: error.code, note: `Nothing was installed: ${error.message}${retry}` };
}

/** The injected deployment policy decides; without one, the site environment does (read per call). */
function localInstallEnabled(required: { deps: PluginsInstallToolDeps }): boolean {
  const { deps } = required;
  return deps.pluginSourcePolicy?.localInstallEnabled({}, {}) ?? sitePluginLocalInstallEnabled({ env: deps.env ?? process.env });
}

/** A folder source passes its path; a ZIP source (local file or chat attachment) passes its bounded bytes. */
async function installInputFor(
  required: { request: PluginInstallRequest; ownerId: string; runId: string },
  optional: { readAttachment?: InstallAttachmentReader } = {},
): Promise<PluginInstallInput> {
  const { request, ownerId, runId } = required;
  if (request.kind === "folder") return { sourceDir: request.path!, replace: request.replace };
  const archive = await readPluginInstallArchive({ request, ownerId, runId, maxBytes: MAX_PLUGIN_ARCHIVE_BYTES }, optional);
  return { archive, replace: request.replace };
}

/** Inspects the package before anything is written; an installer refusal is the caller's input problem. */
async function previewOrRefuse(required: { installer: PluginInstallerPort; input: PluginInstallInput }): Promise<PluginInstallPreview> {
  try { return await required.installer.preview(required.input); }
  catch (error) {
    if (error instanceof PluginInstallError) throw new ToolInputError({ message: `${error.code}: ${error.message}` });
    throw error;
  }
}

/** What the model relays after a successful install; the plugin always lands OFF. */
function installedResult(required: { plugin: PluginInstallPreview }): unknown {
  const { plugin } = required;
  return {
    installed: true, enabled: false,
    plugin: { id: plugin.id, name: plugin.name, version: plugin.version, tier: plugin.tier, ...(plugin.upgradeFrom ? { upgradeFrom: plugin.upgradeFrom } : {}) },
    warning: pluginInstallRiskSentence({ preview: plugin }),
    note: `Installed ${plugin.name} ${plugin.version}. It is OFF in every workspace; turn it on with plugins_set_enabled (family 'site-runtime') if the user wants it on.`,
  };
}

/**
 * Order is load-bearing: authorize -> parse -> opt-in gate -> preview -> install with the previewed
 * digest. Preview runs first so an invalid package is refused before anything is written.
 * @complexity O(package bytes) twice (preview and install each inspect).
 */
export function buildRegistrations(deps: PluginsInstallToolDeps, _optional: Record<string, never> = {}): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "plugins-install",
    catalogModule: "features/plugin-runtime/install-tool.ts",
    catalog: indexCatalogById({ catalog }),
    derivedRisk,
    handlers: {
      [PLUGINS_INSTALL_TOOL_ID]: async (ctx) => {
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.plugins.enable" }, { entityType: "plugin" });
        const request = readPluginInstallRequest({ input: ctx.input });
        const installer = deps.pluginInstaller;
        if (!localInstallEnabled({ deps }) || !installer) {
          return { installed: false, reason: "PLUGIN_LOCAL_INSTALL_DISABLED", note: "Nothing was installed: local plugin installs are off on this server. The owner has to start Tovu with TOVU_PLUGIN_LOCAL_INSTALL=1 first." };
        }
        const input = await installInputFor({ request, ownerId: ctx.principal.id, runId: ctx.run.id }, { readAttachment: deps.readInstallAttachment });
        const preview = await previewOrRefuse({ installer, input });
        try {
          const plugin = await installer.install({ ...input, expectedDigest: preview.digest });
          deps.tracker?.capture({ name: "plugin_installed", userId: ctx.principal.id }, { properties: { pluginId: plugin.id, pluginKind: "cms", source: "assistant" } });
          return installedResult({ plugin });
        } catch (error) {
          deps.tracker?.capture({ name: "operation_failed", userId: ctx.principal.id }, { properties: { operationKind: "plugin_install", reasonClass: error instanceof PluginInstallError ? "refused" : "internal", surface: "assistant", retryable: false } });
          if (error instanceof PluginInstallError) return refusedResult(error, preview.id);
          throw error;
        }
      },
    },
  });
}

/** Contributes `plugins_install` as its own domain — see this file's header. */
export function contributePluginsInstallTools(required: { readInstallAttachment?: InstallAttachmentReader } = {}, _optional: Record<string, never> = {}): ToolContributor<PluginsInstallToolDeps, unknown> {
  return { domain: "plugins-install", build: deps => buildRegistrations({ ...deps, ...required }), risk: derivedRisk };
}
