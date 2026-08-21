import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { createFakeUsersPort } from "../hooks/users-dependencies.hooks";
import { useUsers, useWiredUsers } from "../hooks/use-users.hooks";

/**
 * @file First dedicated hook-level test file for `useUsers` (0% before this pass — the highest-
 * state screen in the app, 25 `useState` calls, was previously exercised only indirectly through
 * `Users.unit.test.tsx`/`Users.crud.unit.test.tsx`'s full-component renders). Written as a
 * CHARACTERIZATION suite against CURRENT behavior — documents what the code DOES — so it proves
 * equivalence across the `useAsyncAction` adoption this pass also makes for `onCreate` and
 * `confirmResetPassword`, the same discipline `MediaPickerDialog.unit.test.tsx` used.
 *
 * Follows `use-roles.unit.test.ts`'s exact harness: mock global `fetch`, not the `api` module —
 * asserting the actual request shape (and the EXACT string `describeApiError` produces) is part of
 * the point, since that translation moved verbatim off `Users.tsx` in the original extraction.
 *
 * Scope note: `grantSaving`/`grantError` (shared by `onAssignRole`/`onAttachPolicy`/`onSaveEmail`)
 * and `toggleSavingId`/`toggleError` (shared by `onToggleStatus`/`confirmDisable`, keyed by
 * principalId rather than a plain boolean) are covered here as-is — they are NOT migrated onto
 * `useAsyncAction` in this pass; see that hook's own file header and the refactor report for why.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): the combined users+roles+policies read and
 * every write now go through `useFetchQuery`/`useFetchMutation`, which throw without a
 * `QueryClientProvider` ancestor.
 *
 * `useWiredUsers` (2026-08-14, `useX(dependencies)` / `useWiredX()` conversion): every call below
 * that used to render bare `useUsers()` now renders `useWiredUsers()` instead — same real `fetch`
 * harness, same assertions, only the entry point renamed now that `useUsers` takes an injected
 * `UsersDependencies` argument. Matches `use-posts.unit.test.ts`/`use-redirects.hooks.unit.test.tsx`'s
 * identical split: this file's bulk stays a `fetch`-stubbed `useWiredUsers` suite, and a new
 * "injected port" group at the bottom composes `useUsers` directly against `createFakeUsersPort`
 * with no `fetch` stub at all.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const USER_A = {
  principalId: "u1",
  workspaceId: "w1",
  username: "alice",
  email: "alice@example.com",
  status: "active" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  roleIds: [] as string[],
  policyIds: [] as string[],
};
const ROLE = { id: "r1", workspaceId: "w1", name: "Editor", isBuiltin: false };
const POLICY = { id: "p1", workspaceId: "w1", name: "Content", description: "d", isBuiltin: false, isFrozen: false };

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useUsers` now also calls `useAdminLocale()` (real `fetch`, not this hook's own concern),
  // which would otherwise consume one of this file's strictly-ordered `mockResolvedValueOnce`
  // slots and shift every later assertion by one call. Routed to a fixed default-locale response
  // outside `fetchMock`'s own call queue — same interceptor pattern `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ users: [USER_A] }))
    .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
    .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));
  const view = renderHook(() => useWiredUsers(), { wrapper });
  await waitFor(() => expect(view.result.current.users).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("loads users, roles, and policies together and exposes all three once settled", async () => {
    const { result } = await renderLoaded();
    expect(result.current.users).toEqual([USER_A]);
    expect(result.current.roles).toEqual([ROLE]);
    expect(result.current.policies).toEqual([POLICY]);
    expect(result.current.error).toBeNull();
  });

  it("sets a translated error and leaves all three null when any list call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "nope", code: "FORBIDDEN" }, 403))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));
    const { result } = renderHook(() => useWiredUsers(), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("You do not have permission to do that.");
    expect(result.current.users).toBeNull();
  });
});

describe("onCreate", () => {
  it("creates, clears the form fields, closes the form, and reloads on success", async () => {
    const { result } = await renderLoaded();
    act(() => {
      result.current.setUsername("bob");
      result.current.setEmail("bob@example.com");
      result.current.setPassword("hunter22");
      result.current.setFormOpen(true);
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { ...USER_A, principalId: "u2", username: "bob" } }))
      .mockResolvedValueOnce(jsonResponse({ users: [USER_A, { ...USER_A, principalId: "u2", username: "bob" }] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onCreate({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(result.current.username).toBe("");
    expect(result.current.email).toBe("");
    expect(result.current.password).toBe("");
    expect(result.current.formOpen).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.formError).toBeNull();
    // `waitFor`, not a bare synchronous read (2026-08-12, `lib/fetch-query` migration): the
    // reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited background
    // refetch, so the mutation's own promise resolving does not guarantee it has landed yet.
    await waitFor(() => expect(result.current.users).toHaveLength(2));
  });

  it("sets formError, stops saving, but keeps the typed fields, on failure", async () => {
    const { result } = await renderLoaded();
    act(() => {
      result.current.setUsername("dup");
      result.current.setPassword("hunter22");
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "dup", code: "RESOURCE_CONFLICT" }, 409));

    await act(async () => {
      await result.current.onCreate({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(result.current.formError).toBe("That username is already in use.");
    expect(result.current.saving).toBe(false);
    expect(result.current.username).toBe("dup");
  });
});

describe("toggleExpanded", () => {
  it("opens the panel for a collapsed row, seeding editEmail and clearing pending grant fields", async () => {
    const { result } = await renderLoaded();
    act(() => {
      result.current.setPendingRoleId("stale-role");
      result.current.setPendingPolicyId("stale-policy");
    });

    act(() => result.current.toggleExpanded(USER_A));

    expect(result.current.expandedId).toBe(USER_A.principalId);
    expect(result.current.editEmail).toBe(USER_A.email);
    expect(result.current.pendingRoleId).toBe("");
    expect(result.current.pendingPolicyId).toBe("");
    expect(result.current.grantError).toBeNull();
  });

  it("closes the panel (back to null) when toggled a second time for the same row", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.toggleExpanded(USER_A));
    act(() => result.current.toggleExpanded(USER_A));
    expect(result.current.expandedId).toBeNull();
  });
});

describe("onAssignRole / onAttachPolicy — shared grantSaving/grantError", () => {
  it("onAssignRole is a no-op with no fetch call when pendingRoleId is empty", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.onAssignRole(USER_A.principalId);
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("onAssignRole clears pendingRoleId and reloads on success", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingRoleId(ROLE.id));

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ assignment: {} }))
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...USER_A, roleIds: [ROLE.id] }] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onAssignRole(USER_A.principalId);
    });

    expect(result.current.pendingRoleId).toBe("");
    expect(result.current.grantSaving).toBe(false);
    expect(result.current.grantError).toBeNull();
    // `waitFor`: the reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited
    // background refetch — see this file's identical note above.
    await waitFor(() => expect(result.current.users?.[0].roleIds).toEqual([ROLE.id]));
  });

  it("onAssignRole sets grantError on failure and keeps pendingRoleId", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingRoleId(ROLE.id));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope", code: "GRANT_EXCEEDS_ISSUER" }, 403));

    await act(async () => {
      await result.current.onAssignRole(USER_A.principalId);
    });

    expect(result.current.grantError).toBe("You cannot grant a permission you do not hold.");
    expect(result.current.pendingRoleId).toBe(ROLE.id);
    expect(result.current.grantSaving).toBe(false);
  });

  it("onAttachPolicy shares the SAME grantError slot as onAssignRole — a fresh call clears a stale one", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingRoleId(ROLE.id));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope", code: "FORBIDDEN" }, 403));
    await act(async () => {
      await result.current.onAssignRole(USER_A.principalId);
    });
    expect(result.current.grantError).not.toBeNull();

    act(() => result.current.setPendingPolicyId(POLICY.id));
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ attachment: {} }))
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...USER_A, policyIds: [POLICY.id] }] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onAttachPolicy(USER_A.principalId);
    });

    // The stale error from the earlier onAssignRole failure is gone — same shared slot, cleared by
    // the next action's own attempt, not scoped per-action.
    expect(result.current.grantError).toBeNull();
  });
});

describe("onSaveEmail", () => {
  it("saves the edited email and reloads on success, tracked by its OWN emailSaving flag", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setEditEmail("alice+new@example.com"));

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { ...USER_A, email: "alice+new@example.com" } }))
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...USER_A, email: "alice+new@example.com" }] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onSaveEmail(USER_A.principalId);
    });

    expect(result.current.emailSaving).toBe(false);
    expect(result.current.grantError).toBeNull();
    // `waitFor`: the reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited
    // background refetch — see this file's identical note above.
    await waitFor(() => expect(result.current.users?.[0].email).toBe("alice+new@example.com"));
  });

  it("on failure, writes into the same shared grantError slot the grant actions use", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "bad", code: "VALIDATION_ERROR" }, 400));

    await act(async () => {
      await result.current.onSaveEmail(USER_A.principalId);
    });

    // `VALIDATION_ERROR`'s override is `e.message || "Please correct the highlighted fields."` — a
    // non-empty server message (like "bad" here) wins verbatim over the generic fallback.
    expect(result.current.grantError).toBe("bad");
    expect(result.current.emailSaving).toBe(false);
  });
});

describe("onToggleStatus — toggleSavingId is the busy row's id, not a plain boolean", () => {
  it("disables an active user and reloads, clearing toggleSavingId back to null", async () => {
    const { result } = await renderLoaded();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { ...USER_A, status: "disabled" } }))
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...USER_A, status: "disabled" }] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onToggleStatus(USER_A);
    });

    expect(result.current.toggleSavingId).toBeNull();
    expect(result.current.toggleError).toBeNull();
    // `waitFor`: the reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited
    // background refetch — see this file's identical note above.
    await waitFor(() => expect(result.current.users?.[0].status).toBe("disabled"));
  });

  it("enables a disabled user (calls the enable route, not disable)", async () => {
    const { result } = await renderLoaded();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { ...USER_A, status: "active" } }))
      .mockResolvedValueOnce(jsonResponse({ users: [USER_A] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onToggleStatus({ ...USER_A, status: "disabled" });
    });

    const enableCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/enable"));
    expect(enableCall).toBeTruthy();
  });

  it("on failure, sets toggleError and clears toggleSavingId", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope", code: "OWNER_REQUIRED" }, 409));

    await act(async () => {
      await result.current.onToggleStatus(USER_A);
    });

    expect(result.current.toggleError).toBe("The workspace must keep at least one active owner.");
    expect(result.current.toggleSavingId).toBeNull();
  });
});

describe("requestDisable / confirmDisable — ConfirmDialog gate", () => {
  it("requestDisable opens the dialog without calling the API", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    act(() => result.current.requestDisable(USER_A));
    expect(result.current.confirmingDisable).toEqual(USER_A);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("confirmDisable is a no-op with nothing pending", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.confirmDisable();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("confirmDisable calls onToggleStatus for the pending user and closes the dialog EITHER WAY, even on failure", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.requestDisable(USER_A));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope", code: "FORBIDDEN" }, 403));

    await act(async () => {
      await result.current.confirmDisable();
    });

    expect(result.current.confirmingDisable).toBeNull();
    expect(result.current.toggleError).toBe("You do not have permission to do that.");
  });
});

describe("openResetPassword / confirmResetPassword", () => {
  it("openResetPassword clears passwordError and seeds an empty password field", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPasswordError("stale"));
    act(() => result.current.openResetPassword(USER_A));

    expect(result.current.resetPasswordFor).toEqual(USER_A);
    expect(result.current.newPassword).toBe("");
    expect(result.current.passwordError).toBeNull();
  });

  it("openResetPassword refuses to open while a toggle or another reset is already in flight", async () => {
    const { result } = await renderLoaded();
    // Simulate a reset already in flight by opening once, then trying to open a second time before
    // any save call — the real guard reads `toggleSavingId || passwordSaving` at call time, so this
    // exercises it through `confirmResetPassword`'s own saving window instead of poking state.
    const d: { resolve?: () => void } = {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (d.resolve = () => resolve(jsonResponse({})))));
    act(() => result.current.openResetPassword(USER_A));
    act(() => result.current.setNewPassword("newpass1"));
    let confirmPromise!: Promise<void>;
    act(() => {
      confirmPromise = result.current.confirmResetPassword();
    });
    expect(result.current.passwordSaving).toBe(true);

    act(() => result.current.openResetPassword({ ...USER_A, principalId: "u9" }));
    // Still targeting the original user — the second open was refused.
    expect(result.current.resetPasswordFor).toEqual(USER_A);

    // `useFetchMutation` (TanStack's `useMutation`) flips `passwordSaving` to `true` synchronously
    // on `mutate()`, same as the pre-migration `setSaving(true)` did — but defers actually INVOKING
    // `mutationFn` (and therefore this `fetch`) by one microtask, so `d.resolve` is not assigned yet
    // at this exact point. `await Promise.resolve()` lets that deferred call land before reaching
    // for it — see `use-new-content-type-dialog.unit.test.tsx`'s identical note in `collections`.
    await act(async () => {
      await Promise.resolve();
      d.resolve?.();
      await confirmPromise;
    });
  });

  it("confirmResetPassword is a no-op with no user pending or an empty password", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.confirmResetPassword();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("on success: sets a notice, closes the dialog, and clears the password field", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.openResetPassword(USER_A));
    act(() => result.current.setNewPassword("newpass1"));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await act(async () => {
      await result.current.confirmResetPassword();
    });

    expect(result.current.notice).toContain(USER_A.username);
    expect(result.current.resetPasswordFor).toBeNull();
    expect(result.current.newPassword).toBe("");
    expect(result.current.passwordSaving).toBe(false);
  });

  it("on failure: keeps the dialog OPEN (unlike Disable) and keeps the typed password", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.openResetPassword(USER_A));
    act(() => result.current.setNewPassword("newpass1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "weak", code: "VALIDATION_ERROR" }, 400));

    await act(async () => {
      await result.current.confirmResetPassword();
    });

    expect(result.current.resetPasswordFor).toEqual(USER_A);
    expect(result.current.newPassword).toBe("newpass1");
    // Same `e.message || fallback` behavior as onSaveEmail's failure above — "weak" is the server's
    // own message and wins over the generic fallback text.
    expect(result.current.passwordError).toBe("weak");
    expect(result.current.passwordSaving).toBe(false);
  });
});

describe("t/locale (2026-08-11, standing i18n rule)", () => {
  /** `Users.tsx` no longer imports `useAdminLocale`/`users-i18n` itself — `t`/`locale` must reflect
   *  this hook's OWN already-resolved locale (the same one it already used for its own error
   *  strings), not a hardcoded English pass-through. */
  it("t/locale reflect the locale settings fetch's resolved value, not the DEFAULT_LOCALE this hook starts with", async () => {
    const network = fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: "es" }] }));
      }
      return network(url, init);
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: [USER_A] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    const { result } = renderHook(() => useWiredUsers(), { wrapper });

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Users")).toBe("Usuarios");
  });
});

