import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import { ApiError, type AdminPublishCredentialSummary, type AdminPublishCredentialsSnapshot } from "../../../../lib/api";
import { usePublishCredentials } from "../use-publish-credentials.hooks";
import { createFakePublishCredentialsPort } from "../publish-credentials-dependencies.hooks";

/**
 * @file `usePublishCredentials` — the Static Site tab's credential list, add/edit form state, and
 * the create/update/delete CRUD flow. Same injected-port shape as `use-static-publish.unit.test.tsx`;
 * `StaticSiteTab.unit.test.tsx` only proves the markup wiring, not the field-state and request-shape
 * behavior this file pins.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";

const GH_CREDENTIAL: AdminPublishCredentialSummary = {
  id: "cred-1",
  providerId: "github-pages",
  label: "Production GitHub Pages",
  configured: true,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

describe("usePublishCredentials — initial load", () => {
  it("seeds credentials and executionMode from the port's initial read", async () => {
    const snapshot: AdminPublishCredentialsSnapshot = { credentials: [GH_CREDENTIAL], executionMode: "hosted-api-only" };
    const port = createFakePublishCredentialsPort({ listCredentials: () => Promise.resolve(snapshot) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());
    expect(result.current.credentials).toEqual([GH_CREDENTIAL]);
    expect(result.current.executionMode).toBe("hosted-api-only");
    expect(result.current.loadError).toBeNull();
  });

  it("surfaces a rejected initial read as a translated load error, credentials/executionMode stay undefined", async () => {
    const port = createFakePublishCredentialsPort({ listCredentials: () => Promise.reject(new Error("disk error")) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toContain("Could not load publish credentials");
    expect(result.current.loadError).toContain("disk error");
    expect(result.current.credentials).toBeUndefined();
    expect(result.current.executionMode).toBeUndefined();
  });
});

describe("usePublishCredentials — startAdd / startEdit / cancelForm", () => {
  it("startAdd opens the form in add mode with every field blank and github-pages selected", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.editingId).toBeNull();
    expect(result.current.providerId).toBe("github-pages");
    expect(result.current.label).toBe("");
    expect(result.current.token).toBe("");
    expect(result.current.owner).toBe("");
  });

  it("startEdit seeds providerId/label from the row but leaves every connection field blank — a stored credential is never read back", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startEdit(GH_CREDENTIAL));
    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.editingId).toBe("cred-1");
    expect(result.current.providerId).toBe("github-pages");
    expect(result.current.label).toBe("Production GitHub Pages");
    expect(result.current.token).toBe("");
    expect(result.current.owner).toBe("");
    expect(result.current.repo).toBe("");
  });

  it("startEdit after typing into an add-mode field does not leak that value into the edit form", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    act(() => result.current.setToken("some-typed-token"));
    act(() => result.current.startEdit(GH_CREDENTIAL));
    expect(result.current.token).toBe("");
  });

  it("cancelForm closes the form and clears editingId/formError", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startEdit(GH_CREDENTIAL));
    act(() => result.current.cancelForm());
    expect(result.current.isFormOpen).toBe(false);
    expect(result.current.editingId).toBeNull();
  });
});

describe("usePublishCredentials — create (add mode)", () => {
  it("submit() sends label + the built connection, appends the result, and closes the form", async () => {
    let sentInput: { label: string; connection: unknown } | undefined;
    const created: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Staging" };
    const port = createFakePublishCredentialsPort({
      createCredential: (input) => {
        sentInput = input;
        return Promise.resolve(created);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    act(() => result.current.setLabel("Staging"));
    act(() => result.current.setToken("ghp_abc"));
    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({ label: "Staging", connection: { providerId: "github-pages", token: "ghp_abc", owner: "octo", repo: "demo-repo" } });
    expect(result.current.credentials).toEqual([created]);
    expect(result.current.isFormOpen).toBe(false);
  });

  it("submit() is a no-op while the form is not ready to submit — never calls the port", async () => {
    const createCredential = vi.fn();
    const port = createFakePublishCredentialsPort({ createCredential });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    act(() => result.current.setLabel("Staging"));
    // token/owner/repo all still blank — github-pages is not ready.
    await act(async () => {
      await result.current.submit();
    });
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("a 409 DUPLICATE_LABEL rejection surfaces a specific formError, the form stays open", async () => {
    const port = createFakePublishCredentialsPort({
      createCredential: () => Promise.reject(new ApiError("DUPLICATE_LABEL", 409)),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    act(() => result.current.setLabel("Staging"));
    act(() => result.current.setToken("tok"));
    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.formError).toBe("A credential with this label already exists.");
    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.credentials).toEqual([]);
  });

  it("a generic rejection surfaces the wrapped, translated save-error banner", async () => {
    const port = createFakePublishCredentialsPort({ createCredential: () => Promise.reject(new Error("network down")) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    act(() => result.current.setLabel("Staging"));
    act(() => result.current.setToken("tok"));
    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.formError).toContain("Could not save this credential");
    expect(result.current.formError).toContain("network down");
  });
});

describe("usePublishCredentials — update (edit mode)", () => {
  it("a BLANK token omits `connection` from the PUT entirely — the stored secret stays untouched", async () => {
    let sentInput: { label?: string; connection?: unknown } | undefined;
    const renamed: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, label: "Renamed" };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      updateCredential: (_id, input) => {
        sentInput = input;
        return Promise.resolve(renamed);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL]));

    act(() => result.current.startEdit(GH_CREDENTIAL));
    act(() => result.current.setLabel("Renamed"));
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({ label: "Renamed" });
    expect(sentInput).not.toHaveProperty("connection");
    expect(result.current.credentials).toEqual([renamed]);
  });

  it("a NON-blank token sends a full rebuilt connection and replaces the row in place", async () => {
    let sentInput: { label?: string; connection?: unknown } | undefined;
    const updated: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, updatedAt: "2026-08-15T09:00:00.000Z" };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      updateCredential: (_id, input) => {
        sentInput = input;
        return Promise.resolve(updated);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL]));

    act(() => result.current.startEdit(GH_CREDENTIAL));
    act(() => result.current.setToken("new-token"));
    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({
      label: "Production GitHub Pages",
      connection: { providerId: "github-pages", token: "new-token", owner: "octo", repo: "demo-repo" },
    });
    expect(result.current.credentials).toEqual([updated]);
  });
});

describe("usePublishCredentials — delete", () => {
  it("remove() deletes and removes the row from the local list", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      deleteCredential: () => Promise.resolve(),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL]));

    await act(async () => {
      await result.current.remove("cred-1");
    });
    expect(result.current.credentials).toEqual([]);
    expect(result.current.deletingId).toBeNull();
    expect(result.current.deleteError).toBeNull();
  });

  it("remove() closes the form when the row being deleted is the one currently being edited", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      deleteCredential: () => Promise.resolve(),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL]));

    act(() => result.current.startEdit(GH_CREDENTIAL));
    await act(async () => {
      await result.current.remove("cred-1");
    });
    expect(result.current.isFormOpen).toBe(false);
    expect(result.current.editingId).toBeNull();
  });

  it("a rejected delete surfaces a translated deleteError and leaves the row in place", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      deleteCredential: () => Promise.reject(new Error("locked")),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL]));

    await act(async () => {
      await result.current.remove("cred-1");
    });
    expect(result.current.deleteError).toContain("Could not delete this credential");
    expect(result.current.deleteError).toContain("locked");
    expect(result.current.credentials).toEqual([GH_CREDENTIAL]);
  });
});
