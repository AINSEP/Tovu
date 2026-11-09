/** Tovu compatibility shim (A10 seam). The portable card bodies live in `@jini-ai/agent-plugins/connect`
 * and take the card runtime, identity and product copy as required inputs; these entries keep their
 * original signatures and bind Tovu's UI builders, card identity and wording (bytes unchanged). */
import type { SurfaceCardOutcome as SurfaceOutcomeSpec, SurfaceCardSecretForm as SecretCardForm } from "@jini-ai/core/contracts/cards";
import type { PluginCredentialCard } from "@jini-ai/core/contracts/credentials";
import type { PluginCredentialsPort } from "./service-ports.js";
import { agentPluginCardHost } from "./card-host-bindings.js";
import {
  buildAgentPluginConnectCardWithPorts, buildAgentPluginAccessTokenFormWithPorts, buildAgentPluginAccessTokenOutcomeWithPorts,
  type AgentPluginConnectCardSpec, type AgentPluginAccessTokenFormMessages,
} from "@jini-ai/agent-plugins/connect";
export {
  buildAgentPluginConnectCardWithPorts, buildAgentPluginAccessTokenOutcomeWithPorts, resolveAgentPluginCardIdentity,
  type AgentPluginConnectCardSpec, type AgentPluginCardIdentity, type AgentPluginCredentialCardForms, type AgentPluginAccessTokenFormMessages,
} from "@jini-ai/agent-plugins/connect";

/** Tovu's token-form wording (bytes unchanged from the pre-seam body). */
export const tovuAccessTokenFormMessages: AgentPluginAccessTokenFormMessages = {
  description: ({ pluginDisplayName, helpUrl }) =>
    `Create a personal access token at ${helpUrl}, then paste it below. Tovu checks it with ` +
    `${pluginDisplayName} and seals it the moment you submit. The assistant never sees it, and it is never written to the chat.`,
};

/** Same host card signatures and bytes; new seams receive builders and identities explicitly. */
export function buildAgentPluginConnectCard(spec: AgentPluginConnectCardSpec, optional: Record<string, never> = {}) {
  return buildAgentPluginConnectCardWithPorts({ spec, cards: agentPluginCardHost.cards, identity: agentPluginCardHost.connect }, optional);
}
export function buildAgentPluginAccessTokenForm(spec: {
  readonly credentials: Pick<PluginCredentialsPort, "apply">; readonly pluginDisplayName: string; readonly helpUrl: string; readonly credentialCard?: PluginCredentialCard;
}, optional: Record<string, never> = {}): SecretCardForm {
  return buildAgentPluginAccessTokenFormWithPorts({ spec, app: agentPluginCardHost.token.formApp, messages: tovuAccessTokenFormMessages }, optional);
}
export function buildAgentPluginAccessTokenOutcome(spec: Parameters<typeof buildAgentPluginAccessTokenOutcomeWithPorts>[0]['spec'], optional: Record<string, never> = {}): SurfaceOutcomeSpec {
  return buildAgentPluginAccessTokenOutcomeWithPorts({ spec, app: agentPluginCardHost.token.outcomeApp }, optional);
}
