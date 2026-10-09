import { agentHandle } from "@jini-ai/agentic";
import type { Translate } from "@jini-ai/ui/panel-kit";

import "./recent-errors.css";
import { CheckIcon, ChevronIcon, CopyIcon } from "./observability-visuals";
import { useRecentErrorItem } from "./hooks/use-recent-error-item.hooks";
import type { RecentServerErrorRow, RecentServerErrorsController, useWiredRecentServerErrors } from "./hooks/use-recent-server-errors.hooks";

/**
 * Recent errors tab (gap A-04, slice L2): the newest server error lines, the same data the
 * `system_read_server_logs` chat tool returns. Markup only — state lives in
 * `use-recent-server-errors.hooks.ts` (list) and `use-recent-error-item.hooks.ts` (one row). The
 * hook is called HERE, not in `Observability.tsx`, so the read only happens when this tab is opened.
 *
 * Owner pass 2026-10-08 ("This looks awful… maybe an accordion to show the full error, and a copy
 * button"): each distinct error is a collapsed one-line row (time, source, summary, ×N when
 * repeated) that opens to the full message with shortened paths; Copy puts a paste-ready block on
 * the clipboard.
 */
export function RecentErrorsPanel({ useRecentServerErrorsHook }: { useRecentServerErrorsHook: typeof useWiredRecentServerErrors }) {
  const controller = useRecentServerErrorsHook();
  const { rows, logs, loading, error, refresh, clipboard, t } = controller;

  return (
    <section className="jini-settings-section observability-errors" aria-label={t("Recent server errors")}>
      <div className="observability-errors-toolbar">
        <p className="observability-lede">
          {t("The newest errors this site's server logged, including its assistant. Secret values are hidden.")}
        </p>
        <button
          type="button"
          className="jini-button observability-errors-refresh"
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
            <RecentErrorItem key={row.key} row={row} clipboard={clipboard} t={t} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/**
 * One distinct error: a toggle button (the whole summary line) that opens the full message, and a
 * Copy button beside it — siblings, never nested, so each stays its own tab stop.
 */
function RecentErrorItem({ row, clipboard, t }: { row: RecentServerErrorRow; clipboard: RecentServerErrorsController["clipboard"]; t: Translate }) {
  const { expanded, toggle, detailId, copied, copy } = useRecentErrorItem({ copyText: row.copyText, clipboard });

  return (
    <li className="observability-error" data-expanded={expanded}>
      <div className="observability-error-head">
        <button type="button" className="observability-error-toggle" aria-expanded={expanded} aria-controls={detailId} onClick={toggle}>
          <span className="observability-error-chevron">
            <ChevronIcon />
          </span>
          <span className="observability-error-body">
            <RecentErrorMeta row={row} t={t} />
            <span className="observability-error-summary">{row.summary || t("(empty message)")}</span>
          </span>
        </button>
        <button
          type="button"
          className="jini-button observability-error-copy"
          onClick={copy}
          title={t("Copy the time, source and full message, ready to paste.")}
          data-copied={copied}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span aria-live="polite">{copied ? t("Copied") : t("Copy")}</span>
        </button>
      </div>
      <RecentErrorDetail row={row} id={detailId} hidden={!expanded} t={t} />
    </li>
  );
}

/** Time, source pill, the message's `[tag]` pill, and ×N when the error repeated. */
function RecentErrorMeta({ row, t }: { row: RecentServerErrorRow; t: Translate }) {
  return (
    <span className="observability-error-meta">
      <time dateTime={row.at}>{row.when}</time>
      <span className="observability-error-pill">{row.source === "daemon" ? t("assistant") : t("server")}</span>
      {row.scope ? <span className="observability-error-pill">{row.scope}</span> : null}
      {row.count > 1 ? (
        <span className="observability-error-pill observability-error-pill--count" title={`${t("Times this error occurred")}: ${row.count}`}>
          ×{row.count}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The full message. Always in the DOM (`hidden` while collapsed) so the toggle's `aria-controls`
 * always names a real element. Shortened paths carry the full path in `title`.
 */
function RecentErrorDetail({ row, id, hidden, t }: { row: RecentServerErrorRow; id: string; hidden: boolean; t: Translate }) {
  return (
    <div id={id} className="observability-error-detail" hidden={hidden}>
      {row.firstWhen ? (
        <p className="observability-error-first-seen">
          {t("First seen")}: <time dateTime={row.firstAt ?? undefined}>{row.firstWhen}</time>
        </p>
      ) : null}
      <pre className="observability-error-message">
        <code>
          {row.segments.map((segment, index) =>
            segment.fullPath ? (
              <span key={index} className="observability-error-path" title={segment.fullPath}>
                {segment.text}
              </span>
            ) : (
              segment.text
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
