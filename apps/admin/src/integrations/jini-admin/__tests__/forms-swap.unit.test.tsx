import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchQueryProvider } from '@/__tests__/fetch-query-provider.test-helper';
import { createMemoryFormsApi } from '@jini-ai/admin/forms/adapters/memory';
import { FormsList, FormEditor } from '../../../features/forms';
import { AdminModulesContext, createHostAdminScope } from '../modules.hooks';
import { formsEvents } from '../forms-ports';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';

const scopes: ReturnType<typeof createHostAdminScope>[] = [];
afterEach(() => {
  cleanup();
  for (const scope of scopes.splice(0)) { scope.admin.dispose(); scope.overlays.dispose(); }
  resetContentRefreshBus();
  window.history.replaceState(null, '', '/');
});
const form = { id: 'f1', name: 'Contact', slug: 'contact', fields: [{ id: 'email', label: 'Email', type: 'email', required: true }], notify: { enabled: false, recipients: [] }, status: 'active', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' };
function fixture({ useLocale = () => 'en', permissions = ['*'] }: { useLocale?: () => string; permissions?: string[] } = {}) {
  const api = createMemoryFormsApi({}, { forms: [form], submissions: [{ id: 's1', formDefinitionId: 'f1', data: { email: 'visitor@example.com' }, sourceIp: '127.0.0.1', submittedAt: '2026-10-07T00:00:00Z' }] });
  const list = vi.spyOn(api, 'listFormDefinitions');
  const navigate = vi.fn();
  const runtime = createHostAdminScope({ permissions }, { formsPorts: { formsApi: api, formsTrash: api.trash, formsEvents, formsNavigation: { navigate } }, useFormsLocaleHook: useLocale });
  scopes.push(runtime);
  const node = (child: React.ReactNode) => <FetchQueryProvider><AdminModulesContext.Provider value={runtime}>{child}</AdminModulesContext.Provider></FetchQueryProvider>;
  return { api, list, runtime, node, navigate };
}

describe('Jini Forms host switch', () => {
  it('mounts the list with the original handles, paths and expanded owner grant', async () => {
    const { runtime, node } = fixture();
    render(node(<FormsList />));
    expect(screen.getByText('Loading forms…')).toHaveClass('notice');
    expect(await screen.findByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/admin/forms/contact');
    expect(screen.getByRole('heading', { name: 'Forms' })).toHaveClass('page-title');
    expect(screen.getByRole('link', { name: 'New form' })).toHaveAttribute('data-agent-element', 'forms-new');
    expect(runtime.admin.describe().pages.find(page => page.id === 'forms.list')).toMatchObject({ path: '/forms', visible: true, permissions: ['admin.forms.manage'] });
  });

  it('preserves an edited draft across locale and route-derived submissions tab changes', async () => {
    let locale = 'en';
    const { node } = fixture({ useLocale: () => locale });
    const view = render(node(<FormEditor formId="contact" tab="fields" />));
    const name = await screen.findByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Unsaved draft' } });
    locale = 'de';
    view.rerender(node(<FormEditor formId="contact" tab="fields" />));
    expect(await screen.findByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    expect(view.container.querySelector('#form-name')).toBe(name);
    expect(name).toHaveValue('Unsaved draft');
    view.rerender(node(<FormEditor formId="contact" tab="submissions" />));
    expect(await screen.findByText('visitor@example.com')).toBeInTheDocument();
    view.rerender(node(<FormEditor formId="contact" tab="fields" />));
    expect(await screen.findByLabelText('Name')).toHaveValue('Unsaved draft');
  });

  it('renders the new-form HTML authoring controls through the editor page', async () => {
    const user = userEvent.setup();
    const { node } = fixture();
    render(node(<FormEditor formId="new" tab="fields" />));
    expect(await screen.findByLabelText('Name')).toHaveValue('');
    // The new editor paints before its effect-owned controller is attached; await the gesture.
    await user.click(screen.getByRole('button', { name: 'HTML' }));
    expect(await screen.findByLabelText('Form HTML')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Submissions' })).toBeNull();
  });

  it('keeps tab navigation on the original history-pushed paths', async () => {
    const { navigate, node } = fixture();
    render(node(<FormEditor formId="contact" tab="fields" />));
    const tab = await screen.findByRole('tab', { name: 'Submissions' });
    fireEvent.click(tab);
    expect(navigate).toHaveBeenCalledWith({ base: '/admin', routePath: '/forms/contact/submissions' });
  });

  it('confirms submission Trash through the original generic port and retains its payload', async () => {
    const { api, node } = fixture();
    const trash = vi.spyOn(api.trash, 'trash');
    render(node(<FormEditor formId="contact" tab="submissions" />));
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete submission' }));
    expect(await screen.findByRole('dialog', { name: 'Move to trash?' })).toBeInTheDocument();
    expect(trash).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(trash).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete submission' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
    await waitFor(() => expect(trash).toHaveBeenCalledWith({ type: 'form_submission', id: 's1' }));
    expect(await screen.findByText('No submissions yet.')).toBeInTheDocument();
    expect(api.submissions).toEqual([{ id: 's1', formDefinitionId: 'f1', data: { email: 'visitor@example.com' }, sourceIp: '127.0.0.1', submittedAt: '2026-10-07T00:00:00Z', status: 'trash' }]);
  });

  it('refreshes the mounted list and disposes its subscription on unmount', async () => {
    const { list, node } = fixture();
    const view = render(node(<FormsList />));
    await screen.findByRole('link', { name: 'Contact' });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => publishContentRefresh(['media']));
    expect(list).toHaveBeenCalledTimes(1);
    act(() => publishContentRefresh(['forms']));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    view.unmount();
    act(() => publishContentRefresh(['forms']));
    expect(list).toHaveBeenCalledTimes(2);
  });
});
