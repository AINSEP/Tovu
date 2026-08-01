import { useEffect, useState } from "react";
import { ApiError, api, describeApiError as describeApiErrorDefault, type AdminWorkspace } from "../lib/api";

/**
 * @file "Workspace" admin screen (SPEC-044) — the `/admin/workspace` route.
 *
 * Mirrors `sections/Roles.tsx`'s fetch/loading/error/form shape. Shows the current (single, v1)
 * workspace's `name`/`slug`/`createdAt` and an editable rename form (REQ-04). No list/create UI —
 * v1 always has exactly one workspace, addressable only through the caller's own boot-wired
 * `deps.workspaceId` (see feature.spec.md's Architectural Finding section); `api.getWorkspace()`
 * fetches that one record directly rather than listing then picking the first.
 *
 * The "Delete workspace" control is REQ-07's deliberate choice: present, not hidden, but always
 * disabled with an explanatory notice — `DELETE_WORKSPACE` always refuses in v1 (INV-03, a real
 * guard, not a stub), so a live, clickable button here would just be a guaranteed-failing round
 * trip; omitting the control entirely would look like the capability doesn't exist rather than
 * "exists, guarded, not reachable yet."
 */

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`) — this screen's
 *  `RESOURCE_CONFLICT` means "slug already taken", a different meaning than `Roles.tsx`'s "still
 *  referenced" or `Users.tsx`'s "username already in use" for the same code (audit cross-cutting
 *  finding #2 — deliberately not unified into one table). */
function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "FORBIDDEN") return "You do not have permission to do that.";
    if (e.code === "RESOURCE_CONFLICT") return "That slug is already in use.";
    if (e.code === "VALIDATION_ERROR") return e.message || "Please correct the highlighted fields.";
  }
  return describeApiErrorDefault(e, fallback);
}

export function Workspace() {
  const [workspace, setWorkspace] = useState<AdminWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function reload(): Promise<void> {
    return api
      .getWorkspace()
      .then((r) => {
        setWorkspace(r.workspace);
        setName(r.workspace.name);
        setSlug(r.workspace.slug);
      })
      .catch((e) => setError(describeApiError(e, "failed to load workspace")));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { workspace: updated } = await api.updateWorkspace({ name, slug });
      setWorkspace(updated);
      setSaved(true);
    } catch (e) {
      setSaveError(describeApiError(e, "failed to save workspace"));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!workspace) return <div className="notice">Loading workspace…</div>;

  const dirty = name !== workspace.name || slug !== workspace.slug;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Design & System</p>
          <h1 className="page-title">Workspace</h1>
          <p className="page-description">This site's identity — its name, URL slug, and creation date.</p>
        </div>
      </div>

      <form onSubmit={onSave} className="notice integrations-form">
        {saveError ? <span className="save-error">{saveError}</span> : null}
        {saved && !dirty ? <span className="save-success">Saved.</span> : null}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Slug
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </label>
        <button type="submit" disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="table-scroll">
      <table className="list-table">
        <tbody>
          <tr>
            <th>Workspace ID</th>
            <td>{workspace.id}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td>{workspace.createdAt}</td>
          </tr>
        </tbody>
      </table>
      </div>

      <h2>Delete workspace</h2>
      <div className="notice">
        <p>
          Every Tovu install must always have at least one workspace, so deleting your only
          workspace is not available. This becomes available once this install supports more than
          one workspace.
        </p>
        {/* `.btn-danger` at rest, not just on some future enabled state — genuinely destructive by
            nature even while `:disabled` (which already desaturates it); staying `.btn-danger`
            means this doesn't quietly read as a neutral action if it's ever wired live. */}
        <button
          type="button"
          className="btn-danger"
          disabled
          title="Not available — this install has only one workspace"
        >
          Delete workspace
        </button>
      </div>
    </div>
  );
}
