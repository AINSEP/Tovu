import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api, type AdminPolicy, type AdminRole } from "../../../lib/api";
import { describeApiError } from "../rules";

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
}

/** The shape `onDeleteRole`/`onDeletePolicy` both repeat: guard on nothing pending, set the shared
 *  `rowSavingId`/`rowError` pair keyed by the row's own id (deliberately not a fit for
 *  `useAsyncAction` — see that file's own header on why a busy-row-id, not a boolean, is a
 *  different shape), delete, reload, and always clear both the saving flag and the pending
 *  selection in `finally` regardless of outcome. The "whole-hook" complexity view (brief §2) counts
 *  both ~12-line blocks against `useRoles` even though each is individually small under ESLint's
 *  own per-function view — `onDeletePolicy` had no test at all before this pass; characterisation
 *  tests were added first (`use-roles.unit.test.ts`) so this extraction has coverage to prove it
 *  behavior-preserving against. */
async function runRowDelete(
  id: string,
  deleteCall: (id: string) => Promise<unknown>,
  setRowSavingId: Dispatch<SetStateAction<string | null>>,
  setRowError: Dispatch<SetStateAction<string | null>>,
  clearPending: () => void,
  reload: () => Promise<void>,
  describeError: (e: unknown) => string,
): Promise<void> {
  setRowSavingId(id);
  setRowError(null);
  try {
    await deleteCall(id);
    await reload();
  } catch (e) {
    setRowError(describeError(e));
  } finally {
    setRowSavingId(null);
    clearPending();
  }
}

export function useRoles(): RolesController {
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [policies, setPolicies] = useState<AdminPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [roleName, setRoleName] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

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

  function reload(): Promise<void> {
    return Promise.all([api.listRoles(), api.listPolicies()])
      .then(([r, p]) => {
        setRoles(r.roles);
        setPolicies(p.policies);
      })
      .catch((e) => setError(describeApiError(e, "failed to load roles/policies")));
  }

  useEffect(() => {
    void reload();
  }, []);

  async function onCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleSaving(true);
    setRoleError(null);
    try {
      await api.createRole(roleName);
      setRoleName("");
      await reload();
    } catch (e) {
      setRoleError(describeApiError(e, "failed to create role"));
    } finally {
      setRoleSaving(false);
    }
  }

  async function onCreatePolicy(e: React.FormEvent) {
    e.preventDefault();
    setPolicySaving(true);
    setPolicyError(null);
    try {
      await api.createPolicy({ name: policyName }, { description: policyDescription || undefined });
      setPolicyName("");
      setPolicyDescription("");
      await reload();
    } catch (e) {
      setPolicyError(describeApiError(e, "failed to create policy"));
    } finally {
      setPolicySaving(false);
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
      await api.updateRole({ roleId, name: editingRoleName });
      setEditingRoleId(null);
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, "failed to rename role"));
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
      api.deleteRole,
      setRowSavingId,
      setRowError,
      () => setPendingRoleDelete(null),
      reload,
      (e) => describeApiError(e, "failed to delete role"),
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
      await api.updatePolicy({ policyId }, { name: editingPolicyName, description: editingPolicyDescription });
      setEditingPolicyId(null);
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, "failed to update policy"));
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
      api.deletePolicy,
      setRowSavingId,
      setRowError,
      () => setPendingPolicyDelete(null),
      reload,
      (e) => describeApiError(e, "failed to delete policy"),
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
      await api.writePolicyPermission({ policyId, permission: permissionInput }, { resourceType: resourceTypeInput || undefined });
      setPermissionInput("");
      setResourceTypeInput("");
    } catch (e) {
      setRowError(describeApiError(e, "failed to add permission"));
    } finally {
      setRowSavingId(null);
    }
  }

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
  };
}
