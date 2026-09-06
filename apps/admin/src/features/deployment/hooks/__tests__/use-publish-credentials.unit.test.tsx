import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { ApiError, type AdminPublishCredentialSummary, type AdminPublishCredentialsSnapshot } from "@/lib/api";
import { usePublishCredentials } from "../use-publish-credentials.hooks";
import { createFakePublishCredentialsPort } from "../publish-credentials-dependencies.hooks";

/**
 * @file `usePublishCredentials` — the Static Site tab's flat, one-row-per-provider credential state
 * and its create-or-update save flow (2026-08-15 redesign, replacing the earlier add/edit/delete/
 * default-promotion CRUD hook — see the hook's own file header). Same injected-port shape as
 * `use-static-publish.unit.test.tsx`; `StaticSiteTab.unit.test.tsx` only proves the markup wiring,
 * not the field-state and request-shape behavior this file pins.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";

const GH_CREDENTIAL: AdminPublishCredentialSummary = {
  id: "cred-1",
  providerId: "github-pages",
  label: "default",
  configured: true,
  isDefault: true,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-15T09:30:00.000Z",
  accountLabel: null,
};

describe("usePublishCredentials — initial load", () => {
  it("seeds rows (one per provider) and executionMode from the port's initial read", async () => {
    const snapshot: AdminPublishCredentialsSnapshot = { credentials: [GH_CREDENTIAL], executionMode: "hosted-api-only" };
    const port = createFakePublishCredentialsPort({ listCredentials: () => Promise.resolve(snapshot) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.rows).not.toBeUndefined());
    expect(result.current.rows).toHaveLength(4);
    expect(result.current.rows!.map((row) => row.providerId)).toEqual(["github-pages", "vercel", "netlify", "cloudflare-pages"]);
    expect(result.current.executionMode).toBe("hosted-api-only");
    expect(result.current.loadError).toBeNull();
  });

  it("rows stay undefined until the first load resolves", () => {
    const port = createFakePublishCredentialsPort({ listCredentials: () => new Promise(() => {}) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    expect(result.current.rows).toBeUndefined();
    expect(result.current.executionMode).toBeUndefined();
  });

  it("surfaces a rejected initial read as a translated load error, rows/executionMode stay undefined", async () => {
    const port = createFakePublishCredentialsPort({ listCredentials: () => Promise.reject(new Error("disk error")) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toContain("Could not load publish credentials");
    expect(result.current.loadError).toContain("disk error");
    expect(result.current.rows).toBeUndefined();
    expect(result.current.executionMode).toBeUndefined();
  });
});

/**
 * `credentials` (the raw state `rows` is derived from) is `undefined` only in the window before the
 * initial `listCredentials()` read resolves — every setter afterward keeps it a real array forever.
 * `save`/`verify`/`credentialsForProvider` all read it through a `credentials ?? []` fallback rather
 * than an explicit "not loaded yet" guard, so calling one in that window is a real, reachable path
 * (not merely a defensive one) that treats the not-yet-loaded state as "nothing saved yet".
 */
