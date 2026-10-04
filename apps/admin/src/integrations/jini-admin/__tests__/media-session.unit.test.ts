import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useAdminSession } from '../../../App.hooks';
import { api } from '../../../lib/api';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('ignores a previous session response after a new login and clears grants on logout', async () => {
  vi.stubGlobal('EventSource', class { close() {} addEventListener() {} removeEventListener() {} });
  let settleOld!: (value: Awaited<ReturnType<typeof api.me>>) => void;
  vi.spyOn(api, 'me').mockImplementationOnce(() => new Promise(resolve => { settleOld = resolve; }))
    .mockResolvedValueOnce({ user: { id: 'new', username: 'reader' }, effectivePermissions: ['media.read'] });
  vi.spyOn(api, 'logout').mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useAdminSession());
  await waitFor(() => expect(api.me).toHaveBeenCalledTimes(1));
  act(() => result.current.handleLogin({ id: 'new', username: 'reader' }));
  await waitFor(() => expect(result.current.effectivePermissions).toEqual(['media.read']));
  await act(async () => { settleOld({ user: { id: 'old', username: 'owner' }, effectivePermissions: ['*'] }); });
  expect(result.current.user?.id).toBe('new');
  expect(result.current.effectivePermissions).toEqual(['media.read']);
  await act(async () => { await result.current.logout(); });
  expect(result.current.user).toBeNull(); expect(result.current.effectivePermissions).toEqual([]);
});
