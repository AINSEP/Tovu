import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchQueryProvider } from '@/__tests__/fetch-query-provider.test-helper';
import type { AdminComment, AdminCommentsPort, AdminCommentsQueuePage } from '@jini-ai/admin/comments';
import { CommentQueueScopeProvider } from '@jini-ai/admin/comments/react';
import { Comments } from '../../../features/comments';
import { AdminModulesContext, createHostAdminScope } from '../modules.hooks';
import { commentsEvents, createCommentsQueueScope } from '../comments-ports';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';

const scopes: ReturnType<typeof createHostAdminScope>[] = [];
afterEach(() => {
  cleanup();
  for (const scope of scopes.splice(0)) { scope.admin.dispose(); scope.overlays.dispose(); }
  resetContentRefreshBus();
});

/** DI fixtures exercise the shipped host wrapper/module, never a mock module or copied page. */
function fixture(_required: Record<string, never>, { permissions = ['*'], useLocale = () => 'en' }: { permissions?: string[]; useLocale?: () => string } = {}) {
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
  // The API, runtime and cache survive logout just as they do under main.tsx's session boundary.
  const node = ({ principalId = 'u1' }: { principalId?: string | null }, _optional: Record<string, never> = {}) =>
    <FetchQueryProvider><AdminModulesContext.Provider value={runtime}>
      {principalId === null ? <p>Signed out</p> :
        <CommentQueueScopeProvider scope={createCommentsQueueScope({ principalId })}><Comments /></CommentQueueScopeProvider>}
    </AdminModulesContext.Provider></FetchQueryProvider>;
  return { api, me, runtime, node };
}

describe('Jini comments host switch', () => {
  it('mounts both existing sections through Comments(), allowing the owner wildcard', async () => {
    const { api, me, runtime, node } = fixture({});
    render(node({}));
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
    const { api, node } = fixture({}, { useLocale: () => locale });
    const view = render(node({}));
    const input = await screen.findByRole('spinbutton', { name: 'Max thread depth' });
    fireEvent.change(input, { target: { value: '7' } });
    const filter = screen.getByLabelText('Status');
    fireEvent.change(filter, { target: { value: 'spam' } });
    await waitFor(() => expect(api.listCommentsQueue).toHaveBeenCalledWith({}, { status: 'spam' }));
    locale = 'es';
    view.rerender(node({}));
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
    const { api, runtime, node } = fixture({}, { permissions: [] });
    render(node({}));
    expect(await screen.findByText('You do not have permission to view the moderation queue.')).toBeInTheDocument();
    expect(runtime.admin.describe().pages.find(page => page.id === 'comments.queue')).toMatchObject({ visible: false });
    expect(api.listCommentsQueue).not.toHaveBeenCalled();
    expect(api.getCommentsSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
  });

  it('refreshes only the mounted queue and removes its event subscription on unmount', async () => {
    const { api, node } = fixture({});
    const view = render(node({}));
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

  it('keeps cached comments and late cursor responses private after logout/login as another principal', async () => {
    const { api, node } = fixture({});
    const a: AdminComment = {
      id: 'a', entryId: 'post-1', parentId: null, threadRootId: 'a', depth: 0, status: 'pending',
      authorPrincipalId: null, authorName: 'Reader A', authorEmail: null, authorUrl: null, authorIpHash: null,
      bodyText: 'Private comment for operator A', spamScore: null, spamProvider: null,
      createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', version: 1,
    };
    const aMore = { ...a, id: 'a-more', bodyText: 'Private cursor comment for operator A' };
    const aLate = { ...a, id: 'a-late', bodyText: 'Late private comment for operator A' };
    const b = { ...a, id: 'b', bodyText: 'Private comment for operator B' };
    const bMore = { ...b, id: 'b-more', bodyText: 'Private cursor comment for operator B' };
    let principalId = 'operator-a';
    let completeB!: (page: AdminCommentsQueuePage) => void;
    let completeLateA!: (page: AdminCommentsQueuePage) => void;
    api.listCommentsQueue.mockImplementation((_required, options) => {
      if (principalId === 'operator-a') {
        if (options?.cursor === 'late-a') return new Promise<AdminCommentsQueuePage>(resolve => { completeLateA = resolve; });
        return Promise.resolve({ items: options?.cursor ? [aMore] : [a], nextCursor: options?.cursor ? 'late-a' : 'shared-cursor' });
      }
      return options?.cursor ? Promise.resolve({ items: [bMore], nextCursor: null })
        : new Promise<AdminCommentsQueuePage>(resolve => { completeB = resolve; });
    });
    const view = render(node({ principalId }));
    expect(await screen.findByText(a.bodyText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(aMore.bodyText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(api.listCommentsQueue).toHaveBeenCalledWith({}, { status: 'pending', cursor: 'late-a' }));

    view.rerender(node({ principalId: null }));
    expect(screen.getByText('Signed out')).toBeInTheDocument();
    principalId = 'operator-b';
    view.rerender(node({ principalId }));
    expect(screen.queryByText(a.bodyText)).toBeNull();
    expect(screen.queryByText(aMore.bodyText)).toBeNull();
    await waitFor(() => expect(completeB).toBeTypeOf('function'));
    expect(screen.getByText('Loading comments…')).toBeInTheDocument();
    expect(screen.queryByText(a.bodyText)).toBeNull();
    expect(screen.queryByText(aMore.bodyText)).toBeNull();
    await act(async () => { completeLateA({ items: [aLate], nextCursor: null }); });
    expect(screen.queryByText(aLate.bodyText)).toBeNull();
    expect(screen.getByText('Loading comments…')).toBeInTheDocument();

    await act(async () => { completeB({ items: [b], nextCursor: 'shared-cursor' }); });
    expect(await screen.findByText(b.bodyText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(bMore.bodyText)).toBeInTheDocument();
    for (const previous of [a, aMore, aLate]) expect(screen.queryByText(previous.bodyText)).toBeNull();
  });
});
