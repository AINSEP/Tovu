import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useQueryClient } from '@tanstack/react-query';
import { useCachedLoader, useFetchMutation, useFetchQuery } from '@jini-ai/ui/fetch-query';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FetchQueryProvider } from '../provider';

describe('admin TanStack provider composition', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider devtools={null}>{children}</FetchQueryProvider>;

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
    expect(result.current.client.getQueryData(key)).toBe('value 1');
    await expect(result.current.loader.load()).resolves.toBe('value 1');
    expect(version).toBe(1);
    await act(async () => { await result.current.write.mutate({ input: undefined }); });
    await waitFor(() => expect(result.current.query.data).toBe('value 2'));
    expect(result.current.client.getQueryData(key)).toBe('value 2');
  });

  it('scopes independent admin roots and puts injected development tools inside the client provider', async () => {
    const clients: unknown[] = [];
    function Tools({ initialIsOpen }: { initialIsOpen: boolean }) {
      clients.push(useQueryClient());
      expect(initialIsOpen).toBe(false);
      return null;
    }
    const withTools = ({ children }: { children: ReactNode }) => <FetchQueryProvider devtools={Tools}>{children}</FetchQueryProvider>;
    const first = renderHook(() => ({ query: useFetchQuery({ key: ['same'], fetch: async () => 'first' }), client: useQueryClient() }), { wrapper: withTools });
    const second = renderHook(() => ({ query: useFetchQuery({ key: ['same'], fetch: async () => 'second' }), client: useQueryClient() }), { wrapper });
    await waitFor(() => expect(first.result.current.query.data).toBe('first'));
    await waitFor(() => expect(second.result.current.query.data).toBe('second'));
    expect(clients).toContain(first.result.current.client);
    expect(first.result.current.client).not.toBe(second.result.current.client);
  });
});
