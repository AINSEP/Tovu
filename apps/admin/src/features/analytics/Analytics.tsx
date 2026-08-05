import { formatTimestamp } from "../../lib/format-timestamp";
import { DataTable } from "@jini-ai/admin/react";
import { useAnalytics } from "./hooks/use-analytics.hooks";

/**
 * @file Admin "Analytics" screen (ADR-035 ingest half only) — markup only.
 *
 * IMPORTANT — honesty note: this is a raw recent-hits list read straight off the in-memory ingest
 * buffer (`LocalBufferSink`), NOT a dashboard. There is no rollup/aggregation/time-series layer
 * built yet (that's a later Tier-3 build per the ADR) — so there are no totals, charts, or
 * breakdowns here on purpose. Do not read the absence of aggregates as a bug in this screen.
 *
 * Mirrors `features/posts/Posts.tsx`'s fetch/loading/error/empty-state shape. State and the fetch
 * live in `hooks/use-analytics.hooks.ts`.
 */
export interface AnalyticsProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useAnalyticsHook?: typeof useAnalytics;
}

export function Analytics({ useAnalyticsHook = useAnalytics }: AnalyticsProps = {}) {
  const { hits, error } = useAnalyticsHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!hits) return <div className="notice">Loading recent hits…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Marketing</p>
          <h1 className="page-title">Analytics</h1>
          <p className="page-description">The most recent pageviews and events captured on this site.</p>
        </div>
      </div>
      <div className="notice">
        Raw ingest data only — the most recent hits currently sitting in memory. There is no
        aggregation/rollup layer yet, so there are no totals, trends, or breakdowns here; that is a
        later build.
      </div>

      <DataTable
        rows={hits}
        rowKey={(hit, index) => `${hit.occurredAt}-${index}`}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No hits recorded yet.</p>
              <p className="page-description">Once the site beacon starts sending traffic, recent hits will appear here.</p>
            </div>
          </div>
        }
        columns={[
          { key: "path", header: "Path", cell: (hit) => hit.path },
          { key: "referrer", header: "Referrer", cell: (hit) => hit.referrerHost ?? "(direct)" },
          {
            key: "device",
            header: "Device / Browser",
            cell: (hit) => (
              <>
                {hit.deviceClass}
                {hit.browserFamily ? ` / ${hit.browserFamily}` : ""}
              </>
            ),
          },
          { key: "kind", header: "Kind", cell: (hit) => (hit.eventName ? `event: ${hit.eventName}` : hit.kind) },
          { key: "time", header: "Time", cell: (hit) => formatTimestamp(hit.occurredAt) },
        ]}
      />
    </div>
  );
}
