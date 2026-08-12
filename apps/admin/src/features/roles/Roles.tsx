import { Fragment, type FormEvent } from "react";
import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import type { AdminPolicy, AdminRole } from "../../lib/api";

import { roleMenuItems, policyMenuItems } from "./rules";
import { useRoles } from "./hooks/use-roles.hooks";
import { rolesDescriptionParts, roleDeleteBodyParts, policyDeleteBodyParts } from "./roles-i18n";

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

/**
 * The create-a-role form, as one thing the section can be handed.
 *
 * Replaces the five loose `roleName`/`setRoleName`/`roleSaving`/`roleError`/`onCreateRole` props the
 * section used to take. They were never independent — every one of them is meaningless without the
 * other four — so naming the group is what lets a caller (or a test) supply a form rather than
 * assemble one out of parts.
 */
export interface RoleCreateFormController {
  name: string;
  setName: (name: string) => void;
  saving: boolean;
  error: string | null;
  submit: (e: FormEvent) => Promise<void>;
}

/** A role row's own affordances: rename in place, or ask for deletion. Grouped for the same reason
 *  as {@link RoleCreateFormController} — `editingId` and `draftName` describe one interaction. */
export interface RoleRowController {
  /** Which role is mid-rename, or `null`. */
  editingId: string | null;
  setEditingId: (roleId: string | null) => void;
  draftName: string;
  setDraftName: (name: string) => void;
  startRename: (role: AdminRole) => void;
  saveRename: (roleId: string) => Promise<void>;
  /** Which row has a write in flight — drives the per-row Saving… label, not a page-wide spinner. */
  savingId: string | null;
  requestDelete: (role: AdminRole | null) => void;
}

export interface RolesSectionProps {
  roles: AdminRole[];
  create: RoleCreateFormController;
  row: RoleRowController;
  t: (key: string) => string;
  locale: string;
}

/** "Roles" heading, create-role form, and the roles `DataTable`.
 *  `DataTable`'s own `cell` callbacks are already separately-scoped closures under ESLint (each
 *  gets its own report), so this split is about the create-form's own branches, not the table.
 *
 *  Exported so a test can render it against hand-built controllers — the seam only counts as one if
 *  something other than `Roles` can drive it. */
export function RolesSection({ roles, create, row, t, locale }: RolesSectionProps) {
  return (
    <>
      <h2>{t("Roles")}</h2>
      <form onSubmit={create.submit} className="notice integrations-form">
        {create.error ? <span className="save-error">{create.error}</span> : null}
        <label>
          {t("Role name")}
          <input value={create.name} onChange={(e) => create.setName(e.target.value)} required />
        </label>
        <button type="submit" disabled={create.saving || !create.name}>
          {create.saving ? t("Creating…") : t("Create role")}
        </button>
      </form>
      <DataTable
        rows={roles}
        rowKey={(role) => role.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No roles yet.")}</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "name",
            header: t("Name"),
            cell: (role) =>
              row.editingId === role.id ? (
                <input value={row.draftName} onChange={(e) => row.setDraftName(e.target.value)} />
              ) : (
                role.name
              ),
          },
          { key: "type", header: t("Type"), cell: (role) => (role.isBuiltin ? t("Built-in") : t("Custom")) },
          {
            key: "actions",
            header: t("More"),
            cell: (role) =>
              role.isBuiltin ? (
                <span className="muted-cell">—</span>
              ) : row.editingId === role.id ? (
                <span className="editor-actions">
                  <button type="button" disabled={row.savingId === role.id} onClick={() => row.saveRename(role.id)}>
                    {row.savingId === role.id ? t("Saving…") : t("Save")}
                  </button>
                  <button type="button" onClick={() => row.setEditingId(null)}>
                    {t("Cancel")}
                  </button>
                </span>
              ) : (
                <RowMenu
                  triggerLabel={`${t("Actions for role")} "${role.name}"`}
                  items={roleMenuItems(role, { onRename: row.startRename, onDelete: row.requestDelete }, locale)}
                />
              ),
          },
        ]}
      />
    </>
  );
}

