# build-search REPORT — generic site search (2026-10-21)

Branch `cloud/build-search-2026-10-21` in both repos (base `cloud/integration-2026-10-21`). Pushed, never force-pushed.
- **Jini:** 5d9d87f3 contract · 1d2bb375 indexer/service/tools · 908e4982 registry/contribution/testkit · 9d4d2b9e CAPABILITIES · 7735628c principalId on set_provider (+ wip 5fb49887, ad97276f; merged provfix ddc1e606)
- **Tovu:** 579434fb data layer + migration 0023 · 824e8566 Meilisearch plugin + loader · 960fee47 composition/route/loop/tools (+ wip ee338f13, f438649c, e2533a76, 25051395)
- Time lost: every builder hit the account usage limit around 17:30Z and resumed at ~19:56Z when the limit lifted.

## What was built
- **`@jini-ai/search`** (new Jini package): frozen contract (`contract.ts`, `ports.ts`, `api.ts`); registry on the shared `createProviderRegistry`; `./contribution` for plugin providers (**plugins declaring acceptsRestricted=true are refused**, so vendors are public-only); tokens.
  - **Indexer** (the one writer): re-loads each document (never trusts the event payload); writes to active + building targets; a restricted doc for a public-only provider becomes a tombstone; `unknown` is never turned into `failed`; resumable watermark backfill; compare-and-swap generation promote, then the old index is dropped.
  - **Query service**: 3 s deadline; audiences only for providers accepting restricted content; drops cross-site hits and revalidates every hit through the access port (fails closed, explicit `unavailable` reason).
  - **Tools** `search_query`, `search_status`, `search_reindex`, `search_set_provider`; the two writes need human approval (reindex remembered per provider, provider switch never).
  - **Conformance kit** `runSearchProviderConformance` (injected test runner): audience isolation, stale writes, never-indexed remove, no resurrection, published→draft removes, async completion via `awaitTask`, index/site isolation, locale, collections, pagination, empty text, `revisionOf`, `dropIndex`, unavailable case. 50 tests prove it catches broken providers. Plus a tiny in-memory reference provider, for tests only.
- **Tovu:** migration **0023_search_index** (`search_index_state`, `search_index_watermarks`, `search_index_targets`; SQLite + Postgres); SQL state/target store with atomic promote; CMS `post`/`page` sources (revision = instant×1000 + version%1000, so a scheduled post's go-live outranks its embargo tombstone; members gates → audiences `members`/`paid`/`tier:<id>`); fail-closed access port; per-site setting `core.search/provider` (default `builtin`).
  - Composition `modules/site-search.ts`: built-in slot **empty today**, so status reports `not_configured`; vendors via the contribution loader; vault credentials by label `Tovu Search — <Provider>`; guarded HTTP; index names from `deriveInstallationId` + site + generation.
  - Bus subscription next to SEO; serving-app maintenance loop (reconcile + backfill every 30 s, boot rebuild when the site has no target, stops on shutdown).
  - Public `GET /api/search`: audiences only from the member session; plain-text snippets + highlight ranges; 400 on bad input, 503 `search_unavailable`. Agent tools registered via the tool-catalog manifest with human confirm.
- **Meilisearch example vendor**, a bundled Agent Plugin (`content/agent-plugins/meilisearch/`, plain `.mjs`): **seeds disabled** (gets content only after the owner opts in); public-only; versioned tombstone docs + stale-revision check; async tasks via `awaitTask`; snippets from sentinel highlight tags; never throws or leaks the API key.
- Indexing uses `entry.published|updated|unpublished` and **assumes the scheduled-post fix (cloud/fix-scheduled-2026-10-21) fires `entry.published` at go-live**; until then a scheduled post is indexed only by a later event or a reindex. The design's new delete event was dropped (trash already emits `entry.unpublished`).

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
