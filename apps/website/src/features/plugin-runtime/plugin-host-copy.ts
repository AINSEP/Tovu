/**
 * @file The host's product copy for the plugin runtime's model-facing text, bound once.
 *
 * The catalogs, messages and capability card live in `@jini-ai/plugins/runtime/*` and name no
 * product; the product name, the site-plugin package format, the local-install switch, the
 * install-source schema, the plugin list tool and the Plugins admin path are this host's, so they are passed in here and
 * every tool binding and test reads the bound values from this module.
 */
import type { PluginHostCopy } from "@jini-ai/plugins/runtime/plugin-host-copy";
import { createPluginAgentToolCatalog } from "@jini-ai/plugins/runtime/agent-tools";
import { createPluginSourceAgentToolCatalog } from "@jini-ai/plugins/runtime/source-tool-catalog";
import { createInstallToolCatalog } from "@jini-ai/plugins/runtime/install-tool-catalog";
import { createPluginInstallMessages, createPluginToolMessages } from "@jini-ai/plugins/runtime/plugin-tool-messages";
import { createCapabilityCard } from "@jini-ai/plugins/runtime/capability-card";
import { PLUGIN_INSTALL_SOURCE_SCHEMA } from "#src/contracts/headless/index";

export const PLUGIN_HOST_COPY: PluginHostCopy = {
  productName: "Tovu",
  sitePluginFormat: ".tovu-plugin",
  localInstallEnv: "TOVU_PLUGIN_LOCAL_INSTALL",
  pluginListToolName: "content_read.plugin",
};

export const pluginAgentToolCatalog = createPluginAgentToolCatalog({ copy: PLUGIN_HOST_COPY });
export const pluginSourceAgentToolCatalog = createPluginSourceAgentToolCatalog({ copy: PLUGIN_HOST_COPY });
export const pluginsInstallCatalog = createInstallToolCatalog({ copy: PLUGIN_HOST_COPY, installSourceSchema: PLUGIN_INSTALL_SOURCE_SCHEMA });
export const pluginToolMessages = createPluginToolMessages({ copy: PLUGIN_HOST_COPY });
export const pluginInstallMessages = createPluginInstallMessages({ copy: PLUGIN_HOST_COPY });
export const capabilityCard = createCapabilityCard({ pluginsAdminHref: "/admin/addons/plugins", pluginListToolName: PLUGIN_HOST_COPY.pluginListToolName });
