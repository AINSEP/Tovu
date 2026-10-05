import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  ToolInputError,
  type AgentToolDefinition,
  type DerivedRiskByToolId,
  type ToolRegistration,
} from "@jini-ai/core";

import type { ToolContributor } from "#src/assistant/index";
import { PluginInstallError, sitePluginLocalInstallEnabled, type PluginInstallInput, type PluginInstallPreview } from "./install.js";
import { MAX_PLUGIN_ARCHIVE_BYTES } from "./install-archive.js";
import { pluginInstallRiskSentence } from "./install-consent.js";
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
 *
 * No confirmation card (owner, 2026-10-05: only permanent deletes ask first; it shipped with one in
 * 444e9dfca and was dropped the same day). The digest pin still matters without a human in between:
 * it refuses bytes swapped between the inspection and the write. The trust disclosure the card showed
 * (`install-consent.ts`, which the CLI prompt still uses) comes back as the result's `warning`.
 *
 * Its own domain and module (not a 4th entry in `agent-tools.ts`'s catalog): installing writes
 * third-party code to disk, a different blast radius from enable/uninstall, and the risk map is
 * keyed per tool id. Installing never turns the plugin on — `plugins_set_enabled` does that. Agent Plugins have no admin install path today, so this tool does not take
 * a `family`.
 */

export type PluginsInstallToolDeps = Pick<PluginsToolDeps, "workspaceId" | "authorize" | "pluginInstaller"> & {
  /** Defaults to `process.env`; read per call so the switch matches the admin route's. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export const PLUGINS_INSTALL_TOOL_ID = "plugins_install";

const SOURCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "path"],
  properties: {
    kind: { type: "string", enum: ["folder", "zip"], description: "'folder' for an unpacked plugin folder (it holds tovu.plugin.json), 'zip' for a .zip of one." },
    path: { type: "string", minLength: 1, description: "ABSOLUTE path on the machine Tovu runs on, e.g. /Users/me/plugins/my-plugin. Expand ~ yourself; relative paths are refused." },
  },
} as const;

export const catalog: AgentToolDefinition[] = [{
  name: PLUGINS_INSTALL_TOOL_ID,
  description:
    "Installs a SITE plugin (.tovu-plugin, the kind content_read.plugin lists) from a local folder or .zip on the machine Tovu runs on. " +
    "Use when the user asks to install or add a plugin from a folder or zip. The package is inspected and an invalid one is refused before " +
    "anything is written; the result names its trust tier and carries a warning saying whether it runs code — tell the user. Set replace:true to replace an installed version (refused while that plugin is on). The plugin is " +
    "installed OFF in every workspace — turn it on afterwards with plugins_set_enabled (family 'site-runtime'). Refused unless the server " +
    "was started with TOVU_PLUGIN_LOCAL_INSTALL=1 (the same opt-in the admin Install Plugin dialog needs). Does not install Agent Plugins, " +
    "themes or skills, and does not download anything.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: "admin.plugins.enable" },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["source"],
    properties: {
      source: SOURCE_SCHEMA,
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

interface InstallRequest { readonly kind: "folder" | "zip"; readonly path: string; readonly replace: boolean }

/** @complexity O(1). */
function readInstallRequest(rawInput: unknown): InstallRequest {
  const input = requireInputRecord({ input: rawInput });
  const source = input.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new ToolInputError({ message: "'source' is required: { kind: 'folder' | 'zip', path: '<absolute path>' }." });
  const { kind, path: sourcePath } = source as Record<string, unknown>;
  if (kind !== "folder" && kind !== "zip") throw new ToolInputError({ message: "source.kind must be 'folder' or 'zip'." });
  if (typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)) throw new ToolInputError({ message: "source.path must be an absolute path on the machine Tovu runs on (expand ~ first)." });
  if (input.replace !== undefined && typeof input.replace !== "boolean") throw new ToolInputError({ message: "replace must be a boolean." });
  return { kind, path: sourcePath, replace: input.replace === true };
}

/** The admin ZIP route's upload limit, applied before the bytes are read. @complexity O(file bytes). */
async function installerInput(request: InstallRequest): Promise<PluginInstallInput> {
  if (request.kind === "folder") return { sourceDir: request.path, replace: request.replace };
  let size: number;
  try { size = (await stat(request.path)).size; } catch { throw new ToolInputError({ message: `No readable ZIP at ${request.path}.` }); }
  if (size > MAX_PLUGIN_ARCHIVE_BYTES) throw new ToolInputError({ message: "ZIP exceeds the 32 MiB upload limit." });
  return { archive: await readFile(request.path), replace: request.replace };
}

/** An installer refusal after the preview (lost race, busy lock, changed bytes) is relayable, not a crash. */
function refusedResult(error: PluginInstallError, pluginId: string): unknown {
  const retry = error.code === "PLUGIN_CHANGED_SINCE_PREVIEW" ? " Call plugins_install again to install what is there now." : "";
  return { installed: false, pluginId, reason: error.code, note: `Nothing was installed: ${error.message}${retry}` };
}

/**
 * Order is load-bearing: authorize -> parse -> opt-in gate -> preview -> install with the previewed
 * digest. Preview runs first so an invalid package is refused before anything is written.
 * @complexity O(package bytes) twice (preview and install each inspect).
 */
export function buildRegistrations(deps: PluginsInstallToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({
    domain: "plugins-install",
    catalogModule: "features/plugin-runtime/install-tool.ts",
    catalog: indexCatalogById({ catalog }),
    derivedRisk,
    handlers: {
      [PLUGINS_INSTALL_TOOL_ID]: async (ctx) => {
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.plugins.enable" }, { entityType: "plugin" });
        const request = readInstallRequest(ctx.input);
        if (!sitePluginLocalInstallEnabled({ env: deps.env ?? process.env }) || !deps.pluginInstaller) {
          return { installed: false, reason: "PLUGIN_LOCAL_INSTALL_DISABLED", note: "Nothing was installed: local plugin installs are off on this server. The owner has to start Tovu with TOVU_PLUGIN_LOCAL_INSTALL=1 first." };
        }
        const input = await installerInput(request);
        let preview: PluginInstallPreview;
        try { preview = await deps.pluginInstaller.preview(input); }
        catch (error) { if (error instanceof PluginInstallError) throw new ToolInputError({ message: `${error.code}: ${error.message}` }); throw error; }
        try {
          const plugin = await deps.pluginInstaller.install({ ...input, expectedDigest: preview.digest });
          return {
            installed: true, enabled: false,
            plugin: { id: plugin.id, name: plugin.name, version: plugin.version, tier: plugin.tier, ...(plugin.upgradeFrom ? { upgradeFrom: plugin.upgradeFrom } : {}) },
            warning: pluginInstallRiskSentence({ preview: plugin }),
            note: `Installed ${plugin.name} ${plugin.version}. It is OFF in every workspace; turn it on with plugins_set_enabled (family 'site-runtime') if the user wants it on.`,
          };
        } catch (error) {
          if (error instanceof PluginInstallError) return refusedResult(error, preview.id);
          throw error;
        }
      },
    },
  });
}

/** Contributes `plugins_install` as its own domain — see this file's header. */
export function contributePluginsInstallTools(): ToolContributor {
  return { domain: "plugins-install", build: buildRegistrations, risk: derivedRisk };
}
