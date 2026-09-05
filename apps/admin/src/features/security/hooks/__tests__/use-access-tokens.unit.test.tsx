import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { ApiError, type AdminCustomCredentialSummary, type AdminPublishCredentialSummary, type AdminSourceControlCredentialSummary } from "@/lib/api";
import { useAccessTokens, useWiredAccessTokens } from "../use-access-tokens.hooks";
import { createFakeAccessTokensPort } from "../access-tokens-dependencies.hooks";
import { ACCESS_TOKENS_RESOURCE } from "../../rules";
import type { AccessTokenExistingRowState, AccessTokenProviderGroupState } from "../use-access-tokens.hooks";
import type { AccessTokenRow } from "../../rules";

/**
 * @file (2026-09-04 coverage pass) `use-access-tokens.hooks.ts` was at 58% line / 51% branch
 * coverage — the entire non-custom `replaceToken` body, `createToken`, `openAddForm`/`closeAddForm`/
 * `setAddField`, `createCustomCredential`, `mergeCredential`/`refetchStore` (the PUBLISH and
 * SOURCE-CONTROL merge branches specifically — every prior test here only ever exercised `custom`
 * rows for create/replace, and only ever REJECTED publish/source-control writes, so the success
 * paths for those two stores were never reached), the three-way `accessTokensLoadError` priority
 * (only the background-reload-rejection path was covered, never an actual INITIAL load failure),
 * and `accessTokenSubmitErrorMessage`'s duplicate-label/validation/generic classification were all
 * at zero. The blocks below fill each of those in, plus `useWiredAccessTokens` (the real-port/
 * real-locale binding), which had never been called at all.
 */

/**
 * @file Regression coverage for two Terra audit findings (2026-08-19, Codex sol bug/architecture
 * audit) in `useAccessTokens`, plus a 2026-09-01 owner-reported bug:
 *
 * - HIGH #2: editing a saved token's Token/Account/Username field BEFORE its Name field erased the
 *   displayed Name, because the first partial draft update was seeded from `blankDraft()` (whose
 *   `name` is `""`) instead of the persisted row.
 * - MEDIUM: `removeToken`/`makeDefault` awaited their API calls with no error handling at all, so a
 *   rejected call (network/auth/server failure) produced an unhandled rejection and no visible
 *   change — the user could not tell the operation had failed.
 * - Owner-reported: a custom credential's saved `username` (e.g. a fly.io login) rendered BLANK in
 *   the edit form even though it was genuinely saved server-side, forcing a retype on every visit to
 *   this page. Root cause: `AccessTokenRow` carried no `username` field at all until `rules.ts` grew
 *   one (2026-09-01) — every draft fallback in this file seeded `username: ""` unconditionally, with
 *   no saved value to seed FROM even once the row started carrying one.
 */

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const T = (key: string): string => key;