/** A policy row's own affordances — {@link RoleRowController}'s counterpart, with the extra
 *  description field a policy carries. */
export interface PolicyRowController {
  /** Which policy is mid-rename, or `null`. */
  editingId: string | null;
  setEditingId: (policyId: string | null) => void;
  draftName: string;
  setDraftName: (name: string) => void;
  draftDescription: string;
  setDraftDescription: (description: string) => void;
  startRename: (policy: AdminPolicy) => void;
  saveRename: (policyId: string) => Promise<void>;
  savingId: string | null;
  requestDelete: (policy: AdminPolicy | null) => void;
}

/** The inline "Add permission" editor: which row it is open on, its two fields, and its write.
 *  Separate from {@link PolicyRowController} because it is a different interaction on the same row —
 *  a row can be mid-rename or mid-permission, and neither controller's state means anything to the
 *  other. */
export interface PolicyPermissionController {
  /** The policy whose permission form is open, or `null` when none is. */
  openForPolicyId: string | null;
  permission: string;
  setPermission: (permission: string) => void;
  resourceType: string;
  setResourceType: (resourceType: string) => void;
  toggleForm: (policyId: string) => void;
  write: (policyId: string) => Promise<void>;
}

export interface PolicyRowProps {
  policy: AdminPolicy;
  row: PolicyRowController;
  permission: PolicyPermissionController;
  t: (key: string) => string;
  locale: string;
}

interface PolicyRowActionsProps {
  policy: AdminPolicy;
  row: PolicyRowController;
  permission: PolicyPermissionController;
  t: (key: string) => string;
  locale: string;
}

/** The "More" cell's three-way branch (built-in/frozen -> dash, mid-rename -> Save/Cancel,
 *  at-rest -> `RowMenu`) — extracted out of `PolicyRow`, which was still 13/13 after the first
 *  split pass because this cell's own branches (the `||` guard plus its two nested ternaries) were
 *  still counted in `PolicyRow`'s scope. Same "the panel, not the row, was the actual size" lesson
 *  `Users.tsx`'s `UserRow` -> `UserManagePanel` split already applied. */
function PolicyRowActions({ policy, row, permission, t, locale }: PolicyRowActionsProps) {
  if (policy.isBuiltin || policy.isFrozen) return <span className="muted-cell">—</span>;
  if (row.editingId === policy.id) {
    return (
      <span className="editor-actions">
        <button type="button" disabled={row.savingId === policy.id} onClick={() => row.saveRename(policy.id)}>
          {row.savingId === policy.id ? t("Saving…") : t("Save")}
        </button>
        <button type="button" onClick={() => row.setEditingId(null)}>
          {t("Cancel")}
        </button>
      </span>
    );
  }
  return (
    <RowMenu
      triggerLabel={`${t("Actions for policy")} "${policy.name}"`}
      items={policyMenuItems(
        policy,
        permission.openForPolicyId,
        {
          onRename: row.startRename,
          onTogglePermissionForm: permission.toggleForm,
          onDelete: row.requestDelete,
        },
        locale,
      )}
    />
  );
}

interface PolicyPermissionFormProps {
  policyId: string;
  savingId: string | null;
  permission: PolicyPermissionController;
  t: (key: string) => string;
}

/** The inline "Add permission" row — extracted out of `PolicyRow` verbatim, for the same reason as
 *  `PolicyRowActions` above. */
function PolicyPermissionForm({ policyId, savingId, permission, t }: PolicyPermissionFormProps) {
  return (
    <tr>
      <td colSpan={4}>
        <div className="notice integrations-form">
          <label>
            {t("Permission")}
            <span className="editor-actions">
              <input
                value={permission.permission}
                onChange={(e) => permission.setPermission(e.target.value)}
                placeholder="e.g. content.write"
              />
              <input
                value={permission.resourceType}
                onChange={(e) => permission.setResourceType(e.target.value)}
                placeholder={t("resource type (optional)")}
              />
              <button
                type="button"
                disabled={!permission.permission || savingId === policyId}
                onClick={() => permission.write(policyId)}
              >
                {savingId === policyId ? t("Saving…") : t("Add")}
              </button>
            </span>
          </label>
        </div>
      </td>
    </tr>
  );
}

