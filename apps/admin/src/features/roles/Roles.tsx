import { Fragment } from "react";
import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { roleMenuItems, policyMenuItems } from "./rules";
import { useRoles } from "./hooks/use-roles.hooks";

/**
 * @file "Roles & Permissions" screen (SPEC-006 + 0.6.0 CRUD-completion amendment) — the
 * `/admin/roles` route. Markup only.
 *
 * State and API calls live in `hooks/use-roles.hooks.ts`; the row-menu logic and the
 * `RESOURCE_CONFLICT`-etc. error copy live in `rules.ts`.
 *
 * Lists roles and policies, creates new ones (`CREATE_ROLE`/`CREATE_POLICY`), and (0.6.0) renames
 * (`UPDATE_ROLE`/`UPDATE_POLICY`), deletes (`DELETE_ROLE`/`DELETE_POLICY`), and — for policies —
 * writes a permission onto a custom policy (`WRITE_POLICY_PERMISSION`, closing the gap this
 * screen's own prior header comment flagged: "granting individual permission strings to a custom
 * policy has no admin route yet"). Every mutating action here is a plain button/inline form, no
 * dedicated edit mode — matches this screen's existing utilitarian style. Role/policy -> user grant
 * assignment stays on `Users.tsx`'s "Manage" row, not duplicated here. Built-in rows never show
 * rename/delete controls (the backend refuses them anyway, INV-06 — hiding the control avoids a
 * guaranteed-failing click).
 *
 * Scope note (unchanged from before 0.6.0): removing a single permission from a policy has no
 * transition (OQ-10, `feature.spec.md`) — the only way to shrink a policy's permission set is
 * delete (only when unused) + recreate.
 */
export interface RolesProps {
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  nothing and behave exactly as before. This screen has no unit test today (see `README.md`); a
   *  test can supply a stub and drive it through any state without module mocking. */
  useRolesHook?: typeof useRoles;
}

