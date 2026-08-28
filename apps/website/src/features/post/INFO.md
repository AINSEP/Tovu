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
