import { describe, expect, it, vi } from 'vitest';
import type { FormsTransportPort } from '@jini-ai/admin/forms/adapters/http';
import { createFormsHostPorts, createFormsTranslator, formsEvents, formsSessionGrants } from '../forms-ports';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';
import { COMMON_I18N } from '../../../lib/i18n-common';

describe('Forms host ports', () => {
  it('preserves encoded routes, envelopes, authoring patches and the generic Trash POST', async () => {
    const request = vi.fn<(input: Parameters<FormsTransportPort['request']>[0]) => Promise<unknown>>()
      .mockResolvedValue({ data: [], nextCursor: null });
    const transport: FormsTransportPort = {
      request: async <T,>(input: Parameters<FormsTransportPort['request']>[0]): Promise<T> => await request(input) as T,
      url: ({ path }) => path,
    };
    const ports = createFormsHostPorts({ transport }, { workspaceId: 'w1' });
    await expect(ports.formsApi.listFormDefinitions({})).resolves.toEqual([]);
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/forms', method: 'GET' });
    await ports.formsApi.getFormDefinition({ id: 'contact/us' });
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/forms/contact%2Fus', method: 'GET' });
    await ports.formsApi.updateFormDefinition({ id: 'f1' }, { name: 'Contact' });
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/forms/f1', method: 'PUT', body: { name: 'Contact' } });
    await ports.formsApi.updateFormDefinition({ id: 'f1' }, { mode: 'html', html: '<input name="email">' });
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/forms/f1/authoring', method: 'PUT', body: { mode: 'html', html: '<input name="email">' } });
    await expect(ports.formsApi.listFormSubmissions({ formId: 'f/1' }, { cursor: 's/1', limit: 10 })).resolves.toEqual({ items: [], nextCursor: null });
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/forms/f%2F1/submissions?cursor=s%2F1&limit=10', method: 'GET' });
    await ports.formsApi.deleteFormSubmission({ formId: 'f/1', submissionId: 's/1' });
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/forms/f%2F1/submissions/s%2F1', method: 'DELETE' });
    await ports.formsTrash.trash({ type: 'form_submission', id: 's1' });
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/trash/items', method: 'POST', body: { type: 'form_submission', id: 's1' } });
    await ports.formsTrash.trash({ type: 'form', id: 'f1' });
    expect(request).toHaveBeenLastCalledWith({ path: '/workspaces/w1/trash/items', method: 'POST', body: { type: 'form', id: 'f1' } });
  });

  it('preserves transport errors instead of replacing a Trash conflict', async () => {
    const error = Object.assign(new Error('changed'), { status: 409, code: 'TRASH_VERSION_CHANGED' });
    const request = vi.fn<(input: Parameters<FormsTransportPort['request']>[0]) => Promise<never>>().mockRejectedValue(error);
    const ports = createFormsHostPorts({ transport: { request, url: ({ path }) => path } });
    await expect(ports.formsTrash.trash({ type: 'form', id: 'f1' })).rejects.toBe(error);
    await expect(ports.formsApi.deleteFormSubmission({ formId: 'f1', submissionId: 's1' })).rejects.toBe(error);
  });

  it('filters refreshes to Forms and unsubscribes on disposal', () => {
    resetContentRefreshBus();
    const onRefresh = vi.fn();
    const unsubscribe = formsEvents.subscribe({ onRefresh });
    publishContentRefresh(['media']);
    expect(onRefresh).not.toHaveBeenCalled();
    publishContentRefresh(['forms']);
    expect(onRefresh).toHaveBeenCalledOnce();
    unsubscribe();
    publishContentRefresh(['forms']);
    expect(onRefresh).toHaveBeenCalledOnce();
    resetContentRefreshBus();
  });

  it('uses exact grants or the literal wildcard and reuses feature/common dictionaries including placeholders', () => {
    expect(formsSessionGrants({ permissions: ['*'] })).toEqual(['admin.forms.manage']);
    expect(formsSessionGrants({ permissions: ['admin.forms.manage'] })).toEqual(['admin.forms.manage']);
    expect(formsSessionGrants({ permissions: ['admin.forms.*'] })).toEqual([]);
    expect(formsSessionGrants({ permissions: ['media.read'] })).toEqual([]);
    expect(formsSessionGrants({ permissions: [] })).toEqual([]);
    const t = createFormsTranslator({ locale: 'de' });
    expect(t('Forms')).toBe('Formulare');
    expect(t('Save')).toBe(COMMON_I18N.de.Save);
    expect(t('Created {date}', { date: 'today' })).toBe('Erstellt today');
  });
});
