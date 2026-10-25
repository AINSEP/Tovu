# Site search — generic contract + provider plugins (design, report-only)

Scope: contract, host wiring, event-driven indexing, agent tools, conformance kit, two example vendor
plugins. **The built-in default provider is the owner's** — only its required surface is specified (§6).
Evidence: no public site search exists; the only search is the admin post FTS projection
`apps/website/src/features/post/search-index.ts:22` (`PostSearchDialect`, SQLite FTS5 + Postgres
tsvector, eval-gated). Content lifecycle events exist: `features/post/post.ts:2093-2097` emits
`entry.published|updated|unpublished` through the outbox; SEO already subscribes
(`server/runtime/composition/app.ts:1750-1752`). Bus contract: Jini `cms/src/core/ports.ts:68`.

## 1. File tree
```
Jini/packages/search/                      @jini-ai/search (new, product-neutral, universal runtime)
  src/contract.ts        SearchProvider, SearchDocument, SearchQuery, SearchError (typed, never thrown)
  src/registry.ts        createSearchProviderRegistry()  (clone of commerce/src/payments/registry.ts)
  src/tokens.ts          SearchProviderRegistryToken, ActiveSearchProviderToken, SearchDocumentSourceToken (manyToken)
  src/indexer.ts         createSearchIndexer() — the ONE writer of index state; outbox subscriber
  src/contribution.ts    defineSearchProviderContribution({filename}) → defineExecutablePluginContribution
  src/tools.ts           search.query / search.status / search.reindex / search.set_provider
  src/testkit/index.ts   runSearchProviderConformance() + in-memory fakes (exported ./testkit)
Jini/packages/search-meilisearch/  (or an Agent Plugin package)  example vendor provider
Jini/packages/search-algolia/                                    example vendor provider
Tovu/apps/website/src/features/site-search/   product wiring: CMS document source, settings, routes, theme block
Tovu/apps/website/src/platform/db/migrations/00NN_search_index_state.ts   ADR-066 TS migration
```

## 2. Contract (Jini `src/contract.ts`)
```ts
export type SearchProviderId = string;              // open string, ADR-026 grammar (as PaymentProviderId)
export interface SearchDocument {
  readonly id: string; readonly collection: string;  // e.g. "post", "page", "product"
  readonly version: string;                          // monotonic (updatedAt or revision) — idempotency + reconcile
  readonly locale?: string; readonly url: string; readonly title: string; readonly body: string;
  readonly fields?: Readonly<Record<string, string | number | boolean | readonly string[]>>; // facets/filters
  readonly visibility: "public" | { readonly audience: string };  // members tiers → audience filter
}
export interface SearchQuery {
  readonly text: string; readonly collections?: readonly string[]; readonly locale?: string;
  readonly filters?: Readonly<Record<string, string | number | boolean>>;
  readonly audiences?: readonly string[];            // host injects from viewer; never from user input
  readonly limit?: number; readonly cursor?: string; }
export interface SearchHit { readonly id: string; readonly collection: string; readonly url: string; readonly title: string; readonly snippet: string; readonly score: number }
export interface SearchCapabilities { readonly facets: boolean; readonly typoTolerance: boolean;
  readonly locales: readonly string[] | "any"; readonly maxBatch: number; readonly versionLookup: boolean }
export type SearchErrorCode = "NOT_CONFIGURED" | "TRANSPORT_ERROR" | "PROVIDER_ERROR" | "INVALID_REQUEST" | "QUOTA";
export type SearchResult<T> = { ok: true; value: T } | { ok: false; code: SearchErrorCode; message: string; retryable: boolean };
export interface SearchProviderContext {            // pre-resolved per provider, as commerce ProviderContext
  readonly workspaceId: string; readonly indexName: string;
  readonly credentials: Readonly<Record<string, string>>;
  readonly httpClient: HttpClientPort;               // ADR-038 guarded egress; no raw fetch
  readonly storage?: StorageKernelPort;              // only for in-process providers (the built-in)
  readonly now: () => number;
}
export interface SearchProvider {
  readonly id: SearchProviderId; readonly label: string; readonly capabilities: SearchCapabilities;
  readonly credentialKeys: readonly string[];
  ensureIndex(ctx: SearchProviderContext, required: { collections: readonly string[] }): Promise<SearchResult<void>>;
  upsert(ctx: SearchProviderContext, required: { documents: readonly SearchDocument[] }): Promise<SearchResult<{ accepted: number }>>;
  remove(ctx: SearchProviderContext, required: { ids: readonly string[] }): Promise<SearchResult<void>>;
  query(ctx: SearchProviderContext, required: { query: SearchQuery }): Promise<SearchResult<{ hits: readonly SearchHit[]; next?: string }>>;
  /** Optional when capabilities.versionLookup=false; used to reconcile UNKNOWN outcomes. */
  versionOf?(ctx: SearchProviderContext, required: { ids: readonly string[] }): Promise<SearchResult<Readonly<Record<string, string | null>>>>;
  clear(ctx: SearchProviderContext, required: Record<string, never>): Promise<SearchResult<void>>;
}
export interface SearchDocumentSource {             // manyToken: CMS posts/pages, commerce catalog, plugins
  readonly collection: string;
  load(required: { workspaceId: string; id: string }): Promise<SearchDocument | null>; // null = not indexable
  scan(required: { workspaceId: string; cursor?: string }): Promise<{ docs: readonly SearchDocument[]; next?: string }>;
  readonly events: { readonly upsert: readonly string[]; readonly remove: readonly string[] };
}
```
Rules (commerce `ports.ts` discipline): stateless, never throw, no Tovu tables (built-in: own tables via `ctx.storage`).

