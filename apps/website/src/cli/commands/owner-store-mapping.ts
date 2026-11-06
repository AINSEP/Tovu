import { ToolInputError } from '@jini-ai/core';
import type { VaultMeta, VaultRecord } from '@jini-ai/platform/secrets/credential-sets';
import { sourceControlSavedApiKeyLabels } from '#src/features/source-control/provider-module';
import { loadBundledSourceControlProviderRegistry } from '#src/features/source-control/provider-registry';
import { bundledAgentPluginsDir } from '#src/server/runtime/composition/site-paths';

interface OwnerApiKeyMapping { kind: VaultRecord['kind']; provider: string | null; label: string; meta: VaultMeta; payload: VaultMeta | null }

/** Source-control aliases become the same custom API-key entry every provider reader resolves. */
export async function mapOwnerApiKey({ row, payload }: { row: Pick<VaultRecord, "kind" | "provider" | "label" | "meta">; payload: VaultMeta | null }, _options = {}): Promise<OwnerApiKeyMapping> {
  const label = row.kind === 'source-control' ? sourceControlSavedApiKeyLabels.get(row.provider ?? '') : undefined;
  if (!label) return { kind: row.kind, provider: row.provider, label: row.label, meta: row.meta, payload };
  const provider = (await loadBundledSourceControlProviderRegistry({ sourceRoot: bundledAgentPluginsDir() })).get(row.provider!);
  if (!provider || typeof payload?.token !== 'string') throw new ToolInputError({ message: "This older source-control key cannot be imported. Save a replacement in Shared Keys. Details: P25_IMPORT_SOURCE_CONTROL_PAYLOAD; secret values omitted." });
  return { kind: 'vendor' as const, provider: null, label,
    meta: { credentialType: 'custom', worksFor: [row.provider!], category: 'source-control',
      baseUrl: provider.descriptor.apiOrigin, additionalHosts: [], username: null }, payload: { token: payload.token } };
}

