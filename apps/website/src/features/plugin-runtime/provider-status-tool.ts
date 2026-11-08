import { createProviderStatusTools } from '@jini-ai/agent-plugins/lifecycle/host-tools';
import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';
export { PROVIDER_STATUS_TOOL_ID } from '@jini-ai/agent-plugins/lifecycle/host-tools';
export type { ProviderStatusRow, ProviderStatusPorts, ProviderSettingFieldProjection } from '@jini-ai/agent-plugins/lifecycle/host-tools';
export const { providerStatusAgentToolCatalog, providerStatusDerivedRisk, buildProviderStatusRegistrations } = createProviderStatusTools({ metadata: toolMetadata, authorization: { permission: 'admin.plugins.read' } });
