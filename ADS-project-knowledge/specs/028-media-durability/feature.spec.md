# Feature Spec: Media Durability (ADR-046 Phase 1, slice 6)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-028 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-028-media-durability |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed)

Sixth ADR-046 Phase 1 slice, and the largest new-code slice of the phase — `media` had no SQLite
adapters at all (unlike Members/Webhooks/Origin, which had partial or full prior-session builds).
Four new tables, four new adapter classes, one contract-test suite covering all four.
`BlobGcJournalRepoPort` (a fifth media port) is deliberately NOT given a SQLite adapter — no
composition root wires one (`RouteDeps` has no `blobGcJournalRepo` field), and the real
journaled-GC protocol itself remains a disclosed, deferred build (ADR-027 §5), not just its
persistence — mirroring SPEC-025's identical scope decision for `SqliteMemberConsentRepo`.

## Problem Statement

**Current state (before this slice):** `server/deps.ts` wired `InMemoryMediaRepo`,
`InMemoryAssetBlobRepo`, `InMemoryAssetRenditionRepo`, and `InMemoryTransformDefinitionRepo` —
every media item, blob reference, rendition, and transform definition was lost on restart. Blob
*bytes* were already durable (`LocalFsBlobStore`, real filesystem) — only the metadata rows
weren't.

**Desired state:** `content.db` gains four tables (`media`, `asset_blobs`, `asset_renditions`,
`transform_registry`); real composition uses SQLite adapters for all four.

## Requirements

- REQ-01: `infra/db/schema.ts` shall gain four tables matching `MediaRecord`, `AssetBlobRecord`,
  `AssetRenditionRecord`, and `TransformDefinitionRecord` respectively, with unique indexes
  matching each port's own lookup-key contract (`AssetBlobRepoPort.findByHash`'s
  `(workspaceId, sha256)`; `AssetRenditionRepoPort.findOne`'s
  `(workspaceId, assetId, transformName, version)`; `TransformDefinitionRepoPort`'s append-only
  `(workspaceId, name, version)`).
- REQ-02: Four new adapter classes shall implement `MediaRepoPort`, `AssetBlobRepoPort`,
  `AssetRenditionRepoPort`, and `TransformDefinitionRepoPort` respectively.
- REQ-03: `TransformDefinitionRepoPort`'s append-only contract shall be enforced at the storage
  layer (a unique index causing a duplicate insert to fail), not just by adapter-side convention.
- REQ-04: `server/deps.ts` shall construct all four SQLite adapters against the real `content.db`
  connection, replacing the in-memory equivalents.
- REQ-05: `server/app.ts`'s hermetic composition shall remain unchanged (in-memory adapters).
- REQ-06: The capability inventory's `media` entry shall be reclassified `hasDurableAdapter: true`.

## Acceptance Criteria

- AC-01 (REQ-01/REQ-02) [P1]: The full CRUD/lookup contract for each of the four ports passes
  identically against both its in-memory and SQLite adapter.
- AC-02 (REQ-03) [P1]: Inserting a duplicate `(workspaceId, name, version)` transform definition
  rejects on both adapters.
- AC-03 [P1] (ADR-046's own required test-matrix row, restart): a row in each of the four tables,
  written against a real on-disk `content.db`, is still found after a simulated restart (fresh
  `openContentDb()` call against the same file).
- AC-04 (REQ-06) [P2]: `production-readiness-boot.integration.test.ts`'s staleness check continues
  to pass.

## Non-Goals

- `BlobGcJournalRepoPort`'s SQLite adapter (see Scope Note).
- The real ADR-027 §5 journaled-GC protocol (epochs, `BEGIN IMMEDIATE`, crash-safety) — this
  slice's `blob-gc.ts` behavior is unchanged; only the four ports it and the rest of `media`
  depend on became durable.
- Changing `sharp` readiness gating (REQ-08, SPEC-022) — unrelated concern, already handled by
  `production-readiness-gate.ts`'s own `sharpReadiness` parameter.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Drizzle, no new dependency. |
| II — Test-First | COMPLIES | 29-case contract suite (all four ports × both adapters, plus one cross-table restart test) written and passing; one bug (undefined-vs-omitted-key, same class as SPEC-027's) caught and fixed before this doc was finalized. |
| III — Simplicity Gate | COMPLIES | Follows the established `repo.memory.ts`/`repo.sqlite.ts` rule-of-two pattern for all four ports; no new abstraction. |
| IV — Anti-Abstraction Gate | COMPLIES | Implements existing ports unchanged. |
| V — Integration-First Testing | COMPLIES | AC-03 is a real-file restart test spanning all four tables. |
| VI — Security-by-Default | N/A | No authz surface change. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal. |

## Implementation Record

- `src/infra/db/schema.ts`: `media`, `assetBlobs`, `assetRenditions`, `transformDefinitions`
  tables (migration `0014_condemned_anthem.sql`).
- `src/infra/sqlite/media-repo.sqlite.ts`: `SqliteMediaRepo`, `SqliteAssetBlobRepo`,
  `SqliteAssetRenditionRepo`, `SqliteTransformDefinitionRepo`.
- `src/server/deps.ts`: real composition now wires all four (unchanged for `server/app.ts`).
- `src/server/capability-inventory.ts`: `media` entry now `hasDurableAdapter: true`.
- Tests: `src/media/__tests__/repo.contract.test.ts` (29 cases).
- Full suite: 1557/1561 passing at completion (4 pre-existing, disclosed, unrelated failures
  carried since before this slice). Typecheck clean.

## Handoff Contract

- **Inputs used:** direct inspection of `media/ports.ts` and `media/repo.memory.ts` (confirmed
  no prior SQLite adapter existed for any of the four route-consumed ports, unlike Members/
  Webhooks), `media/types.ts`/`media/transform-types.ts` for exact record shapes.
- **Output summary:** media metadata, blob references, renditions, and transform definitions all
  survive a restart. Blob bytes were already durable; this closes the metadata gap.
- **Risks:** `BlobGcJournalRepoPort` remains unwired — a real, disclosed, deliberate scope limit
  named explicitly in Non-Goals, not an oversight.
- **Suggested next assignee:** Coordinator, for the final ADR-046 Phase 1 slice (Analytics).
