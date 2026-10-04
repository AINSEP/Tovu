import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { useSourceControlCredentials } from "../hooks/use-source-control-credentials.hooks";
import { createFakeSourceControlCredentialsPort } from "../hooks/source-control-credentials-dependencies.hooks";
import { ApiError, type AdminSourceControlCredentialSummary } from "@/lib/api";
import { SOURCE_CONTROL_PROVIDERS_SNAPSHOT } from "./source-control-providers.fixture";

/** The fake port with the fixture hosts listed (GitHub, and Forge with a required username). */
function fakePort(overrides: Parameters<typeof createFakeSourceControlCredentialsPort>[0] = {}) {
  return createFakeSourceControlCredentialsPort({ listProviders: () => Promise.resolve(SOURCE_CONTROL_PROVIDERS_SNAPSHOT), ...overrides });
}

/**
 * @file `useSourceControlCredentials`, exercised against `createFakeSourceControlCredentialsPort` —
 * no `fetch` stubbing needed, same "the pure hook is independently testable against its fake port"
 * precedent `use-timeline-section.unit.test.tsx`'s own header documents for its own injected-port
 * describe block.
 */

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const T = (key: string): string => key;

function githubCredential(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
  return {
    id: "cred-github-1",
    providerId: "github",
    label: "default",
    configured: true,
    isDefault: true,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
    ...overrides,
  };
}

describe("useSourceControlCredentials", () => {
  it("starts with rows undefined, then resolves one row per listed host once both lists load", async () => {
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [] }) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });

    expect(result.current.rows).toBeUndefined();

    await waitFor(() => expect(result.current.rows).toBeDefined());
    expect(result.current.rows!.map((row) => row.providerId)).toEqual(["github", "forge"]);
    expect(result.current.rows!.every((row) => row.saved === undefined)).toBe(true);
  });

  it("marks a provider's row saved once its default credential is present in the initial load", async () => {
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [githubCredential()] }) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });

    await waitFor(() => expect(result.current.rows).toBeDefined());
    const githubRow = result.current.rows!.find((row) => row.providerId === "github");
    expect(githubRow?.saved?.id).toBe("cred-github-1");
    const forgeRow = result.current.rows!.find((row) => row.providerId === "forge");
    expect(forgeRow?.saved).toBeUndefined();
  });

  it("sets a load error when listCredentials rejects, without throwing", async () => {
    const port = fakePort({ listCredentials: () => Promise.reject(new Error("network down")) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toContain("network down");
  });

  it("setToken/setField update only the targeted row's own draft state", async () => {
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [] }) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("github", "ghp_abc"));
    act(() => result.current.setField("forge", "username", "alice"));

    const github = result.current.rows!.find((row) => row.providerId === "github")!;
    const forge = result.current.rows!.find((row) => row.providerId === "forge")!;
    expect(github.token).toBe("ghp_abc");
    expect(github.readyToSave).toBe(true);
    expect(forge.values).toEqual({ username: "alice" });
    expect(forge.token).toBe("");
    expect(forge.readyToSave).toBe(false);
  });

  it("save() is a no-op (no create call) when the row isn't ready — e.g. a blank token", async () => {
    const createCredential = vi.fn();
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    await act(() => result.current.save("github"));
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("save() CREATEs with the fixed row label when this provider has nothing saved yet, then clears the draft", async () => {
    const createCredential = vi.fn().mockResolvedValue(githubCredential());
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("github", "ghp_abc"));
    await act(() => result.current.save("github"));

    expect(createCredential).toHaveBeenCalledWith({ label: "default", connection: { providerId: "github", token: "ghp_abc" } });
    const githubRow = result.current.rows!.find((row) => row.providerId === "github")!;
    expect(githubRow.saved?.id).toBe("cred-github-1");
    expect(githubRow.token).toBe(""); // draft cleared after a successful save
  });

  it("save() UPDATEs the existing default's id when this provider already has a saved connection", async () => {
    const updated = githubCredential({ updatedAt: "2026-10-03T09:00:00.000Z" });
    const updateCredential = vi.fn().mockResolvedValue(updated);
    const port = fakePort({
      listCredentials: () => Promise.resolve({ credentials: [githubCredential()] }),
      updateCredential,
    });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("github", "ghp_new"));
    await act(() => result.current.save("github"));

    expect(updateCredential).toHaveBeenCalledWith("cred-github-1", { connection: { providerId: "github", token: "ghp_new" } });
    const githubRow = result.current.rows!.find((row) => row.providerId === "github")!;
    expect(githubRow.saved).toEqual(updated);
    expect(githubRow.token).toBe("");
    expect(githubRow.saving).toBe(false);
  });

  it("save() requires the token AND every required declared field before it will call createCredential", async () => {
    const createCredential = vi.fn().mockResolvedValue(githubCredential({ providerId: "forge" }));
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("forge", "app-pw"));
    await act(() => result.current.save("forge"));
    expect(createCredential).not.toHaveBeenCalled();

    act(() => result.current.setField("forge", "username", "alice"));
    await act(() => result.current.save("forge"));
    expect(createCredential).toHaveBeenCalledWith({
      label: "default",
      connection: { providerId: "forge", token: "app-pw", username: "alice" },
    });
  });

  it.each([
    [new Error("server exploded"), "Could not save this connection (server exploded)."],
    [new ApiError("duplicate", 409, "DUPLICATE_LABEL"), "This connection was already saved — reload the page and try again."],
    [new ApiError("bad request", 400, "VALIDATION", { detail: "token is required" }), "Could not save this connection (token is required)."],
    [new ApiError("server exploded", 500), "Could not save this connection (server exploded)."],
  ])("save() surfaces %s as the row error and clears saving", async (failure, expected) => {
    const createCredential = vi.fn().mockRejectedValue(failure);
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("github", "ghp_abc"));
    await act(() => result.current.save("github"));

    const githubRow = result.current.rows!.find((row) => row.providerId === "github")!;
    expect(githubRow.saving).toBe(false);
    expect(githubRow.error).toBe(expected);
    expect(githubRow.saved).toBeUndefined();
    expect(githubRow.token).toBe("ghp_abc"); // draft is NOT cleared on a failed save
  });

  it("keeps a saved connection whose host is not listed as a row marked unlisted, and never saves to it (IRON RULE)", async () => {
    const createCredential = vi.fn();
    const port = fakePort({ listCredentials: () => Promise.resolve({ credentials: [githubCredential({ id: "gl-1", providerId: "gitlab" })] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    const gitlab = result.current.rows!.find((row) => row.providerId === "gitlab")!;
    expect(gitlab.info.listed).toBe(false);
    expect(gitlab.saved?.id).toBe("gl-1");
    act(() => result.current.setToken("gitlab", "glpat"));
    await act(() => result.current.save("gitlab"));
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("still shows saved connections when the host list fails to load", async () => {
    const port = createFakeSourceControlCredentialsPort({
      listProviders: () => Promise.reject(new Error("down")),
      listCredentials: () => Promise.resolve({ credentials: [githubCredential()] }),
    });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());
    expect(result.current.rows!.map((row) => [row.providerId, row.info.listed])).toEqual([["github", false]]);
  });
});
