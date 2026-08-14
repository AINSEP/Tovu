import { useState, type Dispatch, type SetStateAction } from "react";
import { type AdminPolicy, type AdminRole } from "../../../lib/api";
import { useFetchMutation, useFetchQuery } from "../../../lib/fetch-query";
import { describeApiError, KEYS } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../roles-i18n";
import { defaultRolesPort } from "./roles-dependencies.hooks";
import type { RolesPort } from "./roles-port.hooks";

/**
 * @file Everything the "Roles & Permissions" screen does, so `Roles.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings. This
 * screen has no unit test today (`README.md`'s own note: "treat a change here as unverified until
 * you have driven it in a browser"), and it is the file this extraction pass exists for: a hook is
 * reachable from `renderHook` with no table, no `RowMenu`, and no `ConfirmDialog`.
 *
 * The doc comments below moved WITH the functions they describe, verbatim — several are decision
 * records (why delete now gates via `ConfirmDialog` instead of the two-click `ConfirmButton`) and a
 * comment separated from its code stops being read.
 *
 * `describeApiError` moved to `../rules` (it computes a value — an error string — rather than
 * rendering one); every handler below that used to call the module-level `describeApiError` now
 * calls the imported one instead, unchanged in every other respect.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `features/posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/roles` needs it.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import): this hook already called
 * `useAdminLocale()` for its own error-string translations, so exposing that SAME already-resolved
 * `locale` as a bound `t` (plus the raw value, still needed for `rules.ts`'s `roleMenuItems`/
 * `policyMenuItems` and `roles-i18n.tsx`'s several part-builder helpers, all of which take `locale`
 * directly) on the return value adds no new fetch — `Roles.tsx` used to call `useAdminLocale()` a
 * second time and rebuild its own `translateRoles(locale, key)` closure, entirely redundant with
 * the resolution this hook was already doing internally.
 *
 * `lib/fetch-query` migration (2026-08-12): the combined roles+policies read is one `useFetchQuery`
 * keyed on `KEYS.list`; every write invalidates it instead of calling `reload()` by hand (see
 * `rules.ts`'s `KEYS` doc) — except `onWritePermission`, which never called `reload()` either, so it
 * stays a plain `useFetchMutation` with no `invalidates`.
 *
 * `rowSavingId`/`rowError` deliberately stay plain `useState`, NOT derived from any mutation's own
 * `status`/`error`: five independent writes (rename role, delete role, rename policy, delete policy,
 * write permission) share this ONE "which row is busy" id and one error slot, and a mutation object's
 * `status` has no way to carry "which row this particular call was for" the way a manually-set id
 * does. `createRoleMutation`/`createPolicyMutation` are the ones-per-mutation exception below — each
 * backs exactly one form, so `roleSaving`/`policySaving`/`roleError`/`policyError` derive from them
 * directly, same shape as every other migrated create form in this sweep.
 *
 * `useX(dependencies)` / `useWiredX()` conversion (2026-08-14): every `api.xxx()` call below is now
 * `port.xxx()` — see `roles-port.hooks.ts` for the interface and `roles-dependencies.hooks.ts` for
 * the real binding, the only file left that imports `lib/api` as a value for this feature. Same
 * "no ref/dep-array needed" note as `use-users.hooks.ts`'s identical section: every write here goes
 * through `useFetchMutation` (via `lib/fetch-query`), which takes a fresh `mutationFn` closure every
 * render by design — there is no `useEffect([port])` in this file for `port` to be listed in wrongly.
 */

export interface RolesController {
  roles: AdminRole[] | null;
  policies: AdminPolicy[] | null;
  error: string | null;
  rowError: string | null;

  roleName: string;
  setRoleName: (name: string) => void;
  roleSaving: boolean;
  roleError: string | null;
  onCreateRole: (e: React.FormEvent) => Promise<void>;

  policyName: string;
  setPolicyName: (name: string) => void;
  policyDescription: string;
  setPolicyDescription: (description: string) => void;
  policySaving: boolean;
  policyError: string | null;
  onCreatePolicy: (e: React.FormEvent) => Promise<void>;