describe("usePublishCredentials — called before the initial load resolves", () => {
  it("save() proceeds as a create (credentials ?? [] finds nothing 'existing' to update)", async () => {
    const created: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, providerId: "vercel", id: "cred-new" };
    let sentInput: { label?: string; connection?: unknown } | undefined;
    const port = createFakePublishCredentialsPort({
      listCredentials: () => new Promise(() => {}), // never resolves
      createCredential: (input) => {
        sentInput = input;
        return Promise.resolve(created);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    expect(result.current.rows).toBeUndefined();

    act(() => result.current.setToken("vercel", "vc_abc"));
    await act(async () => {
      await result.current.save("vercel");
    });

    expect(sentInput).toEqual({ label: "default", connection: { providerId: "vercel", token: "vc_abc" } });
  });

  it("verify() is a no-op (credentials ?? [] finds no 'connected' row to verify)", async () => {
    const verifyCredential = vi.fn();
    const port = createFakePublishCredentialsPort({ listCredentials: () => new Promise(() => {}), verifyCredential });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });

    await act(async () => {
      await result.current.verify("vercel");
    });
    expect(verifyCredential).not.toHaveBeenCalled();
  });

  it("credentialsForProvider returns [] rather than throwing", () => {
    const port = createFakePublishCredentialsPort({ listCredentials: () => new Promise(() => {}) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });

    expect(result.current.credentialsForProvider("vercel")).toEqual([]);
  });

  it("selectCredential proceeds (credentials ?? [] finds no current default to already match)", async () => {
    const promoted: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, isDefault: true };
    let sentId: string | undefined;
    let listCalls = 0;
    const port = createFakePublishCredentialsPort({
      // Call 1 is the bootstrap read (must stay pending so `credentials` state is still undefined
      // when selectCredential runs); call 2 is selectCredential's own direct re-fetch afterward.
      listCredentials: () => {
        listCalls += 1;
        if (listCalls === 1) return new Promise(() => {});
        return Promise.resolve({ credentials: [promoted], executionMode: "self-hosted-cli" as const });
      },
      updateCredential: (id) => {
        sentId = id;
        return Promise.resolve(promoted);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    expect(result.current.rows).toBeUndefined();

    await act(async () => {
      await result.current.selectCredential("github-pages", "cred-1");
    });
    expect(sentId).toBe("cred-1");
  });
});

describe("usePublishCredentials — row shape", () => {
  it("a provider with no saved connection shows saved: undefined and blank draft fields", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    const vercelRow = result.current.rows!.find((row) => row.providerId === "vercel")!;
    expect(vercelRow.saved).toBeUndefined();
    expect(vercelRow.token).toBe("");
    expect(vercelRow.accountId).toBe("");
    expect(vercelRow.saving).toBe(false);
    expect(vercelRow.error).toBeNull();
  });

  it("a provider with a saved connection shows it as `saved` — the connection fields themselves stay blank, never read back", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    const ghRow = result.current.rows!.find((row) => row.providerId === "github-pages")!;
    expect(ghRow.saved).toEqual(GH_CREDENTIAL);
    expect(ghRow.token).toBe("");
    expect(ghRow.accountId).toBe("");
  });

  it("with two saved connections for one provider, the row shows the DEFAULT one, never an arbitrary one", async () => {
    const backup: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "backup", isDefault: false };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [backup, GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    const ghRow = result.current.rows!.find((row) => row.providerId === "github-pages")!;
    expect(ghRow.saved).toEqual(GH_CREDENTIAL); // isDefault: true
  });
});

describe("usePublishCredentials — setToken / setAccountId", () => {
  it("each provider's draft fields are independent of every other provider's", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("vercel", "vercel-token"));
    act(() => result.current.setToken("netlify", "netlify-token"));
    act(() => result.current.setAccountId("cloudflare-pages", "acct-1"));

    const byProvider = Object.fromEntries(result.current.rows!.map((row) => [row.providerId, row]));
    expect(byProvider["vercel"].token).toBe("vercel-token");
    expect(byProvider["netlify"].token).toBe("netlify-token");
    expect(byProvider["github-pages"].token).toBe("");
    expect(byProvider["cloudflare-pages"].accountId).toBe("acct-1");
    expect(byProvider["cloudflare-pages"].token).toBe("");
  });
});

