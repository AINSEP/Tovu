import { createProviderStatusTools } from '@jini-ai/agent-plugins/lifecycle/host-tools';
import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';
export { PROVIDER_STATUS_TOOL_ID } from '@jini-ai/agent-plugins/lifecycle/host-tools';
export type { ProviderStatusRow, ProviderStatusPorts, ProviderSettingFieldProjection } from '@jini-ai/agent-plugins/lifecycle/host-tools';
const authorization = { permission: 'admin.plugins.read' };
const messages = {
  description: "Read-only status of provider plugins (product analytics, error tracking, observability/tracing): for each, pluginId, enabled, configured (every required setting has a value), missing (labels of required settings without one), store (site = this site's own key; project = a key saved in your project), usedByThisSite (false = saved but not used here; ask before project_key_use), keyId, usedBy, appliesAt (now; restart when the provider cannot re-start live; failed when it could not start with the saved settings), unreadable (saved but cannot be opened on this machine; enter it again) and quarantine (the host's reason, when it switched the plugin off). Returns fields from the manifest with required, requiredUnless, requiredWhen, options, defaults and hints; use these declarations to explain requirements. Never returns a saved setting value or secret. Pass pluginId for one plugin. When asked to show or open settings, call the returned settingsCard tool and input to open the human card. Requires " + authorization.permission + ".",
  pluginIdDescription: "Optional provider plugin id, e.g. from plugins_list.",
  unknownPlugin: ({ pluginId }: { pluginId: unknown }) => `No installed provider plugin '${String(pluginId)}'. Call provider_status without pluginId, or plugins_list.`,
  unexpectedInput: "provider_status takes only an optional pluginId.",
};
export const { providerStatusAgentToolCatalog, providerStatusDerivedRisk, buildProviderStatusRegistrations } = createProviderStatusTools({ metadata: toolMetadata, authorization, messages, catalogModule: 'features/plugin-runtime/provider-status-tool.ts' });
