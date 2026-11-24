# site-search Overview

Owns Tovu's data layer for site search. The generic contract, indexer and query
service live in `@jini-ai/search` (Jini); this feature supplies the host ports
they need over the site's content database. Composition, routes, tools and the
plugin loader are wired elsewhere (`server/runtime/composition`).

## Responsibilities

- `index-state-store.ts` — `createSqlSearchIndexStore({ kernel, now })` returns
  `{ indexState, targets }`: `SearchIndexStatePort` and `SearchTargetPort` on the
  tables of migration `0027_search_index` (`search_index_state`,
  `search_index_watermarks`, `search_index_targets`) and `0028_search_index_retired`
  (`search_index_retired`). One Kysely body for SQLite, PGlite and Postgres.
  `promote` is a single compare-and-swap UPDATE on the building AND active
  pointers, so `replaced` is exactly what the switch displaced; the same
  transaction records `replaced` as retired until its index drop is confirmed.
  `settle` is a compare-and-swap UPDATE on the observed revision and task id.
- `cms-search-rules.ts` — `CMS_SEARCH_RULES`: the host rules the CMS search
  source and access port in `@jini-ai/search/site/{cms-document-source,access}`
  require — `isLiveAt` (public publish rule), `postPublicPath`, `toSearchText`
  (`toPostSearchDocument(toRecord(row))`, the post FTS projection's extraction)
  and `resolveMemberAccess` (`resolvePostMemberAccess`). The composition
  (`server/runtime/composition/modules/site-search.ts`) and `cms-search.test.ts`
  spread it into `createCmsSearchDocumentSources` / `createCmsSearchAccessPort`.
  The sources (`post` and `page`; `documentIdOf` claims only post.ts's
  `entry.published|updated|unpublished` with its own `payload.contentType`), the
  fail-closed access port and `memberSearchAudiences` moved to Jini; their pure
  unit tests live there, the dialect-matrix tests stay here.
- `settings.ts` — the per-site `core.search/provider` setting (default `builtin`):
  `ensureSearchProviderSetting`, `readSearchProviderSetting`,
  `writeSearchProviderSetting` (through the host settings chokepoint).

## Rules

- Never index or show anything the public site would not: draft, trashed and
  still-scheduled rows load as `document: null` (a tombstone).
- Member gates map to audiences `members`, `paid`, `tier:<id>`; an unreadable or
  unknown gate is restricted to no audience (fail closed). Restricted documents
  reach only providers that declare `acceptsRestricted` (the built-in).
- Revisions are `instantMs * 1000 + version % 1000` (see `cmsSearchRevision`):
  strictly increasing per key across saves, removals and a scheduled go-live.
- Provider ids match `^[a-z][a-z0-9_]{0,63}$`, checked on write and on read.

## Known gaps

- A bespoke HTML page edit now enqueues `entry.updated` from
  `SqlPagesHtmlDocumentStore` (when built with an `outbox`, as `deps.ts` does);
  the in-memory store and the peer-site store do not, so an edit there still
  reaches the index only through a backfill/reindex `scan`.
- A scheduled post's `entry.published` currently fires at save time; the go-live
  sweep is a separate fix. Until it lands, a scheduled post is indexed only by a
  later event or a reindex.
- The generic settings route can store a `core.search/provider` value outside the
  grammar (the chokepoint has no hook for it); the reader then refuses it.
