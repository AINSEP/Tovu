import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { useAdminSession } from '../../../App.hooks';
import { authApi } from '../../../features/auth/api/auth-api';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('ignores a previous session response after a new login and clears grants on logout', async () => {
  vi.stubGlobal('EventSource', class { close() {} addEventListener() {} removeEventListener() {} });
  let settleOld!: (value: Awaited<ReturnType<typeof authApi.me>>) => void;
  vi.spyOn(authApi, 'me').mockImplementationOnce(() => new Promise(resolve => { settleOld = resolve; }))
    .mockResolvedValueOnce({ user: { id: 'new', username: 'reader' }, effectivePermissions: ['media.read'] });
  vi.spyOn(authApi, 'logout').mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useAdminSession());
  await waitFor(() => expect(authApi.me).toHaveBeenCalledTimes(1));
  act(() => result.current.handleLogin({ id: 'new', username: 'reader' }));
  await waitFor(() => expect(result.current.effectivePermissions).toEqual(['media.read']));
  await act(async () => { settleOld({ user: { id: 'old', username: 'owner' }, effectivePermissions: ['*'] }); });
  expect(result.current.user?.id).toBe('new');
  expect(result.current.effectivePermissions).toEqual(['media.read']);
  await act(async () => { await result.current.logout(); });
  expect(result.current.user).toBeNull(); expect(result.current.effectivePermissions).toEqual([]);
});
