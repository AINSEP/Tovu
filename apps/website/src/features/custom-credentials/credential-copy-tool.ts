import { buildFormSurface } from "@jini-ai/ui/mcp-ui/surfaces";
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { createCredentialCopyRegistrations } from "@jini-ai/integrations/credentialed-http/tools";
export { createCredentialCopyRegistrations };
export type { CredentialCopyRequired } from "@jini-ai/integrations/credentialed-http/tools";
import { type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from '@jini-ai/core';
import type { AuthorizeFn } from '@jini-ai/cms/core';
import type { InstanceAuthorizeFn } from '@jini-ai/core/gated-mutations';

import { type AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';

import type { ProjectKeysPort } from '../project-keys/service.js';
import { toolMetadata } from '../../contracts/core/tool-metadata/custom-credentials.js';
import type { CredentialCopyToolHost } from './credential-tool-host.js';
import { tovuCredentialCardIdentity } from './tovu-credential-card-identity.js';

export const CREDENTIAL_COPY_TOOL_ID = 'credential_copy_from_project';
const NEW_KEY = ':new-key';

/** Trusted host ports: the owner inventory is rendered only inside the principal-bound card. */
export interface CredentialCopyToolDeps {
  readonly workspaceId: string;
  readonly ownerPrincipalId: Promise<string>;
  readonly authorize: AuthorizeFn;
  readonly gatedMutations: { gatewayDeps: { authorizeInstance?: InstanceAuthorizeFn } };
  readonly projectKeys?: ProjectKeysPort;
}
export const catalog: AgentToolDefinition[] = [{ name: CREDENTIAL_COPY_TOOL_ID,
  description: 'Use a saved key or OAuth connection on this site. Opens the owner-only Shared Keys picker and one approval card. ' +
    'No key is copied. Choose Enter a new key to open the normal secure key card. ' +
    'Accepts no selections, site identity or secrets from the model; returns only the approved credentialId.',
  sideEffects: 'mutates-durable-state', authorization: { permission: 'system.write' },
  inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];
export const credentialCopyDerivedRisk: DerivedRiskByToolId = new Map([[CREDENTIAL_COPY_TOOL_ID, 'mutates-durable-state']]);

/** Tovu's saved-key card: its ids, paths, words, and the actual surface helpers. */
const TOVU_CREDENTIAL_COPY_HOST: CredentialCopyToolHost = {
  vocabulary: { toolId: CREDENTIAL_COPY_TOOL_ID, domain: 'credential-copy', catalogModule: 'features/custom-credentials/credential-copy-tool.ts',
    ownerPermission: 'system.write', newKeyValue: NEW_KEY, cardPath: 'use-saved-key' },
  cardIdentity: tovuCredentialCardIdentity, catalog, metadata: toolMetadata, derivedRisk: credentialCopyDerivedRisk,
  messages: {
    ownerOnly: 'Use the installation owner’s session to choose a saved key.',
    instanceRefused: 'Using saved keys is not allowed for this session. Sign in as the installation owner.',
    unexpectedField: 'Choose one saved key in this card. No site identity or secret can be submitted.',
    notOffered: 'This saved key is no longer offered. Open Use a saved key again.',
    inputNotEmpty: 'Use a saved key accepts only {}. Choose the key in the human card.',
    keysUnavailable: 'Shared Keys could not open. Open the normal key card to save a key for this site.',
    needsInteractive: 'Using a saved key requires an interactive confirmation channel. Open this action in chat.',
    cardTitle: 'Use a saved key or connection on this site', siteLabel: 'Site', siteFallback: 'This site',
    cardDescription: 'Nothing is copied. This site can use only the one you choose.',
    fieldLabel: 'Shared Keys', fieldPlaceholder: 'Choose a key', newKeyLabel: 'Enter a new key',
    submitLabel: 'Use this key', cancelLabel: 'Cancel',
  },
  protocol: { askThenReport, buildFormSurface },
};

/** Tovu's old entry: the same registrations, bound to Tovu's saved-key card host inputs. */
export function buildCredentialCopyRegistrations({ deps, surfaces, saveNew }: {
  deps: CredentialCopyToolDeps; surfaces: AssistantSurfaceDeps; saveNew?: ToolHandler;
}, _optional = {}): ToolRegistration[] {
  return createCredentialCopyRegistrations({ deps, surfaces, host: TOVU_CREDENTIAL_COPY_HOST }, saveNew ? { saveNew } : {});
}
