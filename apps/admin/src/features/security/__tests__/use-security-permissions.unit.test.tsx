import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FetchQueryProvider, useFetchQuery } from "@/lib/fetch-query";
import { useSecurityPermissions } from "../hooks/use-security-permissions.hooks";

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

describe("useSecurityPermissions", () => {
  it.each([
    [[], false],
    [["admin.security.tokens.read"], false],
    [["admin.security.tokens.manage"], true],
    [["*"], true],
  ] as const)("denies while loading and evaluates %j after settlement", async (effectivePermissions, expected) => {
    let release!: (value: { effectivePermissions: string[] }) => void;
    const pending = new Promise<{ effectivePermissions: string[] }>((resolve) => { release = resolve; });
    const port = { me: vi.fn(() => pending) };
    const { result } = renderHook(() => ({ controller: useSecurityPermissions(port), query: useFetchQuery({ key: ["security", "permissions"], fetch: () => port.me() }) }), { wrapper });
    await waitFor(() => expect(port.me).toHaveBeenCalledTimes(1));
    expect(result.current.controller.canManageSiteToken).toBe(false);
    await act(async () => { release({ effectivePermissions: [...effectivePermissions] }); await pending; });
    await waitFor(() => expect(result.current.query.status).toBe("success"));
    expect(result.current.query.error).toBeNull();
    expect(result.current.controller.canManageSiteToken).toBe(expected);
  });
});