function publishCredential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
  return {
    id: "cred-1",
    providerId: "github-pages",
    label: "Production",
    configured: true,
    isDefault: true,
    accountLabel: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function customCredential(overrides: Partial<AdminCustomCredentialSummary> = {}): AdminCustomCredentialSummary {
  return {
    id: "custom-1",
    label: "fly.io deploy",
    category: "hosting",
    baseUrl: "https://api.fly.io",
    additionalHosts: [],
    configured: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function sourceControlCredential(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
  return {
    id: "sc-1",
    providerId: "gitlab",
    label: "Main",
    configured: true,
    isDefault: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Locates one saved row's controller state across every provider group — `groups` is a flat list
 *  of per-provider buckets, not keyed by row id, so every assertion below has to search it. */
function findRow(groups: readonly AccessTokenProviderGroupState[] | undefined, id: string): AccessTokenExistingRowState | undefined {
  for (const group of groups ?? []) {
    const found = group.rows.find((r) => r.row.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Locates one provider's own group by `(kind, providerId)` — the `addForm`-level tests below need
 *  this rather than {@link findRow}, since an unconnected provider's `addForm` state exists even
 *  when its `rows` array is empty. */
function findGroup(groups: readonly AccessTokenProviderGroupState[] | undefined, kind: string, providerId: string): AccessTokenProviderGroupState | undefined {
  return (groups ?? []).find((g) => g.info.kind === kind && g.info.providerId === providerId);
}

describe("useAccessTokens: setExistingField", () => {
  it("typing into Token before Name does not clear the saved Name", async () => {
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(findRow(result.current.groups, "cred-1")?.name).toBe("Production");

    // The first field ever touched on this row is Token, NOT Name — the exact repro sequence.
    act(() => result.current.setExistingField("cred-1", { token: "ghp_new_token_never_saved" }));

    const row = findRow(result.current.groups, "cred-1");
    expect(row?.token).toBe("ghp_new_token_never_saved");
    expect(row?.name).toBe("Production");
  });

  it("a SECOND edit on the same row merges onto its own already-created draft, not the persisted-row fallback", async () => {
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setExistingField("cred-1", { token: "first-edit" }));
    act(() => result.current.setExistingField("cred-1", { accountId: "acct-1" }));

    const row = findRow(result.current.groups, "cred-1");
    expect(row?.token).toBe("first-edit");
    expect(row?.accountId).toBe("acct-1");
    expect(row?.name).toBe("Production");
  });

  it("seeds a blank name/username when the edited row id has no persisted row to fall back to (a stale or since-removed row id), proven via replaceToken's own write payload", async () => {
    const update = vi.fn().mockResolvedValue(customCredential({ id: "no-such-row" }));
    const port = createFakeAccessTokensPort({ custom: { update } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    // "no-such-row" belongs to no real row, so `persistedRow` (`rows?.find(...)`) comes back
    // undefined and the fallback must seed BOTH name and username blank rather than throw or leak
    // some other value. This first patch also supplies a real name so the ready-to-save gate below
    // can pass — name is not the field under test here; username is, since neither `act()` call ever
    // touches it, so whatever `replaceToken` reads for it came entirely from the fallback.
    act(() => result.current.setExistingField("no-such-row", { name: "Recovered Name", token: "tok" }));
    // A second edit merges onto the already-created draft (not the persistedRow fallback again) — the
    // same guarantee the "SECOND edit" test above pins for a real row.
    act(() => result.current.setExistingField("no-such-row", { accountId: "acct" }));

    // Not visible through any provider group (this id belongs to no real row — nothing renders it),
    // so probe the seeded draft indirectly through replaceToken, which reads `existingDrafts` by id
    // regardless of whether the row is real — the same hand-built-row idiom used two tests above.
    const handBuiltRow: AccessTokenRow = {
      kind: "custom",
      providerId: "no-such-row",
      id: "no-such-row",
      name: "Some Other Name",
      rawLabel: "Some Other Name",
      isDefault: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      username: "some-other-username",
    };
    await act(() => result.current.replaceToken(handBuiltRow));

    // The seeded draft's username must be "" (the blank fallback) — never handBuiltRow's OWN
    // "some-other-username", and never `undefined` (which would throw inside
    // buildCustomCredentialUpdatePatch's own `.trim()` call before this assertion could even run).
    // "" differs from handBuiltRow.username, so the update patch clears it via the server's `null`
    // sentinel — this exact patch shape is only reachable if the fallback actually produced "".
    expect(update).toHaveBeenCalledWith("no-such-row", { label: "Recovered Name", connection: { token: "tok" }, username: null });
  });
});

describe("useAccessTokens: removeToken", () => {
  it("a rejected remove surfaces a visible per-row error instead of failing silently", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }),
        remove: () => Promise.reject(new Error("network down")),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    await act(() => result.current.removeToken(target));

    const row = findRow(result.current.groups, "cred-1");
    expect(row).toBeDefined();
    expect(row?.saving).toBe(false);
    expect(row?.error).toBe("Couldn't remove this token: network down");
  });
});

describe("useAccessTokens: makeDefault", () => {
  it("a rejected update surfaces a visible per-row error instead of failing silently", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () =>
          Promise.resolve({
            credentials: [publishCredential({ isDefault: false }), publishCredential({ id: "cred-2", label: "Staging", isDefault: true })],
            executionMode: "self-hosted-cli",
          }),
        update: () => Promise.reject(new Error("server exploded")),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    await act(() => result.current.makeDefault(target));

    const row = findRow(result.current.groups, "cred-1");
    expect(row?.saving).toBe(false);
    expect(row?.error).toBe("Couldn't make this token the default: server exploded");
  });
});

describe("useAccessTokens: existing-row username prefill", () => {
  it("a saved custom credential's edit draft prefills its saved username", async () => {
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential({ username: "fly-deploy-bot" })] }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    const row = findRow(result.current.groups, "custom-1");
    expect(row?.username).toBe("fly-deploy-bot");
  });

  it("a saved custom credential with no username still prefills empty, not stale or blank-by-accident", async () => {
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential()] }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    const row = findRow(result.current.groups, "custom-1");
    expect(row?.username).toBe("");
  });
});

describe("useAccessTokens: replaceToken on a custom row — username-only save (2026-09-01 owner-reported bug)", () => {
  it("saving a changed Username with NO token typed sends a username-only PUT, and never touches connection/label", async () => {
    let captured: unknown;
    const port = createFakeAccessTokensPort({
      custom: {
        list: () => Promise.resolve({ credentials: [customCredential({ username: "old-user" })] }),
        update: (_id, input) => {
          captured = input;
          return Promise.resolve(customCredential({ username: "leonaburime@gmail.com" }));
        },
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "custom-1")!.row;

    act(() => result.current.setExistingField("custom-1", { username: "leonaburime@gmail.com" }));
    await act(() => result.current.replaceToken(target));

    expect(captured).toEqual({ username: "leonaburime@gmail.com" });
    const row = findRow(result.current.groups, "custom-1");
    expect(row?.username).toBe("leonaburime@gmail.com");
    expect(row?.error).toBe(null);
  });

  it("clearing a saved Username with no token typed sends the server's `null` clear sentinel, not a blank string", async () => {
    let captured: unknown;
    const port = createFakeAccessTokensPort({
      custom: {
        list: () => Promise.resolve({ credentials: [customCredential({ username: "old-user" })] }),
        update: (_id, input) => {
          captured = input;
          return Promise.resolve(customCredential());
        },
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "custom-1")!.row;

    act(() => result.current.setExistingField("custom-1", { username: "" }));
    await act(() => result.current.replaceToken(target));

    expect(captured).toEqual({ username: null });
  });

  it("does nothing (no API call) when nothing was actually changed — same 'no diff to send' rule as name-only replace", async () => {
    let updateCalled = false;
    const port = createFakeAccessTokensPort({
      custom: {
        list: () => Promise.resolve({ credentials: [customCredential({ username: "old-user" })] }),
        update: () => {
          updateCalled = true;
          return Promise.resolve(customCredential({ username: "old-user" }));
        },
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "custom-1")!.row;

    await act(() => result.current.replaceToken(target));

    expect(updateCalled).toBe(false);
  });
});

/**
 * Regression coverage for the same class of bug `use-taxonomy.hooks.ts`'s own content-refresh suite
 * fixed first (see that file's header): `custom_credential_set_username`/`custom_credential_set_token`
 * (`apps/website/src/features/custom-credentials/agent-tools.ts`) are agent-callable, so an assistant
 * repairing a saved credential's username after a 401 used to leave this screen showing the stale
 * value until a manual reload.
 *
 * `port.custom.list` is reassigned mid-test (this fake's own per-call override shape, not a mutable
 * seed array like `createFakePostsListPort`'s) to stand in for the write landing server-side, mirroring
 * `use-media.hooks.unit.test.tsx`'s identical `port.listMedia = () => new Promise(() => {})` reuse of
 * the same fake for a second scripted response. Driven through the REAL `lib/content-refresh-bus`,
 * same choice `use-taxonomy.hooks.ts` makes and for the same reason.
 */
describe("useAccessTokens — content refresh bus", () => {
  afterEach(() => resetContentRefreshBus());

  it("re-reads all three stores when a content refresh fires, so an assistant-written credential shows up without a reload", async () => {
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential()] }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(result.current.totalCount).toBe(1);

    // The assistant's tool call landing server-side. The screen has no way to know it happened.
    port.custom.list = () =>
      Promise.resolve({ credentials: [customCredential(), customCredential({ id: "custom-2", label: "Second host" })] });

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.totalCount).toBe(2));
  });

  it("refreshes on a notification that names access-tokens, and ignores one that names only other resources", async () => {
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential()] }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(result.current.totalCount).toBe(1);

    port.custom.list = () =>
      Promise.resolve({ credentials: [customCredential(), customCredential({ id: "custom-2", label: "Second host" })] });

    act(() => publishContentRefresh(["taxonomy"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.totalCount).toBe(1);

    act(() => publishContentRefresh([ACCESS_TOKENS_RESOURCE]));
    await waitFor(() => expect(result.current.totalCount).toBe(2));
  });

  it("stops re-reading once unmounted", async () => {
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential()] }) },
    });
    const listSpy = vi.spyOn(port.custom, "list");
    const { result, unmount } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    const callsWhileMounted = listSpy.mock.calls.length;
    unmount();
    act(() => publishContentRefresh());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listSpy).toHaveBeenCalledTimes(callsWhileMounted);
  });

  /**
   * `reloadAllStores` (fired by `triggerReload` above, fire-and-forget via `void reloadAllStores()`
   * so `useContentRefreshSubscription`'s `onRefresh: () => void` contract compiles) awaited all
   * three stores with no `try`/`catch` at all: a rejected store list turned every content-refresh
   * reload into an unhandled promise rejection, with `loadError` staying `null` forever and no way
   * for the operator to tell a background refresh had failed. Asserting only "no exception escapes"
   * would pass for the wrong reason (an unhandled rejection does not throw synchronously) — this
   * asserts the rejection actually surfaces as visible state.
   */
  it("a rejected background reload surfaces a visible load error instead of failing silently", async () => {
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential()] }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(result.current.loadError).toBe(null);

    port.custom.list = () => Promise.reject(new Error("network down"));

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.loadError).toBe("Couldn't load saved access tokens: network down"));
  });
});

