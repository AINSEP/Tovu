import { agentHandle } from "@jini-ai/agentic";

import type { RecentServerErrorsController, useWiredRecentServerErrors } from "./hooks/use-recent-server-errors.hooks";

/**
 * Recent errors tab (gap A-04, slice L2): the newest server error lines, the same data the
 * `system_read_server_logs` chat tool returns. Markup only — state lives in
 * `use-recent-server-errors.hooks.ts`. The hook is called HERE, not in `Observability.tsx`, so the
 * read only happens when this tab is opened.
 */
export function RecentErrorsPanel({ useRecentServerErrorsHook }: { useRecentServerErrorsHook: typeof useWiredRecentServerErrors }) {
  const controller = useRecentServerErrorsHook();
  const { rows, logs, loading, error, refresh, t } = controller;

  return (
    <section className="jini-settings-section" aria-label={t("Recent server errors")}>
      <div className="observability-errors-toolbar">
        <p className="observability-lede">
          {t("The newest errors this site's server logged, including its assistant. Secret values are hidden.")}
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={refresh}
          disabled={loading}
          {...agentHandle({ handle: "observability-errors-refresh" }, { role: "button", label: "Reload recent server errors" })}
        >
          {t("Refresh")}
        </button>
      </div>

      {error ? <p className="observability-alert" role="alert">{error}</p> : null}
      {loading && !logs ? <p role="status">{t("Loading recent errors…")}</p> : null}
      {logs && !logs.capturing ? (
        <p className="jini-field-hint" role="note">{t("This server is not recording its log yet, so errors cannot be listed. Restart the site to start recording.")}</p>
      ) : null}
      {logs && logs.capturing && rows.length === 0 ? <p role="status">{t("No errors recorded.")}</p> : null}
      {logs?.truncated ? <p className="jini-field-hint">{t("Showing the newest 50 errors.")}</p> : null}

      {rows.length > 0 ? (
        <ol className="observability-errors-list" {...agentHandle({ handle: "observability-errors-list" }, { role: "list", label: "Recent server errors, newest first" })}>
          {rows.map((row) => (
            <li key={row.key} className="observability-error">
              <p className="observability-error-meta">
                <time>{row.when}</time>
                <span className="observability-error-source">{row.source === "daemon" ? t("assistant") : t("server")}</span>
              </p>
              <pre className="observability-error-message">{row.message}</pre>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