describe("usePublishCredentials — save, provider not yet connected (create)", () => {
  it("POSTs the fixed row label plus the built connection — no isDefault key, since this is the provider's first connection", async () => {
    let sentInput: { label: string; connection: unknown; isDefault?: boolean } | undefined;
    const created: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-new", providerId: "vercel" };
    const port = createFakePublishCredentialsPort({
      createCredential: (input) => {
        sentInput = input;
        return Promise.resolve(created);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("vercel", "vc_abc"));
    await act(async () => {
      await result.current.save("vercel");
    });

    expect(sentInput).toEqual({ label: "default", connection: { providerId: "vercel", token: "vc_abc" } });
    expect(sentInput).not.toHaveProperty("isDefault");
    expect(result.current.rows!.find((row) => row.providerId === "vercel")!.saved).toEqual(created);
  });

  it("builds a cloudflare-pages connection with accountId", async () => {
    let sentInput: { label: string; connection: unknown } | undefined;
    const created: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-cf", providerId: "cloudflare-pages" };
    const port = createFakePublishCredentialsPort({
      createCredential: (input) => {
        sentInput = input;
        return Promise.resolve(created);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("cloudflare-pages", "cf_tok"));
    act(() => result.current.setAccountId("cloudflare-pages", "acct-1"));
    await act(async () => {
      await result.current.save("cloudflare-pages");
    });

    expect(sentInput?.connection).toEqual({ providerId: "cloudflare-pages", token: "cf_tok", accountId: "acct-1" });
  });

  it("is a no-op while the row is not ready to save — never calls the port", async () => {
    const createCredential = vi.fn();
    const port = createFakePublishCredentialsPort({ createCredential });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    // token still blank.
    await act(async () => {
      await result.current.save("vercel");
    });
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("cloudflare-pages stays not-ready (and never calls the port) until BOTH token and accountId are filled", async () => {
    const createCredential = vi.fn();
    const port = createFakePublishCredentialsPort({ createCredential });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("cloudflare-pages", "cf_tok"));
    await act(async () => {
      await result.current.save("cloudflare-pages");
    });
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("clears the draft token/accountId back to blank once the save resolves", async () => {
    const created: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-cf", providerId: "cloudflare-pages" };
    const port = createFakePublishCredentialsPort({ createCredential: () => Promise.resolve(created) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("cloudflare-pages", "cf_tok"));
    act(() => result.current.setAccountId("cloudflare-pages", "acct-1"));
    await act(async () => {
      await result.current.save("cloudflare-pages");
    });

    const row = result.current.rows!.find((r) => r.providerId === "cloudflare-pages")!;
    expect(row.token).toBe("");
    expect(row.accountId).toBe("");
    expect(row.saving).toBe(false);
  });
});

describe("usePublishCredentials — save, provider already connected (update)", () => {
  it("PUTs to the existing DEFAULT row's id, sending only `connection` — never a label or isDefault", async () => {
    let sentId: string | undefined;
    let sentInput: { label?: string; connection?: unknown; isDefault?: boolean } | undefined;
    const updated: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, updatedAt: "2026-08-15T12:00:00.000Z" };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      updateCredential: (id, input) => {
        sentId = id;
        sentInput = input;
        return Promise.resolve(updated);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("github-pages", "new-token"));
    await act(async () => {
      await result.current.save("github-pages");
    });

    expect(sentId).toBe("cred-1");
    expect(sentInput).toEqual({ connection: { providerId: "github-pages", token: "new-token" } });
    expect(sentInput).not.toHaveProperty("label");
    expect(sentInput).not.toHaveProperty("isDefault");
    expect(result.current.rows!.find((row) => row.providerId === "github-pages")!.saved).toEqual(updated);
  });

  it("a blank token is never ready to save on an already-connected row — nothing to change, never calls the port", async () => {
    const updateCredential = vi.fn();
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      updateCredential,
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.save("github-pages");
    });
    expect(updateCredential).not.toHaveBeenCalled();
  });

  it("updating the default credential never touches a SIBLING credential for the same provider", async () => {
    const backup: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "backup", isDefault: false };
    const updated: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, updatedAt: "2026-08-15T12:00:00.000Z" };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [backup, GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      updateCredential: () => Promise.resolve(updated),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("github-pages", "new-token"));
    await act(async () => {
      await result.current.save("github-pages"); // updates the DEFAULT (cred-1), not the backup
    });

    expect(result.current.credentialsForProvider("github-pages").find((c) => c.id === "cred-1")).toEqual(updated);
    expect(result.current.credentialsForProvider("github-pages").find((c) => c.id === "cred-2")).toEqual(backup);
  });

  it("preserves the row's own existing label — the replaced connection is sent without a label field at all", async () => {
    const renamedRow: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, label: "some legacy label" };
    let sentInput: { label?: string } | undefined;
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [renamedRow], executionMode: "self-hosted-cli" }),
      updateCredential: (_id, input) => {
        sentInput = input;
        return Promise.resolve(renamedRow);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("github-pages", "new-token"));
    await act(async () => {
      await result.current.save("github-pages");
    });
    expect(sentInput).not.toHaveProperty("label");
  });
});

