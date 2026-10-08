import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchQueryProvider } from '@jini-ai/ui/fetch-query';
import type { AdminCommentsPort } from '@jini-ai/admin/comments';
import { Comments } from '../../../features/comments';
import { AdminModulesContext, createHostAdminScope } from '../modules.hooks';
import { commentsEvents } from '../comments-ports';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';

const scopes: ReturnType<typeof createHostAdminScope>[] = [];
afterEach(() => {
  cleanup();
  for (const scope of scopes.splice(0)) { scope.admin.dispose(); scope.overlays.dispose(); }
  resetContentRefreshBus();
});

/** DI fixtures exercise the shipped host wrapper/module, never a mock module or copied page. */
function fixture({ permissions = ['*'], useLocale = () => 'en' }: { permissions?: string[]; useLocale?: () => string } = {}) {
  const api = {
    listCommentsQueue: vi.fn<AdminCommentsPort['listCommentsQueue']>().mockResolvedValue({ items: [], nextCursor: null }),
    moderateComment: vi.fn<AdminCommentsPort['moderateComment']>().mockResolvedValue(undefined),
    purgeComment: vi.fn<AdminCommentsPort['purgeComment']>().mockResolvedValue(undefined),
    getCommentsSettings: vi.fn<AdminCommentsPort['getCommentsSettings']>().mockResolvedValue({ enabled: true, requireModeration: true, maxDepth: 3, closeAfterDays: null, spamAutoRejectScore: 0.05, maxPerIpPerHour: 10 }),
    putCommentsSettings: vi.fn<AdminCommentsPort['putCommentsSettings']>(),
  };
  const me = vi.fn(async () => ({ user: { id: 'u1', username: 'operator' }, effectivePermissions: permissions }));
  const runtime = createHostAdminScope({ permissions }, { commentsPorts: { commentsApi: api, commentsSession: { me }, commentsEvents }, useCommentsLocaleHook: useLocale });
  scopes.push(runtime);
  const node = () => <FetchQueryProvider><AdminModulesContext.Provider value={runtime}><Comments /></AdminModulesContext.Provider></FetchQueryProvider>;
  return { api, me, runtime, node };
}

describe('Jini comments host switch', () => {
  it('mounts both existing sections through Comments(), allowing the owner wildcard', async () => {
    const { api, me, runtime, node } = fixture();
    render(node());
    expect(screen.getByText('Loading Comments…')).toHaveClass('notice');
    expect(await screen.findByRole('heading', { name: 'Comments' })).toHaveClass('page-title');
    expect(await screen.findByRole('button', { name: 'Save settings' })).toHaveAttribute('data-agent-element', 'comments-settings-save');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(runtime.admin.describe().pages.find(page => page.id === 'comments.queue')).toMatchObject({ path: '/comments', visible: true, permissions: ['comments.read'] });
    expect(me).toHaveBeenCalledWith({});
    expect(api.listCommentsQueue).toHaveBeenCalledWith({}, { status: 'pending' });
    expect(api.getCommentsSettings).toHaveBeenCalledWith({});
  });

  it('changes locale without remounting the queue filter or an edited settings input', async () => {
    let locale = 'en';
    const { api, node } = fixture({ useLocale: () => locale });
    const view = render(node());
    const input = await screen.findByRole('spinbutton', { name: 'Max thread depth' });
    fireEvent.change(input, { target: { value: '7' } });
    const filter = screen.getByLabelText('Status');
    fireEvent.change(filter, { target: { value: 'spam' } });
    await waitFor(() => expect(api.listCommentsQueue).toHaveBeenCalledWith({}, { status: 'spam' }));
    locale = 'es';
    view.rerender(node());
    expect(await screen.findByRole('heading', { name: 'Comentarios' })).toBeInTheDocument();
    expect(screen.getByText('Personas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBe(filter);
    expect(filter).toHaveValue('spam');
    expect(view.container.querySelector('#comments-max-depth')).toBe(input);
    expect(input).toHaveValue(7);
    expect(api.getCommentsSettings).toHaveBeenCalledTimes(1);
  });

  it('denies the queue/settings reads without their grants', async () => {
    const { api, runtime, node } = fixture({ permissions: [] });
    render(node());
    expect(await screen.findByText('You do not have permission to view the moderation queue.')).toBeInTheDocument();
    expect(runtime.admin.describe().pages.find(page => page.id === 'comments.queue')).toMatchObject({ visible: false });
    expect(api.listCommentsQueue).not.toHaveBeenCalled();
    expect(api.getCommentsSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
  });

  it('refreshes only the mounted queue and removes its event subscription on unmount', async () => {
    const { api, node } = fixture();
    const view = render(node());
    await screen.findByRole('button', { name: 'Save settings' });
    await waitFor(() => expect(api.listCommentsQueue).toHaveBeenCalledTimes(1));
    act(() => publishContentRefresh(['comments-settings']));
    expect(api.listCommentsQueue).toHaveBeenCalledTimes(1);
    act(() => publishContentRefresh(['comments-queue']));
    await waitFor(() => expect(api.listCommentsQueue).toHaveBeenCalledTimes(2));
    expect(api.getCommentsSettings).toHaveBeenCalledTimes(1);
    view.unmount();
    act(() => publishContentRefresh(['comments-queue']));
    expect(api.listCommentsQueue).toHaveBeenCalledTimes(2);
  });
});
