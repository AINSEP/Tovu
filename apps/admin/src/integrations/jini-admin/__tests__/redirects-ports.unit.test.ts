import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApiError, describeApiError } from '@jini-ai/admin/core';
import type { RedirectsTransportPort } from '@jini-ai/admin/redirects/adapters/http';
import { ApiError } from '../../../lib/api';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';
import { createRedirectsHostPorts, createRedirectsTranslator, redirectsEvents, redirectsSessionGrants } from '../redirects-ports';

afterEach(resetContentRefreshBus);

describe('redirects host ports', () => {
  it('uses the shared labels for English and localized redirect enums', () => {
    const en = createRedirectsTranslator({ locale: 'en' });
    expect(['exact', 'prefix', 'wildcard', 'manual', 'auto_slug_change', 'import', 'active', 'disabled']
      .map(value => en(value, { serverLabel: value }))).toEqual([
        'Exact match', 'Starts with', 'Wildcard', 'Manual', 'URL change', 'Imported', 'Active', 'Disabled',
      ]);
    const es = createRedirectsTranslator({ locale: 'es' });
    expect(es('auto_slug_change', { serverLabel: 'auto_slug_change' })).toBe('Cambio de URL');
    expect(es('manual', { serverLabel: 'manual' })).toBe('Manual');
    expect(es('import', { serverLabel: 'import' })).toBe('Importado');
    expect(en('future_source', { serverLabel: 'future_source' })).toBe('future_source');
  });
  it('keeps HTTP paths, envelopes, encoded ids, regex inputs and partial import outcomes', async () => {
    const row = { id: 'r/1', workspaceId: 'ws1' };
    const partial = { created: [row], failed: [{ index: 1, code: 'INVALID', message: 'invalid target' }] };
    const calls = vi.fn<(input: Parameters<RedirectsTransportPort['request']>[0]) => unknown>(input => {
      if (input.path.endsWith('/import')) return partial;
      if (input.path.endsWith('/hits')) return { data: { redirectId: 'r/1', hitCount: 0, lastHitAt: null } };
      return { data: input.path.endsWith('/redirects') && input.method === 'GET' ? [row] : row };
    });
    const transport: RedirectsTransportPort = {
      request: async <T,>(input: Parameters<RedirectsTransportPort['request']>[0]): Promise<T> => calls(input) as T,
      url: ({ path }) => path,
    };
    const { redirectsApi: api } = createRedirectsHostPorts({ transport }, { workspaceId: 'ws1' });
    expect(await api.listRedirects({})).toEqual([row]);
    expect(await api.getRedirect({ id: 'r/1' })).toEqual(row);
    await api.createRedirect({ matchType: 'regex', fromPattern: '^/old$', toTarget: '/new', statusCode: 301 }, { override: true, priority: 7 });
    await api.updateRedirect({ id: 'r/1' }, { status: 'disabled' });
    await api.tombstoneRedirect({ id: 'r/1' });
    expect(await api.getRedirectHitStats({ id: 'r/1' })).toEqual({ redirectId: 'r/1', hitCount: 0, lastHitAt: null });
    const rules = [{ matchType: 'exact', fromPattern: '/old', toTarget: '/new', statusCode: 301 }] as const;
    expect(await api.importRedirects({ rules })).toBe(partial);
    expect(calls.mock.calls.map(([input]) => input)).toEqual([
      { path: '/workspaces/ws1/redirects', method: 'GET' },
      { path: '/workspaces/ws1/redirects/r%2F1', method: 'GET' },
      { path: '/workspaces/ws1/redirects', method: 'POST', body: { matchType: 'regex', fromPattern: '^/old$', toTarget: '/new', statusCode: 301, override: true, priority: 7 } },
      { path: '/workspaces/ws1/redirects/r%2F1', method: 'PATCH', body: { status: 'disabled' } },
      { path: '/workspaces/ws1/redirects/r%2F1', method: 'DELETE' },
      { path: '/workspaces/ws1/redirects/r%2F1/hits', method: 'GET' },
      { path: '/workspaces/ws1/redirects/import', method: 'POST', body: { rules } },
    ]);
  });

  it.each(['', 'operator error'])('retains host error fallback and details for message %j', async message => {
    const body = { detail: 'original detail' };
    const transport: RedirectsTransportPort = { request: async () => { throw new ApiError(message, 409, 'CONFLICT', body); }, url: ({ path }) => path };
    const { redirectsApi } = createRedirectsHostPorts({ transport });
    const error = await redirectsApi.listRedirects({}).catch(value => value);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ message, status: 409, code: 'CONFLICT', body });
    expect(describeApiError({ e: error, fallback: 'failed to load redirects' })).toBe(message || 'failed to load redirects');
  });

  it('passes non-host failures through unchanged', async () => {
    const error = new Error('network failed');
    const transport: RedirectsTransportPort = { request: async () => { throw error; }, url: ({ path }) => path };
    await expect(createRedirectsHostPorts({ transport }).redirectsApi.listRedirects({})).rejects.toBe(error);
  });

  it('calls the existing copy owners, preserving variables and unknown-value fallback', () => {
    const t = createRedirectsTranslator({ locale: 'es' });
    expect(t('Bulk import')).toBe('Importación masiva');
    expect(t('{created} created, {failed} failed.', { created: 17, failed: 3 })).toBe('17 creadas, 3 fallidas.');
    expect(t('Created')).toBe('Creada');
    expect(t('Item {index} ({code})', { index: 9, code: 'DUPLICATE' })).toBe('Elemento 9 (DUPLICATE)');
    expect(t('Actions for redirect rule from "{fromPattern}"', { fromPattern: '/old/<script>' })).toBe('Acciones para la regla de redirección desde "/old/<script>"');
    expect(t('active', { serverLabel: 'active' })).toBe('activo');
    expect(t('future_status', { serverLabel: 'future_status' })).toBe('future_status');
    expect(t('unknown message {count}', { count: 3 })).toBe('unknown message 3');
    expect(createRedirectsTranslator({ locale: 'unlisted-locale' })('Bulk import')).toBe('Bulk import');
  });

  it('uses the literal owner wildcard and exact grants only', () => {
    expect(redirectsSessionGrants({ permissions: ['*'] })).toEqual(['admin.redirects.manage']);
    expect(redirectsSessionGrants({ permissions: ['admin.redirects.manage'] })).toEqual(['admin.redirects.manage']);
    expect(redirectsSessionGrants({ permissions: ['admin.redirects.*', 'media.read'] })).toEqual([]);
    expect(redirectsSessionGrants({ permissions: [] })).toEqual([]);
  });

  it('filters named refreshes, retains unknown scope and removes the listener', () => {
    const listener = vi.fn();
    const unsubscribe = redirectsEvents.subscribe(listener);
    publishContentRefresh(['media']);
    expect(listener).not.toHaveBeenCalled();
    publishContentRefresh(['redirects']);
    publishContentRefresh();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    publishContentRefresh(['redirects']);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
