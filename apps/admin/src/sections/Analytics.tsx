import { useEffect, useState } from "react";
import { api, type AdminAnalyticsHit } from "../lib/api";
import { formatTimestamp } from "../lib/format-timestamp";

/**
 * @file Admin "Analytics" screen (ADR-035 ingest half only).
 *
 * IMPORTANT — honesty note: this is a raw recent-hits list read straight off the in-memory ingest
 * buffer (`LocalBufferSink`), NOT a dashboard. There is no rollup/aggregation/time-series layer
 * built yet (that's a later Tier-3 build per the ADR) — so there are no totals, charts, or
 * breakdowns here on purpose. Do not read the absence of aggregates as a bug in this screen.
 *
 * Mirrors `sections/Posts.tsx`'s fetch/loading/error/empty-state shape.
 */

export function Analytics() {
  const [hits, setHits] = useState<AdminAnalyticsHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRecentAnalyticsHits()
      .then((r) => setHits(r.hits))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load recent hits"));
  }, []);

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

      {hits.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No hits recorded yet.</p>
            <p className="page-description">Once the site beacon starts sending traffic, recent hits will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
        <table className="list-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Referrer</th>
              <th>Device / Browser</th>
              <th>Kind</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((hit, index) => (
              <tr key={`${hit.occurredAt}-${index}`}>
                <td>{hit.path}</td>
                <td>{hit.referrerHost ?? "(direct)"}</td>
                <td>
                  {hit.deviceClass}
                  {hit.browserFamily ? ` / ${hit.browserFamily}` : ""}
                </td>
                <td>{hit.eventName ? `event: ${hit.eventName}` : hit.kind}</td>
                <td>{formatTimestamp(hit.occurredAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
