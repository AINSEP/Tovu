import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AdminPolicyPermission } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
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

    // Two responses: the write itself, then the permission-list reload it triggers (OQ-10) so the
    // row it just created is present with the `id` its Remove button needs.
    fetchMock.mockResolvedValueOnce(jsonResponse({ policyPermission: {} }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        policyPermissions: [
          { id: "pp-new", workspaceId: "w1", policyId: POLICY.id, permission: "content.write" },
        ],
      }),
    );

    await act(async () => {
      await result.current.onWritePermission(POLICY.id);
    });

    expect(result.current.permissionInput).toBe("");
    expect(result.current.resourceTypeInput).toBe("");
    expect(result.current.rowError).toBeNull();
    expect(result.current.permissionRows.map((row) => row.permission)).toEqual(["content.write"]);
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

  // OQ-10 — a policy's permission set used to be append-only from this screen.
  const PERMISSION_ROW = {
    id: "pp-1",
    workspaceId: "w1",
    policyId: POLICY.id,
    permission: "content.write",
    resourceType: null,
    constraintJson: null,
  };

  it("togglePermissionForm loads the policy's current permissions when it opens", async () => {
    const port = createFakeRolesPort({
      roles: [ROLE],
      policies: [POLICY],
      initialPolicyPermissions: [PERMISSION_ROW],
    });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    expect(result.current.permissionRows).toEqual([]);
    await act(async () => result.current.togglePermissionForm(POLICY.id));

    await waitFor(() => expect(result.current.permissionRows).toEqual([PERMISSION_ROW]));
    expect(result.current.permissionsLoading).toBe(false);
  });

  it("togglePermissionForm clears the loaded rows when it closes", async () => {
    const port = createFakeRolesPort({
      roles: [ROLE],
      policies: [POLICY],
      initialPolicyPermissions: [PERMISSION_ROW],
    });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    await act(async () => result.current.togglePermissionForm(POLICY.id));
    await waitFor(() => expect(result.current.permissionRows).toEqual([PERMISSION_ROW]));

    await act(async () => result.current.togglePermissionForm(POLICY.id));
    expect(result.current.permissionPolicyId).toBeNull();
    expect(result.current.permissionRows).toEqual([]);
  });

  it("onRemovePermission removes the row through the injected port and refreshes the list", async () => {
    const other = { ...PERMISSION_ROW, id: "pp-2", permission: "content.read" };
    const port = createFakeRolesPort({
      roles: [ROLE],
      policies: [POLICY],
      initialPolicyPermissions: [PERMISSION_ROW, other],
    });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());
    await act(async () => result.current.togglePermissionForm(POLICY.id));
    await waitFor(() => expect(result.current.permissionRows).toHaveLength(2));

    await act(async () => {
      await result.current.onRemovePermission(POLICY.id, PERMISSION_ROW.id);
    });

    expect(port.policyPermissions).toEqual([other]);
    expect(result.current.permissionRows).toEqual([other]);
    expect(result.current.rowError).toBeNull();
    expect(result.current.removingPermissionId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onRemovePermission sets rowError from the injected port's configured failure and keeps the row", async () => {
    const port = createFakeRolesPort({
      roles: [ROLE],
      policies: [POLICY],
      initialPolicyPermissions: [PERMISSION_ROW],
      removePermissionError: new Error("boom"),
    });
    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());
    await act(async () => result.current.togglePermissionForm(POLICY.id));
    await waitFor(() => expect(result.current.permissionRows).toHaveLength(1));

    await act(async () => {
      await result.current.onRemovePermission(POLICY.id, PERMISSION_ROW.id);
    });

    expect(result.current.rowError).toBe("boom");
    expect(port.policyPermissions).toEqual([PERMISSION_ROW]);
    expect(result.current.removingPermissionId).toBeNull();
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

  // `loadPermissions` (shared by `togglePermissionForm`/`onWritePermission`/`onRemovePermission`) had
  // no guard against a second, DIFFERENT policy's load starting before the first settled — network
  // completion order does not have to match start order. Same bug class `use-sites.hooks.ts`'s
  // `activate`, `use-themes.hooks.ts`'s `activate`/`download`, and `use-theme-explore.hooks.ts`'s
  // rename were fixed for; see `loadPermissions`'s `permissionsGenerationRef` doc comment.
  it("switching panels while the first load is in flight must not let the stale panel's rows win", async () => {
    const otherPolicy = { id: "p2", workspaceId: "w1", name: "Other", description: "", isBuiltin: false, isFrozen: false };
    const deferred: Record<string, { resolve: (v: { policyPermissions: AdminPolicyPermission[] }) => void }> = {};
    const port = createFakeRolesPort({ roles: [ROLE], policies: [POLICY, otherPolicy] });
    port.listPolicyPermissions = vi.fn((policyId: string) => {
      return new Promise<{ policyPermissions: AdminPolicyPermission[] }>((resolve) => {
        deferred[policyId] = { resolve };
      });
    });

    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    // Open POLICY's panel, then switch to `otherPolicy`'s before POLICY's load resolves.
    act(() => result.current.togglePermissionForm(POLICY.id));
    act(() => result.current.togglePermissionForm(otherPolicy.id));
    await waitFor(() => expect(port.listPolicyPermissions).toHaveBeenCalledTimes(2));
    expect(result.current.permissionPolicyId).toBe(otherPolicy.id);

    // `otherPolicy` (opened LAST) resolves first — the operator is looking at its panel.
    await act(async () => {
      deferred[otherPolicy.id]!.resolve({
        policyPermissions: [{ id: "other-perm", workspaceId: "w1", policyId: otherPolicy.id, permission: "other.read", resourceType: null, constraintJson: null }],
      });
    });
    await waitFor(() => expect(result.current.permissionRows).toHaveLength(1));
    expect(result.current.permissionRows[0]!.policyId).toBe(otherPolicy.id);

    // POLICY's stale, superseded load now arrives.
    await act(async () => {
      deferred[POLICY.id]!.resolve({
        policyPermissions: [{ id: "policy-perm", workspaceId: "w1", policyId: POLICY.id, permission: "policy.read", resourceType: null, constraintJson: null }],
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The panel is still showing `otherPolicy` — POLICY's late rows must not have overwritten it.
    expect(result.current.permissionPolicyId).toBe(otherPolicy.id);
    expect(result.current.permissionRows).toHaveLength(1);
    expect(result.current.permissionRows[0]!.policyId).toBe(otherPolicy.id);
  });

  // `onSaveRole` had no guard against its settle-time `editingRoleId`/`rowSavingId` writes closing a
  // DIFFERENT, still-open row's edit UI — nothing gates a second `onSaveRole` (on a different role)
  // from starting before the first settles, unlike a confirm-dialog-gated action. Same bug class as
  // `loadPermissions` above; see `onSaveRole`'s own doc comment.
  it("onSaveRole: a stale save settling after the operator moved to editing a DIFFERENT role must not close that row's edit UI", async () => {
    const roleB = { id: "rB", workspaceId: "w1", name: "Beta", isBuiltin: false };
    let resolveA!: (v: { role: typeof ROLE }) => void;
    const port = createFakeRolesPort({ roles: [ROLE, roleB], policies: [POLICY] });
    port.updateRole = vi.fn(() => new Promise<{ role: typeof ROLE }>((resolve) => { resolveA = resolve; }));

    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    act(() => result.current.startEditRole(ROLE));
    act(() => {
      void result.current.onSaveRole(ROLE.id);
    });
    await waitFor(() => expect(port.updateRole).toHaveBeenCalledTimes(1));

    // Before ROLE's save settles, the operator moves on to editing a DIFFERENT, unsaved role.
    act(() => result.current.startEditRole(roleB));
    expect(result.current.editingRoleId).toBe(roleB.id);

    await act(async () => {
      resolveA({ role: ROLE });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.editingRoleId).toBe(roleB.id);
  });

  // Same bug, the policy-editing counterpart — see `onSavePolicy`'s own doc comment.
  it("onSavePolicy: a stale save settling after the operator moved to editing a DIFFERENT policy must not close that row's edit UI", async () => {
    const policyB = { id: "pB", workspaceId: "w1", name: "Other", description: "", isBuiltin: false, isFrozen: false };
    let resolveA!: (v: { policy: typeof POLICY }) => void;
    const port = createFakeRolesPort({ roles: [ROLE], policies: [POLICY, policyB] });
    port.updatePolicy = vi.fn(() => new Promise<{ policy: typeof POLICY }>((resolve) => { resolveA = resolve; }));

    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    act(() => result.current.startEditPolicy(POLICY));
    act(() => {
      void result.current.onSavePolicy(POLICY.id);
    });
    await waitFor(() => expect(port.updatePolicy).toHaveBeenCalledTimes(1));

    act(() => result.current.startEditPolicy(policyB));
    expect(result.current.editingPolicyId).toBe(policyB.id);

    await act(async () => {
      resolveA({ policy: POLICY });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.editingPolicyId).toBe(policyB.id);
  });

  // `runRowDelete`'s `clearPending` had no guard against a stale delete's settlement silently
  // dismissing a DIFFERENT row's delete confirmation the operator has since opened — nothing gates
  // opening a new confirmation while an earlier delete is still in flight at the hook level. See
  // `runRowDelete`'s own doc comment.
  it("onDeleteRole: a stale delete settling after the operator opened a DIFFERENT row's delete confirmation must not silently close it", async () => {
    const roleB = { id: "rB", workspaceId: "w1", name: "Beta", isBuiltin: false };
    let resolveA!: () => void;
    const port = createFakeRolesPort({ roles: [ROLE, roleB], policies: [POLICY] });
    port.deleteRole = vi.fn(() => new Promise<void>((resolve) => { resolveA = resolve; }));

    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    act(() => result.current.setPendingRoleDelete(ROLE));
    act(() => {
      void result.current.onDeleteRole();
    });
    await waitFor(() => expect(port.deleteRole).toHaveBeenCalledTimes(1));

    // Before ROLE's delete settles, the operator opens a delete confirmation for a DIFFERENT role.
    act(() => result.current.setPendingRoleDelete(roleB));
    expect(result.current.pendingRoleDelete).toEqual(roleB);

    await act(async () => {
      resolveA();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.pendingRoleDelete).toEqual(roleB);
  });

  // `onWritePermission` cleared `permissionInput`/`resourceTypeInput` on success unconditionally —
  // nothing gates opening a DIFFERENT policy's permission form while a previous write is still in
  // flight. See `onWritePermission`'s own doc comment.
  it("onWritePermission: a stale write settling after the operator switched panels and typed a NEW value must not clear it", async () => {
    let resolveA!: (v: { policyPermission: unknown }) => void;
    const otherPolicy = { id: "p2", workspaceId: "w1", name: "Other", description: "", isBuiltin: false, isFrozen: false };
    const port = createFakeRolesPort({ roles: [ROLE], policies: [POLICY, otherPolicy] });
    port.writePolicyPermission = vi.fn(() => new Promise<{ policyPermission: unknown }>((resolve) => { resolveA = resolve; }));

    const { result } = renderHook(() => useRoles({ port }), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());

    await act(async () => result.current.togglePermissionForm(POLICY.id));
    act(() => result.current.setPermissionInput("a.perm"));
    act(() => {
      void result.current.onWritePermission(POLICY.id);
    });
    await waitFor(() => expect(port.writePolicyPermission).toHaveBeenCalledTimes(1));

    // Before POLICY's write settles, the operator switches to a DIFFERENT policy's panel and
    // types a NEW, unrelated value there.
    await act(async () => result.current.togglePermissionForm(otherPolicy.id));
    act(() => result.current.setPermissionInput("b.perm"));
    expect(result.current.permissionInput).toBe("b.perm");

    await act(async () => {
      resolveA({ policyPermission: {} });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.permissionInput).toBe("b.perm");
  });
});
