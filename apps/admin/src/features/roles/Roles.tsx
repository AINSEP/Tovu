import { Fragment, type FormEvent } from "react";
import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import type { AdminPolicy, AdminRole } from "../../lib/api";

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
 *
 * Complexity-ceiling pass (2026-08-06): `Roles` and its policy-row map closure both scored over
 * the ceiling (18/10 and 13/13 — one over-sized "Policies" table section reported as two separate
 * numbers, per the brief for this pass). Split into `RolesSection`, `PoliciesSection`/`PolicyRow`,
 * and the two delete dialogs, same top-level-function convention `Users.tsx`/`Taxonomy.tsx` use —
 * a nested closure would not have moved any branching out of `Roles`' own scope, only a sibling
 * function does.
 */
export interface RolesProps {
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  nothing and behave exactly as before. */
  useRolesHook?: typeof useRoles;
}

interface RolesSectionProps {
  roles: AdminRole[];
  roleName: string;
  setRoleName: (name: string) => void;
  roleSaving: boolean;
  roleError: string | null;
  onCreateRole: (e: FormEvent) => Promise<void>;
  editingRoleId: string | null;
  setEditingRoleId: (roleId: string | null) => void;
  editingRoleName: string;
  setEditingRoleName: (name: string) => void;
  startEditRole: (role: AdminRole) => void;
  onSaveRole: (roleId: string) => Promise<void>;
  rowSavingId: string | null;
  setPendingRoleDelete: (role: AdminRole | null) => void;
}

/** "Roles" heading, create-role form, and the roles `DataTable` — extracted from `Roles` verbatim.
 *  `DataTable`'s own `cell` callbacks are already separately-scoped closures under ESLint (each
 *  gets its own report), so this split is about the create-form's own branches, not the table. */
function RolesSection({
  roles,
  roleName,
  setRoleName,
  roleSaving,
  roleError,
  onCreateRole,
  editingRoleId,
  setEditingRoleId,
  editingRoleName,
  setEditingRoleName,
  startEditRole,
  onSaveRole,
  rowSavingId,
  setPendingRoleDelete,
}: RolesSectionProps) {
  return (
    <>
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
    </>
  );
}

interface PolicyRowProps {
  policy: AdminPolicy;
  editingPolicyId: string | null;
  setEditingPolicyId: (policyId: string | null) => void;
  editingPolicyName: string;
  setEditingPolicyName: (name: string) => void;
  editingPolicyDescription: string;
  setEditingPolicyDescription: (description: string) => void;
  startEditPolicy: (policy: AdminPolicy) => void;
  onSavePolicy: (policyId: string) => Promise<void>;
  rowSavingId: string | null;
  permissionPolicyId: string | null;
  permissionInput: string;
  setPermissionInput: (permission: string) => void;
  resourceTypeInput: string;
  setResourceTypeInput: (resourceType: string) => void;
  togglePermissionForm: (policyId: string) => void;
  onWritePermission: (policyId: string) => Promise<void>;
  setPendingPolicyDelete: (policy: AdminPolicy | null) => void;
}

interface PolicyRowActionsProps {
  policy: AdminPolicy;
  editingPolicyId: string | null;
  setEditingPolicyId: (policyId: string | null) => void;
  onSavePolicy: (policyId: string) => Promise<void>;
  rowSavingId: string | null;
  permissionPolicyId: string | null;
  startEditPolicy: (policy: AdminPolicy) => void;
  togglePermissionForm: (policyId: string) => void;
  setPendingPolicyDelete: (policy: AdminPolicy | null) => void;
}

/** The "More" cell's three-way branch (built-in/frozen -> dash, mid-rename -> Save/Cancel,
 *  at-rest -> `RowMenu`) — extracted out of `PolicyRow`, which was still 13/13 after the first
 *  split pass because this cell's own branches (the `||` guard plus its two nested ternaries) were
 *  still counted in `PolicyRow`'s scope. Same "the panel, not the row, was the actual size" lesson
 *  `Users.tsx`'s `UserRow` -> `UserManagePanel` split already applied. */
