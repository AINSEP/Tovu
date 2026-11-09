/** Request/attachment custody, per-call deployment policy and telemetry stay with the host. */
import { sitePluginLocalInstallEnabled } from './install.js';
import { MAX_PLUGIN_ARCHIVE_BYTES } from './install-archive.js';
import { pluginInstallRiskSentence } from './install-consent.js';
import { readPluginInstallRequest, readPluginInstallArchive } from './install-source.js';
import { catalog, PLUGINS_INSTALL_TOOL_ID, type PluginsInstallToolDeps } from './install-tool.js';
import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';
import { pluginInstallMessages } from './plugin-tool-messages.js';
import type { PluginInstallRequest } from '#src/contracts/headless/index';
import type { PluginInstallToolsRequired } from '@jini-ai/plugins/host/tools';
export function bindPluginInstallTools(deps: PluginsInstallToolDeps): PluginInstallToolsRequired<PluginInstallRequest> {
  return {
    registration: { domain: 'plugins-install', catalogModule: 'features/plugin-runtime/install-tool.ts', catalog, metadata: toolMetadata },
    workspaceId: deps.workspaceId, get authorize() { return deps.authorize; }, toolId: PLUGINS_INSTALL_TOOL_ID, permission: 'admin.plugins.enable', entityType: 'plugin',
    parseRequest: readPluginInstallRequest, installer: deps.pluginInstaller, riskSentence: pluginInstallRiskSentence, messages: pluginInstallMessages,
    localInstallEnabled: () => deps.pluginSourcePolicy?.localInstallEnabled({}, {}) ?? sitePluginLocalInstallEnabled({ env: deps.env ?? process.env, hostSignals: deps.hostSignals }),
    installInput: async ({ request, ownerId, runId }) => request.kind === 'folder' ? { sourceDir: request.path!, replace: request.replace }
      : { archive: await readPluginInstallArchive({ request, ownerId, runId, maxBytes: MAX_PLUGIN_ARCHIVE_BYTES }, { readAttachment: deps.readInstallAttachment }), replace: request.replace },
    telemetry: { installed: ({ principalId, pluginId }) => deps.tracker?.capture({ name: 'plugin_installed', userId: principalId }, { properties: { pluginId, pluginKind: 'cms', source: 'assistant' } }),
      installFailed: ({ principalId, reasonClass }) => deps.tracker?.capture({ name: 'operation_failed', userId: principalId }, { properties: { operationKind: 'plugin_install', reasonClass, surface: 'assistant', retryable: false } }) },
  };
}
