import { Fragment, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { AdminIdentityUser, AdminPolicy, AdminRole } from "../../lib/api";
import { RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { formatGrantLabel, userRowMenuItems } from "./rules";
import { useWiredUsers } from "./hooks/use-users.hooks";

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
   * for `useCustomSelect`. Defaulted to the wired hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useUsersHook?: typeof useWiredUsers;
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
  t: (key: string) => string;
}

/** The "New user" form — extracted from `Users` verbatim; own scope for `formError`/`saving`. */
function NewUserForm({ username, setUsername, email, setEmail, password, setPassword, saving, formError, onCreate, t }: NewUserFormProps) {
  return (
    <form onSubmit={onCreate} className="notice integrations-form">
      {formError ? <span className="save-error">{formError}</span> : null}
      <label>
        {t("Username")}
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label>
        {t("Email (optional)")}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        {t("Password")}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={1}
        />
      </label>
      <button type="submit" disabled={saving}>
        {saving ? t("Creating…") : t("Create user")}
      </button>
    </form>
  );
}

/** The subset of `AdminRole`/`AdminPolicy` a grant `<select>` actually renders. Named rather than
 *  taking the full records, so the shared control below cannot come to depend on anything a role has
 *  and a policy does not. */
export interface GrantOption {
  id: string;
  name: string;
  isBuiltin: boolean;
}

/** One "pick something, then grant it to this user" control. Both grants on the Manage panel are
 *  this same shape, which is what lets them share {@link GrantSelect} instead of being two
 *  near-identical blocks whose props had to be threaded separately. */
export interface GrantSelectController {
  options: GrantOption[];
  /** The id currently selected in the `<select>`, or `""` for the placeholder row. */
  pendingId: string;
  setPendingId: Dispatch<SetStateAction<string>>;
  submit: (principalId: string) => Promise<void>;
}

/**
 * Everything the expanded "Manage" panel needs, as one object.
 *
 * Replaces the fifteen loose state/setter/callback props this panel used to take and `UserRow` used
 * to relay through an `Omit<UserManagePanelProps, "principalId">` rest spread. The grouping is by
 * interaction, not by convenience: the email editor and the two grants are three independent
 * controls that happen to share one error line and one in-flight flag, and saying so in the type is
 * what lets a test build a Manage panel without also standing up a row, a table, and a page.
 */
export interface UserManageController {
  /** The one error line the whole panel shares — any of the three writes can set it. */
  error: string | null;
  /** Shared by both grants: the panel issues one grant at a time. */
  saving: boolean;
  email: {
    value: string;
    set: Dispatch<SetStateAction<string>>;
    saving: boolean;
    save: (principalId: string) => Promise<void>;
  };
  roleGrant: GrantSelectController;
  policyGrant: GrantSelectController;
}

interface GrantSelectProps {
  principalId: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  grant: GrantSelectController;
  saving: boolean;
  t: (key: string) => string;
}

/** The select-plus-button both grants render. */
function GrantSelect({ principalId, label, placeholder, submitLabel, grant, saving, t }: GrantSelectProps) {
  return (
    <label>
      {label}
      <span className="editor-actions">
        <select value={grant.pendingId} onChange={(e) => grant.setPendingId(e.target.value)}>
          <option value="">{placeholder}</option>
          {grant.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.isBuiltin ? ` ${t("(built-in)")}` : ""}
            </option>
          ))}
        </select>
        <button type="button" disabled={!grant.pendingId || saving} onClick={() => grant.submit(principalId)}>
          {saving ? t("Saving…") : submitLabel}
        </button>
      </span>
    </label>
  );
}

export interface UserManagePanelProps {
  principalId: string;
  manage: UserManageController;
  t: (key: string) => string;
}

/** The expanded "Manage" row's contents (email edit, role/policy grant forms).
 *
 *  Exported so a test can drive it with a hand-built {@link UserManageController} — the seam only
 *  counts as one if something other than `Users` can supply it. */
