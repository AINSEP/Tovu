# site-search Overview

Owns Tovu's data layer for site search. The generic contract, indexer and query
service live in `@jini-ai/search` (Jini); this feature supplies the host ports
they need over the site's content database. Composition, routes, tools and the
plugin loader are wired elsewhere (`server/runtime/composition`).

## Responsibilities

- The SQL index-state and target stores live in Jini (`@jini-ai/search/site/index-state-store`,
  `createSqlSearchIndexStore({ kernel, now, tables })`). `server/runtime/composition/modules/site-search.ts`
  binds them to the content kernel and the table names of migrations `0027_search_index` and
  `0028_search_index_retired` (`SEARCH_INDEX_TABLES`).
- `cms-document-source.ts` — `createCmsSearchDocumentSources({ kernel, now })`:
  `post` and `page` sources (the two `kind`s of `posts`). `documentIdOf` claims
  only post.ts's `entry.published|updated|unpublished` with its own
  `payload.contentType`. `load`/`scan` index exactly what the public site shows
  (`isLiveAt`); text comes from the post FTS projection's extraction
  (`toPostSearchDocument`), URLs from `postPublicPath`.
- `access.ts` — `createCmsSearchAccessPort({ kernel, now })`: re-reads the hit
  rows (one query per collection) and keeps only live, same-site, same-workspace
  keys whose member gate admits the viewer. `memberSearchAudiences({ context })`
  turns a validated `MemberContext` into audience tokens.
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
