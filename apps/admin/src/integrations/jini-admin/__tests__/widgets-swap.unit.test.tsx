import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchQueryProvider } from '@/__tests__/fetch-query-provider.test-helper';
import { KitProvider } from '@jini-ai/ui-kit/react';
import { createMemoryWidgetsApi } from '@jini-ai/admin/widgets/adapters/memory';
import type { AdminWidget } from '@jini-ai/admin/widgets';
import { widgets } from '@jini-ai/admin/widgets/react';
import { createAdmin } from '@jini-ai/admin/core/module';
import { WidgetsLibrary, WidgetInstanceEditor, WidgetRegions, WidgetRegionEditor } from '../../../features/widgets';
import { AdminModulesContext, createHostAdminScope } from '../modules.hooks';
import { widgetsEvents, widgetsNavigation } from '../widgets-ports';
import { WidgetsConfigFieldsSlot } from '../widgets-module.hooks';
import { WidgetAddControl } from '../../../components/WidgetPickerDialog/WidgetPickerDialog';
import { WIDGET_TYPE_OPTIONS, defaultWidgetConfig } from '../../../components/WidgetConfigFields/WidgetConfigFields';
import type { AdminWidgetType as HostWidgetType } from '../../../lib/api';
import { tovuKit } from '../kit';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';
import { setPublishToLiveAvailable } from '../../../features/publish-content/hooks/publish-availability.store';

const scopes: ReturnType<typeof createHostAdminScope>[] = [];
afterEach(() => {
  cleanup();
  for (const scope of scopes.splice(0)) { scope.admin.dispose(); scope.overlays.dispose(); }
  resetContentRefreshBus(); vi.unstubAllGlobals();
  setPublishToLiveAvailable(true);
  window.history.replaceState(null, '', '/');
});

const widget: AdminWidget = { id: 'w9', workspaceId: 'ws1', slug: 'footer-note', title: 'Reusable footer',
  status: 'active', widgetType: 'text', config: { body: 'Hello' }, updatedAt: new Date(0).toISOString(), version: 1 };

/** Real module/controllers plus memory API; retained config/picker/publish components are real. */
function fixture({ useLocale = () => 'en' }: { useLocale?: (() => string) | null } = {}) {
  const api = createMemoryWidgetsApi({ widgets: [widget],
    regions: [{ workspaceId: 'ws1', regionKey: 'footer', areaEntryId: 'a1', updatedAt: widget.updatedAt, placementCount: 0 }],
    areas: { footer: { area: { id: 'a1', workspaceId: 'ws1', regionKey: 'footer', updatedAt: widget.updatedAt, version: 1 }, placements: [] } },
  });
  const runtime = createHostAdminScope({ permissions: ['*'] }, {
    widgetsPorts: { widgetsApi: api, widgetsEvents, widgetsNavigation },
    ...(useLocale === null ? {} : { useWidgetsLocaleHook: useLocale }),
  });
  scopes.push(runtime);
  const node = (children: ReactNode) => <KitProvider kit={tovuKit}><FetchQueryProvider><AdminModulesContext.Provider value={runtime}>{children}</AdminModulesContext.Provider></FetchQueryProvider></KitProvider>;
  return { api, runtime, node };
}