export function Roles({ useRolesHook = useRoles }: RolesProps = {}) {
  const {
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
  } = useRolesHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!roles || !policies) return <div className="notice">Loading roles & permissions…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">People</p>
          <h1 className="page-title">Roles & Permissions</h1>
          <p className="page-description">
            Roles and policies grant access to operator users. Assign a role or policy to a
            specific user from the <a href="/admin/users">Users</a> screen.
          </p>
        </div>
      </div>
      {rowError ? <div className="notice error">{rowError}</div> : null}

      <h2>Roles</h2>
      <form onSubmit={onCreateRole} className="notice integrations-form">
        {roleError ? <span className="save-error">{roleError}</span> : null}
        <label>
          Role name
          <input value={roleName} onChange={(e) => setRoleName(e.target.value)} required />
        </label>
        <button type="submit" disabled={roleSaving || !roleName}>
          {roleSaving ? "Creating…" : "Create role"}
        </button>
      </form>
      <DataTable
        rows={roles}
        rowKey={(role) => role.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No roles yet.</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "name",
            header: "Name",
            cell: (role) =>
              editingRoleId === role.id ? (
                <input value={editingRoleName} onChange={(e) => setEditingRoleName(e.target.value)} />
              ) : (
                role.name
              ),
          },
          { key: "type", header: "Type", cell: (role) => (role.isBuiltin ? "Built-in" : "Custom") },
          {
            key: "actions",
            header: "More",
            cell: (role) =>
              role.isBuiltin ? (
                <span className="muted-cell">—</span>
              ) : editingRoleId === role.id ? (
                <span className="editor-actions">
                  <button type="button" disabled={rowSavingId === role.id} onClick={() => onSaveRole(role.id)}>
                    {rowSavingId === role.id ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingRoleId(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <RowMenu
                  triggerLabel={`Actions for role "${role.name}"`}
                  items={roleMenuItems(role, { onRename: startEditRole, onDelete: setPendingRoleDelete })}
                />
              ),
          },
        ]}
      />

      <h2>Policies</h2>
      <form onSubmit={onCreatePolicy} className="notice integrations-form">
        {policyError ? <span className="save-error">{policyError}</span> : null}
        <label>
          Policy name
          <input value={policyName} onChange={(e) => setPolicyName(e.target.value)} required />
        </label>
        <label>
          Description (optional)
          <input value={policyDescription} onChange={(e) => setPolicyDescription(e.target.value)} />
        </label>
        <button type="submit" disabled={policySaving || !policyName}>
          {policySaving ? "Creating…" : "Create policy"}
        </button>
      </form>
      {policies.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No policies yet.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
        <table className="list-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Type</th>
              <th>More</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <Fragment key={policy.id}>
                <tr>
                  <td>
                    {editingPolicyId === policy.id ? (
                      <input value={editingPolicyName} onChange={(e) => setEditingPolicyName(e.target.value)} />
                    ) : (
                      policy.name
                    )}
                  </td>
                  <td>
                    {editingPolicyId === policy.id ? (
                      <input
                        value={editingPolicyDescription}
                        onChange={(e) => setEditingPolicyDescription(e.target.value)}
                      />
                    ) : (
                      policy.description ?? <span className="muted-cell">—</span>
                    )}
                  </td>
                  <td>
                    {policy.isBuiltin ? "Built-in" : "Custom"}
                    {policy.isFrozen ? " (frozen)" : ""}
                  </td>
                  <td>
                    {policy.isBuiltin || policy.isFrozen ? (
                      <span className="muted-cell">—</span>
                    ) : editingPolicyId === policy.id ? (
                      <span className="editor-actions">
                        <button
                          type="button"
                          disabled={rowSavingId === policy.id}
                          onClick={() => onSavePolicy(policy.id)}
                        >
                          {rowSavingId === policy.id ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setEditingPolicyId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <RowMenu
                        triggerLabel={`Actions for policy "${policy.name}"`}
                        items={policyMenuItems(policy, permissionPolicyId, {
                          onRename: startEditPolicy,
                          onTogglePermissionForm: togglePermissionForm,
                          onDelete: setPendingPolicyDelete,
                        })}
                      />
                    )}
                  </td>
                </tr>
                {permissionPolicyId === policy.id ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="notice integrations-form">
                        <label>
                          Permission
                          <span className="editor-actions">
                            <input
                              value={permissionInput}
                              onChange={(e) => setPermissionInput(e.target.value)}
                              placeholder="e.g. content.write"
                            />
                            <input
                              value={resourceTypeInput}
                              onChange={(e) => setResourceTypeInput(e.target.value)}
                              placeholder="resource type (optional)"
                            />
                            <button
                              type="button"
                              disabled={!permissionInput || rowSavingId === policy.id}
                              onClick={() => onWritePermission(policy.id)}
                            >
                              {rowSavingId === policy.id ? "Saving…" : "Add"}
                            </button>
                          </span>
                        </label>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <ConfirmDialog
        open={pendingRoleDelete !== null}
        title="Delete role?"
        body={pendingRoleDelete ? <p>Delete role &quot;{pendingRoleDelete.name}&quot;?</p> : null}
        confirmLabel="Delete"
        destructive
        pending={pendingRoleDelete !== null && rowSavingId === pendingRoleDelete.id}
        onConfirm={onDeleteRole}
        onCancel={() => setPendingRoleDelete(null)}
      />
      <ConfirmDialog
        open={pendingPolicyDelete !== null}
        title="Delete policy?"
        body={pendingPolicyDelete ? <p>Delete policy &quot;{pendingPolicyDelete.name}&quot;?</p> : null}
        confirmLabel="Delete"
        destructive
        pending={pendingPolicyDelete !== null && rowSavingId === pendingPolicyDelete.id}
        onConfirm={onDeletePolicy}
        onCancel={() => setPendingPolicyDelete(null)}
      />
    </div>
  );
}
