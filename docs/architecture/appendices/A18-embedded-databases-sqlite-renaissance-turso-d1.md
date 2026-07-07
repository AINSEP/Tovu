### A18. Embedded Databases / SQLite Renaissance (Turso, D1)

**What it is:** SQLite deployed at the edge or per-tenant, with replication, branching, and distributed read replicas. Each user or workspace gets their own database instance. Reads are sub-millisecond because data is co-located with compute.

**Why it matters:** Horizontal scale by isolation — no shared database bottleneck. Per-tenant isolation is structural, not just logical. Edge deployments can have truly local data.

| Solution | Description |
|---|---|
| Turso / libSQL | SQLite with global replication and git-style branches |
| LiteFS | Distributed SQLite on Fly.io |
| Cloudflare D1 | SQLite at the edge (Cloudflare Workers) |
| rqlite | Distributed SQLite with Raft consensus |

**When to use for Tovu:** The `@tovu/db-turso` adapter already exists. The pattern is particularly valuable for a SaaS deployment of Tovu where each customer workspace gets its own Turso database — complete isolation, no noisy-neighbor problem, and database branching for preview environments becomes trivial.

```typescript
// Each workspace gets its own isolated database
async function getWorkspaceDB(workspaceId: string) {
  return createClient({
    url: `libsql://${workspaceId}.turso.io`,
    authToken: process.env.TURSO_TOKEN
  });
}

// Create an isolated branch for a PR preview deployment
async function createPreviewBranch(workspaceId: string, prNumber: number) {
  const response = await fetch(
    `https://api.turso.tech/v1/databases/${workspaceId}/branches`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TURSO_API_TOKEN}` },
      body: JSON.stringify({ name: `preview-pr-${prNumber}` })
    }
  );
  return response.json(); // Full copy of production data, completely isolated
}
```

---