/**
 * Regression coverage for the 2026-09-05 Gemini audit's four `reloadAllStores` findings — all
 * CONFIRMED against source (see `use-access-tokens.hooks.ts`'s own updated doc comments for each).
 */
describe("useAccessTokens: reloadAllStores hardening (2026-09-05 Gemini audit)", () => {
  afterEach(() => resetContentRefreshBus());

  it("clears a stale initial-load error once a background reload succeeds, instead of masking the success forever (claim a)", async () => {
    const port = createFakeAccessTokensPort({ custom: { list: () => Promise.reject(new Error("custom down")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.loadError).toBe("Couldn't load saved access tokens: custom down"));

    // The store recovers, and a content refresh fires a background reload.
    port.custom.list = () => Promise.resolve({ credentials: [customCredential()] });
    act(() => publishContentRefresh());

    // `publishQuery.error`/`sourceControlQuery.error`/`customQuery.error` (the INITIAL fetch's own
    // state) never reset — only `hasReloadedOnce` gating them out lets this go to `null`.
    await waitFor(() => expect(result.current.loadError).toBe(null));
    expect(result.current.totalCount).toBe(1);
  });

  it("keeps the other two stores' fresh reload data when only one store's reload rejects, instead of Promise.all discarding all three (claim b)", async () => {
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }) },
      sourceControl: { list: () => Promise.resolve({ credentials: [sourceControlCredential()] }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(result.current.totalCount).toBe(2);

    // A just-revoked source-control token, reloaded fresh — landing correctly must not depend on
    // the unrelated custom store's own reload succeeding.
    port.sourceControl.list = () => Promise.resolve({ credentials: [] });
    port.custom.list = () => Promise.reject(new Error("custom down"));
    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.totalCount).toBe(1));
    expect(result.current.loadError).toBe("Couldn't load saved access tokens: custom down");
  });

  it("discards an older in-flight reload's result once a newer reload has already landed, instead of overwriting fresher data (claim c)", async () => {
    const pendingResolvers: Array<(v: { credentials: AdminCustomCredentialSummary[] }) => void> = [];
    const port = createFakeAccessTokensPort({
      custom: { list: () => new Promise<{ credentials: AdminCustomCredentialSummary[] }>((resolve) => pendingResolvers.push(resolve)) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(pendingResolvers.length).toBe(1));
    pendingResolvers[0]({ credentials: [] }); // initial load
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => publishContentRefresh()); // reload #1 (older) — held open
    await waitFor(() => expect(pendingResolvers.length).toBe(2));
    act(() => publishContentRefresh()); // reload #2 (newer) — held open
    await waitFor(() => expect(pendingResolvers.length).toBe(3));

    // The NEWER reload resolves first, with fresh data.
    pendingResolvers[2]({ credentials: [customCredential({ id: "fresh", label: "Fresh" })] });
    await waitFor(() => expect(result.current.totalCount).toBe(1));

    // The OLDER reload resolves last, with stale (empty) data — must be discarded, not applied.
    pendingResolvers[1]({ credentials: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.totalCount).toBe(1);
    expect(findRow(result.current.groups, "fresh")).toBeDefined();
  });
});

describe("useWiredAccessTokens: t identity stability (2026-09-05 Gemini audit claim d)", () => {
  it("returns a referentially stable t across re-renders when locale does not change, so reloadAllStores's useCallback (and its content-refresh subscription) is not rebuilt every render", async () => {
    listPublishCredentials.mockResolvedValue({ credentials: [], executionMode: "self-hosted-cli" });
    listSourceControlCredentials.mockResolvedValue({ credentials: [] });
    listCustomCredentials.mockResolvedValue({ credentials: [] });

    const { result, rerender } = renderHook(() => useWiredAccessTokens(), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const firstT = result.current.t;

    rerender();
    rerender();

    expect(result.current.t).toBe(firstT);
  });
});

describe("useAccessTokens: initial load errors — accessTokensLoadError's publish/source-control/custom priority", () => {
  it("surfaces a rejected PUBLISH list as the load error on first load", async () => {
    const port = createFakeAccessTokensPort({ publish: { list: () => Promise.reject(new Error("publish down")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.loadError).toBe("Couldn't load saved access tokens: publish down"));
  });

  it("surfaces a rejected SOURCE-CONTROL list as the load error when publish succeeds", async () => {
    const port = createFakeAccessTokensPort({ sourceControl: { list: () => Promise.reject(new Error("source-control down")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.loadError).toBe("Couldn't load saved access tokens: source-control down"));
  });

  it("surfaces a rejected CUSTOM list as the load error when the other two stores succeed", async () => {
    const port = createFakeAccessTokensPort({ custom: { list: () => Promise.reject(new Error("custom down")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.loadError).toBe("Couldn't load saved access tokens: custom down"));
  });
});

describe("useAccessTokens: openAddForm / closeAddForm / setAddField", () => {
  it("openAddForm makes exactly that provider's add form visible, leaving every other provider's form untouched", async () => {
    const port = createFakeAccessTokensPort();
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "vercel" };

    act(() => result.current.openAddForm(ref));

    expect(findGroup(result.current.groups, "publish", "vercel")?.addForm.visible).toBe(true);
    expect(findGroup(result.current.groups, "publish", "netlify")?.addForm.visible).toBe(false);
  });

  it("setAddField merges into that provider's own draft, not any other provider's", async () => {
    const port = createFakeAccessTokensPort();
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "vercel" };

    act(() => result.current.setAddField(ref, { name: "Staging" }));
    act(() => result.current.setAddField(ref, { token: "tok-1" }));

    const form = findGroup(result.current.groups, "publish", "vercel")?.addForm;
    expect(form?.name).toBe("Staging");
    expect(form?.token).toBe("tok-1");
    expect(findGroup(result.current.groups, "publish", "netlify")?.addForm.name).toBe("");
  });

  it("closeAddForm resets that provider's form back to blank and invisible", async () => {
    const port = createFakeAccessTokensPort();
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "vercel" };

    act(() => result.current.openAddForm(ref));
    act(() => result.current.setAddField(ref, { name: "Staging", token: "tok" }));
    act(() => result.current.closeAddForm(ref));

    expect(findGroup(result.current.groups, "publish", "vercel")?.addForm).toEqual({
      visible: false,
      name: "",
      token: "",
      accountId: "",
      username: "",
      saving: false,
      error: null,
    });
  });
});

describe("useAccessTokens: createToken", () => {
  it("does nothing (no API call) when the form is not ready to save (blank name)", async () => {
    const create = vi.fn();
    const port = createFakeAccessTokensPort({ publish: { create } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "netlify" };

    act(() => result.current.setAddField(ref, { name: "", token: "tok" }));
    await act(() => result.current.createToken(ref));

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects with a visible duplicate-name error, with no API call, when the name collides with an already-saved row for the same provider", async () => {
    const create = vi.fn();
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential({ providerId: "netlify", label: "Prod" })], executionMode: "self-hosted-cli" }), create },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "netlify" };

    act(() => result.current.setAddField(ref, { name: "Prod", token: "tok" }));
    await act(() => result.current.createToken(ref));

    expect(create).not.toHaveBeenCalled();
    expect(findGroup(result.current.groups, "publish", "netlify")?.addForm.error).toBe('A token named "Prod" already exists for Netlify.');
  });

  it("creates a new PUBLISH credential and merges it into that provider's rows (mergeCredential's publish branch)", async () => {
    const port = createFakeAccessTokensPort({ publish: { create: () => Promise.resolve(publishCredential({ id: "new-1", providerId: "netlify", label: "New" })) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "netlify" };

    act(() => result.current.setAddField(ref, { name: "New", token: "tok" }));
    await act(() => result.current.createToken(ref));

    const group = findGroup(result.current.groups, "publish", "netlify")!;
    expect(group.rows.map((r) => r.row.id)).toContain("new-1");
    expect(group.addForm).toEqual({ visible: false, name: "", token: "", accountId: "", username: "", saving: false, error: null });
  });

  it("creates a new SOURCE-CONTROL credential and merges it into that provider's rows (mergeCredential's source-control branch)", async () => {
    const port = createFakeAccessTokensPort({ sourceControl: { create: () => Promise.resolve(sourceControlCredential({ id: "sc-new-1", providerId: "gitlab", label: "New" })) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "source-control" as const, providerId: "gitlab" };

    act(() => result.current.setAddField(ref, { name: "New", token: "tok" }));
    await act(() => result.current.createToken(ref));

    expect(findGroup(result.current.groups, "source-control", "gitlab")!.rows.map((r) => r.row.id)).toContain("sc-new-1");
  });

  it("a rejected create with a plain Error surfaces the generic save-error message (accessTokenSubmitErrorMessage's generic branch)", async () => {
    const port = createFakeAccessTokensPort({ publish: { create: () => Promise.reject(new Error("network down")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "netlify" };

    act(() => result.current.setAddField(ref, { name: "New", token: "tok" }));
    await act(() => result.current.createToken(ref));

    const group = findGroup(result.current.groups, "publish", "netlify")!;
    expect(group.addForm.error).toBe("Couldn't save this token: network down");
    expect(group.addForm.saving).toBe(false);
  });

  it("a server-detected duplicate label (race with another tab/session) surfaces the same duplicate-name message as the client precheck (accessTokenSubmitErrorMessage's duplicate-label branch)", async () => {
    const port = createFakeAccessTokensPort({ publish: { create: () => Promise.reject(new ApiError("Conflict", 409, "DUPLICATE_LABEL")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "netlify" };

    act(() => result.current.setAddField(ref, { name: "New", token: "tok" }));
    await act(() => result.current.createToken(ref));

    expect(findGroup(result.current.groups, "publish", "netlify")?.addForm.error).toBe('A token named "New" already exists for Netlify.');
  });

  it("a server VALIDATION rejection surfaces the server's own detail text, not a generic message (accessTokenSubmitErrorMessage's validation branch)", async () => {
    const port = createFakeAccessTokensPort({
      publish: { create: () => Promise.reject(new ApiError("Bad request", 400, "VALIDATION", { detail: "Token looks malformed" })) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const ref = { kind: "publish" as const, providerId: "netlify" };

    act(() => result.current.setAddField(ref, { name: "New", token: "tok" }));
    await act(() => result.current.createToken(ref));

    expect(findGroup(result.current.groups, "publish", "netlify")?.addForm.error).toBe("Couldn't save this token: Token looks malformed");
  });
});

describe("useAccessTokens: replaceToken on a PUBLISH/SOURCE-CONTROL row (non-custom)", () => {
  it("does nothing (no API call) when the replace form is not ready to save (blank name)", async () => {
    const update = vi.fn();
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }), update },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    act(() => result.current.setExistingField("cred-1", { name: "" }));
    await act(() => result.current.replaceToken(target));

    expect(update).not.toHaveBeenCalled();
  });

  it("rejects with a visible duplicate-name error, with no API call, when renaming to another saved row's name for the same provider", async () => {
    const update = vi.fn();
    const port = createFakeAccessTokensPort({
      publish: {
        list: () =>
          Promise.resolve({
            credentials: [publishCredential({ id: "cred-1", label: "Prod" }), publishCredential({ id: "cred-2", label: "Staging", isDefault: false })],
            executionMode: "self-hosted-cli",
          }),
        update,
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-2")!.row;

    act(() => result.current.setExistingField("cred-2", { name: "Prod" }));
    await act(() => result.current.replaceToken(target));

    expect(update).not.toHaveBeenCalled();
    expect(findRow(result.current.groups, "cred-2")?.error).toBe('A token named "Prod" already exists for GitHub Pages.');
  });

  it("renames and rotates a PUBLISH row's token, merging the server's result (mergeCredential's publish branch)", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }),
        update: (id) => Promise.resolve(publishCredential({ id, label: "Renamed" })),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    act(() => result.current.setExistingField("cred-1", { name: "Renamed", token: "ghp_new" }));
    await act(() => result.current.replaceToken(target));

    const row = findRow(result.current.groups, "cred-1");
    expect(row?.row.name).toBe("Renamed");
    expect(row?.saving).toBe(false);
    expect(row?.error).toBe(null);
  });

  it("leaves every OTHER saved row for the same provider unchanged when replacing one of several (mergeRaw's own no-match pass-through)", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () =>
          Promise.resolve({
            credentials: [publishCredential({ id: "cred-1", label: "Production" }), publishCredential({ id: "cred-2", label: "Staging", isDefault: false })],
            executionMode: "self-hosted-cli",
          }),
        update: (id) => Promise.resolve(publishCredential({ id, label: "Renamed" })),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    act(() => result.current.setExistingField("cred-1", { name: "Renamed", token: "tok" }));
    await act(() => result.current.replaceToken(target));

    expect(findRow(result.current.groups, "cred-1")?.row.name).toBe("Renamed");
    expect(findRow(result.current.groups, "cred-2")?.row.name).toBe("Staging");
  });

  it("renames a SOURCE-CONTROL row, merging the server's result (mergeCredential's source-control branch)", async () => {
    const port = createFakeAccessTokensPort({
      sourceControl: {
        list: () => Promise.resolve({ credentials: [sourceControlCredential()] }),
        update: (id) => Promise.resolve(sourceControlCredential({ id, label: "Renamed" })),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "sc-1")!.row;

    act(() => result.current.setExistingField("sc-1", { name: "Renamed", token: "tok" }));
    await act(() => result.current.replaceToken(target));

    expect(findRow(result.current.groups, "sc-1")?.row.name).toBe("Renamed");
  });

  it("a rejected replace surfaces the save-error message on that row (accessTokenSubmitErrorMessage via replaceToken's catch)", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }),
        update: () => Promise.reject(new Error("network down")),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    act(() => result.current.setExistingField("cred-1", { name: "Renamed", token: "ghp_new" }));
    await act(() => result.current.replaceToken(target));

    expect(findRow(result.current.groups, "cred-1")?.error).toBe("Couldn't save this token: network down");
  });
});

describe("useAccessTokens: replaceCustomCredential — duplicate name and rejection", () => {
  it("evaluates row.username's own '' fallback when the row has never been given one, with no prior draft (replaceCustomCredential's not-yet-drafted row shape)", async () => {
    const update = vi.fn();
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential()] }), update }, // no `username` override — the row's own `username` stays undefined.
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "custom-1")!.row;
    expect(target.username).toBeUndefined();

    // No prior `setExistingField` — `replaceCustomCredential` builds its draft from the row itself,
    // which is what evaluates `row.username ?? ""`. Nothing changed (no draft, no token), so this
    // stays a no-op — same "no diff to send" rule the sibling test right below already pins for a
    // row that DOES have a saved username.
    await act(() => result.current.replaceToken(target));

    expect(update).not.toHaveBeenCalled();
  });

  it("rejects with a visible duplicate-name error, with no API call, when renaming to another saved custom credential's name", async () => {
    const update = vi.fn();
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential({ id: "custom-1", label: "fly.io deploy" }), customCredential({ id: "custom-2", label: "Other" })] }), update },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "custom-2")!.row;

    act(() => result.current.setExistingField("custom-2", { name: "fly.io deploy" }));
    await act(() => result.current.replaceToken(target));

    expect(update).not.toHaveBeenCalled();
    expect(findRow(result.current.groups, "custom-2")?.error).toBe('A token named "fly.io deploy" already exists for this workspace.');
  });

  it("a rejected custom update surfaces the save-error message on that row", async () => {
    const port = createFakeAccessTokensPort({
      custom: {
        list: () => Promise.resolve({ credentials: [customCredential()] }),
        update: () => Promise.reject(new Error("network down")),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "custom-1")!.row;

    act(() => result.current.setExistingField("custom-1", { username: "new-user" }));
    await act(() => result.current.replaceToken(target));

    expect(findRow(result.current.groups, "custom-1")?.error).toBe("Couldn't save this token: network down");
  });
});

describe("useAccessTokens: removeToken — success paths (mergeCredential/refetchStore's counterparts for a clean delete)", () => {
  it("removing a CUSTOM row calls port.custom.remove then re-reads the custom store", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential({ id: "custom-1" })] }), remove },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "custom-1")!.row;

    port.custom.list = () => Promise.resolve({ credentials: [] });
    await act(() => result.current.removeToken(target));

    expect(remove).toHaveBeenCalledWith("custom-1");
    expect(findRow(result.current.groups, "custom-1")).toBeUndefined();
  });

  it("removing a PUBLISH row calls port.publish.remove then re-fetches the publish store", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }), remove },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    port.publish.list = () => Promise.resolve({ credentials: [], executionMode: "self-hosted-cli" });
    await act(() => result.current.removeToken(target));

    expect(remove).toHaveBeenCalledWith("cred-1");
    expect(findRow(result.current.groups, "cred-1")).toBeUndefined();
  });

  it("removing a SOURCE-CONTROL row calls port.sourceControl.remove then re-fetches the source-control store (refetchStore's else branch)", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const port = createFakeAccessTokensPort({
      sourceControl: { list: () => Promise.resolve({ credentials: [sourceControlCredential()] }), remove },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "sc-1")!.row;

    port.sourceControl.list = () => Promise.resolve({ credentials: [] });
    await act(() => result.current.removeToken(target));

    expect(remove).toHaveBeenCalledWith("sc-1");
    expect(findRow(result.current.groups, "sc-1")).toBeUndefined();
  });
});

