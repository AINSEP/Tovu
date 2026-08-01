import { useEffect, useState } from "react";
import { api, type AdminFormDefinition } from "../lib/api";

/**
 * @file Forms list screen (SPEC-010 ui.spec.md §2.1/§3.1) — the `/admin/forms` route.
 * Mirrors `Menus.tsx`/`Posts.tsx`'s fetch/loading/error/table convention. Layout now follows the
 * Posts/Media page-primitive pass (`.page`/`.page-header`/`.card`/`.table-scroll`/`.empty-state`,
 * see `styles.css`) instead of the bare `.editor-header` this screen used before — see
 * `FormEditor.tsx`'s file comment for the fuller rationale (both screens were audited together).
 */
export function FormsList() {
  const [forms, setForms] = useState<AdminFormDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .listForms()
      .then((r) => setForms(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load forms"));
  }

  useEffect(load, []);

  if (error && !forms) return <div className="notice error">{error}</div>;
  if (!forms) return <div className="notice">Loading forms…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Forms</h1>
          <p className="page-description">Manage the forms embedded across the site and their submissions.</p>
        </div>
        <div className="page-actions">
          <a href="/admin/forms/new">
            <button>New form</button>
          </a>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {forms.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No forms yet.</p>
            <p className="page-description">Create your first form to start collecting submissions.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Fields</th>
                <th>Notify</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id}>
                  <td>
                    <a href={`/admin/forms/${form.id}`}>{form.name}</a>
                  </td>
                  <td>{form.slug}</td>
                  <td>
                    <span className={`status status-${form.status}`}>{form.status}</span>
                  </td>
                  <td>{form.fields.length}</td>
                  <td>{form.notify.enabled ? `${form.notify.recipients.length} recipient(s)` : "off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
