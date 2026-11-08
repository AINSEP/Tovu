import { VaultError, type SecretsVaultService } from '@jini-ai/platform/secrets/credential-sets';
import type { AdminSurfacePluginStatePersistence } from '@jini-ai/agent-plugins/admin-surfaces';
import { apiConnectionVaultScope, PLUGIN_STATE_FORMAT } from './vault-stores.js';

export interface PluginStateHostInput { readonly vault: SecretsVaultService; readonly workspaceId: string }

/** Reuses the exact vault instance and saved host scope/format; no store is constructed here. */
export function bindPluginStatePersistence(required: PluginStateHostInput, _optional: Record<string, never> = {}): AdminSurfacePluginStatePersistence {
  return { vault: required.vault, scope: apiConnectionVaultScope({ workspaceId: required.workspaceId }), format: PLUGIN_STATE_FORMAT,
    isConflict: ({ error }) => error instanceof VaultError && error.code === 'conflict' };
}
