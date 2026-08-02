## 4. Port Interfaces

Every external dependency is behind a port. The core only knows about the interface, never the implementation. Adapters are injected at startup — the core has zero knowledge of Drizzle, Prisma, SQL, Postgres, Supabase, or any specific provider.

```typescript
// packages/content/src/port.ts
export interface DatabasePort {
  // Schema operations
  ensureTable(definition: TableDefinition): Promise<void>;
  migrateSchema(plan: MigrationPlan): Promise<MigrationResult>;

  // CRUD — works on abstract records, not SQL
  insert(table: string, data: Record<string, unknown>): Promise<{ id: string }>;
  findById(table: string, id: string): Promise<Record<string, unknown> | null>;
  findMany(table: string, query: ContentQuery): Promise<PaginatedResult>;
  update(table: string, id: string, data: Record<string, unknown>): Promise<void>;
  delete(table: string, id: string): Promise<void>;

  // Transactions
  transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}

export interface ContentQuery {
  where?: FilterExpression;
  orderBy?: OrderExpression[];
  limit?: number;
  offset?: number;
  include?: string[];  // relations to eager-load
}

// packages/media/src/port.ts
export interface StoragePort {
  upload(key: string, data: ReadableStream, metadata: FileMetadata): Promise<StoredFile>;
  getUrl(key: string, options?: UrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StoredFile[]>;
}

// packages/auth/src/port.ts
export interface AuthPort {
  validateSession(token: string): Promise<Session | null>;
  createSession(userId: string): Promise<Session>;
  destroySession(sessionId: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;
}

// packages/ai/src/port.ts
export interface LLMPort {
  complete(params: CompletionParams): Promise<CompletionResult>;
  stream(params: CompletionParams): AsyncIterable<StreamChunk>;
  embed(texts: string[]): Promise<number[][]>;
}

// packages/search/src/port.ts
export interface SearchPort {
  index(collection: string, doc: SearchDocument): Promise<void>;
  search(collection: string, query: SearchQuery): Promise<SearchResult>;
  remove(collection: string, id: string): Promise<void>;
  semantic(collection: string, embedding: number[], limit: number): Promise<SearchResult>;
}
```

### Swappable Adapters per Port

| Port | Current Adapters | Future Options |
|------|-----------------|----------------|
| `DatabasePort` | Drizzle/Postgres, Drizzle/SQLite, Kysely/Turso | Prisma, any SQL driver |
| `StoragePort` | Supabase Storage, S3, Local FS | Cloudflare R2, GCS |
| `AuthPort` | Supabase Auth, Lucia, Clerk, Auth.js | Any OAuth/session provider |
| `SearchPort` | pgvector, Meilisearch, Typesense | Elasticsearch, Algolia |
| `LLMPort` | Claude, GPT, Gemini | Any local or hosted model |

---