export function UserManagePanel({ principalId, manage, t }: UserManagePanelProps) {
  return (
    <tr>
      <td colSpan={6}>
        <div className="notice integrations-form">
          {manage.error ? <span className="save-error">{manage.error}</span> : null}
          <label>
            {t("Email")}
            <span className="editor-actions">
              <input
                type="email"
                value={manage.email.value}
                onChange={(e) => manage.email.set(e.target.value)}
                placeholder={t("(none)")}
              />
              <button
                type="button"
                disabled={manage.email.saving}
                onClick={() => manage.email.save(principalId)}
              >
                {manage.email.saving ? t("Saving…") : t("Save email")}
              </button>
            </span>
          </label>
          <GrantSelect
            principalId={principalId}
            label={t("Assign role")}
            placeholder={t("Select a role…")}
            submitLabel={t("Assign")}
            grant={manage.roleGrant}
            saving={manage.saving}
            t={t}
          />
          <GrantSelect
            principalId={principalId}
            label={t("Attach policy")}
            placeholder={t("Select a policy…")}
            submitLabel={t("Attach")}
            grant={manage.policyGrant}
            saving={manage.saving}
            t={t}
          />
        </div>
      </td>
    </tr>
  );
}

/** A user row's own affordances — expand/collapse and the three menu actions. Distinct from
 *  {@link UserManageController}, which describes what the expanded panel does once it is open. */
export interface UserRowActionsController {
  expandedId: string | null;
  toggleExpanded: (user: AdminIdentityUser) => void;
  /** Which row has a status write in flight — drives that row's disabled menu item only. */
  savingId: string | null;
  requestDisable: (user: AdminIdentityUser) => void;
  toggleStatus: (user: AdminIdentityUser) => Promise<void>;
  openResetPassword: (user: AdminIdentityUser) => void;
}

export interface UserRowProps {
  user: AdminIdentityUser;
  roleById: ReadonlyMap<string, AdminRole>;
  policyById: ReadonlyMap<string, AdminPolicy>;
  actions: UserRowActionsController;
  manage: UserManageController;
  t: (key: string) => string;
  locale: string;
}

/** One user's row plus its optional expanded "Manage" row. `key` lives on the `<UserRow>` element at
 *  the call site, not inside here, since this is no longer the array-mapping callback itself. */
function UserRow({ user, roleById, policyById, actions, manage, t, locale }: UserRowProps) {
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
            onClick={() => actions.toggleExpanded(user)}
            aria-expanded={actions.expandedId === user.principalId}
          >
            {user.username}
          </button>
        </td>
        <td>{user.email ?? <span className="muted-cell">—</span>}</td>
        <td>
          <span className={`status status-${user.status}`}>{user.status}</span>
        </td>
        <td>{roleLabel !== null ? roleLabel : <span className="muted-cell">{t("none")}</span>}</td>
        <td>{policyLabel !== null ? policyLabel : <span className="muted-cell">{t("none")}</span>}</td>
        <td>
          {/* Matches Posts.tsx/Pages.tsx's three-dot RowMenu shape — Disable/Enable,
              Manage, and Reset password all live in the menu; there is no standalone
              button left in this column. See `rules.ts`'s `userRowMenuItems` doc comment
              for why "Manage" keeps a static label instead of alternating with "Close". */}
          <RowMenu
            triggerLabel={`${t("Actions for user")} "${user.username}"`}
            items={userRowMenuItems(
              user,
              actions.savingId === user.principalId,
              {
                onRequestDisable: actions.requestDisable,
                onEnable: (u) => void actions.toggleStatus(u),
                onManage: actions.toggleExpanded,
                onResetPassword: actions.openResetPassword,
              },
              locale,
            )}
          />
        </td>
      </tr>
      {actions.expandedId === user.principalId ? (
        <UserManagePanel principalId={user.principalId} manage={manage} t={t} />
      ) : null}
    </>
  );
}

export interface UsersTableProps {
  users: AdminIdentityUser[];
  /** The full records, for the Roles/Policies label columns. The grant selects get their own
   *  `options` through `manage`, so neither consumer has to reach into the other's props. */
  roles: AdminRole[];
  policies: AdminPolicy[];
  actions: UserRowActionsController;
  manage: UserManageController;
  t: (key: string) => string;
  locale: string;
}

/** The users table, or the empty state. Builds the role/policy lookup maps once per render rather
 *  than once per row. */
