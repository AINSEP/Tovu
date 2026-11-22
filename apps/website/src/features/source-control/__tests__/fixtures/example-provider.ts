import type { SourceControlProviderOperations } from '../../provider-module.js';
import type { LoadSourceControlProviders, LoadedSourceControlProvider, SourceControlProviderRegistry } from '../../provider-registry.js';

/** Neutral provider data and fake identity port. No plugin code, disk or network dependencies. */
export function exampleRegistry({ probe = true, ids = ['example-git', 'example-token', 'example-paired'] }: { probe?: boolean; ids?: readonly string[] } = {}, _options = {}): SourceControlProviderRegistry {
  const providers: LoadedSourceControlProvider[] = ids.map((id, index) => ({
    pluginId: id,
    descriptor: { id, label: id === 'example-git' ? 'Example Git' : id, maxFileBytes: 1024, apiOrigin: 'https://git.example.test', module: 'example.mjs',
      credential: { tokenField: 'token', fields: [
        { name: 'token', label: 'Token', required: true, secret: true },
        ...(index === 2 ? [{ name: 'username', label: 'Username', required: true }] : []),
      ] },
    },
    module: { validateTarget: ({ owner, repo }) => {
      if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner)) return `invalid Example Git owner '${owner}'`;
      if (!/^[A-Za-z0-9_.-]+$/.test(repo) || repo === '.' || repo === '..') return `invalid Example Git repo '${repo}'`;
      return null;
    }, create: ({ kit }) => ({
      readAccountLabel: async (token: string) => {
        if (!probe || index !== 0) return null;
        // Like the real plugins: the token travels only through the guarded client, redirects refused.
        const response = await kit.httpClient.send({ method: 'GET', url: 'https://git.example.test/identity', headers: { Authorization: `Bearer ${token}` }, timeoutMs: 10_000 }, { redirect: 'error' });
        if (response.status < 200 || response.status > 299) return null;
        const body = JSON.parse(response.bodyText) as { account?: unknown } | null;
        return typeof body?.account === 'string' && body.account !== '' ? body.account : null;
      },
    } as SourceControlProviderOperations) },
  }));
  return { list: () => providers, get: ({ providerId: id }) => providers.find(provider => provider.descriptor.id === id), refusals: [] };
}
export const exampleProviders: LoadSourceControlProviders = async () => exampleRegistry();
export const exampleProvidersWithoutProbe: LoadSourceControlProviders = async () => exampleRegistry({ probe: false });