describe("usePublishCredentials — credentialsForProvider (the Static Site token-picker's data source)", () => {
  it("returns every saved connection for a provider, not just the default one", async () => {
    const backup: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "backup", isDefault: false };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [backup, GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    const github = result.current.credentialsForProvider("github-pages");
    expect(github.map((c) => c.id)).toEqual(["cred-2", "cred-1"]);
  });

  it("returns an empty list for a provider with nothing saved", async () => {
    const port = createFakePublishCredentialsPort();
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    expect(result.current.credentialsForProvider("vercel")).toEqual([]);
  });
});

describe("usePublishCredentials — selectCredential (the Static Site token-picker's write)", () => {
  it("PUTs isDefault: true to the chosen credential's id, then refetches the provider's list", async () => {
    const backup: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "backup", isDefault: false };
    const promoted: AdminPublishCredentialSummary = { ...backup, isDefault: true };
    const demoted: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, isDefault: false };
    let sentId: string | undefined;
    let sentInput: { isDefault?: boolean } | undefined;
    let listCalls = 0;
    const port = createFakePublishCredentialsPort({
      listCredentials: () => {
        listCalls += 1;
        const credentials = listCalls === 1 ? [backup, GH_CREDENTIAL] : [demoted, promoted];
        return Promise.resolve({ credentials, executionMode: "self-hosted-cli" });
      },
      updateCredential: (id, input) => {
        sentId = id;
        sentInput = input;
        return Promise.resolve(promoted);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.selectCredential("github-pages", "cred-2");
    });

    expect(sentId).toBe("cred-2");
    expect(sentInput).toEqual({ isDefault: true });
    expect(listCalls).toBe(2);
    // The row now reads the newly-promoted connection as this provider's default.
    expect(result.current.rows!.find((row) => row.providerId === "github-pages")!.saved?.id).toBe("cred-2");
  });

  it("is a no-op — never calls the port — when the chosen credential is already the default", async () => {
    const updateCredential = vi.fn();
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      updateCredential,
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.selectCredential("github-pages", "cred-1");
    });
    expect(updateCredential).not.toHaveBeenCalled();
  });

  it("proceeds when the provider has no default credential at all yet — 'already selected' can't be true of nothing", async () => {
    const promoted: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, isDefault: true };
    let sentId: string | undefined;
    const port = createFakePublishCredentialsPort({
      // Nothing saved for github-pages at all — `defaultCredentialForProvider` finds no current row.
      listCredentials: () => Promise.resolve({ credentials: [], executionMode: "self-hosted-cli" }),
      updateCredential: (id) => {
        sentId = id;
        return Promise.resolve(promoted);
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.selectCredential("github-pages", "cred-1");
    });
    expect(sentId).toBe("cred-1");
  });
});

