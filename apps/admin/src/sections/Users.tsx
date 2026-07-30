import { Fragment, useEffect, useState } from "react";
import { ApiError, api, type AdminIdentityUser, type AdminPolicy, type AdminRole } from "../lib/api";

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

/** Server error `code` -> a plain-language prefix (SPEC-006 errors.spec.md §2). */
function describeApiError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : fallback;
  if (e.code === "GRANT_EXCEEDS_ISSUER") return "You cannot grant a permission you do not hold.";
  if (e.code === "FORBIDDEN") return "You do not have permission to do that.";
  if (e.code === "RESOURCE_CONFLICT") return "That username is already in use.";
  if (e.code === "OWNER_REQUIRED") return "The workspace must keep at least one active owner.";
  if (e.code === "VALIDATION_ERROR") return e.message || "Please correct the highlighted fields.";
  return e.message || fallback;
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
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [toggleSavingId, setToggleSavingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

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
    setPasswordSaved(false);
    setNewPassword("");
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

  async function onResetPassword(principalId: string) {
    if (!newPassword) return;
    setPasswordSaving(true);
    setGrantError(null);
    setPasswordSaved(false);
    try {
      await api.resetUserPassword({ principalId, password: newPassword });
      setNewPassword("");
      setPasswordSaved(true);
    } catch (e) {
      setGrantError(describeApiError(e, "failed to reset password"));
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

  if (error) return <div className="notice error">{error}</div>;
  if (!users || !roles || !policies) return <div className="notice">Loading users…</div>;

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const policyById = new Map(policies.map((policy) => [policy.id, policy]));

  return (
    <div>
      <div className="editor-header">
        <h1>Users</h1>
        <div className="editor-actions">
          <button onClick={() => setFormOpen((v) => !v)}>{formOpen ? "Cancel" : "New user"}</button>
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
                  <span className="editor-actions">
                    <button
                      type="button"
                      disabled={toggleSavingId === user.principalId}
                      onClick={() => onToggleStatus(user)}
                      title={user.status === "active" ? "DISABLE_PRINCIPAL" : "ENABLE_PRINCIPAL"}
                    >
                      {toggleSavingId === user.principalId
                        ? "…"
                        : user.status === "active"
                          ? "Disable"
                          : "Enable"}
                    </button>
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
                        Reset password
                        <span className="editor-actions">
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New password"
                          />
                          <button
                            type="button"
                            disabled={!newPassword || passwordSaving}
                            onClick={() => onResetPassword(user.principalId)}
                          >
                            {passwordSaving ? "Saving…" : "Reset password"}
                          </button>
                        </span>
                        {passwordSaved ? (
                          <span className="save-success">
                            Password reset — every active session for this user was revoked.
                          </span>
                        ) : null}
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
  );
}
