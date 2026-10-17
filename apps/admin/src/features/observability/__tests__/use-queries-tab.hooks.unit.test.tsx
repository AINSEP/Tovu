import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContext, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { AdminFetchQueryAdapterContext } from "@/lib/fetch-query/adapter-context";
import { useQueriesTab, useWiredQueriesTab, type QueriesIdentityPort } from "../hooks/use-queries-tab.hooks";

const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;

afterEach(() => vi.unstubAllGlobals());

describe("Queries tab host wiring", () => {
  it("reads the authenticated owner through the real API and the host's TanStack provider", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url) !== "/api/admin/v1/auth/me") throw new Error(`Unexpected test request: ${url}`);
      return new Response(JSON.stringify({ user: { id: "owner-1", username: "owner" }, effectivePermissions: ["*"] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }));
    const { result } = renderHook(() => useWiredQueriesTab(), { wrapper });

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.readOnly).toBe(!import.meta.env.DEV);
  });

  it("keeps the wired tab hidden without requesting identity on a built-in host", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const builtinWrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider adapter="builtin">{children}</FetchQueryProvider>;
    const { result } = renderHook(() => useWiredQueriesTab(), { wrapper: builtinWrapper });

    await act(async () => {});

    expect(result.current).toEqual({ visible: false, readOnly: !import.meta.env.DEV });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Queries tab visibility", () => {
  it.each([
    { permissions: ["*"], development: false, visible: true, readOnly: true },
    { permissions: ["*"], development: true, visible: true, readOnly: false },
    { permissions: ["system.read", "system.write"], development: false, visible: false, readOnly: true },
    { permissions: ["system.read"], development: true, visible: false, readOnly: false },
    { permissions: [], development: false, visible: false, readOnly: true },
    { permissions: undefined, development: false, visible: false, readOnly: true },
  ])("owner gate for $permissions, development=$development", async ({ permissions, development, visible, readOnly }) => {
    let calls = 0;
    const port: QueriesIdentityPort = { me: async () => { calls++; return { effectivePermissions: permissions }; } };
    const { result } = renderHook(() => ({
      tab: useQueriesTab({ adapter: useContext(AdminFetchQueryAdapterContext), port }, { development }),
      identity: useFetchQuery({ key: ['auth', 'me'], fetch: () => port.me() }, { staleTime: 0 }),
    }), { wrapper });
    await waitFor(() => {
      expect(result.current.identity.status).toBe("success");
      expect(result.current.tab).toEqual({ visible, readOnly });
    });
    expect(calls).toBe(1);
  });

  it("keeps pending identity hidden, then reveals a confirmed owner", async () => {
    let resolve!: (value: { effectivePermissions: string[] }) => void;
    const port: QueriesIdentityPort = { me: () => new Promise(done => { resolve = done; }) };
    const { result } = renderHook(() => useQueriesTab({ adapter: "tanstack", port }), { wrapper });
    expect(result.current).toEqual({ visible: false, readOnly: true });
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    await act(async () => resolve({ effectivePermissions: ["*"] }));
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it("keeps failed identity hidden", async () => {
    const port: QueriesIdentityPort = { me: async () => { throw new Error("identity unavailable"); } };
    const { result } = renderHook(() => ({ tab: useQueriesTab({ adapter: "tanstack", port }),
      identity: useFetchQuery({ key: ['auth', 'me'], fetch: () => port.me() }, { staleTime: 0 }) }), { wrapper });
    await waitFor(() => expect(result.current.identity.error?.message).toBe("identity unavailable"));
    expect(result.current.tab).toEqual({ visible: false, readOnly: true });
  });

  it("hides a stale owner result when identity refresh fails", async () => {
    let failed = false;
    const port: QueriesIdentityPort = { me: async () => {
      if (failed) throw new Error("session expired");
      return { effectivePermissions: ["*"] };
    } };
    const { result } = renderHook(() => ({ tab: useQueriesTab({ adapter: "tanstack", port }), client: useQueryClient() }), { wrapper });
    await waitFor(() => expect(result.current.tab.visible).toBe(true));
    failed = true;
    await act(async () => { await result.current.client.invalidateQueries({ queryKey: ["auth", "me"] }); });
    await waitFor(() => expect(result.current.tab.visible).toBe(false));
  });

  it.each(["builtin", null] as const)("hides tooling and skips identity for %s", async adapter => {
    let calls = 0;
    const port: QueriesIdentityPort = { me: async () => { calls++; return { effectivePermissions: ["*"] }; } };
    const builtinWrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider adapter="builtin">{children}</FetchQueryProvider>;
    const { result } = renderHook(() => useQueriesTab({ adapter, port }), { wrapper: builtinWrapper });
    await act(async () => {});
    expect(result.current.visible).toBe(false);
    expect(calls).toBe(0);
  });
});
