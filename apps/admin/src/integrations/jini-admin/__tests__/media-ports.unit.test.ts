import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaApi, createMediaProvidersPort, mediaSessionGrants, mediaEvents } from '../media-ports';
import { publishContentRefresh } from '../../../lib/content-refresh-bus';
import { MEDIA_PROVIDER_CATALOG } from '../../../features/media/media-provider-catalog';
import { ApiError } from '../../../lib/api';
afterEach(() => vi.unstubAllGlobals());
describe('host media ports', () => {
  it('omits an unconfigured provider when its last settings are cleared, preserving siblings', async () => {
    const id = MEDIA_PROVIDER_CATALOG[0]!.id;
    let saved: Record<string, any> = { [id]: { model: 'custom', apiKeyConfigured: false }, sibling: { model: 'keep' } };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PUT') saved = JSON.parse(String(init.body));
      return new Response(JSON.stringify(saved));
    }));
    await createMediaProvidersPort({}).saveSettings!({ id, baseUrl: '', model: '' });
    expect(saved).toEqual({ sibling: { model: 'keep' } });
  });
  it('fails closed and expands the session wildcard into explicit media capabilities', () => {
    expect(mediaSessionGrants({ permissions: [] })).toEqual([]);
    expect(mediaSessionGrants({ permissions: ['media.read'] })).toEqual(['media.read']);
    expect(mediaSessionGrants({ permissions: ['*'] })).toEqual(['media.read', 'media.upload', 'media.update', 'media.trash', 'media.delete.force', 'media.providers', 'media.restore']);
    expect(mediaSessionGrants({ permissions: ['media.read'] })).not.toContain('media.providers');
  });
  it('requires both Trash gates and the library read grant before enabling restore', () => {
    for (const permissions of [[], ['media.read', 'media.delete'], ['media.read', 'content.read'], ['content.read', 'media.delete']]) {
      expect(mediaSessionGrants({ permissions })).not.toContain('media.restore');
    }
    expect(mediaSessionGrants({ permissions: ['media.read', 'content.read', 'media.delete'] })).toContain('media.restore');
  });
  it('restores through the real Trash protocol then returns the authenticated asset', async () => {
    const signal = new AbortController().signal;
    const row = { id: 'a/b', status: 'active', slug: 'kept-slug', title: 'Kept title' };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ restored: 1, results: [{ entityType: 'media', entityId: 'a/b', outcome: 'restored' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ media: [row] })));
    vi.stubGlobal('fetch', fetch);
    expect(mediaApi.restoreSupported).toBe(true);
    expect(await mediaApi.restore!({ id: 'a/b' }, { signal })).toEqual(row);
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/admin/v1/workspaces/workspace-local/trash/restore', expect.objectContaining({
      method: 'POST', signal, credentials: 'same-origin', body: JSON.stringify({ items: [{ entityType: 'media', entityId: 'a/b' }] }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/admin/v1/workspaces/workspace-local/media', expect.objectContaining({ method: 'GET', signal }));
  });
  it.each(['forbidden', 'not-found', 'version-changed', 'missing-result'])('refuses a 200 restore response whose item outcome is %s', async outcome => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ restored: 0, results: outcome === 'missing-result' ? [] : [{ entityType: 'media', entityId: 'm1', outcome }] })));
    vi.stubGlobal('fetch', fetch);
    await expect(mediaApi.restore!({ id: 'm1' })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refuses a restored result when the authoritative reread is missing or still trashed', async () => {
    for (const media of [[], [{ id: 'm1', status: 'trashed' }]]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ entityType: 'media', entityId: 'm1', outcome: 'restored' }] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ media }))));
      await expect(mediaApi.restore!({ id: 'm1' })).rejects.toThrow();
    }
  });
  it('uses the authenticated media route, URL and abort signal', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ media: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await mediaApi.list({}, { signal });
    expect(fetch).toHaveBeenCalledWith('/api/admin/v1/workspaces/workspace-local/media', expect.objectContaining({ credentials: 'same-origin', signal }));
    expect(mediaApi.originalUrl({ id: 'a/b' })).toBe('/api/admin/v1/workspaces/workspace-local/media/a%2Fb/original');
    expect(mediaApi.replaceSupported).toBe(true);
  });
  it('replaces the existing asset through the capability-gated authenticated endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ media: { id: 'a/b' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const upload = { filename: 'new.png', contentType: 'image/png', dataBase64: 'AAAA' };
    expect(mediaApi.replaceSupported).toBe(true);
    expect(await mediaApi.replace!({ id: 'a/b', upload }, { signal })).toEqual({ id: 'a/b' });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/v1/workspaces/workspace-local/media/a%2Fb/replace',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin', signal, body: JSON.stringify(upload) }));
  });
  it('propagates an actual 503 without manufacturing a retry or invalidating the session', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'blocked pending recovery', code: 'SITE_BLOCKED_PENDING_RECOVERY',
    }), { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(mediaApi.list({})).rejects.toMatchObject({
      message: 'blocked pending recovery', status: 503, code: 'SITE_BLOCKED_PENDING_RECOVERY',
    } satisfies Partial<ApiError>);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('propagates mount cancellation as an AbortError before requesting the API', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const controller = new AbortController(); controller.abort();
    await expect(mediaApi.list({}, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError', message: 'This operation was aborted',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('serializes full-map credential edits and preserves endpoints, models and siblings', async () => {
    const id = MEDIA_PROVIDER_CATALOG[0]!.id;
    let saved: Record<string, any> = { [id]: { baseUrl: 'https://example.invalid', model: 'custom' }, sibling: { apiKeyConfigured: true } };
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PUT') { saved = JSON.parse(String(init.body)); bodies.push(saved); if (saved[id]) { saved[id] = { ...saved[id], apiKeyConfigured: !!saved[id].apiKey }; delete saved[id].apiKey; } }
      return new Response(JSON.stringify(saved), { status: 200 });
    }));
    const port = createMediaProvidersPort({});
    await Promise.all([port.saveCredential({ id, credential: 'secret' }), port.removeCredential({ id })]);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]![id]).toMatchObject({ baseUrl: 'https://example.invalid', model: 'custom' });
    expect(bodies[1]!.sibling).toEqual({ apiKeyConfigured: true });
    expect((await port.list({}))!.find(row => row.id === id)).toEqual({ id, label: MEDIA_PROVIDER_CATALOG[0]!.label, configured: false });
  });
  it('preserves unknown provider state when reads fail and supports aborting queued writes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const port = createMediaProvidersPort({});
    expect(await port.list({})).toBeNull();
    const abort = new AbortController(); abort.abort();
    await expect(port.saveCredential({ id: MEDIA_PROVIDER_CATALOG[0]!.id, credential: 'secret' }, { signal: abort.signal })).rejects.toThrow();
  });
  it('persists endpoint/model edits in the existing whole-map store without disturbing keys or siblings', async () => {
    const id = MEDIA_PROVIDER_CATALOG[0]!.id;
    const sibling = MEDIA_PROVIDER_CATALOG[1]!.id;
    let saved: Record<string, any> = { [id]: { baseUrl: 'https://old.invalid', model: 'old', apiKeyConfigured: true, apiKeyTail: 'tail' },
      [sibling]: { baseUrl: 'https://sibling.invalid', model: 'sibling', apiKeyConfigured: true } };
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        saved = JSON.parse(String(init.body)); bodies.push(saved);
        saved = Object.fromEntries(Object.entries(saved).map(([key, value]) => { const { apiKey, ...rest } = value; return [key, { ...rest, apiKeyConfigured: !!apiKey || rest.apiKeyConfigured }]; }));
      }
      return new Response(JSON.stringify(saved));
    }));
    const port = createMediaProvidersPort({});
    // The display-only tail feeds the legacy "Saved (••••tail)" badge; it is never key material.
    expect((await port.list({}))!.find(row => row.id === id)).toEqual({ id, label: MEDIA_PROVIDER_CATALOG[0]!.label, configured: true, apiKeyTail: 'tail', baseUrl: 'https://old.invalid', model: 'old' });
    const [settings] = await Promise.all([port.saveSettings!({ id, baseUrl: 'https://new.invalid', model: 'new' }), port.saveCredential({ id, credential: 'secret' })]);
    expect(settings).toEqual({ id, label: MEDIA_PROVIDER_CATALOG[0]!.label, configured: true, apiKeyTail: 'tail', baseUrl: 'https://new.invalid', model: 'new' });
    expect(bodies[0]![id]).not.toHaveProperty('apiKey');
    expect(bodies[1]![id]).toMatchObject({ baseUrl: 'https://new.invalid', model: 'new', apiKey: 'secret' });
    expect(bodies[0]![sibling]).toEqual(saved[sibling]);
    expect((await port.list({}))!.find(row => row.id === id)).not.toHaveProperty('apiKey');
    await port.saveSettings!({ id, baseUrl: '', model: '' });
    expect(bodies[2]![id]).toMatchObject({ apiKeyConfigured: true });
    expect(bodies[2]![id]).not.toHaveProperty('baseUrl');
    expect(bodies[2]![id]).not.toHaveProperty('model');
  });
  it('saves the whole catalog set in one PUT, keeping keys, siblings and foreign providers, and omits cleared entries', async () => {
    const id = MEDIA_PROVIDER_CATALOG[0]!.id;
    const sibling = MEDIA_PROVIDER_CATALOG[1]!.id;
    let saved: Record<string, any> = { [id]: { baseUrl: 'https://old.invalid', model: 'old', apiKeyConfigured: true, apiKeyTail: 'tail' },
      [sibling]: { baseUrl: 'https://sibling.invalid', model: 'sibling', apiKeyConfigured: true }, foreign: { model: 'outside-catalog' } };
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        bodies.push(JSON.parse(String(init.body)));
        // Server contract: an entry without apiKey keeps its stored key; responses carry markers only.
        saved = Object.fromEntries(Object.entries(bodies.at(-1)!).map(([key, value]: [string, any]) => { const { apiKey, ...rest } = value;
          return [key, { ...rest, ...(apiKey || saved[key]?.apiKeyConfigured ? { apiKeyConfigured: true, apiKeyTail: apiKey ? apiKey.slice(-4) : saved[key].apiKeyTail } : {}) }]; }));
      }
      return new Response(JSON.stringify(saved));
    }));
    const port = createMediaProvidersPort({});
    const siblingEntry = { apiKeyConfigured: true, baseUrl: 'https://sibling.invalid', model: 'sibling' };
    const rows = await port.saveChanges!({ providers: { [id]: { apiKeyConfigured: true, apiKeyTail: 'tail', baseUrl: ' https://new.invalid ', model: 'new' }, [sibling]: siblingEntry } });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ [id]: { baseUrl: 'https://new.invalid', model: 'new', apiKeyConfigured: true }, [sibling]: siblingEntry, foreign: { model: 'outside-catalog' } });
    expect(rows.find(row => row.id === id)).toEqual({ id, label: MEDIA_PROVIDER_CATALOG[0]!.label, configured: true, apiKeyTail: 'tail', baseUrl: 'https://new.invalid', model: 'new' });
    await port.saveChanges!({ providers: { [id]: { apiKeyConfigured: true, apiKey: 'brand-new-secret' }, [sibling]: siblingEntry } });
    expect(bodies[1]![id]).toEqual({ apiKey: 'brand-new-secret', apiKeyConfigured: true });
    expect(JSON.stringify(await port.list({}))).not.toContain('brand-new-secret');
    // Clear omits the provider entirely: never an empty {"openai":{}} that the server would keep.
    await port.saveChanges!({ providers: { [sibling]: siblingEntry } });
    expect(bodies[2]).not.toHaveProperty(id);
    expect(bodies[2]).toEqual({ [sibling]: siblingEntry, foreign: { model: 'outside-catalog' } });
    // A keyless entry whose last settings were blanked is omitted too, even when the server still holds it.
    saved = { ...saved, [id]: { model: 'leftover' } };
    await port.saveChanges!({ providers: { [id]: { baseUrl: '  ', model: '' }, [sibling]: siblingEntry } });
    expect(bodies[3]).toEqual({ [sibling]: siblingEntry, foreign: { model: 'outside-catalog' } });
    await expect(port.saveChanges!({ providers: { 'not-in-catalog': { model: 'x' } } })).rejects.toThrow('Unknown media provider');
    expect(bodies).toHaveLength(4);
  });
  it('refreshes only media or unknown changes and unsubscribes on disposal', () => {
    const refresh = vi.fn(); const dispose = mediaEvents.subscribe({ onRefresh: refresh });
    publishContentRefresh(['posts']); expect(refresh).not.toHaveBeenCalled();
    publishContentRefresh(['media']); publishContentRefresh(); expect(refresh).toHaveBeenCalledTimes(2);
    dispose(); publishContentRefresh(['media']); expect(refresh).toHaveBeenCalledTimes(2);
  });
});
