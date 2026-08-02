### A19. Vector Databases Going Hybrid (pgvector in Postgres)

**What it is:** Vector similarity search embedded directly into an existing relational database rather than in a separate purpose-built vector store. Hybrid queries combine semantic similarity, full-text search, and relational filters in a single query.

**Why it matters:** One database — no sync between an operational DB and a separate vector store. Vectors update atomically with the rest of the record. Hybrid queries are possible without a join across two systems.

| Solution | Description |
|---|---|
| pgvector | Vectors in Postgres (HNSW and IVFFlat indexes) |
| sqlite-vec | Vectors in SQLite |
| Turbopuffer | Serverless vectors optimized for RAG |
| LanceDB | Embedded vector DB |

**When to use for Tovu:** Already in use — the `contents` and `agent_memories` tables have `embedding vector(1536)` columns with HNSW indexes, and `@tovu/search-postgres` implements hybrid search. The pattern to maintain: embeddings live in the same row as the content they represent, updated in the same transaction.

```typescript
// Hybrid search: semantic score + full-text score + relational filters — single query
async function hybridSearch(query: string, filters: SearchFilters) {
  const embedding = await embed(query);

  return db.$queryRaw`
    SELECT
      id, title, type, status,
      1 - (embedding <=> ${embedding}::vector) as semantic_score,
      ts_rank(search_vector, plainto_tsquery('english', ${query})) as text_score,
      (
        0.6 * (1 - (embedding <=> ${embedding}::vector)) +
        0.4 * ts_rank(search_vector, plainto_tsquery('english', ${query}))
      ) as combined_score
    FROM contents
    WHERE
      workspace_id = ${filters.workspaceId}
      AND status = 'published'
      AND embedding <=> ${embedding}::vector < 0.5
    ORDER BY combined_score DESC
    LIMIT ${filters.limit || 10}
  `;
}
```

---