describe("useAccessTokens: makeDefault — already-default no-op, and a successful promotion", () => {
  it("does nothing (no API call) when the row is already the default", async () => {
    const update = vi.fn();
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential({ isDefault: true })], executionMode: "self-hosted-cli" }), update },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    await act(() => result.current.makeDefault(target));

    expect(update).not.toHaveBeenCalled();
  });

  it("makes a non-default row the default, then re-fetches the store (refetchStore's publish branch)", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () =>
          Promise.resolve({
            credentials: [publishCredential({ isDefault: false }), publishCredential({ id: "cred-2", label: "Staging", isDefault: true })],
            executionMode: "self-hosted-cli",
          }),
        update: (id) => Promise.resolve(publishCredential({ id, isDefault: true })),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    await act(() => result.current.makeDefault(target));

    const row = findRow(result.current.groups, "cred-1");
    expect(row?.saving).toBe(false);
    expect(row?.error).toBe(null);
  });
});

describe("useAccessTokens: custom add-form draft + reset", () => {
  it("setCustomAddField merges into the draft without touching other fields", async () => {
    const port = createFakeAccessTokensPort();
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setCustomAddField({ name: "fly.io" }));
    act(() => result.current.setCustomAddField({ baseUrl: "https://api.fly.io" }));

    expect(result.current.customAddForm.name).toBe("fly.io");
    expect(result.current.customAddForm.baseUrl).toBe("https://api.fly.io");
  });

  it("resetCustomAddForm clears every field back to blank and clears busy/error state", async () => {
    const port = createFakeAccessTokensPort({ custom: { create: () => Promise.reject(new Error("network down")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setCustomAddField({ name: "fly.io", token: "tok", baseUrl: "https://api.example.com" }));
    await act(() => result.current.createCustomCredential());
    expect(result.current.customAddForm.error).not.toBeNull();

    act(() => result.current.resetCustomAddForm());

    expect(result.current.customAddForm).toEqual({ name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", saving: false, error: null });
  });
});

describe("useAccessTokens: createCustomCredential", () => {
  it("returns false and makes no API call when the form is not ready to save (invalid base URL)", async () => {
    const create = vi.fn();
    const port = createFakeAccessTokensPort({ custom: { create } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setCustomAddField({ name: "fly.io", token: "tok", baseUrl: "not-a-url" }));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createCustomCredential();
    });

    expect(ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects with a visible workspace-wide duplicate-name error, with no API call", async () => {
    const create = vi.fn();
    const port = createFakeAccessTokensPort({
      custom: { list: () => Promise.resolve({ credentials: [customCredential({ label: "fly.io deploy" })] }), create },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setCustomAddField({ name: "fly.io deploy", token: "tok", baseUrl: "https://api.example.com" }));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createCustomCredential();
    });

    expect(ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(result.current.customAddForm.error).toBe('A token named "fly.io deploy" already exists for this workspace.');
  });

  it("creates a new custom credential, appends it, resets the form, and returns true", async () => {
    const port = createFakeAccessTokensPort({ custom: { create: () => Promise.resolve(customCredential({ id: "custom-new", label: "New host" })) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setCustomAddField({ name: "New host", token: "tok", baseUrl: "https://api.example.com" }));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createCustomCredential();
    });

    expect(ok).toBe(true);
    expect(findRow(result.current.groups, "custom-new")).toBeDefined();
    expect(result.current.customAddForm).toEqual({ name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", saving: false, error: null });
  });

  it("a rejected create surfaces the save-error message and returns false", async () => {
    const port = createFakeAccessTokensPort({ custom: { create: () => Promise.reject(new Error("network down")) } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setCustomAddField({ name: "New host", token: "tok", baseUrl: "https://api.example.com" }));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createCustomCredential();
    });

    expect(ok).toBe(false);
    expect(result.current.customAddForm.error).toBe("Couldn't save this token: network down");
  });
});

/**
 * Bucket 3 coverage (per this dispatch's own taxonomy): `mergeCredential`/`refetchStore`'s
 * `prev ?? []` fallbacks, and every `rows ?? []`/`existingDrafts[row.id] ?? {...}` guard in
 * `createToken`/`replaceToken`/`replaceCustomCredential`/`createCustomCredential`, all protect
 * against being called before this hook's own THREE-store initial load has resolved
 * (`publishCredentials`/`sourceControlCredentials`/`customCredentials`/`rows` all start `undefined`
 * and only become arrays once every store's `list()` settles). `AccessTokensTab.tsx` structurally
 * cannot trigger this today — every Create/Replace/Remove button lives behind `controller.groups
 * !== undefined`'s own loading gate — but nothing in the CONTROLLER's own exported surface enforces
 * that, so an out-of-band caller (a race between two fast actions, or a future agent-tool call
 * bypassing the rendered form) genuinely could. Kept, not deleted, and exercised by calling the
 * controller directly against a port whose `list()` calls never resolve, which pins `rows`/the
 * three credential-list states at `undefined` for the whole test with no timing race to get wrong.
 */
describe("useAccessTokens: actions called before the initial load resolves (defensive `?? []`/`?? {}` fallbacks)", () => {
  function neverResolvingPort(overrides: Parameters<typeof createFakeAccessTokensPort>[0] = {}) {
    return createFakeAccessTokensPort({
      publish: { list: () => new Promise(() => undefined), ...overrides.publish },
      sourceControl: { list: () => new Promise(() => undefined), ...overrides.sourceControl },
      custom: { list: () => new Promise(() => undefined), ...overrides.custom },
    });
  }

  it("createToken evaluates the addForms-not-yet-created fallback and exits via readyToSave when nothing was ever typed", async () => {
    const create = vi.fn();
    const port = neverResolvingPort({ publish: { create } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    const ref = { kind: "publish" as const, providerId: "netlify" };

    await act(() => result.current.createToken(ref));

    expect(create).not.toHaveBeenCalled();
  });

  it("createToken proceeds through accessTokenNameTaken's rows-not-yet-loaded fallback and mergeCredential's publish-not-yet-seeded fallback", async () => {
    const create = vi.fn().mockResolvedValue(publishCredential({ id: "new-1", providerId: "netlify", label: "New" }));
    const port = neverResolvingPort({ publish: { create } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    const ref = { kind: "publish" as const, providerId: "netlify" };

    act(() => result.current.setAddField(ref, { name: "New", token: "tok" }));
    await act(() => result.current.createToken(ref));

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("createToken proceeds the same way for a SOURCE-CONTROL provider (mergeCredential's source-control-not-yet-seeded fallback)", async () => {
    const create = vi.fn().mockResolvedValue(sourceControlCredential({ id: "sc-new-1", providerId: "gitlab", label: "New" }));
    const port = neverResolvingPort({ sourceControl: { create } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    const ref = { kind: "source-control" as const, providerId: "gitlab" };

    act(() => result.current.setAddField(ref, { name: "New", token: "tok" }));
    await act(() => result.current.createToken(ref));

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("createCustomCredential proceeds through customCredentialNameTaken's and the custom-store's own not-yet-loaded fallbacks", async () => {
    const create = vi.fn().mockResolvedValue(customCredential({ id: "custom-new", label: "New host" }));
    const port = neverResolvingPort({ custom: { create } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });

    act(() => result.current.setCustomAddField({ name: "New host", token: "tok", baseUrl: "https://api.example.com" }));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createCustomCredential();
    });

    expect(ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("replaceToken (publish) proceeds through accessTokenNameTaken's rows-not-yet-loaded fallback when a draft already exists for a row this hook has never actually loaded", async () => {
    const update = vi.fn().mockResolvedValue(publishCredential({ id: "cred-x", label: "Renamed" }));
    const port = neverResolvingPort({ publish: { update } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    const handBuiltRow: AccessTokenRow = {
      kind: "publish",
      providerId: "netlify",
      id: "cred-x",
      name: "Original",
      rawLabel: "Original",
      isDefault: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };

    act(() => result.current.setExistingField("cred-x", { name: "Renamed", token: "tok" }));
    await act(() => result.current.replaceToken(handBuiltRow));

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("replaceCustomCredential proceeds through customCredentialNameTaken's and the custom-store's own not-yet-loaded fallbacks", async () => {
    const update = vi.fn().mockResolvedValue(customCredential({ id: "custom-x", username: "new-user" }));
    const port = neverResolvingPort({ custom: { update } });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    const handBuiltRow: AccessTokenRow = {
      kind: "custom",
      providerId: "custom-x",
      id: "custom-x",
      name: "Custom X",
      rawLabel: "Custom X",
      isDefault: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      username: "old-user",
    };

    act(() => result.current.setExistingField("custom-x", { name: "Custom X", username: "new-user" }));
    await act(() => result.current.replaceToken(handBuiltRow));

    expect(update).toHaveBeenCalledWith("custom-x", { username: "new-user" });
  });
});

describe("useAccessTokens: replaceToken's own not-yet-drafted row shape (existingDrafts[row.id] ?? {...row.username ?? \"\"})", () => {
  it("evaluates row.username's fallback safely for a real row (username always undefined for a non-custom kind), without an API call since nothing changed", async () => {
    const update = vi.fn();
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }), update },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;
    expect(target.username).toBeUndefined();

    await act(() => result.current.replaceToken(target));

    expect(update).not.toHaveBeenCalled();
  });

  it("evaluates row.username's fallback safely for a hand-built row that already carries one — a shape today's UI never produces for a non-custom kind, but the field is not discriminated by kind at the type level, and the code's own comment documents keeping this fallback for a future provider that does", async () => {
    const update = vi.fn();
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }), update },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const rowWithUsername: AccessTokenRow = { ...findRow(result.current.groups, "cred-1")!.row, username: "leftover-value" };

    await expect(act(() => result.current.replaceToken(rowWithUsername))).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
  });
});

const { listPublishCredentials, listSourceControlCredentials, listCustomCredentials } = vi.hoisted(() => ({
  listPublishCredentials: vi.fn(),
  listSourceControlCredentials: vi.fn(),
  listCustomCredentials: vi.fn(),
}));

// `useWiredAccessTokens` binds `defaultAccessTokensPort` (`access-tokens-dependencies.hooks.ts`),
// which calls straight through to `api.list*Credentials` — mocking just those three keeps every
// other `lib/api` export (`ApiError`, `describeApiError`, ...) real, same convention
// `use-other-credentials.unit.test.tsx`'s own `useWiredOtherCredentials` block establishes.
vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listPublishCredentials,
      listSourceControlCredentials,
      listCustomCredentials,
    },
  };
});

describe("useWiredAccessTokens", () => {
  it("wires the real port and locale — reads settle through the mocked lib/api", async () => {
    listPublishCredentials.mockResolvedValue({ credentials: [publishCredential({ id: "wired-1", label: "Wired" })], executionMode: "self-hosted-cli" });
    listSourceControlCredentials.mockResolvedValue({ credentials: [] });
    listCustomCredentials.mockResolvedValue({ credentials: [] });

    const { result } = renderHook(() => useWiredAccessTokens(), { wrapper });

    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(findRow(result.current.groups, "wired-1")?.name).toBe("Wired");
    // `boundT` (the `t` bound to the real resolved locale) is otherwise never actually CALLED by
    // this happy-path test — nothing here hits an error/duplicate-name copy path — so exercise it
    // directly to prove the binding itself works, not just that it compiles.
    expect(result.current.t("Loading access tokens…")).toBe("Loading access tokens…");
  });
});
