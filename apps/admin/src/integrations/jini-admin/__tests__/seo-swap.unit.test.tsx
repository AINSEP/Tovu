import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchQueryProvider } from '@jini-ai/ui/fetch-query';
import { KitProvider } from '@jini-ai/ui-kit/react';
import { createMemorySeoApi } from '@jini-ai/admin/seo/adapters/memory';
import { Seo } from '../../../features/seo';
import { AdminModulesContext, createHostAdminScope } from '../modules.hooks';
import { seoEvents } from '../seo-ports';
import { tovuKit } from '../kit';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';
import { setPublishToLiveAvailable } from '../../../features/publish-content/hooks/publish-availability.store';

const scopes: ReturnType<typeof createHostAdminScope>[] = [];
afterEach(() => {
  cleanup();
  for (const scope of scopes.splice(0)) { scope.admin.dispose(); scope.overlays.dispose(); }
  resetContentRefreshBus();
  vi.unstubAllGlobals();
  setPublishToLiveAvailable(true);
  window.history.replaceState(null, '', '/');
});

/** Real module, controllers and memory adapter; only the host locale/API ports are injected. */
function fixture({ useLocale = () => 'en', tabId = null, sitemapText = '<urlset><url><loc>https://site.test/one</loc></url></urlset>' }: { useLocale?: () => string; tabId?: string | null; sitemapText?: string } = {}) {
  setPublishToLiveAvailable(true);
  const api = createMemorySeoApi({ sitemapText });
  const load = vi.spyOn(api, 'getSeoSettings');
  const subscribe = vi.fn(seoEvents.subscribe);
  const runtime = createHostAdminScope({ permissions: ['*'] }, { seoPorts: { seoApi: api, seoEvents: { subscribe } }, useSeoLocaleHook: useLocale });
  scopes.push(runtime);
  const node = (requestedTab = tabId) => <KitProvider kit={tovuKit}><FetchQueryProvider><AdminModulesContext.Provider value={runtime}><Seo tabId={requestedTab} /></AdminModulesContext.Provider></FetchQueryProvider></KitProvider>;
  return { api, load, subscribe, runtime, node };
}