## 3. DI / composition
- Jini tokens: `SearchProviderRegistryToken = token<SearchProviderRegistry>(…)`,
  `SearchDocumentSourceToken = manyToken<SearchDocumentSource>(…)`, `SearchServiceToken = token<SearchService>(…)`.
- Tovu `server/runtime/composition/modules/site-search.ts`: build registry from (a) the bundled built-in
  provider, (b) providers loaded via the contribution loader; read site setting `search.provider`
  (default `"builtin"`); resolve credentials from the vault (existing `vendor-credentials` feature);
  bind `SearchService = createSearchService({ registry, activeId, contextFor })` — consumers (theme
  search block, `/api/search` route, agent tools) only ever receive the `SearchService` port.
- Indexer subscribes on the existing `EventBusPort` to every `source.events` name (today
  `entry.published|updated` → upsert, `entry.unpublished` → remove). **Gap:** trash/permanent-delete emit no
  entry event → Lot S2 adds `entry.deleted` (or emits `entry.unpublished` on trash).

## 4. Plugin registration (contribution loader)
`defineSearchProviderContribution({ filename: "tovu-search-providers.json" })` wraps
`defineExecutablePluginContribution` (Jini `agent-plugins/src/lifecycle/contribution-loader.ts:108`):
descriptor `{ id, module, credentialKeys }`; `validate` checks the default export is a
`SearchProvider` factory `(kit) => SearchProvider` with matching `id`; refusal lines as the mail registry
(`Tovu features/agent-plugins/mail-adapter-registry.ts:56`). Trust comes from the host lifecycle
(activation + trusted package digest), never from the manifest (`manifest.ts:~10`). Plugins ship no
npm deps; the kit supplies `httpClient`. Registration throws on duplicate id / bad grammar at boot.

## 5. Indexing — one writer, unknowns reconciled
Table `search_index_state(workspace_id, provider_id, doc_id, collection, version, status, attempts,
updated_at)`, status ∈ `pending|indexed|removed|unknown|failed`. ADR-066 TS migration; Kysely body works on
SQLite + Postgres (PGlite/Supabase) via the storage kernel. Handler: mark `pending` → call provider →
`indexed`/`failed(retryable)`; a timeout/transport error becomes `unknown`, **never `failed`**. A
reconcile job resolves `unknown` with `versionOf()` (or re-upserts, idempotent by `version`). Switching
provider = new `provider_id` rows + background `scan()` backfill; old provider serves queries until the
backfill is ≥ `indexed` for all docs (blue/green), then flips `search.provider`.

## 6. What the owner's built-in provider must implement
Exactly `SearchProvider` above with `id: "builtin"`, `credentialKeys: []`, `capabilities.versionLookup:
true`, using `ctx.storage` (storage kernel) on its own tables, created by its own ADR-066 migration.
Dialects that matter: `StorageDialect = "sqlite" | "postgres"` (Jini `db/src/kernel/port.ts:33`). SQLite
→ FTS5 (also on Cloudflare D1 if used as a target); Postgres → `tsvector`/`pg_trgm` — and **PGlite is
the Postgres dialect too, so check extension availability there** (pg_trgm needs loading in PGlite). The
existing post projection (`search-index.sqlite.ts`/`.postgres.ts`) is prior art and its eval set
(`features/post/__tests__/search.eval.ts`) can seed the kit's relevance fixtures. It must pass
`runSearchProviderConformance` unchanged.