  editingRoleId: string | null;
  setEditingRoleId: (roleId: string | null) => void;
  editingRoleName: string;
  setEditingRoleName: (name: string) => void;
  startEditRole: (role: AdminRole) => void;
  onSaveRole: (roleId: string) => Promise<void>;

  editingPolicyId: string | null;
  setEditingPolicyId: (policyId: string | null) => void;
  editingPolicyName: string;
  setEditingPolicyName: (name: string) => void;
  editingPolicyDescription: string;
  setEditingPolicyDescription: (description: string) => void;
  startEditPolicy: (policy: AdminPolicy) => void;
  onSavePolicy: (policyId: string) => Promise<void>;

  /** In-flight row action (rename, delete, or write-permission) — one at a time. */
  rowSavingId: string | null;

  permissionPolicyId: string | null;
  permissionInput: string;
  setPermissionInput: (permission: string) => void;
  resourceTypeInput: string;
  setResourceTypeInput: (resourceType: string) => void;
  togglePermissionForm: (policyId: string) => void;
  onWritePermission: (policyId: string) => Promise<void>;

  /** The role a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
   *  closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
   *  this is what drives its `open` prop. Separate state per table since a role and a policy delete
   *  are independent operations with their own copy, not because anything shares data between them. */
  pendingRoleDelete: AdminRole | null;
  setPendingRoleDelete: (role: AdminRole | null) => void;
  onDeleteRole: () => Promise<void>;

  pendingPolicyDelete: AdminPolicy | null;
  setPendingPolicyDelete: (policy: AdminPolicy | null) => void;
  onDeletePolicy: () => Promise<void>;

  /** Bound translator — `key` already resolved against the caller's locale, so `Roles.tsx` never
   *  imports `useAdminLocale`/`roles-i18n` itself. See this file's header. */
  t: (key: string) => string;
  /** Raw resolved locale — `rules.ts`'s row-menu builders and `roles-i18n.tsx`'s part-builder
   *  helpers take `locale` directly rather than a bound translator. See this file's header. */
  locale: string;
}

/** The shape `onDeleteRole`/`onDeletePolicy` both repeat: guard on nothing pending, set the shared
 *  `rowSavingId`/`rowError` pair keyed by the row's own id (deliberately not a fit for
 *  `useAsyncAction` — see that file's own header on why a busy-row-id, not a boolean, is a
 *  different shape), delete, and always clear both the saving flag and the pending selection in
 *  `finally` regardless of outcome. `reload()` is gone — `deleteMutation` itself `invalidates:
 *  [KEYS.list]` — this helper's job now is purely the shared busy-id/error bookkeeping. The
 *  "whole-hook" complexity view (brief §2) counts both ~10-line blocks against `useRoles` even
 *  though each is individually small under ESLint's own per-function view — `onDeletePolicy` had no
 *  test at all before the extraction pass that introduced this helper; characterisation tests were
 *  added first (`use-roles.unit.test.ts`) so this extraction has coverage to prove it behavior-
 *  preserving against. */
async function runRowDelete(
  id: string,
  mutate: (id: string) => Promise<unknown>,
  setRowSavingId: Dispatch<SetStateAction<string | null>>,
  setRowError: Dispatch<SetStateAction<string | null>>,
  clearPending: () => void,
  describeError: (e: unknown) => string,
): Promise<void> {
  setRowSavingId(id);
  setRowError(null);
  try {
    await mutate(id);
  } catch (e) {
    setRowError(describeError(e));
  } finally {
    setRowSavingId(null);
    clearPending();
  }
}

/** What `useRoles` needs injected from outside — see this file's header for the conversion note. */
export interface RolesDependencies {
  port: RolesPort;
}

/**
 * Everything the "Roles & Permissions" screen does — full state, effects, and every server write, as
 * one hook so `Roles.tsx` stays a pure render of whatever this returns. See this file's header for
 * the `useFetchQuery`/`useFetchMutation` migration and the `port` injection it now also carries.
 *
 * @param deps - Injected collaborators; production callers get these from {@link useWiredRoles}.
 * @returns The full `RolesController` the view renders from — see that interface for every field.
 */