describe('Jini SEO host switch', () => {
  it.each([
    [[], false], [['media.read'], false], [['admin.seo.manage'], true], [['*'], true],
  ] as const)('retains the SEO route gate for grants %j', (permissions, visible) => {
    const runtime = createHostAdminScope({ permissions });
    scopes.push(runtime);
    expect(runtime.admin.describe().pages.find(page => page.id === 'seo.settings')).toMatchObject({ path: '/seo', visible, permissions: ['admin.seo.manage'] });
  });

  it('mounts defaults, the original loading notice and publish contribution', async () => {
    const { runtime, node } = fixture();
    render(node());
    expect(screen.getByText('Loading SEO settings…')).toHaveClass('notice');
    expect(await screen.findByRole('heading', { name: 'SEO' })).toHaveClass('jini-page-title');
    expect(document.querySelector('[data-agent-element="publish-section-settings"]')).toHaveClass('btn-secondary');
    expect(screen.getByRole('tab', { name: 'Site defaults' })).toHaveAttribute('aria-selected', 'true');
    expect(Object.keys(runtime.bindings.seo!.pages.settings!.tabs)).toEqual(['defaults', 'sitemap', 'entries']);
  });

  it('changes locale without remounting the uncontrolled defaults form or rereading settings', async () => {
    let locale = 'en';
    const { load, node } = fixture({ useLocale: () => locale });
    const view = render(node());
    const title = await screen.findByLabelText('Title template (must contain %s)');
    fireEvent.change(title, { target: { value: '%s — unsaved' } });
    locale = 'es';
    view.rerender(node());
    expect(await screen.findByRole('tab', { name: 'Valores predeterminados del sitio' })).toBeInTheDocument();
    expect(view.container.querySelector('#seo-title-template')).toBe(title);
    expect(title).toHaveValue('%s — unsaved');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retains tab deep links and replacement history through the module bridge', async () => {
    window.history.replaceState(null, '', '/admin/seo?tab=defaults');
    const { node } = fixture();
    const view = render(node());
    await screen.findByRole('tab', { name: 'Site defaults' });
    const length = window.history.length;
    fireEvent.click(screen.getByRole('tab', { name: 'Sitemap' }));
    expect(window.location.pathname + window.location.search).toBe('/admin/seo?tab=sitemap');
    expect(window.history.length).toBe(length);
    view.rerender(node('sitemap'));
    expect(await screen.findByText('This site publishes a sitemap.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Pages & posts' }));
    expect(window.location.pathname + window.location.search).toBe('/admin/seo?tab=entries');
    view.rerender(node('entries'));
    expect(await screen.findByRole('combobox', { name: 'Entry' })).toBeInTheDocument();
  });

  it('opens the sitemap modal over the injected raw XML and regenerates through the same API', async () => {
    const { api, node } = fixture({ tabId: 'sitemap' });
    const xml = vi.spyOn(api, 'fetchSitemapXml');
    const regenerate = vi.spyOn(api, 'regenerateSeoSitemap');
    render(node());
    fireEvent.click(await screen.findByRole('button', { name: 'View sitemap' }));
    expect(await screen.findByRole('link', { name: 'https://site.test/one' })).toHaveAttribute('href', 'https://site.test/one');
    expect(xml).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate sitemap' }));
    await waitFor(() => expect(regenerate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(xml).toHaveBeenCalledTimes(2));
  });

  it('formats sitemap dates in the live admin locale without remounting or rewriting XML', async () => {
    let locale = 'en';
    // Zone-less ISO is local wall time, making exact locale assertions independent of test TZ.
    const sitemapText = '<urlset><url><loc>https://site.test/one</loc><lastmod>2026-10-08T14:05:00</lastmod></url><url><loc>https://site.test/invalid</loc><lastmod>invalid</lastmod></url><url><loc>https://site.test/missing</loc></url></urlset>';
    const { api, node } = fixture({ useLocale: () => locale, tabId: 'sitemap', sitemapText });
    const xml = vi.spyOn(api, 'fetchSitemapXml');
    const view = render(node());
    fireEvent.click(await screen.findByRole('button', { name: 'View sitemap' }));
    expect(await screen.findByText('10/8/26, 2:05 PM')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    for (const url of ['https://site.test/invalid', 'https://site.test/missing']) {
      expect(screen.getByRole('link', { name: url }).closest('tr')?.lastElementChild?.textContent).toBe('—');
    }
    locale = 'es';
    view.rerender(node());
    expect(await screen.findByText('8/10/26, 14:05')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(xml).toHaveBeenCalledTimes(1);
    locale = 'en';
    view.rerender(node());
    fireEvent.click(await screen.findByRole('button', { name: 'Raw XML' }));
    expect(dialog.querySelector('pre')?.textContent).toBe(sitemapText);
  });

  it('refreshes SEO settings only for matching resources and releases its subscription', async () => {
    const { load, subscribe, node } = fixture();
    const view = render(node());
    await screen.findByRole('heading', { name: 'SEO' });
    // Settings can paint before the controller's subscription effect has attached.
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    act(() => publishContentRefresh(['media']));
    expect(load).toHaveBeenCalledTimes(1);
    act(() => publishContentRefresh(['seo']));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    view.unmount();
    act(() => publishContentRefresh(['seo']));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('uses the host picker to hydrate a CMS slug before writing the SEO image reference', async () => {
    const user = userEvent.setup();
    const { runtime, node } = fixture();
    const selected = { id: 'm1', title: 'Cover', alt: 'Cover art', contentType: 'image/png', publicUrl: '/m/cover/public' };
    const pick = vi.fn(async () => selected);
    // DI fake for the shared service; the real host wrapper still performs its CMS hydration.
    runtime.picker = { pick };
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ media: [{ ...selected, slug: 'cover-slug', status: 'active' }] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    render(node());
    const input = await screen.findByLabelText('Default Open Graph / Twitter image');
    // Await a browser-style gesture so effect-owned picker state is attached before use.
    await user.click(screen.getByRole('button', { name: 'Choose image' }));
    await waitFor(() => expect(input).toHaveValue('Selected image'));
    expect(new FormData(input.closest('form')!).getAll('defaultOgImage')).toEqual(['cover-slug:public']);
    expect(pick).toHaveBeenCalledWith({ accept: ['image/*'] }, { signal: expect.any(AbortSignal) });
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/workspaces/workspace-local/media'))).toBe(true);
  });
});
