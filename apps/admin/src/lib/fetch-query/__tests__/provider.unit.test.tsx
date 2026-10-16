import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useQueryClient } from '@tanstack/react-query';
import { useCachedLoader, useFetchMutation, useFetchQuery } from '@jini-ai/ui/fetch-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useContext, type ReactNode } from 'react';
import { FetchQueryProvider } from '../provider';
import { AdminFetchQueryAdapterContext } from '../adapter-context';

describe('admin TanStack provider composition', () => {
  afterEach(() => vi.unstubAllGlobals());
  const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;

  it.each(['tanstack', 'builtin'] as const)('allows same-origin reads and writes with navigator offline using %s', async adapter => {
    vi.stubGlobal('navigator', { onLine: false });
    const selectedWrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider adapter={adapter}>{children}</FetchQueryProvider>;
    let reads = 0;
    const { result } = renderHook(() => ({
      query: useFetchQuery({ key: ['offline-local-read'], fetch: async () => { reads++; return 'Local server responded'; } }),
      write: useFetchMutation({ run: async ({ input }: { input: string }) => `Local write: ${input}` }),
    }), { wrapper: selectedWrapper });
    await waitFor(() => expect(result.current.query.data).toBe('Local server responded'));
    await act(async () => { await expect(result.current.write.mutate({ input: 'saved' })).resolves.toBe('Local write: saved'); });
    expect(reads).toBe(1);
  });

  it('selects the composition at the real admin entry', () => {
    // jsdom replaces the global URL, so a file URL from import.meta.url is not one node:fs accepts.
    const entry = readFileSync(path.resolve(__dirname, '../../../main.tsx'), 'utf8');
    expect(entry).toContain('import { FetchQueryProvider } from "./lib/fetch-query/provider";');
    expect(entry).toContain('<FetchQueryProvider>');
  });

  it('binds existing Jini imports and imperative loaders to the TanStack client', async () => {
    let version = 0;
    const key = ['admin-wiring'] as const;
    const fetch = async () => `value ${++version}`;
    const { result } = renderHook(() => ({
      query: useFetchQuery({ key, fetch }),
      loader: useCachedLoader({ key, fetch }),
      write: useFetchMutation({ run: async () => 'saved' }, { invalidates: [key] }),
      client: useQueryClient(),
    }), { wrapper });
    await waitFor(() => expect(result.current.query.data).toBe('value 1'));
    // TanStack stores Jini's arbitration envelope; consumers and loaders receive its value.
    expect(result.current.client.getQueryData(key)).toEqual({ generation: 0, request: 1, value: 'value 1' });
    await expect(result.current.loader.load()).resolves.toBe('value 1');
    expect(version).toBe(1);
    await act(async () => { await result.current.write.mutate({ input: undefined }); });
    await waitFor(() => expect(result.current.query.data).toBe('value 2'));
    expect(result.current.client.getQueryData(key)).toEqual({ generation: 0, request: 2, value: 'value 2' });
  });

  it('scopes independent admin roots and puts tab descendants inside the client provider', async () => {
    const clients: unknown[] = [];
    function Tools() {
      clients.push(useQueryClient());
      return null;
    }
    const withTools = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}<Tools /></FetchQueryProvider>;
    const first = renderHook(() => ({ query: useFetchQuery({ key: ['same'], fetch: async () => 'first' }), client: useQueryClient() }), { wrapper: withTools });
    const second = renderHook(() => ({ query: useFetchQuery({ key: ['same'], fetch: async () => 'second' }), client: useQueryClient() }), { wrapper });
    await waitFor(() => expect(first.result.current.query.data).toBe('first'));
    await waitFor(() => expect(second.result.current.query.data).toBe('second'));
    expect(clients).toContain(first.result.current.client);
    expect(first.result.current.client).not.toBe(second.result.current.client);
  });

  it.each(['tanstack', 'builtin'] as const)('reports the actual selected %s provider without vendor detection', async adapter => {
    const selectedWrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider adapter={adapter}>{children}</FetchQueryProvider>;
    const { result } = renderHook(() => ({
      adapter: useContext(AdminFetchQueryAdapterContext),
      query: useFetchQuery({ key: ['selected-provider'], fetch: async () => adapter }),
    }), { wrapper: selectedWrapper });
    await waitFor(() => expect(result.current.query.data).toBe(adapter));
    expect(result.current.adapter).toBe(adapter);
  });
});
