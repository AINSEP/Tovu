import { useEffect, useState } from "react";
import { api, type AdminFormDefinition } from "../lib/api";

/**
 * @file Forms list screen (SPEC-010 ui.spec.md §2.1/§3.1) — the `#/forms` route.
 * Mirrors `Menus.tsx`/`Posts.tsx`'s fetch/loading/error/table convention.
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
    <div>
      <div className="editor-header">
        <h1>Forms</h1>
        <a href="#/forms/new">
          <button>New form</button>
        </a>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {forms.length === 0 ? (
        <div className="notice">No forms yet.</div>
      ) : (
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
                  <a href={`#/forms/${form.id}`}>{form.name}</a>
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
      )}
    </div>
  );
}
