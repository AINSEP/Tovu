import { useEffect, useState } from "react";
import { ApiError, api, type AdminPolicy, type AdminRole } from "../lib/api";

/**
 * @file "Roles & Permissions" screen (SPEC-006) — the `#/section/roles` route.
 *
 * Lists roles and policies, and creates new ones (`CREATE_ROLE`/`CREATE_POLICY`).
 * `Users.tsx`'s own doc comment names this screen as the intended home for those two
 * create forms; role/policy -> user grant assignment stays on `Users.tsx`'s "Manage
 * grants" row, not duplicated here.
 *
 * Scope note: granting individual permission strings to a custom policy has no admin
 * route yet (only built-in policies get permissions, seeded at boot) — out of scope here.
 */

function describeApiError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : fallback;
  if (e.code === "FORBIDDEN") return "You do not have permission to do that.";
  if (e.code === "VALIDATION_ERROR") return e.message || "Please correct the highlighted fields.";
  return e.message || fallback;
}

export function Roles() {
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [policies, setPolicies] = useState<AdminPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [roleName, setRoleName] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

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
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>{role.name}</td>
                <td>{role.isBuiltin ? "Built-in" : "Custom"}</td>
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
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td>{policy.name}</td>
                <td>{policy.description ?? <span className="muted-cell">—</span>}</td>
                <td>
                  {policy.isBuiltin ? "Built-in" : "Custom"}
                  {policy.isFrozen ? " (frozen)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
