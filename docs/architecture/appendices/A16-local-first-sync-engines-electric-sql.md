### A16. Local-First / Sync Engines (Electric SQL)

**What it is:** The browser holds a full local copy of relevant data in SQLite. All reads and writes are instant (local). A sync engine propagates changes to and from the server in the background, with conflict resolution built in.

**Why it matters:** Zero-latency UI updates. Offline capability. No optimistic update boilerplate — writes are local and therefore always succeed immediately.

| Solution | Description |
|---|---|
| Electric SQL | Postgres that syncs to SQLite in browser |
| PowerSync | Offline-first, mobile focus |
| Triplit | Full relational DB in browser |
| cr-sqlite | CRDTs built into SQLite |

**When to use for Tovu:** The content editor is the highest-value candidate. Autosave, collaborative editing, and draft management all benefit from local-first semantics. If Tovu ever adds a mobile admin app, local-first becomes essential rather than optional.

**When NOT to use:** Multi-user real-time collaboration on the same document requires CRDT-aware sync (Yjs integration), which adds complexity. Start with local-first for single-user editing flows first.

```typescript
import { electrify } from 'electric-sql';

const electric = await electrify(sqliteDb, schema, {
  url: 'https://api.myapp.com/electric'
});

// Reactive query — re-renders automatically when sync delivers changes
const { results: posts } = useLiveQuery(
  electric.db.contents.liveMany({
    where: { type: 'post', status: 'published' },
    orderBy: { publishedAt: 'desc' }
  })
);

// Write is instant (local SQLite) — sync happens in background
async function createPost(data: NewPost) {
  await electric.db.contents.create({
    data: { id: generateId(), ...data, status: 'draft', createdAt: new Date() }
  });
  // UI updates immediately. Server receives the change asynchronously.
}
```

---

