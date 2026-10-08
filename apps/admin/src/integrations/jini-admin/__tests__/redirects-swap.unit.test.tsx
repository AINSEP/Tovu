import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchQueryProvider } from '@jini-ai/ui/fetch-query';
import { createMemoryRedirectsApi } from '@jini-ai/admin/redirects/adapters/memory';
import { Redirects } from '../../../features/redirects';
import { AdminModulesContext, createHostAdminScope } from '../modules.hooks';
import { redirectsEvents } from '../redirects-ports';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';

const scopes: ReturnType<typeof createHostAdminScope>[] = [];
afterEach(() => {
  cleanup();
  for (const scope of scopes.splice(0)) { scope.admin.dispose(); scope.overlays.dispose(); }
  resetContentRefreshBus();
});

/** Use the real module/memory adapter and host markup slots, with no module mocks. */
async function fixture({ useLocale = () => 'en' }: { useLocale?: () => string } = {}) {
  const api = createMemoryRedirectsApi({});
  const row = await api.createRedirect({ matchType: 'exact', fromPattern: '/old/<script>', toTarget: '/new', statusCode: 301 });
  const list = vi.spyOn(api, 'listRedirects');
  const hits = vi.spyOn(api, 'getRedirectHitStats');
  const runtime = createHostAdminScope({ permissions: ['*'] }, { redirectsPorts: { redirectsApi: api, redirectsEvents }, useRedirectsLocaleHook: useLocale });
  scopes.push(runtime);
  const node = () => <FetchQueryProvider><AdminModulesContext.Provider value={runtime}><Redirects /></AdminModulesContext.Provider></FetchQueryProvider>;
  return { api, row, list, hits, runtime, node };
}

describe('Jini redirects host switch', () => {
  it.each([
    [[], false],
    [['media.read'], false],
    [['admin.redirects.manage'], true],
    [['*'], true],
  ] as const)('keeps the route gate for grants %j', (permissions, visible) => {
    const runtime = createHostAdminScope({ permissions });
    scopes.push(runtime);
    expect(runtime.admin.describe().pages.find(page => page.id === 'redirects.list')).toMatchObject({ path: '/redirects', visible, permissions: ['admin.redirects.manage'] });
  });

  it('mounts the existing route, publish contribution and lazy zero-hit cell', async () => {
    const user = userEvent.setup();
    const { row, hits, runtime, node } = await fixture();
    const view = render(node());
    expect(screen.getByText('Loading redirects…')).toHaveClass('notice');
    // The real lazy page's cold import includes the shared admin views; wait for its DOM,
    // rather than treating Testing Library's one-second default as a product deadline.
    expect(await screen.findByRole('heading', { name: 'Redirects' }, { timeout: 10000 })).toHaveClass('page-title');
    expect(screen.getByRole('button', { name: 'Publish redirects' })).toHaveAttribute('data-agent-element', 'publish-section-redirects');
    expect(runtime.admin.describe().pages.find(page => page.id === 'redirects.list')).toMatchObject({ path: '/redirects', visible: true, permissions: ['admin.redirects.manage'] });
    expect(hits).not.toHaveBeenCalled();
    const tableRow = screen.getByText('/old/<script>').closest('tr')!;
    // A newly mounted row paints before its effect-owned hit controller is attached.
    await user.click(within(tableRow).getByRole('button', { name: 'Load hits' }));
    expect(await within(tableRow).findByText('0')).toBeInTheDocument();
    expect(hits).toHaveBeenCalledWith({ id: row.id });
    expect(view.container.querySelector('script')).toBeNull();
  }, 15000);

  it('changes locale without remounting edited create/import fields or loaded hits', async () => {
    let locale = 'en';
    const { hits, list, node } = await fixture({ useLocale: () => locale });
    const view = render(node());
    const from = await screen.findByLabelText('From path', {}, { timeout: 10000 });
    fireEvent.change(from, { target: { value: '/unsaved' } });
    const raw = view.container.querySelector('#redirects-import-json')!;
    fireEvent.change(raw, { target: { value: '[{"draft":true}]' } });
    const row = screen.getByText('/old/<script>').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Load hits' }));
    await within(row).findByText('0');
    locale = 'es';
    view.rerender(node());
    expect(await screen.findByRole('heading', { name: 'Redirecciones' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ruta de origen')).toBe(from);
    expect(from).toHaveValue('/unsaved');
    expect(view.container.querySelector('#redirects-import-json')).toBe(raw);
    expect(raw).toHaveValue('[{"draft":true}]');
    expect(screen.getByText('Importación masiva')).toBeInTheDocument();
    expect(within(row).getByText('0')).toBeInTheDocument();
    expect(hits).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    const label = view.container.querySelector('label[for="redirects-import-json"]')!;
    expect(label.textContent).toBe('Pega un arreglo JSON de objetos de regla {matchType, fromPattern, toTarget, statusCode, override?, priority?} (1-500 elementos)');
    expect(label.querySelector('code')?.textContent).toBe('{matchType, fromPattern, toTarget, statusCode, override?, priority?}');
    fireEvent.click(within(row).getByRole('button', { name: 'Acciones para la regla de redirección desde "/old/<script>"' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar' }));
    expect(await screen.findByText('¿Eliminar la regla de redirección desde "/old/<script>"?')).toBeInTheDocument();
    expect(view.container.querySelector('script')).toBeNull();
  }, 15000);

  it('renders partial import results through the original helper copy', async () => {
    const { node } = await fixture({ useLocale: () => 'es' });
    const view = render(node());
    await screen.findByRole('heading', { name: 'Redirecciones' }, { timeout: 10000 });
    fireEvent.change(view.container.querySelector('#redirects-import-json')!, { target: { value: JSON.stringify([
      { matchType: 'exact', fromPattern: '/good', toTarget: '/new', statusCode: 301 },
      { matchType: 'regex', fromPattern: '^/bad$', toTarget: '/new', statusCode: 301 },
    ]) } });
    fireEvent.submit(view.container.querySelector('#redirects-import-json')!.closest('form')!);
    expect(await screen.findByText('1 creadas, 1 fallidas.')).toBeInTheDocument();
    expect(screen.getByText('Creada')).toBeInTheDocument();
    expect(screen.getByText('Elemento 1 (REDIRECT_VALIDATION_ERROR)')).toBeInTheDocument();
  }, 15000);

  it('refreshes the mounted list for redirects and disposes its subscription', async () => {
    const { list, node } = await fixture();
    const view = render(node());
    await screen.findByRole('heading', { name: 'Redirects' });
    expect(list).toHaveBeenCalledTimes(1);
    act(() => publishContentRefresh(['media']));
    expect(list).toHaveBeenCalledTimes(1);
    act(() => publishContentRefresh(['redirects']));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    view.unmount();
    act(() => publishContentRefresh(['redirects']));
    expect(list).toHaveBeenCalledTimes(2);
  });
});
