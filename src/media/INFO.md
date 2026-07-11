# media Overview

Walking-skeleton implementation of ADR-027 (Media/Assets Subsystem). Owns
upload, listing, metadata edit, and a trash→purge deletion ladder for media
assets, plus the two core-owned operational sidecars ADR-027 §2 specifies.

## Disclosed scope adjustment: bespoke table, not generic entries

ADR-027 describes a media asset as a seeded `entries` content-type entry
(ADR-022) — editorial fields on a generic entry row, with revisions, taxonomy,
and `entry_refs` inherited for free. **That generic entries model does not
exist as running code in this repo** (ADR-022 is ACCEPTED design, never
implemented; `post` itself is still a bespoke first-class table). This library
is therefore built exactly the way `post` is built: `MediaRecord` is a bespoke
record with editorial fields (`title`/`alt`/`caption`/`credit`) inlined
directly. See `src/features/post/post.ts` for the pattern this mirrors, and
`types.ts`'s file header for the full note. When the generic entries system
ships, both `post` and `media` are candidates to migrate onto it.

The two sidecars — `asset_blobs` (physical bytes) and `asset_renditions`
(derived variants) — ARE built as ADR-027 §2 intends: core-owned, single-writer
tables independent of the entries question.

## Blob GC (ADR-027 §5 INV-1) — built in `blob-gc.ts` / `blob-gc-lock.ts`

The journaled tombstone -> delete-pass -> unlink-pass protocol is real:
`isBlobUnreferenced` does the actual sha256-uniqueness-across-non-purged-media
check; every `asset_blobs` transition (upload dedup, tombstone, delete,
unlink) runs inside `withSha256Lock` (an in-process per-sha256 mutex — this
build's substitute for `BEGIN IMMEDIATE` against an in-memory table, not a
cross-process guarantee); `gc_grace` defaults to 30 days via the injectable
clock. `purgeMedia` now only tombstones a newly-unreferenced blob — it no
longer deletes bytes itself. Still disclosed-stubbed within that protocol
(named functions in `blob-gc.ts`, not silently skipped): the `entry_refs`
where-used conjunct (ADR-022 not implemented), the retained-snapshot conjunct
(Storage/Backups primitive not implemented), and the monthly orphan sweep
(needs a scheduler this repo doesn't have — its function exists but is never
called).

## Named transform registry + rendition generation (ADR-027 §4) — built in
`transform-types.ts` / `transform-registry.ts` / `rendition-service.ts` /
`transform-lock.ts` / `image-transformer*.ts`

Core-declared named transform definitions (`registerTransform`), stored
append-only in an in-memory `transform_registry` keyed
`(workspaceId, name, version)` — redefining a name mints a new version, the
old version's row is never mutated. The public, unauthenticated
`GET /m/{assetId}/{transformName}.v{version}/{slug}.{ext}` route
(`server/routes/site/media-rendition.ts`) serves an existing rendition
unconditionally (serve-if-exists), and lazily generates an as-yet-ungenerated
one only if its `(name, version)` is the latest registered version of `name`
(older/unreferenced versions are never anonymously materialized — the
registry-history amplification guard). Generation is in-process, single-flight
per `(sha256, transformName, version)` (`withRenditionLock`,
`transform-lock.ts`).

Disclosed scope adjustments:
- **No theme/plugin declaration API** — only the core-declared registration
  path exists; `owner` is kept a plain string (not a hardcoded `"core"`
  literal) so a future declarer slots in without a schema change.
- **No eager hot-set generation** (the ADR-009 outbox worker half) and **no
  out-of-process generation** (the worker/process ADR-027 §1/§4 wants to
  protect the host from `sharp` OOMing) — this build calls the
  `ImageTransformerPort` synchronously, in-process, inside the request.
- **`isReferencedByPublishedContent` is a stub** (always `false`) — same
  `entry_refs`-doesn't-exist-yet gap `blob-gc.ts`'s `hasLiveEntryRefs` names.
- **`sharp` is not an installed dependency in this repo** as of this build.
  `SharpImageTransformer` (`image-transformer.sharp.ts`) is written as the
  real, production-shaped adapter — properly typed, lazily `require()`s
  `sharp` at call time — but throws a clear `ImageTransformUnavailableError`
  instead of faking output bytes until `npm install sharp` is run. Hermetic
  tests and the dev/test composition (`server/app.ts`) use
  `InMemoryImageTransformer` instead (a deterministic, non-real test double);
  the real running server (`server/deps.ts`) is wired to `SharpImageTransformer`.
- **Purged-vs-never-existed is indistinguishable** at the rendition route:
  `purgeMedia` hard-deletes with no tombstone, so `rendition-service.ts` maps
  "no media row" to `404` and the one gone-but-observable state this build
  actually has — `status === "trashed"` — to `410`. See that file's doc
  comment on `resolveMediaRendition`.

## What this pass deliberately does NOT build

Named and reasoned about in `media-service.ts`'s and `blob-gc.ts`'s file
headers — summarized:

- **Origin-isolated serving**: the new `/m/` route lives on the same Express
  app/process as everything else (no second listener/process, no cookie-less
  media origin) — a disclosed simplification, not the full ADR-027 §1 design.
- **`MediaIngressPolicy`**: a byte-size cap and an advisory MIME allowlist
  only — no SSRF guards, magic-byte sniffing, or pixel-bomb caps.
- **Where-used**: no `entry_refs` index; `purgeMedia`'s 409 guard (the row-level
  trash-before-purge gate, separate from blob GC's unreferenced check above)
  still uses "not yet trashed" as an explicit stand-in.
- Virus scanning, remote-URL upload, video pipeline states, S3 adapter — all
  deferred by ADR-027 itself.

## Rules

- Keep media business rules inside this feature (`media-service.ts`), not in
  Express routes.
- Repositories and blob storage stay behind their ports (`ports.ts`); routes
  and the composition roots (`src/server/app.ts`, `src/server/deps.ts`) only
  wire concrete adapters in.
- `source.sha256` is write-once (`resolveWriteOnceSource`) — no write path may
  add a way to change it without also updating that guard and its test.

## Persistence direction

Same JSON/relational split guidance as `post`'s INFO.md: `MediaRecord`'s
editorial fields are plain relational columns here (no JSON body yet, unlike
`post.bodyJson`) since there's no rich-content payload for a media asset in
this pass — just scalar editorial metadata.
