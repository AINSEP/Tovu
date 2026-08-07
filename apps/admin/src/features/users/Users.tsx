import { Fragment, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { AdminIdentityUser, AdminPolicy, AdminRole } from "../../lib/api";
import { RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { formatGrantLabel, userRowMenuItems } from "./rules";
import { useUsers } from "./hooks/use-users.hooks";

/**
 * @file Admin "Users" screen (SPEC-006 §3 human grant-writing transitions + 0.6.0 CRUD-completion
 * amendment) — markup only.
 *
 * State and API calls live in `hooks/use-users.hooks.ts`; the row-menu logic and the
 * server-error-message overrides live in `rules.ts`. What stays here is what actually renders: the
 * form, the table, and the two dialogs.
 *
 * Mirrors `features/integrations/Integrations.tsx`'s fetch/loading/error/form/table shape.
 * Lists operator users, creates new ones (`CREATE_USER`), and grants roles/
 * policies to an existing user (`ASSIGN_ROLE`/`ATTACH_POLICY`) via an
 * inline expandable "Manage" row. Role/policy *creation* is out of
 * this screen's UI (no `CREATE_ROLE`/`CREATE_POLICY` form here) — the API
 * client exposes `api.createRole`/`api.createPolicy` for the Roles &
 * Permissions screen to reuse.
 *
 * 0.6.0: the same expandable row also carries `UPDATE_USER` (email),
 * `RESET_USER_PASSWORD`, and a quick `DISABLE_PRINCIPAL`/`ENABLE_PRINCIPAL` toggle.
 *
 * Row actions (audit follow-up): all three of the above — Disable/Enable, Manage (opens the
 * expandable row), Reset password — now live behind a single three-dot `RowMenu`, matching
 * `Posts.tsx`/`Pages.tsx`'s row-action shape rather than a row of separate buttons. There is
 * intentionally no Delete item: no server-side route deletes a user principal
 * (`src/server/routes/admin/users/` has create/disable/enable/update/reset-password plus
 * role/policy grants, nothing else) — adding one is a product decision outside this pass.
 *
 * Complexity-ceiling pass (2026-08-06): `Users` and its row-map closure both scored over the
 * ceiling (19/16 and 11/11 respectively). Split into four top-level, individually-testable
 * functions below — `NewUserForm`, `UsersTable`/`UserRow`, `UserDisableDialog`,
 * `UserResetPasswordDialog` — following `Taxonomy.tsx`'s existing convention of sibling top-level
 * function components in the same file rather than nested closures (a nested `const` inside
 * `Users` would not have moved any branching out of `Users`' own scope). `Users` itself is now a
 * thin composition of those four; none of them are exported, so no test does anything `Users.tsx`
 * didn't already support — see `__tests__/Users.unit.test.tsx`/`Users.crud.unit.test.tsx` for the
 * full-render tests these were extracted underneath (unchanged), plus new
 * `__tests__/users-components.unit.test.tsx` for direct component-level tests of each piece.
 */
export interface UsersProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useUsersHook?: typeof useUsers;
}

interface NewUserFormProps {
  username: string;
  setUsername: Dispatch<SetStateAction<string>>;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
  saving: boolean;
  formError: string | null;
  onCreate: (e: FormEvent) => Promise<void>;
}

/** The "New user" form — extracted from `Users` verbatim; own scope for `formError`/`saving`. */
function NewUserForm({ username, setUsername, email, setEmail, password, setPassword, saving, formError, onCreate }: NewUserFormProps) {
  return (
    <form onSubmit={onCreate} className="notice integrations-form">
      {formError ? <span className="save-error">{formError}</span> : null}
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label>
        Email (optional)
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={1}
        />
      </label>
      <button type="submit" disabled={saving}>
        {saving ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}

interface UserManagePanelProps {
  principalId: string;
  roles: AdminRole[];
  policies: AdminPolicy[];
  grantError: string | null;
  editEmail: string;
  setEditEmail: Dispatch<SetStateAction<string>>;
  emailSaving: boolean;
  onSaveEmail: (principalId: string) => Promise<void>;
  pendingRoleId: string;
  setPendingRoleId: Dispatch<SetStateAction<string>>;
  grantSaving: boolean;
  onAssignRole: (principalId: string) => Promise<void>;
  pendingPolicyId: string;
  setPendingPolicyId: Dispatch<SetStateAction<string>>;
  onAttachPolicy: (principalId: string) => Promise<void>;
}

/** The expanded "Manage" row's contents (email edit, role/policy grant forms) — extracted out of
 *  `UserRow` verbatim. `UserRow` on its own was still over the complexity ceiling after the first
 *  extraction pass because this panel's five own branches (`grantError`, `emailSaving`, two
 *  disabled-guard `||`s, two `grantSaving` labels) were still counted in its scope; splitting the
 *  panel into its own function is what actually moves them out, per this pass's "extract to a
 *  top-level function, not a nested closure" rule. */
function UserManagePanel({
  principalId,
  roles,
  policies,
  grantError,
  editEmail,
  setEditEmail,
  emailSaving,
  onSaveEmail,
  pendingRoleId,
  setPendingRoleId,
  grantSaving,
  onAssignRole,
  pendingPolicyId,
  setPendingPolicyId,
  onAttachPolicy,
}: UserManagePanelProps) {
  return (
    <tr>
      <td colSpan={6}>
        <div className="notice integrations-form">
          {grantError ? <span className="save-error">{grantError}</span> : null}
          <label>
            Email
            <span className="editor-actions">
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="(none)"
              />
              <button type="button" disabled={emailSaving} onClick={() => onSaveEmail(principalId)}>
                {emailSaving ? "Saving…" : "Save email"}
              </button>
            </span>
          </label>
          <label>
            Assign role
            <span className="editor-actions">
              <select value={pendingRoleId} onChange={(e) => setPendingRoleId(e.target.value)}>
                <option value="">Select a role…</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                    {role.isBuiltin ? " (built-in)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pendingRoleId || grantSaving}
                onClick={() => onAssignRole(principalId)}
              >
                {grantSaving ? "Saving…" : "Assign"}
              </button>
            </span>
          </label>
          <label>
            Attach policy
            <span className="editor-actions">
              <select value={pendingPolicyId} onChange={(e) => setPendingPolicyId(e.target.value)}>
                <option value="">Select a policy…</option>
                {policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                    {policy.isBuiltin ? " (built-in)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pendingPolicyId || grantSaving}
                onClick={() => onAttachPolicy(principalId)}
              >
                {grantSaving ? "Saving…" : "Attach"}
              </button>
            </span>
          </label>
        </div>
      </td>
    </tr>
  );
}

type UserRowProps = Omit<UserManagePanelProps, "principalId"> & {
  user: AdminIdentityUser;
  roleById: ReadonlyMap<string, AdminRole>;
  policyById: ReadonlyMap<string, AdminPolicy>;
  expandedId: string | null;
  toggleExpanded: (user: AdminIdentityUser) => void;
  toggleSavingId: string | null;
  requestDisable: (user: AdminIdentityUser) => void;
  onToggleStatus: (user: AdminIdentityUser) => Promise<void>;
  openResetPassword: (user: AdminIdentityUser) => void;
};

/** One user's row plus its optional expanded "Manage" row — extracted from `UsersTable`'s
 *  `.map()` body verbatim. `key` lives on the `<UserRow>` element at the call site, not inside
 *  here, since this is no longer the array-mapping callback itself. */
function UserRow({
  user,
  roleById,
  policyById,
  expandedId,
  toggleExpanded,
  toggleSavingId,
  requestDisable,
  onToggleStatus,
  openResetPassword,
  ...managePanelProps
}: UserRowProps) {
  const roleLabel = formatGrantLabel(user.roleIds, roleById);
  const policyLabel = formatGrantLabel(user.policyIds, policyById);
  return (
    <>
      <tr>
        <td>
          {/* Two affordances, one behavior: this and the RowMenu's "Manage" item both
              call `toggleExpanded` directly rather than duplicating its logic. A real
              `<button>`, not `<a href="#">` — this doesn't navigate anywhere, it only
              toggles the panel below, and an anchor with no real target is its own
              accessibility smell. The visible text is the username itself, so the
              accessible name already identifies which user this manages — no need for a
              separate "Manage user ..." label duplicating what's already legible.
              `aria-expanded` mirrors `Members.tsx`'s identical email-toggle-button
              convention for the same shape of control. */}
          <button
            type="button"
            className="link-button"
            onClick={() => toggleExpanded(user)}
            aria-expanded={expandedId === user.principalId}
          >
            {user.username}
          </button>
        </td>
        <td>{user.email ?? <span className="muted-cell">—</span>}</td>
        <td>
          <span className={`status status-${user.status}`}>{user.status}</span>
        </td>
        <td>{roleLabel !== null ? roleLabel : <span className="muted-cell">none</span>}</td>
        <td>{policyLabel !== null ? policyLabel : <span className="muted-cell">none</span>}</td>
        <td>
          {/* Matches Posts.tsx/Pages.tsx's three-dot RowMenu shape — Disable/Enable,
              Manage, and Reset password all live in the menu; there is no standalone
              button left in this column. See `rules.ts`'s `userRowMenuItems` doc comment
              for why "Manage" keeps a static label instead of alternating with "Close". */}
          <RowMenu
            triggerLabel={`Actions for user "${user.username}"`}
            items={userRowMenuItems(user, toggleSavingId === user.principalId, {
              onRequestDisable: requestDisable,
              onEnable: (u) => void onToggleStatus(u),
              onManage: toggleExpanded,
              onResetPassword: openResetPassword,
            })}
          />
        </td>
      </tr>
      {expandedId === user.principalId ? (
        <UserManagePanel principalId={user.principalId} {...managePanelProps} />
      ) : null}
    </>
  );
}

type UsersTableProps = Omit<UserRowProps, "user" | "roleById" | "policyById"> & {
  users: AdminIdentityUser[];
};

/** The users table, or the empty state — extracted from `Users` verbatim. Builds the
 *  role/policy lookup maps once per render rather than once per row. */
function UsersTable({ users, roles, policies, ...rowProps }: UsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>No users yet.</p>
          <p className="page-description">Create your first operator account to get started.</p>
        </div>
      </div>
    );
  }

  const roleById = new Map<string, AdminRole>(roles.map((role) => [role.id, role]));
  const policyById = new Map<string, AdminPolicy>(policies.map((policy) => [policy.id, policy]));

  return (
    <div className="table-scroll">
      <table className="list-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Status</th>
            <th>Roles</th>
            <th>Policies</th>
            <th>More</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <Fragment key={user.principalId}>
              <UserRow user={user} roleById={roleById} policyById={policyById} roles={roles} policies={policies} {...rowProps} />
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface UserDisableDialogProps {
  confirmingDisable: AdminIdentityUser | null;
  setConfirmingDisable: Dispatch<SetStateAction<AdminIdentityUser | null>>;
  toggleSavingId: string | null;
  confirmDisable: () => Promise<void>;
}

/** The Disable confirm dialog — extracted from `Users` verbatim. */
function UserDisableDialog({ confirmingDisable, setConfirmingDisable, toggleSavingId, confirmDisable }: UserDisableDialogProps) {
  return (
    <ConfirmDialog
      open={confirmingDisable !== null}
      title="Disable this user?"
      body={
        confirmingDisable ? (
          <p>
            Disable &quot;{confirmingDisable.username}&quot;? They will not be able to sign in until
            re-enabled.
          </p>
        ) : null
      }
      confirmLabel="Disable"
      tone="warning"
      pending={confirmingDisable !== null && toggleSavingId === confirmingDisable.principalId}
      onConfirm={confirmDisable}
      onCancel={() => setConfirmingDisable(null)}
    />
  );
}

interface UserResetPasswordDialogProps {
  resetPasswordFor: AdminIdentityUser | null;
  setResetPasswordFor: Dispatch<SetStateAction<AdminIdentityUser | null>>;
  newPassword: string;
  setNewPassword: Dispatch<SetStateAction<string>>;
  passwordError: string | null;
  setPasswordError: Dispatch<SetStateAction<string | null>>;
  passwordSaving: boolean;
  confirmResetPassword: () => Promise<void>;
}

/** The reset-password dialog — extracted from `Users` verbatim. */
function UserResetPasswordDialog({
  resetPasswordFor,
  setResetPasswordFor,
  newPassword,
  setNewPassword,
  passwordError,
  setPasswordError,
  passwordSaving,
  confirmResetPassword,
}: UserResetPasswordDialogProps) {
  return (
    <ConfirmDialog
      open={resetPasswordFor !== null}
      title="Reset password?"
      body={
        resetPasswordFor ? (
          <>
            <p>
              Set a new password for &quot;{resetPasswordFor.username}&quot;. Every active session for
              this user will be signed out.
            </p>
            <div className="field">
              <label className="field-label" htmlFor="users-reset-password-input">
                New password
              </label>
              <input
                id="users-reset-password-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {passwordError ? (
              <p className="save-error" role="alert">
                {passwordError}
              </p>
            ) : null}
          </>
        ) : null
      }
      confirmLabel="Reset password"
      tone="warning"
      pending={passwordSaving}
      onConfirm={confirmResetPassword}
      onCancel={() => {
        setResetPasswordFor(null);
        setNewPassword("");
        setPasswordError(null);
      }}
    />
  );
}

interface UsersPageHeaderProps {
  formOpen: boolean;
  setFormOpen: Dispatch<SetStateAction<boolean>>;
}

/** The page title plus the "New user"/"Cancel" toggle button — extracted from `Users` verbatim so
 *  its two `formOpen` ternaries (class, label) count against this function, not `Users`'. */
function UsersPageHeader({ formOpen, setFormOpen }: UsersPageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <p className="page-kicker">People</p>
        <h1 className="page-title">Users</h1>
        <p className="page-description">Operator accounts with access to this admin — assign roles and policies, or disable access.</p>
      </div>
      <div className="page-actions">
        {/* Same toggle button throughout — reads "New user" (the page's one primary action) when
            closed, "Cancel" (a dismiss, not a create) once the form is open, so the tone follows
            the label instead of a second button competing with the form's own "Create user". */}
        <button className={formOpen ? "btn-secondary" : undefined} onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Cancel" : "New user"}
        </button>
      </div>
    </div>
  );
}

interface UsersNoticesProps {
  toggleError: string | null;
  notice: string | null;
}

/** The Disable/Enable-toggle error banner and the reset-password success notice — extracted from
 *  `Users` verbatim. `Users` was still cyc 10 (over the tightened <=9/<=9 bar) with these two
 *  independent ternaries inline; moving them out is the same "extract to a top-level function"
 *  rule the rest of this pass follows. */
function UsersNotices({ toggleError, notice }: UsersNoticesProps) {
  return (
    <>
      {toggleError ? <div className="notice error">{toggleError}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}
    </>
  );
}

export function Users({ useUsersHook = useUsers }: UsersProps = {}) {
  const {
    users,
    roles,
    policies,
    error,

    formOpen,
    setFormOpen,
    username,
    setUsername,
    email,
    setEmail,
    password,
    setPassword,
    saving,
    formError,
    onCreate,

    expandedId,
    toggleExpanded,
    pendingRoleId,
    setPendingRoleId,
    pendingPolicyId,
    setPendingPolicyId,
    grantSaving,
    grantError,
    onAssignRole,
    onAttachPolicy,

    editEmail,
    setEditEmail,
    emailSaving,
    onSaveEmail,

    toggleSavingId,
    toggleError,
    notice,

    confirmingDisable,
    setConfirmingDisable,
    requestDisable,
    confirmDisable,
    onToggleStatus,

    resetPasswordFor,
    setResetPasswordFor,
    newPassword,
    setNewPassword,
    passwordSaving,
    passwordError,
    setPasswordError,
    openResetPassword,
    confirmResetPassword,
  } = useUsersHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!users || !roles || !policies) return <div className="notice">Loading users…</div>;

  return (
    <div className="page">
      <UsersPageHeader formOpen={formOpen} setFormOpen={setFormOpen} />

      {formOpen ? (
        <NewUserForm
          username={username}
          setUsername={setUsername}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          saving={saving}
          formError={formError}
          onCreate={onCreate}
        />
      ) : null}

      <UsersNotices toggleError={toggleError} notice={notice} />

      <UsersTable
        users={users}
        roles={roles}
        policies={policies}
        expandedId={expandedId}
        toggleExpanded={toggleExpanded}
        toggleSavingId={toggleSavingId}
        requestDisable={requestDisable}
        onToggleStatus={onToggleStatus}
        openResetPassword={openResetPassword}
        grantError={grantError}
        editEmail={editEmail}
        setEditEmail={setEditEmail}
        emailSaving={emailSaving}
        onSaveEmail={onSaveEmail}
        pendingRoleId={pendingRoleId}
        setPendingRoleId={setPendingRoleId}
        grantSaving={grantSaving}
        onAssignRole={onAssignRole}
        pendingPolicyId={pendingPolicyId}
        setPendingPolicyId={setPendingPolicyId}
        onAttachPolicy={onAttachPolicy}
      />

      <UserDisableDialog
        confirmingDisable={confirmingDisable}
        setConfirmingDisable={setConfirmingDisable}
        toggleSavingId={toggleSavingId}
        confirmDisable={confirmDisable}
      />
      <UserResetPasswordDialog
        resetPasswordFor={resetPasswordFor}
        setResetPasswordFor={setResetPasswordFor}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        passwordError={passwordError}
        setPasswordError={setPasswordError}
        passwordSaving={passwordSaving}
        confirmResetPassword={confirmResetPassword}
      />
    </div>
  );
}
