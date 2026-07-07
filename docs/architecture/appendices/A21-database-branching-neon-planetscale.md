### A21. Database Branching (Neon, PlanetScale)

**What it is:** Treat a database like a git repository — create branches from the main database that are fully isolated copies (using copy-on-write), run migrations or tests on the branch, and delete it when done.

**Why it matters:** Preview deployments get a real copy of production data, fully isolated. Schema migrations can be tested without risk to production. Instant rollback — just don't merge the branch. No more "staging is out of sync with production."

| Solution | Description |
|---|---|
| Neon | Postgres with copy-on-write branches (instant) |
| PlanetScale | MySQL with branching and non-blocking schema changes |
| Turso | SQLite with branches |
| Supabase | Postgres branching (beta) |

**When to use for Tovu:** Preview deployments in a SaaS context. Safe migration testing. Neon is the strongest option for the Postgres-primary stack — branches are created in seconds using copy-on-write, not full data copies.

```typescript
// Create an isolated Neon branch for a PR preview
async function createPreviewBranch(prNumber: number) {
  const response = await fetch(
    'https://console.neon.tech/api/v2/projects/{project_id}/branches',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}` },
      body: JSON.stringify({
        branch: { name: `preview-pr-${prNumber}`, parent_id: 'main' },
        endpoints: [{ type: 'read_write' }]
      })
    }
  );
  const { branch, endpoints } = await response.json();
  return { branchId: branch.id, connectionString: endpoints[0].connection_uri };
}

// Test a migration on a branch before applying to production
async function testMigration(sql: string) {
  const { connectionString } = await createPreviewBranch('migration-test');
  const testDb = neon(connectionString);
  try {
    await testDb.transaction(async (tx) => {
      await tx.raw(sql);
      await runMigrationTests(tx); // Verify integrity after migration
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await deleteBranch('migration-test');
  }
}
```

---

