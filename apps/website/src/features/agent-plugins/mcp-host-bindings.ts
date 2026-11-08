/** Compatibility wiring only: all projections/errors remain the canonical store's functions. */
import { externalMcpAccessSnapshot, externalMcpAdmissionRevision, readExternalMcpToolGrants, validateExternalMcpToolNames, ExternalMcpValidationError } from '../../contracts/core/external-mcp-access.js';
import { externalMcpRecordHasStaticAccessToken, resolveExternalMcpOAuthStatus } from '../../contracts/core/external-mcp-auth.js';
import { ExternalMcpSecretStoreUnconfiguredError } from '../external-mcp/external-mcp-store.js';
import { OAuthError } from '../../platform/oauth/errors.js';
import type { AgentPluginMcpContext, AgentPluginMcpProjectionPorts, AgentPluginMcpProjections, AgentPluginOAuthPort, AgentPluginSignInPort } from './service-ports.js';

export const agentPluginMcpProjections: AgentPluginMcpProjections = {
  accessSnapshot: externalMcpAccessSnapshot, admissionRevision: externalMcpAdmissionRevision,
  readToolGrants: readExternalMcpToolGrants, validateToolNames: validateExternalMcpToolNames,
  oauthStatus: resolveExternalMcpOAuthStatus, hasStaticAccessToken: externalMcpRecordHasStaticAccessToken,
};
export function classifyAgentPluginMcpError({ error }: { error: unknown }, _optional: Record<string, never> = {}): 'validation' | 'unconfigured' | 'other' {
  if (error instanceof ExternalMcpValidationError) return 'validation';
  return error instanceof ExternalMcpSecretStoreUnconfiguredError ? 'unconfigured' : 'other';
}
/** No I/O or cache: old signatures get the original functions; explicit host ports retain identity. */
export function resolveAgentPluginMcpPorts(required: AgentPluginMcpContext, _optional: Record<string, never> = {}): AgentPluginMcpProjectionPorts {
  return { projections: required.projections ?? agentPluginMcpProjections, classifyError: required.classifyError ?? classifyAgentPluginMcpError };
}
/** Discovery refusal and canonical OAuth errors both mean no card opened. Unknown faults propagate. */
export function isAgentPluginSignInRefusal({ error }: { error: unknown }, _optional: Record<string, never> = {}): boolean {
  return error instanceof ExternalMcpValidationError || error instanceof OAuthError;
}
export function resolveAgentPluginSignInPort(required: AgentPluginOAuthPort | AgentPluginSignInPort, _optional: Record<string, never> = {}): AgentPluginSignInPort {
  return { beginConnect: (input, options) => required.beginConnect(input, options),
    isSignInRefusal: ({ error }) => required.isSignInRefusal ? required.isSignInRefusal({ error })
      : ('isValidationError' in required && required.isValidationError({ error })) || error instanceof OAuthError,
  };
}
