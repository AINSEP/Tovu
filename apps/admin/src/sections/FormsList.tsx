import { useEffect, useState } from "react";
import { api, type AdminFormDefinition } from "../lib/api";
import { navigate } from "../lib/router";
import { DataTable, RowMenu, type RowMenuItem } from "@jini-ai/admin/react";

/**
 * @file Forms list screen (SPEC-010 ui.spec.md §2.1/§3.1) — the `/admin/forms` route.
 * Mirrors `Menus.tsx`/`Posts.tsx`'s fetch/loading/error/table convention. Layout now follows the
 * Posts/Media page-primitive pass (`.page`/`.page-header`/`.card`/`.table-scroll`/`.empty-state`,
 * see `styles.css`) instead of the bare `.editor-header` this screen used before — see
 * `FormEditor.tsx`'s file comment for the fuller rationale (both screens were audited together).
 *
 * Row actions (this pass): `Posts.tsx`/`Pages.tsx`'s `RowMenu` pattern, minus a Delete item —
 * `api.ts` has no `deleteForm` route at all (only `deleteFormSubmission`, a different resource),
 * so there is nothing to wire without inventing a server capability that doesn't exist. What DOES
 * exist is `api.updateForm`'s `status` patch, the exact call `FormEditor.tsx`'s own Disable/Enable
 * button already makes — surfaced here too so an operator doesn't have to open the editor just to
 * toggle it. No `ConfirmDialog`: `FormEditor.tsx` treats this as reversible either direction (no
 * confirm step there either), so this list doesn't invent a heavier gate the editor itself doesn't
 * have. `.btn-warning`'s tone applies only going active -> disabled, same asymmetry as
 * `FormEditor.tsx`'s "Re-enabling is the safe direction" comment.
 */
export function FormsList() {
  const [forms, setForms] = useState<AdminFormDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // In-flight row action (status toggle) — one at a time, same `rowSavingId` convention
  // `Posts.tsx`/`Pages.tsx` use for their own row actions.
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function load() {
    api
      .listForms()
      .then((r) => setForms(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load forms"));
  }

  useEffect(load, []);

  async function toggleStatus(form: AdminFormDefinition) {
    setRowSavingId(form.id);
    setError(null);
    try {
      const { data: updated } = await api.updateForm(
        { id: form.id },
        { status: form.status === "active" ? "disabled" : "active" }
      );
      setForms((prev) => (prev ? prev.map((f) => (f.id === updated.id ? updated : f)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update form status");
    } finally {
      setRowSavingId(null);
    }
  }

  // `RowMenu` has no per-item `disabled` — the in-flight guard lives inside `onSelect` instead,
  // same shape as `Redirects.tsx`'s `if (saving) return;`.
  function rowMenuItems(form: AdminFormDefinition): RowMenuItem[] {
    return [
      { key: "edit", label: "Edit", onSelect: () => navigate(`/forms/${form.id}`) },
      {
        key: "toggle-status",
        label: form.status === "active" ? "Disable" : "Enable",
        tone: form.status === "active" ? "warning" : "default",
        onSelect: () => {
          if (rowSavingId) return;
          void toggleStatus(form);
        },
      },
    ];
  }

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
      <DataTable
        rows={forms}
        rowKey={(form) => form.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No forms yet.</p>
              <p className="page-description">Create your first form to start collecting submissions.</p>
            </div>
          </div>
        }
        columns={[
          { key: "name", header: "Name", cell: (form) => <a href={`/admin/forms/${form.id}`}>{form.name}</a> },
          { key: "slug", header: "Slug", cell: (form) => form.slug },
          {
            key: "status",
            header: "Status",
            cell: (form) => <span className={`status status-${form.status}`}>{form.status}</span>,
          },
          { key: "fields", header: "Fields", cell: (form) => form.fields.length },
          {
            key: "notify",
            header: "Notify",
            cell: (form) => (form.notify.enabled ? `${form.notify.recipients.length} recipient(s)` : "off"),
          },
          {
            key: "actions",
            header: "More",
            cell: (form) => <RowMenu triggerLabel={`Actions for form "${form.name}"`} items={rowMenuItems(form)} />,
          },
        ]}
      />
    </div>
  );
}