describe('Jini widgets host switch', () => {
  it.each([[[]], [['media.read']], [['widgets.*']], [['*']]] as const)('retains four pages without a client permission gate for %j', permissions => {
    const runtime = createHostAdminScope({ permissions });
    scopes.push(runtime);
    expect(runtime.admin.describe().pages.filter(page => page.id.startsWith('widgets.')).map(page => [page.id, page.path, page.visible, page.permissions])).toEqual([
      ['widgets.library', '/widgets', true, []], ['widgets.editor', '/widgets/:widgetId', true, []],
      ['widgets.regions', '/widgets/regions', true, []], ['widgets.region', '/widgets/regions/:regionKey', true, []],
    ]);
  });

  it('mounts the library loading notice, row handles, create route and publish contribution', async () => {
    setPublishToLiveAvailable(true);
    const { node } = fixture();
    render(node(<WidgetsLibrary />));
    expect(screen.getByText('Loading widgets…')).toHaveClass('notice');
    expect(await screen.findByRole('heading', { name: 'Widgets' })).toHaveClass('page-title');
    expect(screen.getByRole('link', { name: 'Reusable footer' })).toHaveAttribute('href', '/admin/widgets/footer-note');
    expect(document.querySelector('[data-agent-element="publish-section-widgets"]')).toHaveClass('btn-secondary');
    fireEvent.change(screen.getByRole('combobox', { name: 'Widget type to create' }), { target: { value: 'social-links' } });
    expect(screen.getByRole('link', { name: 'Add New' })).toHaveAttribute('href', '/admin/widgets/new?type=social-links');
  });

  // Retained from WidgetsLibrary.unit: real locale/dictionary wiring, not just injected strings.
  it("labels the create-type select and its options in the admin's locale", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ key: 'locale', value: 'es' }] }), { headers: { 'content-type': 'application/json' } })));
    const { node } = fixture({ useLocale: null });
    render(node(<WidgetsLibrary />));
    const select = await screen.findByRole('combobox', { name: 'Tipo de widget a crear' });
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual([
      'Texto', 'Enlaces sociales', 'Entradas recientes', 'Menú', 'Formulario de contacto',
    ]);
  });

  // Retained from WidgetInstanceEditor.unit: ConfigFields has its OWN shared dictionary.
  it("threads a Spanish locale into the nested WidgetConfigFields via a SECOND t bound to shared-components-i18n, not this screen's own widgets-i18n t", async () => {
    const { node } = fixture({ useLocale: () => 'es' });
    render(node(<WidgetInstanceEditor widgetId={null} widgetType="text" />));
    expect(await screen.findByLabelText('Texto')).toBeInTheDocument();
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
  });

  it('uses shared config copy even when the page translator is an English passthrough', () => {
    // Keep the old mixed suite's discriminating seam: page copy intentionally stays English.
    // Only the actual host slot's separate dictionary can produce Texto in this harness.
    const feature = widgets({ slots: { ConfigFields: WidgetsConfigFieldsSlot, AddControl: WidgetAddControl },
      widgetTypes: WIDGET_TYPE_OPTIONS, defaultConfig: type => defaultWidgetConfig(type as HostWidgetType),
    }, { locale: 'es', t: key => key });
    const admin = createAdmin({ modules: [feature], ports: { widgetsApi: createMemoryWidgetsApi({}) } });
    try {
      render(<feature.react.Provider admin={admin}><WidgetsConfigFieldsSlot widgetType="text" config={{}} onChange={vi.fn()} t={key => key} /></feature.react.Provider>);
      expect(screen.getByLabelText('Texto')).toBeInTheDocument();
      expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
    } finally { cleanup(); admin.dispose(); }
  });

  it('refreshes locale without remounting a loaded editor or losing unsaved title/config', async () => {
    let locale = 'en';
    const { api, node } = fixture({ useLocale: () => locale });
    const read = vi.spyOn(api, 'getWidget');
    const view = render(node(<WidgetInstanceEditor widgetId="footer-note" widgetType={null} />));
    const title = await screen.findByLabelText('Widget title');
    const body = screen.getByLabelText('Text');
    fireEvent.change(title, { target: { value: 'Unsaved footer' } });
    fireEvent.change(body, { target: { value: 'Unsaved body' } });
    locale = 'es'; view.rerender(node(<WidgetInstanceEditor widgetId="footer-note" widgetType={null} />));
    expect(await screen.findByLabelText('Texto')).toBe(body);
    expect(title).toHaveValue('Unsaved footer');
    expect(body).toHaveValue('Unsaved body');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('forwards new-editor type and navigates a created widget to its slug', async () => {
    const user = userEvent.setup();
    const { api, node } = fixture();
    const create = vi.spyOn(api, 'createWidget');
    render(node(<WidgetInstanceEditor widgetId={null} widgetType="text" />));
    // A new editor paints immediately; awaited gestures flush its effect-owned controller.
    const title = await screen.findByLabelText('Widget title');
    await user.type(title, 'New footer');
    expect(title).toHaveValue('New footer');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ widgetType: 'text', title: 'New footer', config: { body: '' } }, { signal: expect.any(AbortSignal) }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/widgets/fake-slug-2'));
  });

  it('binds a new region and retains the host regions route', async () => {
    const { api, node } = fixture();
    const bind = vi.spyOn(api, 'bindWidgetRegion');
    render(node(<WidgetRegions />));
    expect(await screen.findByRole('link', { name: 'footer' })).toHaveAttribute('href', '/admin/widgets/regions/footer');
    fireEvent.change(screen.getByPlaceholderText('e.g. footer'), { target: { value: ' sidebar ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bind region' }));
    await waitFor(() => expect(bind).toHaveBeenCalledWith({ regionKey: 'sidebar' }, { signal: expect.any(AbortSignal) }));
    // Binding opens the new region editor; this isolated list mount does not follow routes.
    await waitFor(() => expect(window.location.pathname).toBe('/admin/widgets/regions/sidebar'));
    expect((await api.getWidgetRegion({ regionKey: 'sidebar' })).area.regionKey).toBe('sidebar');
  });

  // Retained from WidgetRegionEditor.unit: exercise the actual picker and native Dialog.
  it('renders the Add widget control and places the selected existing widget', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).includes('/settings/effective')
      ? { data: [{ key: 'locale', value: 'en' }] } : { widgets: [widget] }), { headers: { 'content-type': 'application/json' } })));
    const { api, node } = fixture();
    const save = vi.spyOn(api, 'mutateWidgetRegionPlacements');
    render(node(<WidgetRegionEditor regionKey="footer" />));
    await user.click(await screen.findByRole('button', { name: '+ Add widget' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Existing Text widgets' }));
    await user.click(screen.getByRole('option', { name: 'Reusable footer' }));
    await user.click(within(dialog).getByRole('button', { name: 'Use this widget' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Reusable footer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ regionKey: 'footer', baseVersion: 1, placements: [
      { placementId: expect.any(String), widgetEntryId: 'w9', enabled: true },
    ] }, { signal: expect.any(AbortSignal) }));
  });

  it('refreshes only the mounted library resource and unsubscribes on unmount', async () => {
    const { api, node } = fixture();
    const read = vi.spyOn(api, 'listWidgets');
    const view = render(node(<WidgetsLibrary />));
    await screen.findByRole('heading', { name: 'Widgets' });
    act(() => publishContentRefresh(['widgets-regions']));
    expect(read).toHaveBeenCalledTimes(1);
    act(() => publishContentRefresh(['widgets-library']));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    view.unmount();
    act(() => publishContentRefresh(['widgets-library']));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('replaces a raw id bookmark with its loaded slug without adding history', async () => {
    const { api, node } = fixture();
    const id = '550e8400-e29b-41d4-a716-446655440000';
    api.widgets[0]!.id = id;
    window.history.replaceState(null, '', `/admin/widgets/${id}`);
    const length = window.history.length;
    render(node(<WidgetInstanceEditor widgetId={id} widgetType={null} />));
    await screen.findByDisplayValue('Reusable footer');
    await waitFor(() => expect(window.location.pathname).toBe('/admin/widgets/footer-note'));
    expect(window.history.length).toBe(length);
  });

  it('keeps an unsaved region draft through locale changes and unrelated refreshes', async () => {
    let locale = 'en';
    const { api, node } = fixture({ useLocale: () => locale });
    const area = (await api.getWidgetRegion({ regionKey: 'footer' })).area;
    await api.mutateWidgetRegionPlacements({ regionKey: 'footer', baseVersion: area.version,
      placements: [{ placementId: 'p1', widgetEntryId: 'w9', enabled: true }] });
    const read = vi.spyOn(api, 'getWidgetRegion');
    const save = vi.spyOn(api, 'mutateWidgetRegionPlacements');
    const view = render(node(<WidgetRegionEditor regionKey="footer" />));
    const enabled = await screen.findByRole('checkbox', { name: 'Enabled' });
    fireEvent.click(enabled);
    expect(enabled).not.toBeChecked();
    locale = 'es'; view.rerender(node(<WidgetRegionEditor regionKey="footer" />));
    act(() => publishContentRefresh(['widgets-regions']));
    expect(view.container.querySelector('input[type="checkbox"]')).toBe(enabled);
    expect(enabled).not.toBeChecked();
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ regionKey: 'footer', baseVersion: 2,
      placements: [{ placementId: 'p1', widgetEntryId: 'w9', enabled: false }] }, { signal: expect.any(AbortSignal) }));
  });
});
