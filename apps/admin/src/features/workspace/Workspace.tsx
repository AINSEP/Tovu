import { isWorkspaceDirty } from "./rules";
import { useWorkspace } from "./hooks/use-workspace.hooks";

/**
 * @file "Workspace" admin screen (SPEC-044) — the `/admin/workspace` route — markup only.
 *
 * Mirrors `features/roles/Roles.tsx`'s fetch/loading/error/form shape. Shows the current (single, v1)
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
 *
 * State, the fetch, and save live in `hooks/use-workspace.hooks.ts`; the error-code overrides and
 * the dirty-form derivation live in `rules.ts`.
 */
export interface WorkspaceProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useWorkspaceHook?: typeof useWorkspace;
}

export function Workspace({ useWorkspaceHook = useWorkspace }: WorkspaceProps = {}) {
  const { workspace, error, name, setName, slug, setSlug, saving, saveError, saved, onSave } = useWorkspaceHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!workspace) return <div className="notice">Loading workspace…</div>;

  const dirty = isWorkspaceDirty(workspace, name, slug);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Administration</p>
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