/** One policy's row plus its optional inline "Add permission" row. `key` lives on the `<PolicyRow>`
 *  element at the call site, same convention `Users.tsx`'s `UserRow` uses.
 *
 *  Exported for the same reason as {@link RolesSection}. */
export function PolicyRow({ policy, row, permission, t, locale }: PolicyRowProps) {
  const renaming = row.editingId === policy.id;
  return (
    <>
      <tr>
        <td>
          {renaming ? (
            <input value={row.draftName} onChange={(e) => row.setDraftName(e.target.value)} />
          ) : (
            policy.name
          )}
        </td>
        <td>
          {renaming ? (
            <input value={row.draftDescription} onChange={(e) => row.setDraftDescription(e.target.value)} />
          ) : (
            policy.description ?? <span className="muted-cell">—</span>
          )}
        </td>
        <td>
          {policy.isBuiltin ? t("Built-in") : t("Custom")}
          {policy.isFrozen ? ` ${t("(frozen)")}` : ""}
        </td>
        <td>
          <PolicyRowActions policy={policy} row={row} permission={permission} t={t} locale={locale} />
        </td>
      </tr>
      {permission.openForPolicyId === policy.id ? (
        <PolicyPermissionForm policyId={policy.id} savingId={row.savingId} permission={permission} t={t} />
      ) : null}
    </>
  );
}

/** The create-a-policy form — {@link RoleCreateFormController} plus the description field. */
export interface PolicyCreateFormController {
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  saving: boolean;
  error: string | null;
  submit: (e: FormEvent) => Promise<void>;
}

export interface PoliciesSectionProps {
  policies: AdminPolicy[];
  create: PolicyCreateFormController;
  row: PolicyRowController;
  permission: PolicyPermissionController;
  t: (key: string) => string;
  locale: string;
}

/** "Policies" heading, create-policy form, and the policies table (or its empty state).
 *
 *  The row controllers pass straight through rather than being spread from an `Omit<PolicyRowProps,
 *  "policy">` rest object, which is what the old flat prop bag forced: with the props named, this
 *  section no longer has to restate the row's entire surface in its own type just to relay it. */