describe("injected port (useX(dependencies) / useWiredX() conversion coverage)", () => {
  /** `useUsers` still calls `useAdminLocale()` internally regardless of which port is injected —
   *  see this file's header note and `use-users.hooks.ts`'s own header on why that stays out of
   *  `UsersPort` (it is wired in a separate pass). This file's `beforeEach` already routes that one
   *  locale request to a fixed response, so every assertion below on `fetchMock` still only counts
   *  the calls `UsersPort` itself would have made. */

  it("loads users, roles, and policies through the injected port, without touching fetch", async () => {
    const port = createFakeUsersPort({ users: [USER_A], roles: [ROLE], policies: [POLICY] });
    const { result } = renderHook(() => useUsers({ port }), { wrapper });
    await waitFor(() => expect(result.current.users).not.toBeNull());

    expect(result.current.users).toEqual([USER_A]);
    expect(result.current.roles).toEqual([ROLE]);
    expect(result.current.policies).toEqual([POLICY]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onCreate writes through the injected port and the list reflects the new user", async () => {
    const port = createFakeUsersPort({ users: [USER_A], roles: [ROLE], policies: [POLICY] });
    const { result } = renderHook(() => useUsers({ port }), { wrapper });
    await waitFor(() => expect(result.current.users).not.toBeNull());

    act(() => {
      result.current.setUsername("carol");
      result.current.setPassword("hunter22");
    });
    await act(async () => {
      await result.current.onCreate({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(port.users).toHaveLength(2);
    await waitFor(() => expect(result.current.users).toHaveLength(2));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onToggleStatus disables an active user through the injected port", async () => {
    const port = createFakeUsersPort({ users: [USER_A], roles: [ROLE], policies: [POLICY] });
    const { result } = renderHook(() => useUsers({ port }), { wrapper });
    await waitFor(() => expect(result.current.users).not.toBeNull());

    await act(async () => {
      await result.current.onToggleStatus(USER_A);
    });

    expect(port.users[0]!.status).toBe("disabled");
    await waitFor(() => expect(result.current.users![0].status).toBe("disabled"));
  });

  it("onAssignRole sets grantError from the injected port's configured failure", async () => {
    const port = createFakeUsersPort({
      users: [USER_A],
      roles: [ROLE],
      policies: [POLICY],
      assignRoleError: new Error("boom"),
    });
    const { result } = renderHook(() => useUsers({ port }), { wrapper });
    await waitFor(() => expect(result.current.users).not.toBeNull());

    act(() => result.current.setPendingRoleId(ROLE.id));
    await act(async () => {
      await result.current.onAssignRole(USER_A.principalId);
    });

    expect(result.current.grantError).toBe("boom");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
