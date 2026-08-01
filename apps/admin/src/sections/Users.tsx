import { Fragment, useEffect, useState } from "react";
import { ApiError, api, describeApiError as describeApiErrorDefault, type AdminIdentityUser, type AdminPolicy, type AdminRole } from "../lib/api";
import { RowMenu, type RowMenuItem } from "../components/RowMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";

/**
 * @file Admin "Users" screen (SPEC-006 §3 human grant-writing transitions + 0.6.0 CRUD-completion
 * amendment).
 *
 * Mirrors `sections/Integrations.tsx`'s fetch/loading/error/form/table shape.
 * Lists operator users, creates new ones (`CREATE_USER`), and grants roles/
 * policies to an existing user (`ASSIGN_ROLE`/`ATTACH_POLICY`) via an
 * inline expandable "Manage" row. Role/policy *creation* is out of
 * this screen's UI (no `CREATE_ROLE`/`CREATE_POLICY` form here) — the API
 * client exposes `api.createRole`/`api.createPolicy` for the Roles &
 * Permissions screen to reuse.
 *
 * 0.6.0: the same expandable row also carries `UPDATE_USER` (email),
 * `RESET_USER_PASSWORD`, and a quick `DISABLE_PRINCIPAL`/`ENABLE_PRINCIPAL` toggle in the
 * Actions column (a common enough single action to not require opening the panel).
 */

/** Server error `code` -> a plain-language prefix (SPEC-006 errors.spec.md §2), layered on the
 *  shared default (`lib/api.ts`'s `describeApiError`) — this screen's `RESOURCE_CONFLICT` means
 *  "username already in use", a different meaning than `Roles.tsx`'s "still referenced" or
 *  `Workspace.tsx`'s "slug already taken" for the same code (audit cross-cutting finding #2 —
 *  deliberately not unified into one table). */
function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "GRANT_EXCEEDS_ISSUER") return "You cannot grant a permission you do not hold.";
    if (e.code === "FORBIDDEN") return "You do not have permission to do that.";
    if (e.code === "RESOURCE_CONFLICT") return "That username is already in use.";
    if (e.code === "OWNER_REQUIRED") return "The workspace must keep at least one active owner.";
    if (e.code === "VALIDATION_ERROR") return e.message || "Please correct the highlighted fields.";
  }
  return describeApiErrorDefault(e, fallback);
}

