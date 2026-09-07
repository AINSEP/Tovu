# Media identity audit — is there slug/unique-id enforcement?

**Direct answer:** There is no slug at all — Tovu's media system has never had a `slug` column or field. Every lookup, in the admin, the render path, and raw-HTML embed markers, is keyed exclusively by the media row's `id` (a `crypto.randomUUID()` value). The human-facing text you're remembering (`woodnest-cabin-booking`) is the `title` field, and it carries **zero uniqueness enforcement** — no DB unique index, no application-level check, not even on collision. What IS uniquely enforced, at the DB level, is content-addressing: identical bytes uploaded twice always dedupe to one stored blob (`UNIQUE(workspace_id, sha256)`), but that dedup happens on `asset_blobs`, a *different* table from `media` — it does not stop you from creating two separate `media` library rows (two titles, two ids) that both point at that one deduped blob. So: **id uniqueness is real (structural — UUIDs, never checked because never colliding); title/"slug" uniqueness is not enforced at all; content dedup is real and DB-backed, but at the blob layer, not the media-row layer.**

## 1. What identifies a media asset

`MediaRecord` (`node_modules/@jini-ai/cms/src/media/types.ts`, mirrored in Tovu's `apps/website/src/platform/db/schema.ts:1239-1259` and `schema.postgres.ts:586-601`) has these columns: `id, workspaceId, title, alt, caption, credit, sourceSha256, status, createdAt, updatedAt, version, width, height, cssClass`. There is **no `slug` column, ever** — not in the schema, not in `MediaRecord`, not in the live DB (verified below).

- **Key (identity):** `id` — a UUID from `randomUUID()` (`apps/website/src/server/runtime/composition/app.ts:269`, `deps.ts:730`). Every repo method (`SqliteMediaRepo.findById/save/remove`, `apps/website/src/platform/db/sqlite/media-repo.sqlite.ts:61-96`) keys on `(workspaceId, id)`.
- **Display only:** `title` — set once at upload from the filename (`deriveTitleFromFilename`, `node_modules/@jini-ai/cms/src/media/media-service.ts:144-146`, strips the extension, falls back to `"Untitled"`), editable afterward via `updateMediaMetadata` (same file, ~line 377-406). It is `.trim()`ed, nothing else. No format constraint, no length cap, no dedup check.

## 2. Uniqueness enforcement — is it real?

Checked the actual `media` table in both dialects and the live DB. **The only unique thing on `media` is the primary key on `id`.**

- `schema.ts:1239` (SQLite) and `schema.postgres.ts:586` (Postgres) define `media` with **no `uniqueIndex(...)` call at all** — contrast with `assetBlobs` two tables above it, which does carry one (`schema.ts:1300`: `uniqueIndex("idx_asset_blobs_workspace_sha256").on(table.workspaceId, table.sha256)`, matching in Postgres at `schema.postgres.ts:109`).
- Verified against the live DB (read-only): `sqlite3 "file:.../sites/tovu-com/content.db?mode=ro" "SELECT name, sql FROM sqlite_master WHERE tbl_name='media';"` returns exactly one index, `sqlite_autoindex_media_1` — SQLite's automatic index for the `id PRIMARY KEY`. Nothing else. The live schema matches `schema.ts` verbatim (no drift on this table).
- `SqliteMediaRepo.save()` (`media-repo.sqlite.ts:69-92`) does a manual `findById` then branches `update`/`insert` — it never even attempts to catch a unique-constraint error the way `SqliteTransformDefinitionRepo.insert()` does (`media-repo.sqlite.ts:307-331`, which explicitly relies on and catches a real `UNIQUE constraint failed` from the `(workspace_id, name, version)` index it documents as "append-only... fail at the storage layer, not just by convention"). Media has no equivalent — because there is no equivalent index to fail against.
- The schema.ts comment at line 1236 ("this table has no DB-level constraint for it, matching every other write-once field in this schema") is about `source_sha256`'s write-once-ness specifically, not about a name/slug — confirmed true against the code: `resolveWriteOnceSource` (`media-service.ts:131-142`) is an **application-layer-only** guard, and it's also, per its own doc comment, "not currently reachable through any exposed write path" since `UpdateMediaMetadataInput` has no `sha256` field to trigger it.

**Verdict for this section: enforced (id, via PK) vs. conventional-but-unenforced (title — no convention even attempts it).**

## 3. The raw-HTML path specifically

Two distinct raw-HTML mechanisms exist, and both resolve by `id`, never by name:

**(a) Embed markers** (`data-embed-type="media" data-embed-config='{"type":"media","id":"<uuid>","variant":"..."}'`) authored directly in an `"html"`-format Page's `body_html`. Resolution: `resolveOneMediaEmbed` (`apps/website/src/features/widgets/resolver-service.ts:596-637`) calls `mediaRepo.findById({ workspaceId, id: assetId })` (line 607) where `assetId` comes straight from the marker's `data-embed-id` (`parseMediaEmbedRef`, lines 540-554) — shape-validated (`isPlausibleMediaRefId`, lines 482-487: non-empty, ≤200 chars, no whitespace/slash) but never checked against any "name." On a miss (`!record`, line 608) it logs a warning and returns `undefined` — never throws (REQ-27); the caller (`render.ts`'s `renderHtmlPageBody`) degrades the whole marker to a placeholder per REQ-28. There is no "collision" case to speak of because nothing is looked up by name — a miss is just "no such id," full stop.

**(b) A raw `<img>`/`<video>` tag pointing straight at `/m/<id>/original` or `/m/<id>/<transform>.v<n>/<slug>.<ext>`**, typed by hand instead of using an embed marker, bypasses the resolver/marker system entirely — it's literal HTML the renderer never touches. At request time it's served by `registerMediaRenditionRoute` / `registerMediaOriginalVideoRoute` (`apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:477-573`), which read `:assetId` from the Express route param and look it up the same way (`resolveMediaRendition`/`resolveMediaOriginalBlob`, both id-keyed). The doc comment at lines 21-23 is explicit and I confirmed it against the code (`resolveTransformSpec`, lines 69-85, and the route registration, line 478): **`slug`/`ext` are read only to satisfy Express's routing shape and are never passed to any lookup function** — you could put any garbage text in that segment and the asset still resolves correctly by `assetId` alone. Same for the admin preview route, `GET /api/admin/v1/workspaces/:workspaceId/media/:mediaId/original` (`apps/website/src/server/inbound/admin-http/routes/media/original.ts:160`, `98`) — no slug segment in that URL at all, matching the example URL you gave.

One real gap this file surfaces, but it's an **access-gating** gap, not an identity/uniqueness one — flagging since it's adjacent: a raw `<img>` bypassing the embed-marker system also bypasses `addHtmlEmbedAssetIds`'s reference scan (`media-rendition.ts:162-166`, which only recognizes `scanEmbedMarkers` output), so that asset won't be recognized as "referenced by this entry" for the gating decision in `resolveMediaAccessDecision`. That's a distinct, already-documented concern in that file's own comments (lines 323-331) about entries not being the only legitimate producer of a `/m/` URL — not something this audit is asked to fix.

## 4. Content-addressing

Real and DB-enforced, but at the **blob** layer (`asset_blobs`), not the **media** layer:

- `uploadMedia` (`media-service.ts:205-283`) computes `sha256 = createHash("sha256").update(bytes).digest("hex")` (line 227), then does a locked (`withSha256Lock`) find-or-create against `asset_blobs` keyed by `(workspaceId, sha256)` (line 231, backed by the real unique index confirmed live above).
- **Two uploads of identical bytes → one blob, but two `MediaRecord`s.** The doc comment says this explicitly (lines 190-192: "uploading the same bytes twice always creates two `MediaRecord`s (two distinct library entries, matching common CMS behavior) but writes the blob bytes only once") and the code matches it: `media.id = deps.idGen.newId()` is called fresh every `uploadMedia` invocation (line 259), unconditionally, regardless of whether the blob was deduped.
- So: sha256 is a **real identity key for the blob**, used for dedup and for the write-once guard on `source.sha256` — but it is **not** an identity key for the media *asset* itself. Two different media library entries (different ids, potentially different titles) can and do legitimately share one sha256/blob.

## 5. Dialect drift check

None found on the tables in scope. `media`, `asset_blobs`, `asset_renditions`, and `transform_registry` all match column-for-column and index-for-index between `schema.ts` and `schema.postgres.ts` (compared directly, see line refs above). The live SQLite DB matches `schema.ts` exactly for `media` and `asset_blobs` (checked via read-only `sqlite3` query). This one is clean — the divergence pattern flagged elsewhere in this repo's history didn't reproduce here.

## Summary table

| What | Enforced? | Where | Mechanism |
|---|---|---|---|
| `media.id` uniqueness | **Enforced** | `media` table PK, all dialects + live DB | SQLite/Postgres PRIMARY KEY; practically never collides since it's `randomUUID()`, not user input |
| `media.title` ("the slug you're thinking of") uniqueness | **Not enforced, not even attempted** | n/a | No DB index, no app check, no format constraint beyond `.trim()` |
| Cosmetic URL `slug` segment (`/m/<id>/<transform>.v<n>/<slug>.<ext>`) | **Not identity at all** | `media-rendition.ts:21-23`, `resolveTransformSpec` | Read for Express routing shape only, discarded before any lookup |
| Blob content-addressing (`asset_blobs.sha256`) | **Enforced** | `idx_asset_blobs_workspace_sha256`, verified live | Real DB unique index on `(workspace_id, sha256)`; `uploadMedia` finds-or-creates under a per-hash lock |
| `media.source_sha256` write-once | **Application-layer only, not DB-backed, and not currently reachable** | `resolveWriteOnceSource`, `media-service.ts:131-142` | No DB constraint; `updateMediaMetadata`'s input type has no `sha256` field, so the throw branch is dead on every exposed write path today |

Files read (evidence trail): `apps/website/src/platform/db/schema.ts:1232-1339`, `schema.postgres.ts:80-123,575-601`, `node_modules/@jini-ai/cms/src/media/media-service.ts` (full), `apps/website/src/platform/db/sqlite/media-repo.sqlite.ts` (full), `apps/website/src/features/widgets/resolver-service.ts:480-660`, `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts` (full), `apps/website/src/server/inbound/admin-http/routes/media/original.ts:96-185`, plus a read-only live-DB schema query against `sites/tovu-com/content.db`.
