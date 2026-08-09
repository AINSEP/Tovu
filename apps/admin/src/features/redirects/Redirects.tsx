import { DataTable, RowMenu, type RowMenuItem, ConfirmDialog } from "@jini-ai/admin/react";

import { describeApiError } from "../../lib/api";
import { redirectRowMenuItems } from "./rules";
import { useRedirects } from "./hooks/use-redirects.hooks";
import { useHitCountCell } from "./hooks/use-hit-count-cell.hooks";
import { useImportRedirectsForm } from "./hooks/use-import-redirects-form.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import {
  t,
  importRulesLabel,
  importResultSummary,
  createdLabel,
  failedItemLabel,
  deleteRedirectBody,
  actionsForRedirectLabel,
} from "./redirects-i18n";

/**
 * @file Redirects admin screen (SPEC-009 ui.spec.md) — the `/admin/redirects` route.
 * Single-screen list + inline create form + per-row disable/enable + tombstone.
 *
 * SPEC-037 REQ-03/REQ-04: `HitCountCell` wires the previously-unused `api.getRedirectHits` as a
 * lazy per-row fetch (button-triggered, not fired for every row on mount — avoids an N+1 burst on
 * a large list), and `ImportRedirectsForm` wires the new `api.importRedirects` bulk-import
 * affordance, surfacing the route's own `207` per-item created/failed breakdown.
 *
 * ## Pilot for `lib/fetch-query`
 *
 * First screen migrated off the admin's `useState`-triple convention
 * (`data`/`loading`/`error` + a hand-written `load()`), which the other 37
 * fetching files still use. Picked as the pilot because it exercises the whole
 * interface in one small file: a list read, three writes that each used to
 * call `load()` by hand, a gesture-gated lazy read, and an import that
 * refreshes the list.
 *
 * Two things genuinely change beyond line count. Writes now name what they
 * invalidate instead of calling a loader the component happens to own — so a
 * second mounted view of the same key refreshes too, where `load()` only ever
 * refreshed this one. And a background refresh no longer throws the table
 * away: `status` stays `'success'` while `isFetching` is true, so the old
 * `if (!redirects) return <Loading/>` full-screen flash after every write is
 * gone.
 *
 * ## Markup only
 *
 * All state, effects, and `api.*` calls now live in `hooks/use-redirects.hooks.ts`,
 * `hooks/use-hit-count-cell.hooks.ts`, and `hooks/use-import-redirects-form.hooks.ts` — one hook
 * per component in this file. Pure logic (cache keys, payload shaping, the row-menu builder, the
 * import textarea's parse check) lives in `rules.ts`. What stays here is what actually renders.
 *
 * `locale` is fetched once in `Redirects` via `useAdminLocale()` and threaded down as a prop —
 * see `Database.tsx`'s file header for why (the hook's `loadLanguage()` isn't memoized).
 * `rules.ts`'s row-menu labels stay English — see `redirects-i18n.tsx`'s file header.
 */

export interface HitCountCellProps {
  locale: string;
  redirectId: string;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useHitCountCellHook?: typeof useHitCountCell;
}

/** Lazy hit-count cell (REQ-03) — fetches on first click rather than on mount, so a list of many
 *  rows never fires a synchronous burst of `/hits` requests. A rule with zero recorded hits still
 *  renders `0` (not blank), matching `hits.ts`'s own "still 200s with hitCount: 0" contract. */
function HitCountCell({ locale, redirectId, useHitCountCellHook = useHitCountCell }: HitCountCellProps) {
  const { error, data, isFetching, request } = useHitCountCellHook({ redirectId });

  if (error) return <span className="save-error">{describeApiError(error, "failed")}</span>;
  // A rule with zero recorded hits still renders `0` (not blank), matching
  // `hits.ts`'s own "still 200s with hitCount: 0" contract — so this branches
  // on the request having completed, never on the count's truthiness.
  if (data) return <span>{data.data.hitCount}</span>;
  return (
    <button type="button" onClick={request} disabled={isFetching}>
      {isFetching ? t(locale, "Loading…") : t(locale, "Load hits")}
    </button>
  );
}

export interface ImportRedirectsFormProps {
  locale: string;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useImportRedirectsFormHook?: typeof useImportRedirectsForm;
}

/** Bulk-import affordance (REQ-04) — paste a JSON array of rule objects, submit through
 * `api.importRedirects`, and surface the `207` per-item created/failed breakdown directly
 * (never collapsed into a single pass/fail toast — a partial-batch failure is the route's own
 * designed behavior, not an edge case). */
