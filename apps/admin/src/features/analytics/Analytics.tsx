import { formatTimestamp } from "../../lib/format-timestamp";
import { DataTable } from "@jini-ai/admin/react";
import { useWiredAnalytics } from "./hooks/use-analytics.hooks";

/**
 * @file Admin "Analytics" screen (ADR-035 ingest half only) — markup only.
 *
 * IMPORTANT — honesty note: this is a raw recent-hits list, NOT a dashboard. There is no
 * rollup/aggregation/time-series layer built yet (that's a later Tier-3 build per the ADR) — so
 * there are no totals, charts, or breakdowns here on purpose. Do not read the absence of
 * aggregates as a bug in this screen.
 *
 * The on-screen notice used to also claim the hits were "sitting in memory". That was false on a
 * real install: `deps.ts` binds `SqliteBufferSink` (a durable table, no eviction), and the
 * in-memory `LocalBufferSink` in `app.ts` is only ever reached under `TOVU_DB=memory`. The copy no
 * longer makes any storage claim — only the aggregation claim, which is still true.
 *
 * Mirrors `features/posts/Posts.tsx`'s fetch/loading/error/empty-state shape. State and the fetch
 * live in `hooks/use-analytics.hooks.ts`.
 */
export interface AnalyticsProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useAnalyticsHook?: typeof useWiredAnalytics;
}

export function Analytics({ useAnalyticsHook = useWiredAnalytics }: AnalyticsProps = {}) {
  const { hits, error, t } = useAnalyticsHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!hits) return <div className="notice">{t("Loading recent hits…")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Marketing")}</p>
          <h1 className="page-title">{t("Analytics")}</h1>
          <p className="page-description">{t("The most recent pageviews and events captured on this site.")}</p>
        </div>
      </div>
      <div className="notice">
        {t("Each visit is listed on its own row, newest first. This is not a summary — there are no totals, trends, or breakdowns to compare traffic over time yet.")}
      </div>

      <DataTable
        rows={hits}
        rowKey={(hit, index) => `${hit.occurredAt}-${index}`}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No hits recorded yet.")}</p>
              <p className="page-description">{t("Once the site beacon starts sending traffic, recent hits will appear here.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "path", header: t("Path"), cell: (hit) => hit.path },
          { key: "referrer", header: t("Referrer"), cell: (hit) => hit.referrerHost ?? t("(direct)") },
          {
            key: "device",
            header: t("Device / Browser"),
            cell: (hit) => (
              <>
                {hit.deviceClass}
                {hit.browserFamily ? ` / ${hit.browserFamily}` : ""}
              </>
            ),
          },
          { key: "kind", header: t("Kind"), cell: (hit) => (hit.eventName ? `${t("event:")} ${hit.eventName}` : hit.kind) },
          { key: "time", header: t("Time"), cell: (hit) => formatTimestamp(hit.occurredAt) },
        ]}
      />
    </div>
  );
}