## 7. Conformance kit (`@jini-ai/search/testkit`)
`runSearchProviderConformance({ name, makeProvider, makeContext, test, expect })` (test runner injected,
no vitest import) asserts: upsert→query finds it; upsert same id newer version replaces; older version
ignored or overwritten deterministically (declared); remove → absent; audience-filtered docs never
returned without the audience; locale filter; `limit`/cursor stable; empty text → INVALID_REQUEST;
transport fake failure → `{ok:false, retryable:true}` and no throw; `versionOf` agrees with last upsert;
`clear` empties. Ships `createFakeHttpClient()` + recorded-fixture helpers for vendor adapters.

## 8. Agent tools (Jini `src/tools.ts`, generic category "search")
| tool | effect | gate |
|---|---|---|
| `search.query` | read | none (viewer audiences from principal, public only for agents by default) |
| `search.status` | read | none — counts by status, active provider, last error |
| `search.reindex` | bulk write to vendor (cost) | `createApprovalHandler` (core/src/approval.ts:55), `rememberKey` per provider |
| `search.set_provider` | settings change + backfill | approval, never remembered |

## 9. Example vendor plugins
- **Meilisearch** (`search-meilisearch`): credentials `host`, `apiKey`; `upsert` → `POST /indexes/{i}/documents`
  (async task id; poll task → `unknown` until done); audiences as filterable attribute; `versionOf` via
  `GET documents?fields=version`.
- **Algolia**: `appId`/`writeKey`/`searchKey`; `batch` endpoint, `objectID=id`; audiences via secured keys; 429→`QUOTA`.

## 10. Lots (each independently testable, 100% per-file with fakes)
S1 `@jini-ai/search` contract + registry + tokens + testkit (fake in-memory provider passes kit) ·
S2 Tovu `entry.deleted` on trash/permanent delete + CMS `SearchDocumentSource` for posts/pages ·
S3 `search_index_state` migration + indexer + reconcile job · S4 `SearchService` composition + `/api/search` +
theme search block · S5 contribution definition + Tovu loader wiring · S6 agent tools + approvals ·
S7 Meilisearch plugin · S8 Algolia plugin · (owner) built-in provider against the kit.

## 11. Risks
Member-only/draft leak to a vendor (source returns null for non-public; audience mandatory) · missed deletes (S2) ·
vendor async → stale reads (`unknown`) · reindex cost (approval) · index collisions (`indexName=<site>-<ws>`).

## 12. Owner questions
1. Index members-only content with audience filters, or public-only in v1?
2. Should commerce products be a `SearchDocumentSource` in v1 (commerce is off today)?
3. Built-in provider: per-dialect FTS (like the post projection) or one portable trigram table?

## GAP-CHECK OVERRIDES (2026-10-21 ~16:30Z — Opus, Sonnet, Codex). WIN over the sections above.
- OWNER must agree to the contract before implementation (he builds the built-in provider).
- Vendors are PUBLIC-ONLY: capability flag `acceptsRestricted` — only the built-in may hold audience-filtered content; revalidate publication/access before returning titles/snippets/URLs (fail closed).
- BUG to fix first: scheduled posts fire `entry.published` at save time (`classifyStatusTransition` ignores `publishAt`, post.ts:2090-2100) → embargoed content can leak; add a go-live sweep.
- Drop S2's new delete event: published trash already emits `entry.unpublished` (post.ts:712/757).
- Keys: namespaced site/workspace/collection/document; numeric revision + versioned tombstones (no resurrection); resumable backfill with watermarks; atomic generation switch; index names from the install id.
- Snippets = plain text + highlight ranges (no HTML); facets returned or dropped from v1; per-site `search.provider` setting; bounded vendor timeouts + explicit unavailable state (warm built-in fallback = later).
- Example vendors ship as Agent Plugins (trust gate), Meilisearch v1, Algolia later; underscore tool names (`search_query`).
- Conformance kit: audience isolation, stale writes, never-indexed remove, published→draft removes, async completion, index isolation between sites.
