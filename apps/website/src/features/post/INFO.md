# post Overview

Owns the first content-authoring slice for a single post model.

## Responsibilities

- validate post edits
- persist post records through a repo port
- expose read helpers for admin and content surfaces

## Rules

- Keep post business rules inside this feature, not in Express routes or shells.
- Repositories stay behind the feature-owned port.
- Public reads and admin reads can shape data differently later, but both depend on the same domain record.

## Future direction

`PostRecord` is an early single-model slice. It should likely evolve toward a generic `ContentEntry` model with:

- `contentType`
- richer lifecycle statuses
- author ownership
- created and published timestamps
- excerpt and metadata fields
- taxonomy relations
- revision history
- media references

## Persistence direction

Use flexible JSON storage for document-shaped fields such as block content, metadata, SEO fields, plugin-owned extension data, import/source snapshots, and AI-generated analysis. For SQLite, store these as validated JSON text; for Postgres, map them to `jsonb`.

Keep stable identity, ownership, routing, workflow, and high-frequency query fields as relational columns. Examples include `id`, `workspaceId`, `contentType`, `slug`, `status`, `authorId`, `createdAt`, `updatedAt`, `publishedAt`, `version`, and soft-delete or archival markers.

## Wiring

- `RuntimeMode` (the type) is imported from `@jini-ai/core/contracts/site/core-runtime-mode`; `resolveRuntimeMode` (the value) still comes from `#src/contracts/core/runtime-mode`, which the composition root calls and passes down.
- The post record, its errors and storage-kind constants (`post.ts`), `expected-version.ts`, `go-live-sweep.ts`, `post-write-fields.ts`, `search.ts`, and `post-tool-errors.ts` now live in `@jini-ai/cms/posts/<name>`; importers here use those subpaths directly (the barrel no longer re-exports them). `PostKind` comes from `@jini-ai/core/contracts/site/post-kind`.
- `startPostGoLiveSweep` is still started by the composition root, which passes the repo/outbox/clock `deps`, the `workspaceId`, and optionally a `tracker` and `timers`.
- Moved to `@jini-ai/cms/posts/{post-read,post-write-effects,featured-image,post-slugs}`; the go-live rule is `@jini-ai/core/contracts/site/scheduled-publish`.
- Host binds: `findMediaByIdOrSlug` (from `@jini-ai/cms/media`) into `FeaturedImageDeps` at `post-tool-input.ts`, `seo/index.ts` and the admin post/page update routes; `outwardErrorMessage` (pass-through `error.message`) into `versionConflictEnvelope` at those routes; the go-live sweep's `onError` console reporter in `server/runtime/composition/serving-app.ts`.
- `post-create.ts` / `post-update.ts` bind `RESERVED_SEGMENTS` (as `reservedSegments`) and `postPublicPath` from `#src/platform/routing` into the `@jini-ai/cms/posts/post-slugs` calls.
