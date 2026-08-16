import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useSourceControlCredentials } from "../hooks/use-source-control-credentials.hooks";
import { createFakeSourceControlCredentialsPort } from "../hooks/source-control-credentials-dependencies.hooks";
import type { AdminSourceControlCredentialSummary } from "../types";

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
  it("starts with rows undefined, then resolves one row per provider once the list loads", async () => {
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.resolve({ credentials: [] }) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });

    expect(result.current.rows).toBeUndefined();

    await waitFor(() => expect(result.current.rows).toBeDefined());
    expect(result.current.rows!.map((row) => row.providerId)).toEqual(["github", "gitlab", "bitbucket"]);
    expect(result.current.rows!.every((row) => row.saved === undefined)).toBe(true);
  });

  it("marks a provider's row saved once its default credential is present in the initial load", async () => {
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.resolve({ credentials: [githubCredential()] }) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });

    await waitFor(() => expect(result.current.rows).toBeDefined());
    const githubRow = result.current.rows!.find((row) => row.providerId === "github");
    expect(githubRow?.saved?.id).toBe("cred-github-1");
    const gitlabRow = result.current.rows!.find((row) => row.providerId === "gitlab");
    expect(gitlabRow?.saved).toBeUndefined();
  });

  it("sets a load error when listCredentials rejects, without throwing", async () => {
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.reject(new Error("network down")) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toContain("network down");
  });

  it("setToken/setUsername update only the targeted row's own draft state", async () => {
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.resolve({ credentials: [] }) });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("github", "ghp_abc"));
    act(() => result.current.setUsername("bitbucket", "alice"));

    const github = result.current.rows!.find((row) => row.providerId === "github")!;
    const gitlab = result.current.rows!.find((row) => row.providerId === "gitlab")!;
    const bitbucket = result.current.rows!.find((row) => row.providerId === "bitbucket")!;
    expect(github.token).toBe("ghp_abc");
    expect(gitlab.token).toBe("");
    expect(bitbucket.username).toBe("alice");
    expect(bitbucket.token).toBe("");
  });

  it("save() is a no-op (no create call) when the row isn't ready — e.g. a blank token", async () => {
    const createCredential = vi.fn();
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    await act(() => result.current.save("github"));
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("save() CREATEs with the fixed row label when this provider has nothing saved yet, then clears the draft", async () => {
    const createCredential = vi.fn().mockResolvedValue(githubCredential());
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
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
    const updateCredential = vi.fn().mockResolvedValue(githubCredential({ id: "cred-github-1" }));
    const port = createFakeSourceControlCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [githubCredential()] }),
      updateCredential,
    });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("github", "ghp_new"));
    await act(() => result.current.save("github"));

    expect(updateCredential).toHaveBeenCalledWith("cred-github-1", { connection: { providerId: "github", token: "ghp_new" } });
  });

  it("save() requires BOTH token and username for bitbucket before it will call createCredential", async () => {
    const createCredential = vi.fn().mockResolvedValue(githubCredential({ providerId: "bitbucket" }));
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("bitbucket", "app-pw"));
    await act(() => result.current.save("bitbucket"));
    expect(createCredential).not.toHaveBeenCalled();

    act(() => result.current.setUsername("bitbucket", "alice"));
    await act(() => result.current.save("bitbucket"));
    expect(createCredential).toHaveBeenCalledWith({
      label: "default",
      connection: { providerId: "bitbucket", token: "app-pw", username: "alice" },
    });
  });

  it("save() surfaces a rejected write as that row's own error, and resets saving to false", async () => {
    const createCredential = vi.fn().mockRejectedValue(new Error("server exploded"));
    const port = createFakeSourceControlCredentialsPort({ listCredentials: () => Promise.resolve({ credentials: [] }), createCredential });
    const { result } = renderHook(() => useSourceControlCredentials(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeDefined());

    act(() => result.current.setToken("github", "ghp_abc"));
    await act(() => result.current.save("github"));

    const githubRow = result.current.rows!.find((row) => row.providerId === "github")!;
    expect(githubRow.saving).toBe(false);
    expect(githubRow.error).not.toBeNull();
    expect(githubRow.saved).toBeUndefined();
    expect(githubRow.token).toBe("ghp_abc"); // draft is NOT cleared on a failed save
  });
});