describe("usePublishCredentials — verify (the 'hit verify on the token' button the assistant's own guidance assumed existed)", () => {
  it("calls the port with the provider's connected (default) credential's id, and reflects the result on that row", async () => {
    let sentId: string | undefined;
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      verifyCredential: (id) => {
        sentId = id;
        return Promise.resolve({ status: "valid", message: "GitHub accepted this credential.", checkedAt: "2026-08-16T00:00:00.000Z", accountLabel: "leonaburime-ucla" });
      },
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.verify("github-pages");
    });

    expect(sentId).toBe("cred-1");
    const row = result.current.rows!.find((r) => r.providerId === "github-pages")!;
    expect(row.verification?.status).toBe("valid");
    expect(row.verifying).toBe(false);
    expect(row.verifyError).toBeNull();
  });

  it("a 'valid' result carrying an accountLabel heals it onto the row's SAVED summary — durable across a re-render, not just the transient result", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      verifyCredential: () =>
        Promise.resolve({ status: "valid", message: "GitHub accepted this credential.", checkedAt: "2026-08-16T00:00:00.000Z", accountLabel: "leonaburime-ucla" }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    expect(result.current.rows!.find((r) => r.providerId === "github-pages")!.saved?.accountLabel).toBeNull();

    await act(async () => {
      await result.current.verify("github-pages");
    });

    expect(result.current.rows!.find((r) => r.providerId === "github-pages")!.saved?.accountLabel).toBe("leonaburime-ucla");
  });

  it("healing the verified credential's accountLabel never touches a SIBLING credential for the same provider", async () => {
    const backup: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "backup", isDefault: false };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [backup, GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      verifyCredential: () =>
        Promise.resolve({ status: "valid", message: "GitHub accepted this credential.", checkedAt: "2026-08-16T00:00:00.000Z", accountLabel: "leonaburime-ucla" }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.verify("github-pages"); // verifies the DEFAULT (cred-1), not the backup
    });

    expect(result.current.credentialsForProvider("github-pages").find((c) => c.id === "cred-1")!.accountLabel).toBe("leonaburime-ucla");
    expect(result.current.credentialsForProvider("github-pages").find((c) => c.id === "cred-2")).toEqual(backup);
  });

  it("a result with NO accountLabel leaves whatever the row already had alone — only a truthy finding heals forward", async () => {
    const alreadyLabeled: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, accountLabel: "leonaburime-ucla" };
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [alreadyLabeled], executionMode: "self-hosted-cli" }),
      verifyCredential: () => Promise.resolve({ status: "unreachable", message: "Could not reach GitHub to verify this credential.", checkedAt: "2026-08-16T00:00:00.000Z" }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.verify("github-pages");
    });

    expect(result.current.rows!.find((r) => r.providerId === "github-pages")!.saved?.accountLabel).toBe("leonaburime-ucla");
  });

  it("is a no-op — never calls the port — when this provider has nothing saved to verify", async () => {
    const verifyCredential = vi.fn();
    const port = createFakePublishCredentialsPort({ verifyCredential });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.verify("vercel");
    });
    expect(verifyCredential).not.toHaveBeenCalled();
    // Without the early `if (!connected) return`, execution would still reach `connected.id` on
    // `undefined` — a TypeError caught by the surrounding try/catch, which would ALSO leave
    // verifyCredential uncalled, silently masking a missing guard. Assert the row itself stays
    // completely untouched (in particular no translated verifyError from that caught crash) so a
    // removed guard is distinguishable from a present one.
    const row = result.current.rows!.find((r) => r.providerId === "vercel")!;
    expect(row.verifying).toBe(false);
    expect(row.verifyError).toBeNull();
    expect(row.verification).toBeUndefined();
  });

  it("a rejected verify surfaces a translated, per-row verifyError and leaves any prior verification result alone", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL], executionMode: "self-hosted-cli" }),
      verifyCredential: () => Promise.reject(new Error("network down")),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    await act(async () => {
      await result.current.verify("github-pages");
    });

    const row = result.current.rows!.find((r) => r.providerId === "github-pages")!;
    expect(row.verifyError).toContain("Could not verify this token");
    expect(row.verifyError).toContain("network down");
    expect(row.verifying).toBe(false);
    expect(row.verification).toBeUndefined();
  });

  it("an in-flight verify sets verifying: true on that row only, never touching a sibling provider's row", async () => {
    const secondCredential: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-vercel", providerId: "vercel" };
    let resolveVerify: (() => void) | undefined;
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [GH_CREDENTIAL, secondCredential], executionMode: "self-hosted-cli" }),
      verifyCredential: () =>
        new Promise((resolve) => {
          resolveVerify = () => resolve({ status: "valid", message: "ok", checkedAt: "2026-08-16T00:00:00.000Z" });
        }),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    let verifyPromise!: Promise<void>;
    act(() => {
      verifyPromise = result.current.verify("github-pages");
    });

    await waitFor(() => expect(result.current.rows!.find((r) => r.providerId === "github-pages")!.verifying).toBe(true));
    expect(result.current.rows!.find((r) => r.providerId === "vercel")!.verifying).toBe(false);

    await act(async () => {
      resolveVerify!();
      await verifyPromise;
    });
    expect(result.current.rows!.find((r) => r.providerId === "github-pages")!.verifying).toBe(false);
  });
});

