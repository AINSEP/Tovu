import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaProvidersPort, mediaSessionGrants } from '../media-ports';
import { MEDIA_PROVIDER_CATALOG } from '../../../features/media/media-provider-catalog';
import type { AdminMediaProviderMap } from '../../../lib/api';

/**
 * Boundary pins for the provider credential port (security-sensitive: it writes API keys).
 * `media-ports.unit.test.ts` covers the main flows; this file pins every remaining branch of
 * the map-building rules so a refactor cannot silently change what reaches the server.
 */

afterEach(() => vi.unstubAllGlobals());

const [first, second] = MEDIA_PROVIDER_CATALOG;
const id = first!.id;
const label = first!.label;
const siblingId = second!.id;

type RecordedRequest = { method: string; body?: AdminMediaProviderMap };

/** A whole-map provider store behind the real authenticated request path. */
function fakeProviderStore({ stored }: { stored: AdminMediaProviderMap }, { failGetWith }: { failGetWith?: { status: number; error: string } } = {}) {
  const requests: RecordedRequest[] = [];
  let state = stored;
  const urls: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    urls.push(String(input));
    const method = init?.method ?? 'GET';
    if (method !== 'PUT') {
      requests.push({ method });
      if (failGetWith) return new Response(JSON.stringify({ error: failGetWith.error }), { status: failGetWith.status });
      return new Response(JSON.stringify(state));
    }
    state = JSON.parse(String(init!.body)) as AdminMediaProviderMap;
    requests.push({ method, body: state });
    return new Response(JSON.stringify(state));
  });
  vi.stubGlobal('fetch', fetch);
  return { requests, urls, puts: () => requests.filter(request => request.method === 'PUT').map(request => request.body) };
}

describe('provider views', () => {
  it('shows only the last four characters of a longer display tail', async () => {
    fakeProviderStore({ stored: { [id]: { apiKeyConfigured: true, apiKeyTail: 'abcdef123456' } } });
    const rows = await createMediaProvidersPort({}).list({});
    expect(rows!.find(row => row.id === id)).toEqual({ id, label, configured: true, apiKeyTail: '3456' });
  });

  it('keeps an empty-string endpoint and model, which differ from absent ones', async () => {
    fakeProviderStore({ stored: { [id]: { baseUrl: '', model: '' } } });
    const rows = await createMediaProvidersPort({}).list({});
    expect(rows!.find(row => row.id === id)).toEqual({ id, label, configured: false, baseUrl: '', model: '' });
  });

  it('omits an empty display tail', async () => {
    fakeProviderStore({ stored: { [id]: { apiKeyConfigured: true, apiKeyTail: '' } } });
    const rows = await createMediaProvidersPort({}).list({});
    expect(rows!.find(row => row.id === id)).toEqual({ id, label, configured: true });
  });

  it('lists one row per catalog provider, in catalog order, ignoring providers outside the catalog', async () => {
    fakeProviderStore({ stored: { foreign: { model: 'outside' } } });
    const rows = await createMediaProvidersPort({}).list({});
    expect(rows!.map(row => row.id)).toEqual(MEDIA_PROVIDER_CATALOG.map(provider => provider.id));
  });
});

