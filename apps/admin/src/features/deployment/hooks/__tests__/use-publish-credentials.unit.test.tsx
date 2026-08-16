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
  isDefault: true,
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
  it("startAdd opens the form in add mode with every field blank, github-pages selected, and isDefault false", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.editingId).toBeNull();
    expect(result.current.providerId).toBe("github-pages");
    expect(result.current.label).toBe("");
    expect(result.current.token).toBe("");
    expect(result.current.accountId).toBe("");
    expect(result.current.isDefault).toBe(false);
  });

  it("startEdit seeds providerId/label/isDefault from the row but leaves every connection field blank — a stored credential is never read back", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startEdit(GH_CREDENTIAL));
    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.editingId).toBe("cred-1");
    expect(result.current.providerId).toBe("github-pages");
    expect(result.current.label).toBe("Production GitHub Pages");
    expect(result.current.token).toBe("");
    expect(result.current.accountId).toBe("");
    expect(result.current.isDefault).toBe(true); // GH_CREDENTIAL.isDefault is true
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
  it("submit() sends label + the built connection, appends the result, and closes the form — no isDefault key: this is the workspace's first github-pages connection", async () => {
    let sentInput: { label: string; connection: unknown; isDefault?: boolean } | undefined;
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
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({ label: "Staging", connection: { providerId: "github-pages", token: "ghp_abc" } });
    expect(sentInput).not.toHaveProperty("isDefault");
    expect(result.current.credentials).toEqual([created]);
    expect(result.current.isFormOpen).toBe(false);
  });

  it("submit() sends the checked isDefault when a sibling credential for the same provider already exists", async () => {
    let sentInput: { label: string; connection: unknown; isDefault?: boolean } | undefined;
    const created: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Staging", isDefault: true };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      createCredential: (input) => {
        sentInput = input;
        return Promise.resolve(created);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL]));

    act(() => result.current.startAdd());
    act(() => result.current.setProviderId("github-pages"));
    act(() => result.current.setLabel("Staging"));
    act(() => result.current.setToken("ghp_abc"));
    act(() => result.current.setIsDefault(true));
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({ label: "Staging", connection: { providerId: "github-pages", token: "ghp_abc" }, isDefault: true });
    // The newly-created default clears the previously-default sibling locally.
    expect(result.current.credentials).toEqual([{ ...GH_CREDENTIAL, isDefault: false }, created]);
  });

  it("submit() builds a cloudflare-pages connection with accountId", async () => {
    let sentInput: { label: string; connection: unknown } | undefined;
    const created: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-3", providerId: "cloudflare-pages", label: "CF" };
    const port = createFakePublishCredentialsPort({
      createCredential: (input) => {
        sentInput = input;
        return Promise.resolve(created);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    act(() => result.current.setProviderId("cloudflare-pages"));
    act(() => result.current.setLabel("CF"));
    act(() => result.current.setToken("cf_tok"));
    act(() => result.current.setAccountId("acct-1"));
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({ label: "CF", connection: { providerId: "cloudflare-pages", token: "cf_tok", accountId: "acct-1" } });
  });

  it("submit() is a no-op while the form is not ready to submit — never calls the port", async () => {
    const createCredential = vi.fn();
    const port = createFakePublishCredentialsPort({ createCredential });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).not.toBeUndefined());

    act(() => result.current.startAdd());
    act(() => result.current.setLabel("Staging"));
    // token still blank — not ready, regardless of provider.
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
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({
      label: "Production GitHub Pages",
      connection: { providerId: "github-pages", token: "new-token" },
    });
    expect(sentInput).not.toHaveProperty("isDefault"); // this row is the only github-pages credential — no real choice to send
    expect(result.current.credentials).toEqual([updated]);
  });

  it("editing one of TWO siblings and toggling isDefault off sends isDefault: false explicitly", async () => {
    const secondCredential: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Backup", isDefault: false };
    let sentInput: { label?: string; connection?: unknown; isDefault?: boolean } | undefined;
    const updated: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, isDefault: false };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL, secondCredential], executionMode: "self-hosted-cli" }),
      updateCredential: (_id, input) => {
        sentInput = input;
        return Promise.resolve(updated);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL, secondCredential]));

    act(() => result.current.startEdit(GH_CREDENTIAL));
    expect(result.current.isDefault).toBe(true); // seeded from GH_CREDENTIAL.isDefault
    act(() => result.current.setIsDefault(false));
    await act(async () => {
      await result.current.submit();
    });

    expect(sentInput).toEqual({ label: "Production GitHub Pages", isDefault: false });
  });
});

describe("usePublishCredentials — markAsDefault", () => {
  it("promotes one credential to default and clears the flag on its provider siblings locally", async () => {
    const other: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Backup", isDefault: false };
    const promoted: AdminPublishCredentialSummary = { ...other, isDefault: true };
    let sentId: string | undefined;
    let sentInput: { isDefault?: boolean } | undefined;
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL, other], executionMode: "self-hosted-cli" }),
      updateCredential: (id, input) => {
        sentId = id;
        sentInput = input;
        return Promise.resolve(promoted);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL, other]));

    await act(async () => {
      await result.current.markAsDefault("cred-2");
    });

    expect(sentId).toBe("cred-2");
    expect(sentInput).toEqual({ isDefault: true });
    expect(result.current.credentials).toEqual([{ ...GH_CREDENTIAL, isDefault: false }, promoted]);
    expect(result.current.markingDefaultId).toBeNull();
    expect(result.current.markDefaultError).toBeNull();
  });

  it("a rejected promotion surfaces a translated markDefaultError and leaves the list unchanged", async () => {
    const other: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Backup", isDefault: false };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL, other], executionMode: "self-hosted-cli" }),
      updateCredential: () => Promise.reject(new Error("locked")),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.credentials).toEqual([GH_CREDENTIAL, other]));

    await act(async () => {
      await result.current.markAsDefault("cred-2");
    });

    expect(result.current.markDefaultError).toContain("Could not make this credential the default");
    expect(result.current.markDefaultError).toContain("locked");
    expect(result.current.credentials).toEqual([GH_CREDENTIAL, other]);
    expect(result.current.markingDefaultId).toBeNull();
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
