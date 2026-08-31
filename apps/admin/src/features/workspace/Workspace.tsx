import { formatTimestamp } from "../../lib/format-timestamp";
import { isWorkspaceDirty } from "./rules";
import { useWiredWorkspace } from "./hooks/use-workspace.hooks";
import { t } from "./workspace-i18n";

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
 *
 * Web-design pass (2026-08-05): the id/createdAt pair below used to render as a full bordered
 * `.list-table` with exactly two rows — sparse next to every real multi-row `.list-table` elsewhere
 * in this app, and reading as "table for table's sake" for a two-field read-only summary. Swapped
 * for `.settings-layer-grid`/`.settings-layer-cell` — the same compact key/value chip idiom
 * `Taxonomy.tsx`'s `TermDetailPanel` already uses for its own small Status/Parent/Version set.
 */
export interface WorkspaceProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useWorkspaceHook?: typeof useWiredWorkspace;
}

/** The rename form's own status pair — a save error, or a "Saved." confirmation once the form is
 *  no longer dirty. Split out of `Workspace` as a top-level function per the complexity-ceiling
 *  brief's extraction rule. */
function WorkspaceFormStatus(props: { locale: string; saveError: string | null; saved: boolean; dirty: boolean }) {
  const { locale, saveError, saved, dirty } = props;
  return (
    <>
      {saveError ? <span className="save-error">{saveError}</span> : null}
      {saved && !dirty ? <span className="save-success">{t(locale, "Saved.")}</span> : null}
    </>
  );
}

export function Workspace({ useWorkspaceHook = useWiredWorkspace }: WorkspaceProps = {}) {
  const { workspace, error, name, setName, slug, setSlug, saving, saveError, saved, onSave, t, locale } = useWorkspaceHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!workspace) return <div className="notice">{t("Loading workspace…")}</div>;

  const dirty = isWorkspaceDirty(workspace, name, slug);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Administration")}</p>
          <h1 className="page-title">{t("Workspace")}</h1>
          <p className="page-description">{t("This site's identity — its name, URL slug, and creation date.")}</p>
        </div>
      </div>

      <form onSubmit={onSave} className="notice integrations-form">
        <WorkspaceFormStatus locale={locale} saveError={saveError} saved={saved} dirty={dirty} />
        <label>
          {t("Name")}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t("Slug")}
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </label>
        <button type="submit" disabled={saving || !dirty}>
          {saving ? t("Saving…") : t("Save changes")}
        </button>
      </form>

      <div className="settings-layer-grid">
        <div className="settings-layer-cell">
          <span className="settings-layer-label">{t("Workspace ID")}</span>
          <span>{workspace.id}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">{t("Created")}</span>
          {/* Raw ISO-8601 (`2026-04-06T00:00:00.000Z`) leaked to the screen unformatted — the
              exact class of bug `format-timestamp.ts`'s own file header describes fixing at ~a
              dozen other call sites; this one was missed. Same shared helper, same YYYY-MM-DD
              HH:MM display, no new formatting logic. */}
          <span>{formatTimestamp(workspace.createdAt)}</span>
        </div>
      </div>

      <h2>{t("Delete workspace")}</h2>
      <div className="notice">
        <p>
          {t("Every Tovu install must always have at least one workspace, so deleting your only workspace is not available. This becomes available once this install supports more than one workspace.")}
        </p>
        {/* `.btn-danger` at rest, not just on some future enabled state — genuinely destructive by
            nature even while `:disabled` (which already desaturates it); staying `.btn-danger`
            means this doesn't quietly read as a neutral action if it's ever wired live. */}
        <button
          type="button"
          className="btn-danger"
          disabled
          title={t("Not available — this install has only one workspace")}
        >
          {t("Delete workspace")}
        </button>
      </div>
    </div>
  );
}