describe("usePublishCredentials — save, error handling", () => {
  it("a rejected save surfaces a translated, per-row error and leaves that row's draft fields intact", async () => {
    const port = createFakePublishCredentialsPort({ createCredential: () => Promise.reject(new Error("network down")) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("vercel", "vc_abc"));
    await act(async () => {
      await result.current.save("vercel");
    });

    const row = result.current.rows!.find((r) => r.providerId === "vercel")!;
    expect(row.error).toContain("Could not save this token");
    expect(row.error).toContain("network down");
    expect(row.token).toBe("vc_abc"); // never discarded on failure — the operator should not have to retype it
    expect(row.saving).toBe(false);
  });

  it("a DUPLICATE_LABEL rejection (a write race — this row should already exist) surfaces its own reload-and-retry message", async () => {
    const port = createFakePublishCredentialsPort({ createCredential: () => Promise.reject(new ApiError("DUPLICATE_LABEL", 409)) });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("vercel", "vc_abc"));
    await act(async () => {
      await result.current.save("vercel");
    });

    const row = result.current.rows!.find((r) => r.providerId === "vercel")!;
    expect(row.error).toBe("This connection was already saved — reload the page and try again.");
  });

  it("a VALIDATION rejection surfaces the server's own detail through the save-error template", async () => {
    const port = createFakePublishCredentialsPort({
      createCredential: () => Promise.reject(new ApiError("VALIDATION", 400, undefined, { detail: "owner is required" })),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("vercel", "vc_abc"));
    await act(async () => {
      await result.current.save("vercel");
    });

    const row = result.current.rows!.find((r) => r.providerId === "vercel")!;
    expect(row.error).toBe("Could not save this token (owner is required).");
  });

  it("an error on one provider's row never touches another provider's row", async () => {
    const port = createFakePublishCredentialsPort({
      createCredential: (input: { connection: { providerId: string } }) =>
        input.connection.providerId === "vercel" ? Promise.reject(new Error("nope")) : Promise.resolve(GH_CREDENTIAL),
    });
    const { result } = renderHook(() => usePublishCredentials(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeUndefined());

    act(() => result.current.setToken("vercel", "vc_abc"));
    act(() => result.current.setToken("netlify", "nl_abc"));
    await act(async () => {
      await result.current.save("vercel");
    });

    const byProvider = Object.fromEntries(result.current.rows!.map((row) => [row.providerId, row]));
    expect(byProvider["vercel"].error).not.toBeNull();
    expect(byProvider["netlify"].error).toBeNull();
    expect(byProvider["netlify"].token).toBe("nl_abc"); // untouched by the sibling row's failed save
  });
});