export function Users() {
  const [users, setUsers] = useState<AdminIdentityUser[] | null>(null);
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [policies, setPolicies] = useState<AdminPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState("");
  const [pendingPolicyId, setPendingPolicyId] = useState("");
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const [editEmail, setEditEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [toggleSavingId, setToggleSavingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Disable now confirms via a `RowMenu` item -> `ConfirmDialog` modal (replacing the in-place
  // two-click `ConfirmButton`, which has no menu-item equivalent — same migration Posts.tsx/
  // Redirects.tsx already made). `null` when the dialog is closed.
  const [confirmingDisable, setConfirmingDisable] = useState<AdminIdentityUser | null>(null);

  // Reset password moved out of the expanded "Manage" panel into its own `RowMenu` item, which
  // opens this dialog (it needs a text field, so it's a `ConfirmDialog` with an input in the body,
  // not a plain confirm). Kept open on failure (unlike the delete-style dialogs above, which close
  // either way) so a failed attempt doesn't discard the password the operator just typed.
  const [resetPasswordFor, setResetPasswordFor] = useState<AdminIdentityUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function reload(): Promise<void> {
    return Promise.all([api.listUsers(), api.listRoles(), api.listPolicies()])
      .then(([u, r, p]) => {
        setUsers(u.users);
        setRoles(r.roles);
        setPolicies(p.policies);
      })
      .catch((e) => setError(describeApiError(e, "failed to load users")));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.createUser({ username, password }, { email: email || undefined });
      setUsername("");
      setEmail("");
      setPassword("");
      setFormOpen(false);
      await reload();
    } catch (e) {
      setFormError(describeApiError(e, "failed to create user"));
    } finally {
      setSaving(false);
    }
  }

  function toggleExpanded(user: AdminIdentityUser) {
    setGrantError(null);
    setPendingRoleId("");
    setPendingPolicyId("");
    setEditEmail(user.email ?? "");
    setExpandedId((current) => (current === user.principalId ? null : user.principalId));
  }

  async function onAssignRole(principalId: string) {
    if (!pendingRoleId) return;
    setGrantSaving(true);
    setGrantError(null);
    try {
      await api.assignRole({ principalId, roleId: pendingRoleId });
      setPendingRoleId("");
      await reload();
    } catch (e) {
      setGrantError(describeApiError(e, "failed to assign role"));
    } finally {
      setGrantSaving(false);
    }
  }

  async function onAttachPolicy(principalId: string) {
    if (!pendingPolicyId) return;
    setGrantSaving(true);
    setGrantError(null);
    try {
      await api.attachPolicy({ principalId, policyId: pendingPolicyId });
      setPendingPolicyId("");
      await reload();
    } catch (e) {
      setGrantError(describeApiError(e, "failed to attach policy"));
    } finally {
      setGrantSaving(false);
    }
  }

  async function onSaveEmail(principalId: string) {
    setEmailSaving(true);
    setGrantError(null);
    try {
      await api.updateUser({ principalId }, { email: editEmail });
      await reload();
    } catch (e) {
      setGrantError(describeApiError(e, "failed to update email"));
    } finally {
      setEmailSaving(false);
    }
  }

  /** Opens the reset-password dialog for `user` — the `RowMenu` item's `onSelect`. Guards against
   *  opening a second one while a toggle or a previous reset is still in flight, same discipline
   *  Redirects.tsx uses for its own `RowMenu` items (no per-item `disabled` on `RowMenu` itself). */
  function openResetPassword(user: AdminIdentityUser) {
    if (toggleSavingId || passwordSaving) return;
    setPasswordError(null);
    setNewPassword("");
    setResetPasswordFor(user);
  }

  async function confirmResetPassword() {
    if (!resetPasswordFor || !newPassword) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await api.resetUserPassword({ principalId: resetPasswordFor.principalId, password: newPassword });
      setNotice(`Password reset for "${resetPasswordFor.username}" — every active session for this user was revoked.`);
      setResetPasswordFor(null);
      setNewPassword("");
    } catch (e) {
      // Dialog stays open on failure (unlike the Disable/Delete-style dialogs elsewhere in this
      // app, which close either way) — closing would discard the password the operator just typed
      // for no reason; there's nothing sensitive left on screen once they retry or cancel.
      setPasswordError(describeApiError(e, "failed to reset password"));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function onToggleStatus(user: AdminIdentityUser) {
    setToggleSavingId(user.principalId);
    setToggleError(null);
    try {
      if (user.status === "active") {
        await api.disableUser(user.principalId);
      } else {
        await api.enableUser(user.principalId);
      }
      await reload();
    } catch (e) {
      setToggleError(describeApiError(e, "failed to change status"));
    } finally {
      setToggleSavingId(null);
    }
  }

  /** Confirms the Disable that `RowMenu`'s "Disable" item asked about. Closes the dialog either
   *  way (matching Posts.tsx/Redirects.tsx's own Disable/Delete `ConfirmDialog` convention) — a
   *  failure surfaces via `toggleError` above the table, not by leaving the modal open. */
  async function confirmDisable() {
    if (!confirmingDisable) return;
    await onToggleStatus(confirmingDisable);
    setConfirmingDisable(null);
  }

  /** `RowMenu` items for one user row. Disable/Enable share a single "toggle" item (label follows
   *  status, same shape as `Redirects.tsx`'s own toggle item) — Disable confirms via the modal
   *  above; Enable fires immediately, matching this screen's existing behavior (Enable was never
   *  confirm-gated). Reset password moved here from the expanded "Manage" panel below. */
  function rowMenuItems(user: AdminIdentityUser): RowMenuItem[] {
    return [
      {
        key: "toggle",
        label: user.status === "active" ? "Disable" : "Enable",
        tone: user.status === "active" ? "warning" : "default",
        onSelect: () => {
          if (toggleSavingId) return;
          if (user.status === "active") {
            setToggleError(null);
            setConfirmingDisable(user);
          } else {
            void onToggleStatus(user);
          }
        },
      },
      {
        key: "reset-password",
        label: "Reset password",
        tone: "warning",
        onSelect: () => openResetPassword(user),
      },
    ];
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!users || !roles || !policies) return <div className="notice">Loading users…</div>;

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const policyById = new Map(policies.map((policy) => [policy.id, policy]));

  return (
    <div className="page">
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

      {formOpen ? (
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
      ) : null}

      {toggleError ? <div className="notice error">{toggleError}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      {users.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No users yet.</p>
            <p className="page-description">Create your first operator account to get started.</p>
          </div>
        </div>
      ) : (
      <div className="table-scroll">
      <table className="list-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Status</th>
            <th>Roles</th>
            <th>Policies</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <Fragment key={user.principalId}>
              <tr>
                <td>{user.username}</td>
                <td>{user.email ?? <span className="muted-cell">—</span>}</td>
                <td>
                  <span className={`status status-${user.status}`}>{user.status}</span>
                </td>
                <td>
                  {user.roleIds.length > 0
                    ? user.roleIds.map((id) => roleById.get(id)?.name ?? id).join(", ")
                    : <span className="muted-cell">none</span>}
                </td>
                <td>
                  {user.policyIds.length > 0
                    ? user.policyIds.map((id) => policyById.get(id)?.name ?? id).join(", ")
                    : <span className="muted-cell">none</span>}
                </td>
                <td>
                  {/* "Manage" stays a visible button — it toggles the panel below, it doesn't
                      perform an action, so it isn't a `RowMenu` candidate. Disable/Enable and
                      Reset password (previously inside that panel) moved into the menu. */}
                  <span className="editor-actions">
                    <RowMenu triggerLabel={`Actions for user "${user.username}"`} items={rowMenuItems(user)} />
                    <button onClick={() => toggleExpanded(user)}>
                      {expandedId === user.principalId ? "Close" : "Manage"}
                    </button>
                  </span>
                </td>
              </tr>
              {expandedId === user.principalId ? (
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
                          <button type="button" disabled={emailSaving} onClick={() => onSaveEmail(user.principalId)}>
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
                            onClick={() => onAssignRole(user.principalId)}
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
                            onClick={() => onAttachPolicy(user.principalId)}
                          >
                            {grantSaving ? "Saving…" : "Attach"}
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
    </div>
  );
}
