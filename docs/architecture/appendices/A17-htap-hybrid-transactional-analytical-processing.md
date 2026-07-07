### A17. HTAP (Hybrid Transactional/Analytical Processing)

**What it is:** A single database that handles both OLTP (transactional reads/writes) and OLAP (analytical aggregations) without a separate data warehouse or ETL pipeline.

**Why it matters:** Real-time analytics on live operational data. No sync lag between operational DB and analytics DB. Eliminates a class of infrastructure (Kafka, ETL jobs, data warehouse).

| Solution | Description |
|---|---|
| TiDB | MySQL-compatible, built for HTAP |
| SingleStore | Real-time analytics on operational data |
| ClickHouse | Columnar, increasingly used as primary OLTP+analytics store |
| DuckDB | Embedded analytics, runs in browser or edge |
| AlloyDB | Google's PostgreSQL with analytics acceleration |

**When to use for Tovu:** When the analytics plugin needs real-time dashboards (content performance, plugin revenue, user behavior) and the operational Postgres becomes a bottleneck for analytical queries. ClickHouse with a `ReplacingMergeTree` is a strong fit for content + event data.

**When NOT to use:** Early stage. Postgres with proper indexing and materialized views handles analytical load well until there is concrete evidence of bottleneck. HTAP adds operational complexity and a different query model.

```typescript
// ClickHouse handles both transactional inserts and analytical aggregations
const client = createClient({ host: 'https://your-clickhouse.com' });

// Transactional insert
await client.insert({
  table: 'contents',
  values: [{ ...content, version: Date.now() }],
  format: 'JSONEachRow'
});

// Analytical query on live data — no ETL lag
const metrics = await client.query({
  query: `
    SELECT type, status, count() as count,
           countIf(created_at >= now() - INTERVAL 7 DAY) as created_last_week
    FROM contents
    WHERE workspace_id = {workspaceId:UUID}
    GROUP BY type, status
  `,
  query_params: { workspaceId }
});
```

---

