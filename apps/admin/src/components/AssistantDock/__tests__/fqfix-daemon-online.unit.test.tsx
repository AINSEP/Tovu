import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { FetchQueryProvider, useFetchQuery } from '@jini-ai/ui/fetch-query';
import { FetchQueryProvider as AdminFetchQueryProvider } from '@/lib/fetch-query/provider';
import { useRuntimeAccess } from '../hooks/AssistantDock.hooks';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('probes localhost outside an offline query gate and shares only the pending transport', async () => {
  let finish!: (response: Response) => void;
  let calls = 0;
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    expect(url).toBe('/api/agents');
    expect(init.credentials).toBe('same-origin');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    calls++;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const environment = { isOnline: () => false, subscribeOnline: () => () => {}, subscribeFocus: () => () => {} };
  const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider environment={environment}>{children}</FetchQueryProvider>;
  const { result } = renderHook(() => useRuntimeAccess(), { wrapper });
  const first = result.current.daemonOnline();
  const joined = result.current.daemonOnline();
  await act(async () => {});
  expect(calls).toBe(1); // This instance joins simultaneous health polls without gating on internet access.
  await act(async () => { finish(new Response(null, { status: 200 })); });
  await expect(first).resolves.toBe(true);
  await expect(joined).resolves.toBe(true);
  const next = result.current.daemonOnline();
  expect(calls).toBe(2);
  await act(async () => { finish(new Response(null, { status: 503 })); });
  await expect(next).resolves.toBe(false);
});


it.each(['builtin', 'tanstack'] as const)('production %s admin queries reach the local port while navigator is offline', async adapter => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  let calls = 0;
  const fetch = async () => { calls++; return 'Local daemon reached'; };
  const wrapper = ({ children }: { children: ReactNode }) => <AdminFetchQueryProvider adapter={adapter}>{children}</AdminFetchQueryProvider>;
  const { result } = renderHook(() => useFetchQuery({ key: ['local-daemon-contract'], fetch }), { wrapper });
  await waitFor(() => expect(result.current.data).toBe('Local daemon reached'));
  expect(calls).toBe(1);
});
