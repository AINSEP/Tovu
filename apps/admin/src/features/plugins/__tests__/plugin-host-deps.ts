import * as folderZip from "@jini-ai/agent-plugins/folder-zip";
import { tPlugins } from "../../../lib/i18n-common";
import { defaultPluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import { isApiError, pluginRules } from "../rules";

/** The host collaborators Jini's plugin hooks take as required fields, bound as the product binds them. */
export const HOST_INSTALL = { isApiError, folderZip, rules: pluginRules };
export const HOST_AGENT_INSTALL = { isApiError, folderZip, rules: pluginRules, productName: "Tovu" };
export const HOST_PLUGINS = { ...HOST_INSTALL, translate: tPlugins, installPort: defaultPluginInstallPort };
