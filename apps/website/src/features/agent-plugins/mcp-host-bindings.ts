/** Compatibility wiring only: all projections/errors remain the canonical store's functions. */
import { externalMcpAccessSnapshot, externalMcpAdmissionRevision, readExternalMcpToolGrants, validateExternalMcpToolNames, ExternalMcpValidationError } from '../../contracts/core/external-mcp-access.js';
import { externalMcpRecordHasStaticAccessToken, resolveExternalMcpOAuthStatus } from '../../contracts/core/external-mcp-auth.js';
import { ExternalMcpSecretStoreUnconfiguredError } from '../external-mcp/external-mcp-store.js';
import { OAuthError } from '../../platform/oauth/errors.js';
import type { AgentPluginMcpContext, AgentPluginMcpProjectionPorts, AgentPluginMcpProjections } from './service-ports.js';

export const agentPluginMcpProjections: AgentPluginMcpProjections = {
  accessSnapshot: externalMcpAccessSnapshot, admissionRevision: externalMcpAdmissionRevision,
  readToolGrants: readExternalMcpToolGrants, validateToolNames: validateExternalMcpToolNames,
  oauthStatus: resolveExternalMcpOAuthStatus, hasStaticAccessToken: externalMcpRecordHasStaticAccessToken,
};
export function classifyAgentPluginMcpError({ error }: { error: unknown }, _optional: Record<string, never> = {}): 'validation' | 'unconfigured' | 'other' {
  if (error instanceof ExternalMcpValidationError) return 'validation';
  return error instanceof ExternalMcpSecretStoreUnconfiguredError ? 'unconfigured' : 'other';
}
/** Tovu's canonical pair, bound whole. Only legacy Tovu entry signatures that receive no ports use it. */
export const agentPluginMcpProjectionPorts: AgentPluginMcpProjectionPorts = { projections: agentPluginMcpProjections, classifyError: classifyAgentPluginMcpError };
/** Bind a host MCP port's pair once per binding/factory. Ports carrying projections keep both
 * (function and error identity); only an old Tovu port without them gets Tovu's canonical
 * projections, keeping its own classifier as before. O(1), no I/O. */
export function agentPluginMcpPortsOf(context: AgentPluginMcpContext, _optional: Record<string, never> = {}): AgentPluginMcpProjectionPorts {
  if (context.projections) return { projections: context.projections, classifyError: context.classifyError };
  return { projections: agentPluginMcpProjections, classifyError: context.classifyError ?? classifyAgentPluginMcpError };
}
/** Discovery refusal and canonical OAuth errors both mean no card opened. Unknown faults propagate. */
export function isAgentPluginSignInRefusal({ error }: { error: unknown }, _optional: Record<string, never> = {}): boolean {
  return error instanceof ExternalMcpValidationError || error instanceof OAuthError;
}