function PolicyRowActions({
  policy,
  editingPolicyId,
  setEditingPolicyId,
  onSavePolicy,
  rowSavingId,
  permissionPolicyId,
  startEditPolicy,
  togglePermissionForm,
  setPendingPolicyDelete,
}: PolicyRowActionsProps) {
  if (policy.isBuiltin || policy.isFrozen) return <span className="muted-cell">—</span>;
  if (editingPolicyId === policy.id) {
    return (
      <span className="editor-actions">
        <button type="button" disabled={rowSavingId === policy.id} onClick={() => onSavePolicy(policy.id)}>
          {rowSavingId === policy.id ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditingPolicyId(null)}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <RowMenu
      triggerLabel={`Actions for policy "${policy.name}"`}
      items={policyMenuItems(policy, permissionPolicyId, {
        onRename: startEditPolicy,
        onTogglePermissionForm: togglePermissionForm,
        onDelete: setPendingPolicyDelete,
      })}
    />
  );
}

interface PolicyPermissionFormProps {
  policyId: string;
  rowSavingId: string | null;
  permissionInput: string;
  setPermissionInput: (permission: string) => void;
  resourceTypeInput: string;
  setResourceTypeInput: (resourceType: string) => void;
  onWritePermission: (policyId: string) => Promise<void>;
}

/** The inline "Add permission" row — extracted out of `PolicyRow` verbatim, for the same reason as
 *  `PolicyRowActions` above. */
function PolicyPermissionForm({
  policyId,
  rowSavingId,
  permissionInput,
  setPermissionInput,
  resourceTypeInput,
  setResourceTypeInput,
  onWritePermission,
}: PolicyPermissionFormProps) {
  return (
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
                disabled={!permissionInput || rowSavingId === policyId}
                onClick={() => onWritePermission(policyId)}
              >
                {rowSavingId === policyId ? "Saving…" : "Add"}
              </button>
            </span>
          </label>
        </div>
      </td>
    </tr>
  );
}

/** One policy's row plus its optional inline "Add permission" row — extracted from
 *  `PoliciesSection`'s `.map()` body verbatim. `key` lives on the `<PolicyRow>` element at the
 *  call site, same convention `Users.tsx`'s `UserRow` uses. */
function PolicyRow({
  policy,
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
  setPendingPolicyDelete,
}: PolicyRowProps) {
  return (
    <>
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
          <PolicyRowActions
            policy={policy}
            editingPolicyId={editingPolicyId}
            setEditingPolicyId={setEditingPolicyId}
            onSavePolicy={onSavePolicy}
            rowSavingId={rowSavingId}
            permissionPolicyId={permissionPolicyId}
            startEditPolicy={startEditPolicy}
            togglePermissionForm={togglePermissionForm}
            setPendingPolicyDelete={setPendingPolicyDelete}
          />
        </td>
      </tr>
      {permissionPolicyId === policy.id ? (
        <PolicyPermissionForm
          policyId={policy.id}
          rowSavingId={rowSavingId}
          permissionInput={permissionInput}
          setPermissionInput={setPermissionInput}
          resourceTypeInput={resourceTypeInput}
          setResourceTypeInput={setResourceTypeInput}
          onWritePermission={onWritePermission}
        />
      ) : null}
    </>
  );
}

type PoliciesSectionProps = Omit<PolicyRowProps, "policy"> & {
  policies: AdminPolicy[];
  policyName: string;
  setPolicyName: (name: string) => void;
  policyDescription: string;
  setPolicyDescription: (description: string) => void;
  policySaving: boolean;
  policyError: string | null;
  onCreatePolicy: (e: FormEvent) => Promise<void>;
};

/** "Policies" heading, create-policy form, and the policies table (or its empty state) —
 *  extracted from `Roles` verbatim. */
function PoliciesSection({
  policies,
  policyName,
  setPolicyName,
  policyDescription,
  setPolicyDescription,
  policySaving,
  policyError,
  onCreatePolicy,
  ...rowProps
}: PoliciesSectionProps) {
  return (
    <>
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
                  <PolicyRow policy={policy} {...rowProps} />
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface RoleDeleteDialogProps {
  pendingRoleDelete: AdminRole | null;
  setPendingRoleDelete: (role: AdminRole | null) => void;
  rowSavingId: string | null;
  onDeleteRole: () => Promise<void>;
}

/** The role-delete confirm dialog — extracted from `Roles` verbatim. */
function RoleDeleteDialog({ pendingRoleDelete, setPendingRoleDelete, rowSavingId, onDeleteRole }: RoleDeleteDialogProps) {
  return (
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
  );
}

interface PolicyDeleteDialogProps {
  pendingPolicyDelete: AdminPolicy | null;
  setPendingPolicyDelete: (policy: AdminPolicy | null) => void;
  rowSavingId: string | null;
  onDeletePolicy: () => Promise<void>;
}

/** The policy-delete confirm dialog — extracted from `Roles` verbatim. */
function PolicyDeleteDialog({ pendingPolicyDelete, setPendingPolicyDelete, rowSavingId, onDeletePolicy }: PolicyDeleteDialogProps) {
  return (
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
  );
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

      <RolesSection
        roles={roles}
        roleName={roleName}
        setRoleName={setRoleName}
        roleSaving={roleSaving}
        roleError={roleError}
        onCreateRole={onCreateRole}
        editingRoleId={editingRoleId}
        setEditingRoleId={setEditingRoleId}
        editingRoleName={editingRoleName}
        setEditingRoleName={setEditingRoleName}
        startEditRole={startEditRole}
        onSaveRole={onSaveRole}
        rowSavingId={rowSavingId}
        setPendingRoleDelete={setPendingRoleDelete}
      />

      <PoliciesSection
        policies={policies}
        policyName={policyName}
        setPolicyName={setPolicyName}
        policyDescription={policyDescription}
        setPolicyDescription={setPolicyDescription}
        policySaving={policySaving}
        policyError={policyError}
        onCreatePolicy={onCreatePolicy}
        editingPolicyId={editingPolicyId}
        setEditingPolicyId={setEditingPolicyId}
        editingPolicyName={editingPolicyName}
        setEditingPolicyName={setEditingPolicyName}
        editingPolicyDescription={editingPolicyDescription}
        setEditingPolicyDescription={setEditingPolicyDescription}
        startEditPolicy={startEditPolicy}
        onSavePolicy={onSavePolicy}
        rowSavingId={rowSavingId}
        permissionPolicyId={permissionPolicyId}
        permissionInput={permissionInput}
        setPermissionInput={setPermissionInput}
        resourceTypeInput={resourceTypeInput}
        setResourceTypeInput={setResourceTypeInput}
        togglePermissionForm={togglePermissionForm}
        onWritePermission={onWritePermission}
        setPendingPolicyDelete={setPendingPolicyDelete}
      />

      <RoleDeleteDialog
        pendingRoleDelete={pendingRoleDelete}
        setPendingRoleDelete={setPendingRoleDelete}
        rowSavingId={rowSavingId}
        onDeleteRole={onDeleteRole}
      />
      <PolicyDeleteDialog
        pendingPolicyDelete={pendingPolicyDelete}
        setPendingPolicyDelete={setPendingPolicyDelete}
        rowSavingId={rowSavingId}
        onDeletePolicy={onDeletePolicy}
      />
    </div>
  );
}