describe('single-provider writes', () => {
  it('refuses a cancelled credential save with the abort reason before reading', async () => {
    const store = fakeProviderStore({ stored: {} });
    const controller = new AbortController(); controller.abort(new Error('credential save cancelled'));
    await expect(createMediaProvidersPort({}).saveCredential({ id, credential: 'secret' }, { signal: controller.signal }))
      .rejects.toThrow('credential save cancelled');
    expect(store.requests).toEqual([]);
  });

  it('propagates a failed read without writing and accepts the next queued edit', async () => {
    const store = fakeProviderStore({ stored: {} }, { failGetWith: { status: 503, error: 'provider store offline' } });
    const port = createMediaProvidersPort({});
    await expect(port.saveCredential({ id, credential: 'secret' })).rejects.toMatchObject({ message: 'provider store offline', status: 503 });
    expect(store.puts()).toEqual([]);
    fakeProviderStore({ stored: {} });
    await expect(port.saveCredential({ id, credential: 'secret' })).resolves.toEqual({ id, label, configured: false });
  });

  it('reads before refusing an unknown provider', async () => {
    const store = fakeProviderStore({ stored: {} });
    await expect(createMediaProvidersPort({}).removeCredential({ id: 'unknown' })).rejects.toThrow('Unknown media provider "unknown": it is not in this host\'s provider catalog');
    expect(store.requests).toEqual([{ method: 'GET' }]);
  });

  it('adds a credential for a provider with no saved entry', async () => {
    const store = fakeProviderStore({ stored: { [siblingId]: { model: 'keep' } } });
    await createMediaProvidersPort({}).saveCredential({ id, credential: 'secret' });
    expect(store.puts()).toEqual([{ [siblingId]: { model: 'keep' }, [id]: { apiKey: 'secret' } }]);
  });

  it('removes the whole entry, settings included, when the credential is removed', async () => {
    const store = fakeProviderStore({ stored: { [id]: { baseUrl: 'https://keep.invalid', apiKeyConfigured: true } } });
    await expect(createMediaProvidersPort({}).removeCredential({ id })).resolves.toEqual({ id, label, configured: false });
    expect(store.puts()).toEqual([{}]);
  });

  it('stores non-blank settings as given, without trimming them', async () => {
    const store = fakeProviderStore({ stored: {} });
    await createMediaProvidersPort({}).saveSettings!({ id, baseUrl: ' https://new.invalid ', model: ' m ' });
    expect(store.puts()).toEqual([{ [id]: { baseUrl: ' https://new.invalid ', model: ' m ' } }]);
  });

  it('clears a whitespace-only endpoint but keeps the model', async () => {
    const store = fakeProviderStore({ stored: { [id]: { baseUrl: 'https://old.invalid', model: 'old' } } });
    await createMediaProvidersPort({}).saveSettings!({ id, baseUrl: '   ', model: 'new' });
    expect(store.puts()).toEqual([{ [id]: { model: 'new' } }]);
  });

  it('clears a whitespace-only model but keeps the endpoint', async () => {
    const store = fakeProviderStore({ stored: { [id]: { baseUrl: 'https://old.invalid', model: 'old' } } });
    await createMediaProvidersPort({}).saveSettings!({ id, baseUrl: 'https://new.invalid', model: ' ' });
    expect(store.puts()).toEqual([{ [id]: { baseUrl: 'https://new.invalid' } }]);
  });

  it('keeps an entry whose settings are blanked while the stored map still echoes a key', async () => {
    const store = fakeProviderStore({ stored: { [id]: { apiKey: 'echoed' } } });
    await createMediaProvidersPort({}).saveSettings!({ id, baseUrl: '', model: '' });
    expect(store.puts()).toEqual([{ [id]: { apiKey: 'echoed' } }]);
  });

  it('serializes single-provider writes with whole-catalog saves', async () => {
    const store = fakeProviderStore({ stored: {} });
    const port = createMediaProvidersPort({});
    await Promise.all([port.saveCredential({ id, credential: 'secret' }), port.saveChanges!({ providers: {} })]);
    expect(store.requests.map(request => request.method)).toEqual(['GET', 'PUT', 'GET', 'PUT']);
    expect(store.puts()).toEqual([{ [id]: { apiKey: 'secret' } }, {}]);
  });
});

describe('provider store route', () => {
  it('reads and replaces the workspace media providers resource', async () => {
    const store = fakeProviderStore({ stored: {} });
    await createMediaProvidersPort({}).saveCredential({ id, credential: 'secret' });
    expect(store.urls).toEqual(['/api/admin/v1/workspaces/workspace-local/media/providers', '/api/admin/v1/workspaces/workspace-local/media/providers']);
  });
});

describe('whole-catalog saves', () => {
  it('trims and sends a new key', async () => {
    const store = fakeProviderStore({ stored: {} });
    await createMediaProvidersPort({}).saveChanges!({ providers: { [id]: { apiKey: '  new-secret  ' } } });
    expect(store.puts()).toEqual([{ [id]: { apiKey: 'new-secret' } }]);
  });

  it('keeps a configured-only entry as a bare marker so the server keeps its key', async () => {
    const store = fakeProviderStore({ stored: { [id]: { apiKeyConfigured: true, baseUrl: 'https://old.invalid' } } });
    await createMediaProvidersPort({}).saveChanges!({ providers: { [id]: { apiKeyConfigured: true, apiKey: '   ' } } });
    expect(store.puts()).toEqual([{ [id]: { apiKeyConfigured: true } }]);
  });

  it('drops a false configured flag but keeps the endpoint', async () => {
    const store = fakeProviderStore({ stored: {} });
    await createMediaProvidersPort({}).saveChanges!({ providers: { [id]: { apiKeyConfigured: false, baseUrl: 'https://x.invalid' } } });
    expect(store.puts()).toEqual([{ [id]: { baseUrl: 'https://x.invalid' } }]);
  });

  it('reads before refusing an unknown provider', async () => {
    const store = fakeProviderStore({ stored: {} });
    await expect(createMediaProvidersPort({}).saveChanges!({ providers: { unknown: {} } })).rejects.toThrow('Unknown media provider "unknown": it is not in this host\'s provider catalog');
    expect(store.requests).toEqual([{ method: 'GET' }]);
  });

  it('returns one view per catalog provider from the saved map', async () => {
    fakeProviderStore({ stored: {} });
    const rows = await createMediaProvidersPort({}).saveChanges!({ providers: { [id]: { model: 'm' } } });
    expect(rows.map(row => row.id)).toEqual(MEDIA_PROVIDER_CATALOG.map(provider => provider.id));
    expect(rows[0]).toEqual({ id, label, model: 'm', configured: false });
  });
});

describe('mediaSessionGrants', () => {
  it('grants provider management from the integrations grant alone', () => {
    expect(mediaSessionGrants({ permissions: ['admin.integrations.manage'] })).toEqual(['media.providers']);
  });

  it('fails closed on a prefix pattern, which is not a recognised wildcard', () => {
    expect(mediaSessionGrants({ permissions: ['media.*'] })).toEqual([]);
  });
});
