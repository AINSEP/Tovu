### A22. Incremental View Maintenance

**What it is:** Materialized views that update incrementally as underlying data changes, rather than being fully recomputed on a schedule. New events flow through a streaming SQL engine and the view reflects changes in milliseconds.

**Why it matters:** Real-time derived data (trending content, content performance scores, live dashboards) without the cost of re-running expensive aggregation queries on every page load. The view is always up to date; queries against it are instant.

| Solution | Description |
|---|---|
| Materialize | Streaming SQL with incremental views |
| ReadySet | Cache layer with incremental view support |
| Feldera | Incremental compute engine |

**When to use for Tovu:** When the analytics plugin needs live dashboards over high-volume event data (page views, engagement events) that would be too expensive to query directly on each request. Materialize maintains views like `trending_content` and `content_performance` incrementally; the dashboard query is a simple `SELECT` against the pre-maintained result.

```sql
-- Connect to Postgres CDC stream
CREATE SOURCE content_events
FROM POSTGRES CONNECTION pg_connection
PUBLICATION 'content_changes';

-- Incrementally maintained view — updates in milliseconds, not on full recompute
CREATE MATERIALIZED VIEW trending_content AS
SELECT
  content_id,
  count(*) as view_count,
  count(DISTINCT user_id) as unique_viewers,
  max(viewed_at) as last_viewed
FROM page_views
WHERE viewed_at > mz_now() - INTERVAL '1 hour'
GROUP BY content_id
ORDER BY view_count DESC;

-- Dashboard query — instant, reads precomputed result
SELECT * FROM trending_content LIMIT 10;
```

---