function UsersTable({ users, roles, policies, actions, manage, t, locale }: UsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t("No users yet.")}</p>
          <p className="page-description">{t("Create your first operator account to get started.")}</p>
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
            <th>{t("Username")}</th>
            <th>{t("Email")}</th>
            <th>{t("Status")}</th>
            <th>{t("Roles")}</th>
            <th>{t("Policies")}</th>
            <th>{t("More")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <Fragment key={user.principalId}>
              <UserRow
                user={user}
                roleById={roleById}
                policyById={policyById}
                actions={actions}
                manage={manage}
                t={t}
                locale={locale}
              />
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
  t: (key: string) => string;
}

/** The Disable confirm dialog — extracted from `Users` verbatim. */
function UserDisableDialog({ confirmingDisable, setConfirmingDisable, toggleSavingId, confirmDisable, t }: UserDisableDialogProps) {
  return (
    <ConfirmDialog
      open={confirmingDisable !== null}
      title={t("Disable this user?")}
      body={
        confirmingDisable ? (
          <p>
            {t("Disable")} &quot;{confirmingDisable.username}&quot;? {t("They will not be able to sign in until re-enabled.")}
          </p>
        ) : null
      }
      confirmLabel={t("Disable")}
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
  t: (key: string) => string;
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
  t,
}: UserResetPasswordDialogProps) {
  return (
    <ConfirmDialog
      open={resetPasswordFor !== null}
      title={t("Reset password?")}
      body={
        resetPasswordFor ? (
          <>
            <p>
              {t("Set a new password for")} &quot;{resetPasswordFor.username}&quot;.{" "}
              {t("Every active session for this user will be signed out.")}
            </p>
            <div className="field">
              <label className="field-label" htmlFor="users-reset-password-input">
                {t("New password")}
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
      confirmLabel={t("Reset password")}
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
  t: (key: string) => string;
}

/** The page title plus the "New user"/"Cancel" toggle button — extracted from `Users` verbatim so
 *  its two `formOpen` ternaries (class, label) count against this function, not `Users`'. */
function UsersPageHeader({ formOpen, setFormOpen, t }: UsersPageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <p className="page-kicker">{t("People")}</p>
        <h1 className="page-title">{t("Users")}</h1>
        <p className="page-description">
          {t("Operator accounts with access to this admin — assign roles and policies, or disable access.")}
        </p>
      </div>
      <div className="page-actions">
        {/* Same toggle button throughout — reads "New user" (the page's one primary action) when
            closed, "Cancel" (a dismiss, not a create) once the form is open, so the tone follows
            the label instead of a second button competing with the form's own "Create user". */}
        <button className={formOpen ? "btn-secondary" : undefined} onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? t("Cancel") : t("New user")}
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

export function Users({ useUsersHook = useWiredUsers }: UsersProps = {}) {
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

    t,
    locale,
  } = useUsersHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!users || !roles || !policies) return <div className="notice">{t("Loading users…")}</div>;

  return (
    <div className="page">
      <UsersPageHeader formOpen={formOpen} setFormOpen={setFormOpen} t={t} />

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
          t={t}
        />
      ) : null}

      <UsersNotices toggleError={toggleError} notice={notice} />

      <UsersTable
        users={users}
        roles={roles}
        policies={policies}
        actions={{
          expandedId,
          toggleExpanded,
          savingId: toggleSavingId,
          requestDisable,
          toggleStatus: onToggleStatus,
          openResetPassword,
        }}
        manage={{
          error: grantError,
          saving: grantSaving,
          email: { value: editEmail, set: setEditEmail, saving: emailSaving, save: onSaveEmail },
          roleGrant: {
            options: roles,
            pendingId: pendingRoleId,
            setPendingId: setPendingRoleId,
            submit: onAssignRole,
          },
          policyGrant: {
            options: policies,
            pendingId: pendingPolicyId,
            setPendingId: setPendingPolicyId,
            submit: onAttachPolicy,
          },
        }}
        t={t}
        locale={locale}
      />

      <UserDisableDialog
        confirmingDisable={confirmingDisable}
        setConfirmingDisable={setConfirmingDisable}
        toggleSavingId={toggleSavingId}
        confirmDisable={confirmDisable}
        t={t}
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
        t={t}
      />
    </div>
  );
}
