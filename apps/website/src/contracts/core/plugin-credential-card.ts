import { buildPluginCredentialForm as build, applyPluginCredentialCard as apply } from '@jini-ai/ui/mcp-ui/credential-card';
import type { SecretCardForm } from '@jini-ai/ui/mcp-ui/secret-card';
import type { PluginCredentialCard } from '@jini-ai/core/contracts/credentials';
export type { PluginCredentialCard, PluginCredentialField } from '@jini-ai/core/contracts/credentials';
const app = { appName: 'tovu-plugin-credential-card', appVersion: '1' };
export function buildPluginCredentialForm(required: { card: PluginCredentialCard }, optional = {}): SecretCardForm & { preferredFrameSize: readonly [string, string] } {
  return build({ ...required, app }, optional);
}
export function applyPluginCredentialCard(required: { card?: PluginCredentialCard; form: SecretCardForm }, optional = {}): SecretCardForm {
  return apply({ ...required, app }, optional);
}
