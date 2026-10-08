import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeoTransportPort, SeoSitemapTransportPort } from '@jini-ai/admin/seo/adapters/http';
import { ApiError } from '../../../lib/api';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';
import { createSeoHostPorts, createSeoTranslator, describeSeoHostError, seoEvents, seoSessionGrants, seoSitemapTransport } from '../seo-ports';
import { siteUrl } from '../../../lib/site-url';

afterEach(() => { resetContentRefreshBus(); vi.unstubAllGlobals(); });

describe('SEO host ports', () => {
  it('keeps workspace paths, envelopes, encoded ids, null clears and posts-before-pages reads', async () => {
    const row = { id: 'post/1', title: 'Page title', status: 'draft' };
    const calls = vi.fn((input: Parameters<SeoTransportPort['request']>[0]) => {
      if (input.path.endsWith('/posts') || input.path.endsWith('/pages')) return { posts: [{ post: row }] };
      return { data: { accepted: true } };
    });
    const transport: SeoTransportPort = {
      request: async <T,>(input: Parameters<SeoTransportPort['request']>[0]): Promise<T> => calls(input) as T,
      url: ({ path }) => `/api/admin/v1${path}`,
    };
    const { seoApi: api } = createSeoHostPorts({ transport }, { workspaceId: 'ws1' });
    expect(await api.getSeoSettings({})).toEqual({ accepted: true });
    await api.putSeoSettings({}, { defaultDescription: null, defaultOgImage: null, twitterSite: null });
    expect(await api.regenerateSeoSitemap({})).toEqual({ accepted: true });
    await api.getSeoEntry({ entryId: 'post/1' });
    await api.putSeoEntry({ entryId: 'post/1' }, { description: null, ogImage: 'photo-slug:public' });
    await api.analyzeSeoEntry({ entryId: 'post/1' });
    expect(await api.listSeoPosts({})).toEqual([row]);
    expect(await api.listSeoPages({})).toEqual([row]);
    expect(api.mediaOriginalUrl({ id: 'photo/1' })).toBe('/api/admin/v1/workspaces/ws1/media/photo%2F1/original');
    expect(calls.mock.calls.map(([input]) => input)).toEqual([
      { path: '/workspaces/ws1/seo/settings', method: 'GET' },
      { path: '/workspaces/ws1/seo/settings', method: 'PUT', body: { defaultDescription: null, defaultOgImage: null, twitterSite: null } },
      { path: '/workspaces/ws1/seo/sitemap/regenerate', method: 'POST' },
      { path: '/workspaces/ws1/seo/entries/post%2F1', method: 'GET' },
      { path: '/workspaces/ws1/seo/entries/post%2F1', method: 'PUT', body: { description: null, ogImage: 'photo-slug:public' } },
      { path: '/workspaces/ws1/seo/entries/post%2F1/analyze', method: 'GET' },
      { path: '/workspaces/ws1/posts', method: 'GET' },
      { path: '/workspaces/ws1/pages', method: 'GET' },
    ]);
  });

  it('reads exact public XML with same-origin credentials and the injected cancellation signal', async () => {
    const xml = '<?xml version="1.0"?><urlset><url><loc>https://site.test/page</loc></url></urlset>';
    const get = vi.fn<SeoSitemapTransportPort['get']>(async () => new Response(xml, { headers: { 'content-type': 'application/xml' } }));
    const transport: SeoTransportPort = { request: async () => { throw new Error('JSON transport must not read XML'); }, url: ({ path }) => path };
    const { seoApi } = createSeoHostPorts({ transport }, { sitemapTransport: { get } });
    const signal = new AbortController().signal;
    expect(await seoApi.fetchSitemapXml({}, { signal })).toEqual({ text: xml });
    expect(get).toHaveBeenCalledWith({ path: '/sitemap.xml', credentials: 'same-origin' }, { signal });
  });

  it.each([
    [404, 'application/xml'],
    [200, 'text/html'],
  ])('retains the public sitemap guard for HTTP %i and %s', async (status, contentType) => {
    const transport: SeoTransportPort = { request: async () => { throw new Error('unused'); }, url: ({ path }) => path };
    const { seoApi } = createSeoHostPorts({ transport }, { sitemapTransport: { get: async () => new Response('not a sitemap', { status, headers: { 'content-type': contentType } }) } });
    await expect(seoApi.fetchSitemapXml({})).rejects.toThrow(`Could not load the sitemap (HTTP ${status}).`);
  });

  it('delegates the public URL to the host site-origin owner', async () => {
    const fetch = vi.fn(async () => new Response('<urlset/>'));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await seoSitemapTransport.get({ path: '/sitemap.xml', credentials: 'same-origin' }, { signal });
    expect(fetch).toHaveBeenCalledWith(siteUrl('/sitemap.xml'), { credentials: 'same-origin', signal });
  });

  it('retains host error identity and the original empty-message fallback', async () => {
    const error = new ApiError('', 403, 'DENIED', { detail: 'original detail' });
    const transport: SeoTransportPort = { request: async () => { throw error; }, url: ({ path }) => path };
    await expect(createSeoHostPorts({ transport }).seoApi.listSeoPosts({})).rejects.toBe(error);
    expect(describeSeoHostError({ error, fallback: 'failed to load entries' })).toBe('failed to load entries');
    expect(describeSeoHostError({ error: new Error('network failed'), fallback: 'fallback' })).toBe('network failed');
  });

  it('uses the feature/common dictionaries, variables and English fallback', () => {
    const t = createSeoTranslator({ locale: 'es' });
    expect(t('Site defaults')).toBe('Valores predeterminados del sitio');
    expect(t('Saved.')).toBe('Guardado.');
    expect(t('Sitemap · {count} URLs', { count: 7 })).toBe('Mapa del sitio · 7 URL');
    expect(t('future SEO label')).toBe('future SEO label');
    expect(createSeoTranslator({ locale: 'unlisted-locale' })('Save settings')).toBe('Save settings');
  });

  it('expands only the permission owner’s exact grants and literal wildcard', () => {
    expect(seoSessionGrants({ permissions: ['*'] })).toEqual(['admin.seo.manage']);
    expect(seoSessionGrants({ permissions: ['admin.seo.manage'] })).toEqual(['admin.seo.manage']);
    expect(seoSessionGrants({ permissions: ['admin.seo.*', 'media.read'] })).toEqual([]);
    expect(seoSessionGrants({ permissions: [] })).toEqual([]);
  });

  it('filters refresh resources, retains unknown scope and disposes subscriptions', () => {
    const onRefresh = vi.fn();
    const dispose = seoEvents.subscribe({ onRefresh });
    publishContentRefresh(['media']);
    expect(onRefresh).not.toHaveBeenCalled();
    publishContentRefresh(['seo']);
    publishContentRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(2);
    dispose();
    publishContentRefresh(['seo']);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });
});
