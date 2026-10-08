import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
import { defaultSecurityPermissionsPort } from "../security-permissions-dependencies.hooks";
import { useWiredSecurityPermissions } from "../use-security-permissions.hooks";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;

it("keeps site-key management unavailable until the wired auth request returns its permission", async () => {
  // Author Checklist F2.3/F2.6/F3.6/F7.1: real wired consumer, held load and exact route.
  // Reject: default port points to a settings route or omits effectivePermissions.
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((res) => { resolve = res; });
  const fetch = vi.fn((url: unknown, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/auth/me");
    expect(init?.method ?? "GET").toBe("GET");
    return pending;
  });
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => useWiredSecurityPermissions(), { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(result.current.canManageSiteKey).toBe(false);
  await act(async () => { resolve(Response.json({ user: { id: "owner-17" }, effectivePermissions: ["admin.security.site-key.manage"] })); });
  await waitFor(() => expect(result.current.canManageSiteKey).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("forwards auth errors instead of manufacturing permissions", async () => {
  // F6.2: reject swallowing auth failures; direct adapter preserves the server refusal.
  const fetch = vi.fn(async (url: unknown) => {
    expect(url).toBe("/api/admin/v1/auth/me");
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  });
  vi.stubGlobal("fetch", fetch);
  await expect(defaultSecurityPermissionsPort.me()).rejects.toMatchObject({ status: 403, body: { error: "FORBIDDEN" } });
  expect(fetch).toHaveBeenCalledTimes(1);
});
