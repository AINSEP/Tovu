import type { ToolRegistration } from '@jini-ai/core';
import { buildCredentialSaveRegistrations, type CredentialSaveAdapters } from '../../features/custom-credentials/credential-save-tool.js';

/** Bind only the domain under test; an accidental cross-kind dispatch fails loudly. */
export function credentialSaveFixtureRegistrations(
  { adapters, registrations = [] }: { adapters: Partial<CredentialSaveAdapters>; registrations?: ToolRegistration[] }, _optional = {},
): ToolRegistration[] {
  const unused = async (): Promise<never> => { throw new Error('Unexpected credential kind in this domain fixture'); };
  return [...registrations, ...buildCredentialSaveRegistrations({ adapters: {
    apiCreate: unused, apiRotate: unused, mediaProvider: unused, sourceControl: unused, publishHost: unused, agentPluginToken: unused,
    ...adapters,
  } })];
}

/** Convert existing characterization cases to the single tool's model metadata contract.
 * Secret-shaped extra keys stay present so the production dispatcher must refuse them.
 */
export function credentialSaveFixtureInput(
  { input, kind, rotation = false }: { input: unknown; kind: string; rotation?: boolean }, _optional = {},
): unknown {
  if (input === undefined && kind === 'api' && !rotation) return { kind };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const metadata = input as Record<string, unknown>;
  if (kind === 'api' && !rotation) return { ...metadata, kind };
  if (kind === 'publish-host') {
    const { target, ...prefill } = metadata;
    return { kind, target, ...(Object.keys(prefill).length ? { prefill } : {}) };
  }
  const key = kind === 'api' ? 'label' : kind === 'agent-plugin-token' ? 'pluginId' : 'provider';
  const { [key]: target, ...rest } = metadata;
  return { ...rest, kind, ...(key in metadata ? { target } : {}) };
}
