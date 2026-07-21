import { Fragment, useEffect, useState } from "react";
import { ApiError, api, type AdminPolicy, type AdminRole } from "../lib/api";

/**
 * @file "Roles & Permissions" screen (SPEC-006 + 0.6.0 CRUD-completion amendment) — the
 * `#/section/roles` route.
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

function describeApiError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : fallback;
  if (e.code === "FORBIDDEN") return "You do not have permission to do that.";
  if (e.code === "RESOURCE_CONFLICT") return "It is still in use — remove that assignment/attachment first.";
  if (e.code === "PERMISSION_UNKNOWN") return "That permission is not recognized.";
  if (e.code === "GRANT_EXCEEDS_ISSUER") return "You cannot grant a permission you do not hold.";
  if (e.code === "VALIDATION_ERROR") return e.message || "Please correct the highlighted fields.";
  return e.message || fallback;
}

export function Roles() {
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
      await api.createPolicy(policyName, policyDescription || undefined);
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
      await api.updateRole(roleId, editingRoleName);
      setEditingRoleId(null);
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, "failed to rename role"));
    } finally {
      setRowSavingId(null);
    }
  }

  async function onDeleteRole(roleId: string) {
    setRowSavingId(roleId);
    setRowError(null);
    try {
      await api.deleteRole(roleId);
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, "failed to delete role"));
    } finally {
      setRowSavingId(null);
    }
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
      await api.updatePolicy(policyId, { name: editingPolicyName, description: editingPolicyDescription });
      setEditingPolicyId(null);
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, "failed to update policy"));
    } finally {
      setRowSavingId(null);
    }
  }

  async function onDeletePolicy(policyId: string) {
    setRowSavingId(policyId);
    setRowError(null);
    try {
      await api.deletePolicy(policyId);
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, "failed to delete policy"));
    } finally {
      setRowSavingId(null);
    }
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
      await api.writePolicyPermission(policyId, permissionInput, resourceTypeInput || undefined);
      setPermissionInput("");
      setResourceTypeInput("");
    } catch (e) {
      setRowError(describeApiError(e, "failed to add permission"));
    } finally {
      setRowSavingId(null);
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!roles || !policies) return <div className="notice">Loading roles & permissions…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Roles & Permissions</h1>
      </div>
      <p>
        Roles and policies grant access to operator users. Assign a role or policy to a
        specific user from the <a href="#/section/users">Users</a> screen.
      </p>
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
      {roles.length === 0 ? (
        <div className="notice">No roles yet.</div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>
                  {editingRoleId === role.id ? (
                    <input value={editingRoleName} onChange={(e) => setEditingRoleName(e.target.value)} />
                  ) : (
                    role.name
                  )}
                </td>
                <td>{role.isBuiltin ? "Built-in" : "Custom"}</td>
                <td>
                  {role.isBuiltin ? (
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
                    <span className="editor-actions">
                      <button type="button" onClick={() => startEditRole(role)}>
                        Rename
                      </button>
                      <button type="button" disabled={rowSavingId === role.id} onClick={() => onDeleteRole(role.id)}>
                        {rowSavingId === role.id ? "…" : "Delete"}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
        <div className="notice">No policies yet.</div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Type</th>
              <th aria-label="Actions" />
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
                      <span className="editor-actions">
                        <button type="button" onClick={() => startEditPolicy(policy)}>
                          Rename
                        </button>
                        <button type="button" onClick={() => togglePermissionForm(policy.id)}>
                          {permissionPolicyId === policy.id ? "Close" : "Add permission"}
                        </button>
                        <button
                          type="button"
                          disabled={rowSavingId === policy.id}
                          onClick={() => onDeletePolicy(policy.id)}
                        >
                          {rowSavingId === policy.id ? "…" : "Delete"}
                        </button>
                      </span>
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
      )}
    </div>
  );
}