export function useRoles(deps: RolesDependencies): RolesController {
  const { port } = deps;
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);

  const list = useFetchQuery({
    key: KEYS.list,
    fetch: async () => {
      const [r, p] = await Promise.all([port.listRoles(), port.listPolicies()]);
      return { roles: r.roles, policies: p.policies };
    },
  });
  const roles = list.data?.roles ?? null;
  const policies = list.data?.policies ?? null;
  const error = list.error ? describeApiError(list.error, t(locale, "failed to load roles/policies")) : null;

  const [rowError, setRowError] = useState<string | null>(null);

  const [roleName, setRoleName] = useState("");
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editingPolicyName, setEditingPolicyName] = useState("");
  const [editingPolicyDescription, setEditingPolicyDescription] = useState("");
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  const [permissionPolicyId, setPermissionPolicyId] = useState<string | null>(null);
  const [permissionInput, setPermissionInput] = useState("");
  const [resourceTypeInput, setResourceTypeInput] = useState("");

  // The row a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
  // this is what drives its `open` prop. Separate state per table since a role and a policy delete
  // are independent operations with their own copy, not because anything shares data between them.
  const [pendingRoleDelete, setPendingRoleDelete] = useState<AdminRole | null>(null);
  const [pendingPolicyDelete, setPendingPolicyDelete] = useState<AdminPolicy | null>(null);

  const createRoleMutation = useFetchMutation({
    run: (name: string) => port.createRole(name),
    invalidates: [KEYS.list],
  });
  const createPolicyMutation = useFetchMutation({
    run: (input: { name: string; description: string | undefined }) =>
      port.createPolicy({ name: input.name }, { description: input.description }),
    invalidates: [KEYS.list],
  });
  const saveRoleMutation = useFetchMutation({
    run: (input: { roleId: string; name: string }) => port.updateRole(input),
    invalidates: [KEYS.list],
  });
  const deleteRoleMutation = useFetchMutation({
    run: (id: string) => port.deleteRole(id),
    invalidates: [KEYS.list],
  });
  const savePolicyMutation = useFetchMutation({
    run: (input: { policyId: string; name: string; description: string }) =>
      port.updatePolicy({ policyId: input.policyId }, { name: input.name, description: input.description }),
    invalidates: [KEYS.list],
  });
  const deletePolicyMutation = useFetchMutation({
    run: (id: string) => port.deletePolicy(id),
    invalidates: [KEYS.list],
  });
  // No `invalidates` — matches the pre-migration `onWritePermission`, which never called `reload()`
  // either.
  const writePermissionMutation = useFetchMutation({
    run: (input: { policyId: string; permission: string; resourceType: string | undefined }) =>
      port.writePolicyPermission({ policyId: input.policyId, permission: input.permission }, { resourceType: input.resourceType }),
  });

  async function onCreateRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRoleMutation.mutate(roleName);
      setRoleName("");
    } catch {
      // already surfaced through createRoleMutation.error -> roleError below
    }
  }

  async function onCreatePolicy(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createPolicyMutation.mutate({ name: policyName, description: policyDescription || undefined });
      setPolicyName("");
      setPolicyDescription("");
    } catch {
      // already surfaced through createPolicyMutation.error -> policyError below
    }
  }

  function startEditRole(role: AdminRole) {
    setRowError(null);
    setEditingRoleId(role.id);
    setEditingRoleName(role.name);
  }

  async function onSaveRole(roleId: string) {
    setRowSavingId(roleId);
    setRowError(null);
    try {
      await saveRoleMutation.mutate({ roleId, name: editingRoleName });
      setEditingRoleId(null);
    } catch (e) {
      setRowError(describeApiError(e, t(locale, "failed to rename role")));
    } finally {
      setRowSavingId(null);
    }
  }

  /** Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item
   *  (`setPendingRoleDelete` below) — this row action moved off the in-place two-click
   *  `ConfirmButton` control (MSG-03 rollout) because a `RowMenu` item fires once and the menu
   *  closes immediately (`selectItem` in `RowMenu.tsx`), so there is no "stay open for a second
   *  confirm click" state for `ConfirmButton` to hold; `ConfirmDialog` is the mechanism that
   *  survives the menu closing, same as `Posts.tsx`/`Pages.tsx`'s own Delete. */
  async function onDeleteRole() {
    if (!pendingRoleDelete) return;
    const role = pendingRoleDelete;
    await runRowDelete(
      role.id,
      deleteRoleMutation.mutate,
      setRowSavingId,
      setRowError,
      () => setPendingRoleDelete(null),
      (e) => describeApiError(e, t(locale, "failed to delete role")),
    );
  }

  function startEditPolicy(policy: AdminPolicy) {
    setRowError(null);
    setEditingPolicyId(policy.id);
    setEditingPolicyName(policy.name);
    setEditingPolicyDescription(policy.description ?? "");
  }

  async function onSavePolicy(policyId: string) {
    setRowSavingId(policyId);
    setRowError(null);
    try {
      await savePolicyMutation.mutate({ policyId, name: editingPolicyName, description: editingPolicyDescription });
      setEditingPolicyId(null);
    } catch (e) {
      setRowError(describeApiError(e, t(locale, "failed to update policy")));
    } finally {
      setRowSavingId(null);
    }
  }

  /** Same `ConfirmDialog`-via-`RowMenu` swap as `onDeleteRole` above — see that function's comment. */
  async function onDeletePolicy() {
    if (!pendingPolicyDelete) return;
    const policy = pendingPolicyDelete;
    await runRowDelete(
      policy.id,
      deletePolicyMutation.mutate,
      setRowSavingId,
      setRowError,
      () => setPendingPolicyDelete(null),
      (e) => describeApiError(e, t(locale, "failed to delete policy")),
    );
  }

  function togglePermissionForm(policyId: string) {
    setRowError(null);
    setPermissionInput("");
    setResourceTypeInput("");
    setPermissionPolicyId((current) => (current === policyId ? null : policyId));
  }

  async function onWritePermission(policyId: string) {
    if (!permissionInput) return;
    setRowSavingId(policyId);
    setRowError(null);
    try {
      await writePermissionMutation.mutate({ policyId, permission: permissionInput, resourceType: resourceTypeInput || undefined });
      setPermissionInput("");
      setResourceTypeInput("");
    } catch (e) {
      setRowError(describeApiError(e, t(locale, "failed to add permission")));
    } finally {
      setRowSavingId(null);
    }
  }

  const roleSaving = createRoleMutation.status === "pending";
  const roleError = createRoleMutation.error ? describeApiError(createRoleMutation.error, t(locale, "failed to create role")) : null;
  const policySaving = createPolicyMutation.status === "pending";
  const policyError = createPolicyMutation.error
    ? describeApiError(createPolicyMutation.error, t(locale, "failed to create policy"))
    : null;

  return {
    roles,
    policies,
    error,
    rowError,

    roleName,
    setRoleName,
    roleSaving,
    roleError,
    onCreateRole,

    policyName,
    setPolicyName,
    policyDescription,
    setPolicyDescription,
    policySaving,
    policyError,
    onCreatePolicy,

    editingRoleId,
    setEditingRoleId,
    editingRoleName,
    setEditingRoleName,
    startEditRole,
    onSaveRole,

    editingPolicyId,
    setEditingPolicyId,
    editingPolicyName,
    setEditingPolicyName,
    editingPolicyDescription,
    setEditingPolicyDescription,
    startEditPolicy,
    onSavePolicy,

    rowSavingId,

    permissionPolicyId,
    permissionInput,
    setPermissionInput,
    resourceTypeInput,
    setResourceTypeInput,
    togglePermissionForm,
    onWritePermission,

    pendingRoleDelete,
    setPendingRoleDelete,
    onDeleteRole,

    pendingPolicyDelete,
    setPendingPolicyDelete,
    onDeletePolicy,

    t: boundT,
    locale,
  };
}

/**
 * Binds the real `/api/.../roles` and `/policies` clients — see `roles-dependencies.hooks.ts`. The
 * zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Roles.tsx` composes this
 * and a test composes {@link useRoles} with `createFakeRolesPort`.
 *
 * @returns The same `RolesController` {@link useRoles} returns, wired to the live API client.
 */
export function useWiredRoles(): RolesController {
  return useRoles({ port: defaultRolesPort });
}
