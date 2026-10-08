import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WidgetsTransportPort } from '@jini-ai/admin/widgets/adapters/http';
import { WIDGETS_LIBRARY_RESOURCE, WIDGETS_REGIONS_RESOURCE, widgetTypeLabel } from '@jini-ai/admin/widgets';
import { createWidgetsHostPorts, createWidgetsTranslator, widgetsEvents, widgetsNavigation } from '../widgets-ports';
import { WIDGET_TYPE_OPTIONS } from '../../../components/WidgetConfigFields/WidgetConfigFields';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';

afterEach(() => { resetContentRefreshBus(); window.history.replaceState(null, '', '/'); });

describe('widgets host ports', () => {
  it('preserves all nine workspace request paths, methods, bodies and cancellation', async () => {
    const calls = vi.fn(async (_input: Parameters<WidgetsTransportPort['request']>[0], _options?: Parameters<WidgetsTransportPort['request']>[1]) => ({ accepted: true }));
    const transport: WidgetsTransportPort = {
      request: async <T,>(input: Parameters<WidgetsTransportPort['request']>[0], options?: Parameters<WidgetsTransportPort['request']>[1]): Promise<T> => await calls(input, options) as T,
      url: ({ path }) => `/api/admin/v1${path}`,
    };
    const { widgetsApi: api } = createWidgetsHostPorts({ transport }, { workspaceId: 'ws1' });
    const signal = new AbortController().signal;
    const options = { signal };
    expect(await api.listWidgets({ widgetType: 'social-links', includeInactive: true }, options)).toEqual({ accepted: true });
    await api.getWidget({ id: 'widget/1' }, options);
    await api.createWidget({ widgetType: 'text', title: 'Footer', config: { body: 'Hello' } }, options);
    await api.updateWidget({ id: 'widget/1', baseVersion: 3, config: { body: 'Edited' } }, options);
    await api.trashWidget({ id: 'widget/1' }, options);
    await api.listWidgetRegions({}, options);
    await api.bindWidgetRegion({ regionKey: 'footer/one' }, options);
    await api.getWidgetRegion({ regionKey: 'footer/one' }, options);
    const placements = [{ placementId: 'p1', widgetEntryId: 'w1', enabled: false }];
    await api.mutateWidgetRegionPlacements({ regionKey: 'footer/one', baseVersion: 4, placements }, options);
    expect(calls.mock.calls.map(([input]) => input)).toEqual([
      { path: '/workspaces/ws1/widgets?widgetType=social-links&includeInactive=true', method: 'GET' },
      { path: '/workspaces/ws1/widgets/widget%2F1', method: 'GET' },
      { path: '/workspaces/ws1/widgets', method: 'POST', body: { widgetType: 'text', title: 'Footer', config: { body: 'Hello' } } },
      { path: '/workspaces/ws1/widgets/widget%2F1', method: 'PUT', body: { baseVersion: 3, config: { body: 'Edited' } } },
      { path: '/workspaces/ws1/trash/items', method: 'POST', body: { type: 'widget', id: 'widget/1' } },
      { path: '/workspaces/ws1/widgets/regions', method: 'GET' },
      { path: '/workspaces/ws1/widgets/regions', method: 'POST', body: { regionKey: 'footer/one' } },
      { path: '/workspaces/ws1/widgets/regions/footer%2Fone', method: 'GET' },
      { path: '/workspaces/ws1/widgets/regions/footer%2Fone', method: 'PUT', body: { baseVersion: 4, placements } },
    ]);
    expect(calls.mock.calls.map(([, optional]) => optional)).toEqual(Array.from({ length: 9 }, () => options));
  });

  it('filters library and region resources independently, includes unknown scope, and disposes', () => {
    const library = vi.fn(), regions = vi.fn();
    const stopLibrary = widgetsEvents.subscribe({ resource: WIDGETS_LIBRARY_RESOURCE, onRefresh: library });
    const stopRegions = widgetsEvents.subscribe({ resource: WIDGETS_REGIONS_RESOURCE, onRefresh: regions });
    publishContentRefresh(['media']);
    expect(library).not.toHaveBeenCalled();
    expect(regions).not.toHaveBeenCalled();
    publishContentRefresh(['widgets-library']);
    expect(library).toHaveBeenCalledTimes(1);
    expect(regions).not.toHaveBeenCalled();
    publishContentRefresh(['widgets-regions']);
    expect(regions).toHaveBeenCalledTimes(1);
    publishContentRefresh();
    expect(library).toHaveBeenCalledTimes(2);
    expect(regions).toHaveBeenCalledTimes(2);
    stopLibrary(); stopRegions();
    publishContentRefresh();
    expect(library).toHaveBeenCalledTimes(2);
    expect(regions).toHaveBeenCalledTimes(2);
  });

  it('uses the existing feature/common dictionaries and preserves unknown type labels', () => {
    const t = createWidgetsTranslator({ locale: 'es' });
    expect(widgetTypeLabel({ widgetType: 'social-links', types: WIDGET_TYPE_OPTIONS }, { t })).toBe('Enlaces sociales');
    expect(widgetTypeLabel({ widgetType: 'future-widget', types: WIDGET_TYPE_OPTIONS }, { t })).toBe('future-widget');
    expect(t('Back')).toBe('Atrás');
    expect(t('future copy')).toBe('future copy');
    expect(createWidgetsTranslator({ locale: 'unlisted' })('Saved · version {version}', { version: 7 })).toBe('Saved · version 7');
  });

  it('uses the host admin base and preserves replace history for old bookmarks', () => {
    window.history.replaceState(null, '', '/admin/widgets/old');
    const length = window.history.length;
    widgetsNavigation.navigate({ base: '/admin', routePath: '/widgets/footer' }, { replace: true });
    expect(window.location.pathname).toBe('/admin/widgets/footer');
    expect(window.history.length).toBe(length);
  });
});
