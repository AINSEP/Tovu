# build-search REPORT — generic site search (2026-10-21)

Branch `cloud/build-search-2026-10-21` in both repos (base `cloud/integration-2026-10-21`). Pushed, never force-pushed.
- **Jini:** 5d9d87f3 contract · 1d2bb375 indexer/service/tools · 908e4982 registry/contribution/testkit · 9d4d2b9e CAPABILITIES · 7735628c principalId on set_provider (+ wip 5fb49887, ad97276f; merged provfix ddc1e606)
- **Tovu:** 579434fb data layer + migration 0023 · 824e8566 Meilisearch plugin + loader · 960fee47 composition/route/loop/tools (+ wip ee338f13, f438649c, e2533a76, 25051395)
- Time lost: every builder hit the account usage limit around 17:30Z and resumed at ~19:56Z when the limit lifted.

## What was built
- **`@jini-ai/search`** (new Jini package):
  - Frozen contract (`contract.ts`, `ports.ts`, `api.ts`).
  - Registry on the shared `createProviderRegistry`.
  - `./contribution`: plugin providers. **acceptsRestricted=true is refused for plugins**, so vendors are public-only.
  - Tokens.
  - Single-writer **indexer**:
    - It re-loads each document; it never trusts the event payload.
    - It writes to the active and building targets.
    - A restricted document going to a public-only provider becomes a tombstone.
    - A `unknown` result is never turned into `failed`.
    - Backfill is resumable with watermarks, and the generation switch is a compare-and-swap promote. The old index is dropped after the switch.
  - **Query service**:
    - Deadline-bounded (3 s).
    - Audiences are passed only to providers that accept restricted content.
    - Cross-site hits are dropped and every hit is revalidated through the access port. This fails closed and reports an explicit `unavailable` reason.
  - **Tools** `search_query`, `search_status`, `search_reindex` and `search_set_provider`.
    - The two write tools ask for human approval.
    - A reindex approval is remembered per provider; a provider switch never is.
  - **Conformance kit** `runSearchProviderConformance` (test runner is injected):
    - Covers audience isolation, stale writes, removing a never-indexed key, no resurrection, published→draft removes, async completion via `awaitTask`, index and site isolation, locale, collections, pagination, empty text, `revisionOf`, `dropIndex`, and the unavailable case.
    - 50 tests prove the kit catches broken providers.
  - Tiny **in-memory reference provider**, for tests only.
- **Tovu:**
  - Migration **0023_search_index**: tables `search_index_state`, `search_index_watermarks` and `search_index_targets`, on SQLite and Postgres.
  - SQL state/target store with an atomic CAS promote.
  - CMS `post` and `page` document sources.
    - Revision = instant×1000 + version%1000, so a scheduled post's go-live outranks its embargo tombstone.
    - Members gates become the audiences `members`, `paid` and `tier:<id>`.
  - Fail-closed access port.
  - Per-site setting `core.search/provider`, default `builtin`.
  - Composition module (`modules/site-search.ts`):
    - Built-in slot, **empty today**, so status reports `not_configured`.
    - Plugin vendors arrive through the contribution loader.
    - Vault credentials by label `Tovu Search — <Provider>`.
    - Guarded HTTP client.
    - Index names come from `deriveInstallationId`, plus site and generation.
  - Bus subscription next to SEO.
  - Maintenance loop in serving-app: reconcile + backfill every 30 s; at boot it starts a rebuild when the site has no target. It stops on shutdown.
  - Public `GET /api/search`:
    - Audiences come only from the member session.
    - Results are plain-text snippets with highlight ranges.
    - Bad input gets 400; an unavailable provider gets 503 `search_unavailable`.
  - Agent tools are registered through the tool-catalog manifest, with human confirm.
- **Meilisearch example vendor**, a bundled Agent Plugin at `content/agent-plugins/meilisearch/`:
  - Plain `.mjs`, no npm imports.
  - **Seeds disabled**: it gets site content only after the owner opts in.
  - Public-only, with versioned tombstone documents and a stale-revision check.
  - Async tasks are settled via `awaitTask`.
  - Snippets are built from sentinel highlight tags.
  - It never throws and never puts the API key in a message.
- **Indexing assumption:** indexing runs on `entry.published`, `entry.updated` and `entry.unpublished`. It assumes the scheduled-post fix (cloud/fix-scheduled-2026-10-21) makes `entry.published` fire at go-live.
  - Until that fix lands, a scheduled post reaches the index only through a later event or a reindex.
  - The design's new delete event was dropped: trash already emits `entry.unpublished`.

## Tests run here (all green)
- **Jini `packages/search`:**
  - `pnpm typecheck` passes.
  - `pnpm test:coverage`: 279/279 tests pass, 100% per-file coverage on every measure.
  - Three builders independently ran deliberate-break checks; tests fail on each break.
- **Tovu search suites:** 136/136 pass (node:test). Run as `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 …`.
  - Covers site-search, the migration step, Meilisearch, the composition module, the route and the wiring.
  - Includes PGlite runs and a real-SQLite boot integration test.
  - Coverage is 100% on all new files, including `meilisearch.mjs`.