function ImportRedirectsForm({ locale, useImportRedirectsFormHook = useImportRedirectsForm }: ImportRedirectsFormProps) {
  const { raw, setRaw, error, result, importing, submit } = useImportRedirectsFormHook();

  return (
    <details className="notice redirects-import">
      <summary>{t(locale, "Bulk import")}</summary>
      <form onSubmit={submit}>
        <label htmlFor="redirects-import-json">
          {importRulesLabel(locale, <code>{"{matchType, fromPattern, toTarget, statusCode, override?, priority?}"}</code>)}
        </label>
        <textarea
          id="redirects-import-json"
          rows={6}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='[{"matchType":"exact","fromPattern":"/old","toTarget":"/new","statusCode":301}]'
        />
        {/* Secondary, not primary — "Add redirect" above is this screen's one actual create
            action; bulk import is a power-user path to the same result, not a second headline CTA
            competing with it. */}
        <button type="submit" className="btn-secondary" disabled={importing}>
          {importing ? t(locale, "Importing…") : t(locale, "Import")}
        </button>
      </form>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="redirects-import-result">
          <p>{importResultSummary(locale, result.created.length, result.failed.length)}</p>
          {result.created.length > 0 ? (
            <ul>
              {result.created.map((r) => (
                <li key={r.id}>
                  <span className="save-ok">{createdLabel(locale)}</span> {r.fromPattern} → {r.toTarget}
                </li>
              ))}
            </ul>
          ) : null}
          {result.failed.length > 0 ? (
            <ul>
              {result.failed.map((f) => (
                <li key={f.index}>
                  <span className="save-error">{failedItemLabel(locale, f.index, f.code)}</span>: {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

export interface RedirectsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before. See `PostsProps.usePostsHook` for the full rationale.
   */
  useRedirectsHook?: typeof useRedirects;
}

export function Redirects({ useRedirectsHook = useRedirects }: RedirectsProps = {}) {
  const locale = useAdminLocale();
  const {
    redirects,
    listStatus,
    listError,
    error,
    saving,
    pendingDelete,
    setPendingDelete,
    confirmDelete,
    deletePending,
    createRedirect,
    onToggleStatus,
    onRequestDelete,
  } = useRedirectsHook();

  // Only a FIRST load blocks the screen. A refetch triggered by a write keeps
  // the table on screen (`status` stays `'success'`), where the old
  // `if (!redirects)` guard blanked the whole page after every single edit.
  if (listStatus === "error" && !redirects) {
    return <div className="notice error">{describeApiError(listError, "failed to load redirects")}</div>;
  }
  if (!redirects) return <div className="notice">{t(locale, "Loading redirects…")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Marketing")}</p>
          <h1 className="page-title">{t(locale, "Redirects")}</h1>
          <p className="page-description">
            {t(locale, "Manual URL redirect rules. Rules created automatically from a slug change (source")}
            <code> auto_slug_change</code>
            {t(locale, ") also show up here.")}
          </p>
        </div>
      </div>
      {error ? <div className="notice error">{describeApiError(error, "request failed")}</div> : null}

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          createRedirect(new FormData(e.currentTarget));
          e.currentTarget.reset();
        }}
      >
        <div className="field-group">
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="redirect-match-type">{t(locale, "Match type")}</label>
              <select id="redirect-match-type" name="matchType" defaultValue="exact">
                <option value="exact">exact</option>
                <option value="prefix">prefix</option>
                <option value="wildcard">wildcard</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="redirect-from-pattern">{t(locale, "From path")}</label>
              <input id="redirect-from-pattern" name="fromPattern" placeholder="/old-path" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="redirect-to-target">{t(locale, "To target")}</label>
              <input id="redirect-to-target" name="toTarget" placeholder="/new-path or https://example.com/..." required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="redirect-status-code">{t(locale, "Status code")}</label>
              <select id="redirect-status-code" name="statusCode" defaultValue="301">
                <option value="301">{t(locale, "301 (permanent)")}</option>
                <option value="302">{t(locale, "302 (temporary)")}</option>
                <option value="307">{t(locale, "307 (temporary, method-preserving)")}</option>
                <option value="308">{t(locale, "308 (permanent, method-preserving)")}</option>
              </select>
            </div>
          </div>
        </div>
        <div className="editor-actions form-actions">
          <button type="submit" disabled={saving}>
            {saving ? t(locale, "Saving…") : t(locale, "Add redirect")}
          </button>
        </div>
      </form>

      <ImportRedirectsForm locale={locale} />

      <DataTable
        rows={redirects}
        rowKey={(rule) => rule.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t(locale, "No redirect rules yet.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "from", header: t(locale, "From"), cell: (rule) => rule.fromPattern },
          { key: "to", header: t(locale, "To"), cell: (rule) => rule.toTarget },
          { key: "type", header: t(locale, "Type"), cell: (rule) => rule.matchType },
          { key: "code", header: t(locale, "Code"), cell: (rule) => rule.statusCode },
          { key: "source", header: t(locale, "Source"), cell: (rule) => rule.source },
          {
            key: "status",
            header: t(locale, "Status"),
            cell: (rule) => <span className={`status status-${rule.status}`}>{rule.status}</span>,
          },
          { key: "hits", header: t(locale, "Hits"), cell: (rule) => <HitCountCell locale={locale} redirectId={rule.id} /> },
          {
            key: "actions",
            header: t(locale, "More"),
            cell: (rule) => {
              const items: RowMenuItem[] = redirectRowMenuItems(rule, { onToggleStatus, onRequestDelete }, locale);
              return <RowMenu triggerLabel={actionsForRedirectLabel(locale, rule.fromPattern)} items={items} />;
            },
          },
        ]}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t(locale, "Delete redirect rule?")}
        body={pendingDelete ? deleteRedirectBody(locale, pendingDelete.fromPattern) : null}
        confirmLabel={t(locale, "Delete")}
        destructive
        pending={deletePending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