export function PoliciesSection({ policies, create, row, permission, t, locale }: PoliciesSectionProps) {
  return (
    <>
      <h2>{t("Policies")}</h2>
      <form onSubmit={create.submit} className="notice integrations-form">
        {create.error ? <span className="save-error">{create.error}</span> : null}
        <label>
          {t("Policy name")}
          <input value={create.name} onChange={(e) => create.setName(e.target.value)} required />
        </label>
        <label>
          {t("Description (optional)")}
          <input value={create.description} onChange={(e) => create.setDescription(e.target.value)} />
        </label>
        <button type="submit" disabled={create.saving || !create.name}>
          {create.saving ? t("Creating…") : t("Create policy")}
        </button>
      </form>
      {policies.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>{t("No policies yet.")}</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Description")}</th>
                <th>{t("Type")}</th>
                <th>{t("More")}</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <Fragment key={policy.id}>
                  <PolicyRow policy={policy} row={row} permission={permission} t={t} locale={locale} />
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
  t: (key: string) => string;
  locale: string;
}

/** The role-delete confirm dialog — extracted from `Roles` verbatim. */
function RoleDeleteDialog({ pendingRoleDelete, setPendingRoleDelete, rowSavingId, onDeleteRole, t, locale }: RoleDeleteDialogProps) {
  const { prefix, suffix } = roleDeleteBodyParts(locale);
  return (
    <ConfirmDialog
      open={pendingRoleDelete !== null}
      title={t("Delete role?")}
      body={
        pendingRoleDelete ? (
          <p>
            {prefix}
            {pendingRoleDelete.name}
            {suffix}
          </p>
        ) : null
      }
      confirmLabel={t("Delete")}
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
  t: (key: string) => string;
  locale: string;
}

/** The policy-delete confirm dialog — extracted from `Roles` verbatim. */
function PolicyDeleteDialog({ pendingPolicyDelete, setPendingPolicyDelete, rowSavingId, onDeletePolicy, t, locale }: PolicyDeleteDialogProps) {
  const { prefix, suffix } = policyDeleteBodyParts(locale);
  return (
    <ConfirmDialog
      open={pendingPolicyDelete !== null}
      title={t("Delete policy?")}
      body={
        pendingPolicyDelete ? (
          <p>
            {prefix}
            {pendingPolicyDelete.name}
            {suffix}
          </p>
        ) : null
      }
      confirmLabel={t("Delete")}
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

    t,
    locale,
  } = useRolesHook();
  const { prefix: descriptionPrefix, linkLabel: descriptionLinkLabel, suffix: descriptionSuffix } =
    rolesDescriptionParts(locale);

  if (error) return <div className="notice error">{error}</div>;
  if (!roles || !policies) return <div className="notice">{t("Loading roles & permissions…")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("People")}</p>
          <h1 className="page-title">{t("Roles & Permissions")}</h1>
          <p className="page-description">
            {descriptionPrefix}
            <a href="/admin/users">{descriptionLinkLabel}</a>
            {descriptionSuffix}
          </p>
        </div>
      </div>
      {rowError ? <div className="notice error">{rowError}</div> : null}

      <RolesSection
        roles={roles}
        create={{
          name: roleName,
          setName: setRoleName,
          saving: roleSaving,
          error: roleError,
          submit: onCreateRole,
        }}
        row={{
          editingId: editingRoleId,
          setEditingId: setEditingRoleId,
          draftName: editingRoleName,
          setDraftName: setEditingRoleName,
          startRename: startEditRole,
          saveRename: onSaveRole,
          savingId: rowSavingId,
          requestDelete: setPendingRoleDelete,
        }}
        t={t}
        locale={locale}
      />

      <PoliciesSection
        policies={policies}
        create={{
          name: policyName,
          setName: setPolicyName,
          description: policyDescription,
          setDescription: setPolicyDescription,
          saving: policySaving,
          error: policyError,
          submit: onCreatePolicy,
        }}
        row={{
          editingId: editingPolicyId,
          setEditingId: setEditingPolicyId,
          draftName: editingPolicyName,
          setDraftName: setEditingPolicyName,
          draftDescription: editingPolicyDescription,
          setDraftDescription: setEditingPolicyDescription,
          startRename: startEditPolicy,
          saveRename: onSavePolicy,
          savingId: rowSavingId,
          requestDelete: setPendingPolicyDelete,
        }}
        permission={{
          openForPolicyId: permissionPolicyId,
          permission: permissionInput,
          setPermission: setPermissionInput,
          resourceType: resourceTypeInput,
          setResourceType: setResourceTypeInput,
          toggleForm: togglePermissionForm,
          write: onWritePermission,
        }}
        t={t}
        locale={locale}
      />

      <RoleDeleteDialog
        pendingRoleDelete={pendingRoleDelete}
        setPendingRoleDelete={setPendingRoleDelete}
        rowSavingId={rowSavingId}
        t={t}
        locale={locale}
        onDeleteRole={onDeleteRole}
      />
      <PolicyDeleteDialog
        pendingPolicyDelete={pendingPolicyDelete}
        setPendingPolicyDelete={setPendingPolicyDelete}
        rowSavingId={rowSavingId}
        t={t}
        locale={locale}
        onDeletePolicy={onDeletePolicy}
      />
    </div>
  );
}