- **Wider Tovu suites:**
  - `assistant/`: 2586 pass, 0 fail.
  - `composition/`: 627 pass. The 10 failures are `*.postgres.test.ts` that need a Postgres server.
  - `agent-plugins/unit`: 1062 pass, 0 fail.
- **Typecheck:** apps/website `tsc` shows the same 10 errors as before these changes, none in search files.
- **Pre-existing failures, not caused by this build:**
  - Jini `pnpm guard` self-test fails on the unmodified tree.
  - Tovu `check:architecture` fails on the base.
  - `check-hardwiring` fails on the ui-ux-design example.

## What the owner's built-in provider must implement
1. **The interface.** Implement `SearchProvider` from `@jini-ai/search` with `id: 'builtin'` and `credentialKeys: []`.
   - Register it through the empty `builtinProvider` slot in `server/runtime/composition/modules/site-search.ts`. That is a core registration; plugins cannot claim the id.
2. **Capabilities.** It may set `acceptsRestricted: true`; it is the only provider allowed to hold members-only content. Choose `asyncIndexing: false` unless you queue writes, and declare `typoTolerance` and `locales` honestly.
3. **Methods.** `ensureIndex`, `dropIndex`, `upsert`, `remove`, `query` and `revisionOf`, plus `awaitTask` if writes are async.
   - Never throw: return `ProviderResult` with `ok`, `rejected` or `unknown`.
   - Writes return one outcome per input, in input order.
4. **Storage.** Keep state in your own tables through `ctx.storage`, created by your own ADR-066 migration on both dialects.
   - SQLite uses FTS5. Postgres and PGlite use tsvector; check extension availability under PGlite.
   - Partition all data by `ctx.indexName`. That is per install, site, provider and generation, and is what makes the switch atomic.
5. **Revisions.** A write whose revision is not strictly greater than what you hold for the key (a document or a tombstone) returns `stale` and changes nothing.
   - `remove` writes a versioned tombstone, including for keys you never saw.
6. **Query semantics.**
   - Restricted documents are returned only when `query.audiences` intersects their audiences.
   - Snippets are plain text with UTF-16 highlight ranges; never HTML.
   - Empty text gets `rejected` with `invalid_request`.
   - The cursor is opaque and pages are stable.
7. **Done means:** it passes `runSearchProviderConformance` from `@jini-ai/search/testkit` unchanged.
   - Reference examples: `testkit/memory-provider.ts` (semantics) and `content/agent-plugins/meilisearch/providers/meilisearch.mjs` (a vendor).
   - Prior art for relevance: the post FTS projection and its eval set.

## TEMP definitions left
- **None.** Jini merged the real shared helper (ddc1e606) before any search code was written.
- Tovu's provfix branch has no shared-helper commit (only mail and webhook fixes), so nothing was merged into Tovu.

## LOCAL-RUN NEEDED
- **Postgres:** `runner.postgres.test.ts` (it expects 84 tables and head 0023) and the 10 composition `*.postgres.test.ts`; they need a Postgres server.
- **Real Meilisearch:** conformance against a real Meilisearch v1.3+ container. Check filter escaping, and how long the `ensureIndex`/`dropIndex` task waits take against the 3 s budget.
- **End to end in a browser:** publish a post, then `/api/search?q=…` (search answers 503 `not_configured` until the built-in exists or Meilisearch is enabled).
- **Dependency packaging:** **`@jini-ai/search` is not in Tovu's `package.json`.** It is unpublished, so adding it would break `npm ci`, and it resolves only through the link script plus a manual symlink. Publish 0.1.0, then run `npm i @jini-ai/search@^0.1.0`.

## Owner questions
1. **Contract sign-off.** The gap check asked for owner agreement before implementation; this build froze it so the work could proceed. Is the contract (`packages/search/src/contract.ts`, `ports.ts`, `api.ts`) acceptable as is?
2. **Database transfer.** Should the `search_index_*` tables be excluded from database transfer (`database-transfer/exclusions.ts`)? Copied state would claim documents are indexed on another install.
3. **Migration number.** 0023 may collide with other cloud jobs' migrations. Renumber at merge?
4. **HTML page edits.** Bespoke HTML page edits (`SqlPagesHtmlDocumentStore.write`) emit no event, so they reach the index only through backfill or reindex. Should those edits emit `entry.updated`?
5. **Middleware.** `/api/search` is mounted before the site serving gate and consent middleware. OK, or should it go behind them?
6. **Self-hosted Meilisearch.** The guarded egress policy blocks private addresses, so `http://localhost` Meilisearch can't be used. Is that acceptable for a dev setup?
7. **Follow-ups.** Theme search block and an Algolia vendor are not in this build. Still wanted?
8. **Exposed files.** `features/site-search` has no `index.ts` barrel, so the architecture check's count of exposed files rose from 698 to 704. Add one?
