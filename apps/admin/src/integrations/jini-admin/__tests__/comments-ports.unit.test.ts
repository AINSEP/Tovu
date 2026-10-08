import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentsTransportPort } from '@jini-ai/admin/comments/adapters/http';
import { commentsEvents, commentsSessionGrants, createCommentsHostPorts, createCommentsTranslator } from '../comments-ports';
import { publishContentRefresh, resetContentRefreshBus } from '../../../lib/content-refresh-bus';

afterEach(resetContentRefreshBus);

describe('comments host ports', () => {
  it('renders human English labels for each moderation status', () => {
    const t = createCommentsTranslator({ locale: 'en' });
    expect(['pending', 'approved', 'spam', 'trash'].map(status => t(status))).toEqual(['Pending', 'Approved', 'Spam', 'Trash']);
  });
  it('uses the original workspace and auth paths, query order and partial write bodies', async () => {
    const settings = { enabled: true, requireModeration: true, maxDepth: 3, closeAfterDays: null, spamAutoRejectScore: 0.05, maxPerIpPerHour: 10 };
    const calls = vi.fn<(input: { path: string; method: string; body?: unknown }) => unknown>(input => {
      if (input.path === '/auth/me') return { user: { id: 'u1', username: 'operator' }, effectivePermissions: ['*'] };
      if (input.path.endsWith('/settings')) return { data: settings };
      if (input.method === 'GET') return { items: [], nextCursor: null };
      return undefined;
    });
    const transport: CommentsTransportPort = {
      request: async <T,>(input: Parameters<CommentsTransportPort['request']>[0]): Promise<T> => calls(input) as T,
      url: ({ path }) => path,
    };
    const { commentsApi: api, commentsSession: session } = createCommentsHostPorts({ transport }, { workspaceId: 'ws1' });
    expect(await session.me({})).toEqual({ user: { id: 'u1', username: 'operator' }, effectivePermissions: ['*'] });
    expect(await api.listCommentsQueue({}, { status: 'spam', cursor: 'a/b', limit: 20 })).toEqual({ items: [], nextCursor: null });
    await api.moderateComment({ commentId: 'c/1', action: 'approve', expectedVersion: 3 });
    await api.purgeComment({ commentId: 'c/1' }, { note: 'confirmed' });
    expect(await api.getCommentsSettings({})).toEqual(settings);
    expect(await api.putCommentsSettings({}, { closeAfterDays: null })).toEqual(settings);
    expect(calls.mock.calls.map(([input]) => input)).toEqual([
      { path: '/auth/me', method: 'GET' },
      { path: '/workspaces/ws1/comments/queue?status=spam&cursor=a%2Fb&limit=20', method: 'GET' },
      { path: '/workspaces/ws1/comments/c%2F1/approve', method: 'POST', body: { expectedVersion: 3, note: undefined } },
      { path: '/workspaces/ws1/comments/c%2F1/purge', method: 'POST', body: { note: 'confirmed' } },
      { path: '/workspaces/ws1/comments/settings', method: 'GET' },
      { path: '/workspaces/ws1/comments/settings', method: 'PUT', body: { closeAfterDays: null } },
    ]);
  });

  it('keeps all copy owners and interpolation, including unknown-locale/key fallback', () => {
    const t = createCommentsTranslator({ locale: 'es' });
    expect(t('People')).toBe('Personas');
    expect(t('Comments')).toBe('Comentarios');
    expect(t('Settings')).toBe('Configuración');
    expect(t('pending')).toBe('pendiente');
    expect(t('approved')).toBe('aprobado');
    expect(t('trash')).toBe('papelera');
    expect(t('spam')).toBe('Spam');
    expect(t('No {status} comments.', { status: t('pending') })).toBe('No hay comentarios "pendiente".');
    expect(t('Unlisted moderation message')).toBe('Unlisted moderation message');
    expect(createCommentsTranslator({ locale: 'unknown-locale' })('Comments')).toBe('Comments');
  });

  it('expands only the existing owner wildcard and retains explicit/default-denied grants', () => {
    expect(commentsSessionGrants({ permissions: [] })).toEqual([]);
    expect(commentsSessionGrants({ permissions: ['comments.read'] })).toEqual(['comments.read']);
    expect(commentsSessionGrants({ permissions: ['*'] })).toEqual(['comments.read', 'comments.moderate', 'comments.delete', 'comments.delete.force', 'comments.configure']);
    expect(commentsSessionGrants({ permissions: ['media.read', 'comments.*'] })).toEqual([]);
  });

  it('refreshes the queue for its resource/unknown scope, excludes settings and unsubscribes', () => {
    const onRefresh = vi.fn();
    const unsubscribe = commentsEvents.subscribe({ onRefresh });
    publishContentRefresh(['comments-settings']);
    publishContentRefresh(['media']);
    expect(onRefresh).not.toHaveBeenCalled();
    publishContentRefresh(['comments-queue']);
    publishContentRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(2);
    unsubscribe();
    publishContentRefresh(['comments-queue']);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });
});
