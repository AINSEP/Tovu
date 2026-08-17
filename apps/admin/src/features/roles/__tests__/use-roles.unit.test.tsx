import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { createFakeRolesPort } from "../hooks/roles-dependencies.hooks";
import { useRoles, useWiredRoles } from "../hooks/use-roles.hooks";

/**
 * @file `useRoles` — the "Roles & Permissions" screen's entire state machine, extracted so it is
 * reachable from `renderHook` with no table, no `RowMenu`, no `ConfirmDialog`. Follows the fetch-
 * mocking harness `PostEditor.unit.test.tsx`/`Comments.unit.test.tsx` established for this package
 * (mock global `fetch`, not the `api` module — asserting the actual request shape is part of the
 * point).
 *
 * Error paths assert the EXACT string `describeApiError` produces — that translation moved verbatim
 * off `Roles.tsx` in this extraction, and a drifted string here is the bug class two other files in
 * this same migration already produced once.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): the combined roles+policies read and every
 * write now go through `useFetchQuery`/`useFetchMutation`, which throw without a
 * `QueryClientProvider` ancestor.
 *
 * `useWiredRoles` (2026-08-14, `useX(dependencies)` / `useWiredX()` conversion): every call below
 * that used to render bare `useRoles()` now renders `useWiredRoles()` instead — same real `fetch`
 * harness, same assertions, only the entry point renamed now that `useRoles` takes an injected
 * `RolesDependencies` argument. Matches `use-users.unit.test.tsx`/`use-posts.unit.test.ts`'s
 * identical split: this file's bulk stays a `fetch`-stubbed `useWiredRoles` suite, and a new
 * "injected port" group at the bottom composes `useRoles` directly against `createFakeRolesPort`
 * with no `fetch` stub at all.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ROLE = { id: "r1", workspaceId: "w1", name: "Editor", isBuiltin: false };
const POLICY = { id: "p1", workspaceId: "w1", name: "Content", description: "d", isBuiltin: false, isFrozen: false };

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useRoles` now also calls `useAdminLocale()` (real `fetch`, not this hook's own concern),
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
    .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
    .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));
  const view = renderHook(() => useWiredRoles(), { wrapper });
  await waitFor(() => expect(view.result.current.roles).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("loads roles and policies in parallel and exposes both once settled", async () => {
    const { result } = await renderLoaded();
    expect(result.current.roles).toEqual([ROLE]);
    expect(result.current.policies).toEqual([POLICY]);
    expect(result.current.error).toBeNull();
  });

  it("sets a translated error and leaves roles/policies null when either list call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "nope", code: "FORBIDDEN" }, 403))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));
    const { result } = renderHook(() => useWiredRoles(), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("You do not have permission to do that.");
    expect(result.current.roles).toBeNull();
    expect(result.current.policies).toBeNull();
  });
});

describe("onCreateRole", () => {
  it("creates, clears the name field, and reloads on success", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setRoleName("New Role"));

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ role: { ...ROLE, id: "r2", name: "New Role" } }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE, { ...ROLE, id: "r2", name: "New Role" }] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onCreateRole({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(result.current.roleName).toBe("");
    expect(result.current.roleSaving).toBe(false);
    expect(result.current.roleError).toBeNull();
    // `waitFor`, not a bare synchronous read (2026-08-12, `lib/fetch-query` migration): the reload
    // triggered by `invalidates: [KEYS.list]` is a separate, un-awaited background refetch, so
    // `onCreateRole()`'s own promise resolving does not guarantee it has landed yet.
    await waitFor(() => expect(result.current.roles).toHaveLength(2));
  });

  it("sets roleError and stops saving, but keeps the typed name, on failure", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setRoleName("Dup Role"));

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "dup", code: "RESOURCE_CONFLICT" }, 409));

    await act(async () => {
      await result.current.onCreateRole({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    // `waitFor`: `roleError` is now derived from `createRoleMutation`'s own `.error`, which can land
    // one render after `onCreateRole()` itself resolves — see `use-merge-term-section.unit.test.tsx`'s
    // identical note in `taxonomy`.
    await waitFor(() => expect(result.current.roleError).toBe("It is still in use — remove that assignment/attachment first."));
    expect(result.current.roleSaving).toBe(false);
    expect(result.current.roleName).toBe("Dup Role");
  });
});

describe("onDeleteRole", () => {
  it("is a no-op with no pending delete — no fetch call", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.onDeleteRole();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("deletes the pending role, reloads, and clears pendingRoleDelete even on failure", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingRoleDelete(ROLE));

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "still referenced", code: "RESOURCE_CONFLICT" }, 409));

    await act(async () => {
      await result.current.onDeleteRole();
    });

    expect(result.current.pendingRoleDelete).toBeNull();
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.rowError).toBe("It is still in use — remove that assignment/attachment first.");
  });

  it("on success: deletes, reloads, and clears both pendingRoleDelete and rowSavingId", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingRoleDelete(ROLE));

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ deletedRoleId: ROLE.id })) // DELETE
      .mockResolvedValueOnce(jsonResponse({ roles: [] })) // reload: roles
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] })); // reload: policies

    await act(async () => {
      await result.current.onDeleteRole();
    });

    expect(result.current.pendingRoleDelete).toBeNull();
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.rowError).toBeNull();
    // `waitFor`: the reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited
    // background refetch — see this file's identical note above.
    await waitFor(() => expect(result.current.roles).toEqual([]));
    const deleteCall = fetchMock.mock.calls[2];
    expect(String(deleteCall[0])).toContain(`/roles/${ROLE.id}`);
    expect(deleteCall[1]?.method).toBe("DELETE");
  });
});

// `onDeletePolicy` had no test at all before this pass — characterisation tests first, per this
// scope's coverage rule, since `runRowDelete` (the extraction below) now carries its behavior too.
describe("onDeletePolicy", () => {
  it("is a no-op with no pending delete — no fetch call", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.onDeletePolicy();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("on success: deletes, reloads, and clears both pendingPolicyDelete and rowSavingId", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingPolicyDelete(POLICY));

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ deletedPolicyId: POLICY.id })) // DELETE
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] })) // reload: roles
      .mockResolvedValueOnce(jsonResponse({ policies: [] })); // reload: policies

    await act(async () => {
      await result.current.onDeletePolicy();
    });

    expect(result.current.pendingPolicyDelete).toBeNull();
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.rowError).toBeNull();
    // `waitFor`: the reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited
    // background refetch — see this file's identical note above.
    await waitFor(() => expect(result.current.policies).toEqual([]));
    const deleteCall = fetchMock.mock.calls[2];
    expect(String(deleteCall[0])).toContain(`/policies/${POLICY.id}`);
    expect(deleteCall[1]?.method).toBe("DELETE");
  });

  it("deletes, reloads, and clears pendingPolicyDelete even on failure", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingPolicyDelete(POLICY));

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "still referenced", code: "RESOURCE_CONFLICT" }, 409));

    await act(async () => {
      await result.current.onDeletePolicy();
    });

    expect(result.current.pendingPolicyDelete).toBeNull();
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.rowError).toBe("It is still in use — remove that assignment/attachment first.");
  });
});

describe("onSaveRole", () => {
  it("on failure, leaves editingRoleId set so the row stays in edit mode", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.startEditRole(ROLE));
    expect(result.current.editingRoleId).toBe(ROLE.id);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "bad name", code: "VALIDATION_ERROR" }, 400));

    await act(async () => {
      await result.current.onSaveRole(ROLE.id);
    });

    expect(result.current.editingRoleId).toBe(ROLE.id);
    expect(result.current.rowError).toBe("bad name");
  });

  it("on success, clears editingRoleId and reloads", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.startEditRole(ROLE));

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ role: { ...ROLE, name: "Renamed" } }))
      .mockResolvedValueOnce(jsonResponse({ roles: [{ ...ROLE, name: "Renamed" }] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    await act(async () => {
      await result.current.onSaveRole(ROLE.id);
    });

    expect(result.current.editingRoleId).toBeNull();
    // `waitFor`: the reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited
    // background refetch — see this file's identical note above.
    await waitFor(() => expect(result.current.roles?.[0].name).toBe("Renamed"));
  });
});

describe("togglePermissionForm", () => {
  it("opens a closed form for the given policy id and clears its inputs", async () => {
    const { result } = await renderLoaded();
    act(() => {
      result.current.setPermissionInput("stale.permission");
      result.current.setResourceTypeInput("stale-type");
    });

    act(() => result.current.togglePermissionForm(POLICY.id));

    expect(result.current.permissionPolicyId).toBe(POLICY.id);
    expect(result.current.permissionInput).toBe("");
    expect(result.current.resourceTypeInput).toBe("");
  });

  it("closes the form (back to null) when toggled a second time for the same policy", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.togglePermissionForm(POLICY.id));
    act(() => result.current.togglePermissionForm(POLICY.id));
    expect(result.current.permissionPolicyId).toBeNull();
  });

  it("switches to a different policy's form rather than closing, when a different id is toggled", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.togglePermissionForm(POLICY.id));
    act(() => result.current.togglePermissionForm("other-policy"));
    expect(result.current.permissionPolicyId).toBe("other-policy");
  });
});

describe("onWritePermission", () => {
  it("is a no-op with an empty permission input — no fetch call", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.onWritePermission(POLICY.id);
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("writes the permission and clears both inputs on success", async () => {
    const { result } = await renderLoaded();
    act(() => {
      result.current.setPermissionInput("content.write");
      result.current.setResourceTypeInput("post");
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ policyPermission: {} }));

    await act(async () => {
      await result.current.onWritePermission(POLICY.id);
    });

    expect(result.current.permissionInput).toBe("");
    expect(result.current.resourceTypeInput).toBe("");
    expect(result.current.rowError).toBeNull();
  });

  it("sets rowError with the unrecognized-permission copy and keeps the typed input on PERMISSION_UNKNOWN", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPermissionInput("bogus.permission"));

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unknown", code: "PERMISSION_UNKNOWN" }, 422));

    await act(async () => {
      await result.current.onWritePermission(POLICY.id);
    });

    expect(result.current.rowError).toBe("That permission is not recognized.");
    expect(result.current.permissionInput).toBe("bogus.permission");
  });
});

describe("t/locale (2026-08-11, standing i18n rule)", () => {
  /** `Roles.tsx` no longer imports `useAdminLocale`/`roles-i18n` itself — `t`/`locale` must reflect
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));

    const { result } = renderHook(() => useWiredRoles(), { wrapper });

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Roles & Permissions")).toBe("Roles y permisos");
  });
});

describe("injected port (useX(dependencies) / useWiredX() conversion coverage)", () => {
  /** `useRoles` still calls `useAdminLocale()` internally regardless of which port is injected —
   *  see this file's header note and `use-roles.hooks.ts`'s own header on why that stays out of
   *  `RolesPort` (it is wired in a separate pass). This file's `beforeEach` already routes that one
   *  locale request to a fixed response, so every assertion below on `fetchMock` still only counts
   *  the calls `RolesPort` itself would have made. */

  it("loads roles and policies through the injected port, without touching fetch", async () => {
    const port = createFakeRolesPort({ roles: [ROLE], policies: [POLICY] });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    expect(result.current.roles).toEqual([ROLE]);
    expect(result.current.policies).toEqual([POLICY]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onCreateRole writes through the injected port and the list reflects the new role", async () => {
    const port = createFakeRolesPort({ roles: [ROLE], policies: [POLICY] });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    act(() => result.current.setRoleName("New Role"));
    await act(async () => {
      await result.current.onCreateRole({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(port.roles).toHaveLength(2);
    await waitFor(() => expect(result.current.roles).toHaveLength(2));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onDeleteRole removes the pending role through the injected port", async () => {
    const port = createFakeRolesPort({ roles: [ROLE], policies: [POLICY] });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    act(() => result.current.setPendingRoleDelete(ROLE));
    await act(async () => {
      await result.current.onDeleteRole();
    });

    expect(port.roles).toEqual([]);
    await waitFor(() => expect(result.current.roles).toEqual([]));
  });

  it("onWritePermission sets rowError from the injected port's configured failure", async () => {
    const port = createFakeRolesPort({
      roles: [ROLE],
      policies: [POLICY],
      writePermissionError: new Error("boom"),
    });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    act(() => result.current.setPermissionInput("content.write"));
    await act(async () => {
      await result.current.onWritePermission(POLICY.id);
    });

    expect(result.current.rowError).toBe("boom");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
