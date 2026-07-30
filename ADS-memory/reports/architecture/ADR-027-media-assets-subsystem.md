# ADR-027: Media / Assets Subsystem — Hybrid Entry+Blob Model, Content-Addressed Storage, Immutable Renditions, Origin-Isolated Serving

- Status: ACCEPTED 2026-07-09 (2-round media swarm debate → round-1 external audit FAIL (3 blockers) → blockers folded → round-2 re-audit PASS (Fable 8.7 PASS; Codex 8.3, clause-gaps only; Gemini degraded/timeout) → 6 clause-gap amendments folded)
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with peers Codex `gpt-5.5` (xhigh), Gemini 3.1 Pro (`agy`), Fable
- Extends: **ADR-022** (media is a seeded content-type on `entries`; sidecars are core-owned operational state that narrow INV-3), **ADR-025** (generalizes cookie-less origin isolation from plugin/theme JS to uploaded bytes)
- Relates: ADR-012 (`uploads/` + `content.db`, portable install-dir), ADR-006 (`BlobStorePort` + `ImageTransformPort` rule-of-two), ADR-007 (workspace-prefixed keys + composite FKs), ADR-021 (`authorize()` + flat `media.*` strings), ADR-009 (outbox/scheduled GC + transform jobs), ADR-023 (never-brick recoverability lineage; retention window itself owned by the pending Storage/Backups primitive), ADR-026 (batched source-replacement ref-rewrite), ADR-024 (out-of-process transform worker), ADR-020 §6 (origin-isolation lineage)
- Sources: debate `reports/swarm-consensus/runs/20260709-media-admin-section-consensus-report.md`; audit `reports/external-audit/runs/20260709-media-design-external-audit-report.md` (TM-media-001); fixes `.local-artifacts/external-audit/proposed-fixes/20260709-media/proposed-fixes.md`

## Context

Tovu needs a Media/Assets subsystem — upload, store, process, organize, reference, secure,
and serve images and files. §3.5 places `media` as a **Tier-2 core library**; the open
question was its internal architecture. A 2-round swarm debate converged (~0.92) on a design;
a round-1 external audit (TM-media-001, risk_tier=high) **endorsed the architecture but
returned FAIL** on three under-specified irreversible surfaces (GC byte-deletion race, URL
immutability, original-serving origin). This ADR is the converged design **with the audited
fixes folded in as normative text**. It stays inside accepted ADRs; it does not reopen the
content model (ADR-022), ports rule (ADR-006), or origin-isolation lineage (ADR-020/025).

## Decision

### 1. Placement and ports

`media` is a Tier-2 core library. It owns upload orchestration, validation, the data model,
the transform registry, lifecycle/GC, where-used, and authorized retrieval. It declares **two
ports** (ADR-006 rule-of-two):

- **`BlobStorePort`** — content-addressed byte storage. Adapters: local `uploads/` (built now)
  → S3/R2/Supabase (next). Presign surface is **minimal and design-frozen-not-validated**:
  `capabilities()` + one `createPresignedUpload()`; the local adapter reports unsupported; no
  S3 adapter ships in v1.
- **`ImageTransformPort`** — pixel work. Adapters: **`NodeWorkerImageTransformAdapter`**
  (`worker_threads`/`child_process`, **out-of-process**, host-agnostic — an Electron host may
  wrap it in `utilityProcess`, but **no host-specific type may appear in the port signature**;
  if one ever does, the port demotes to an internal module) + an in-process test-double.

**Virus scanning is not a port in v1** — it is a pipeline stage seam with a no-op default; the
`quarantined` state exists from day one, and a live scanner is a launch-gate (§6). **Video
transcoding is deferred**; the pipeline states are codec-agnostic so it is a later adapter, not
a repaint.

### 2. Data model — hybrid entry + two core-owned sidecars

A media asset is a **seeded `media` content-type entry** (ADR-022) carrying editorial state
(alt/caption/credit/focalPoint under `fields.ext.media.*`, taxonomy for folders+tags, revisions,
`entry_refs`), **plus two core-owned operational sidecar tables** in the same `content.db`:
`asset_blobs` (physical bytes) and `asset_renditions` (derived variants). There is **no third
`media_assets` table** — the entry is the identity.

The **source binding** — the edge from a media entry to its bytes — lives **on the entry** as a
**write-once** field `bodyJson.$.source.sha256`, backed by the ADR-022 partial expression index
`idx_media_source_sha` (`content_type='media'`). **Write-once means settable-once-from-absent** — the
field transitions absent → set exactly once and is then immutable, enforced at the chokepoint + a CI
canary; changing an already-set source is rejected (source replacement mints a new entry — §4).
Remote-blob materialization (`remote` → local blob, §6) likewise **mints a new entry** rather than
mutating an existing entry's source in place.

Sidecars are **core-owned, single-writer** (the `media/repo` layer only), which **explicitly
narrows the ADR-022 revision-per-write discipline (TM-media-001 INV-3)**: machine writes (rendition
rows, status flips, GC) do **not** generate entry revisions. Instead each `asset_blobs` row stamps `created_by_principal` (required) +
`created_by_plugin_id` (nullable); renditions are **rebuildable-by-definition** (deterministic
function of blob bytes + registry definition) and are excluded from the backup-critical set. A CI
canary (import-graph lint) asserts no module outside `media/repo` writes any of the four operational
tables — `asset_blobs`, `asset_renditions`, `blob_gc_journal`, `transform_registry`.

### 3. Storage — content-addressed, workspace-prefixed, per-generation epochs

`BlobStorePort` is content-addressed. Blob identity is **`(workspace_id, sha256)`** (dedup is
per-workspace; cross-tenant byte sharing is rejected). Storage keys are **workspace-prefixed**
(ADR-007) and carry a **per-generation epoch**:
`ws/{workspaceId}/blobs/{sha256[0..1]}/{sha256}-{storage_epoch}` (epoch = ULID minted per row
generation). Two generations of the same content hash never share a byte path — this is the
structural race-killer for §5's GC. Bytes live under `uploads/` (ADR-012); rows in `content.db`.

### 4. Transforms and the immutable URL contract

**Transforms are declarative named definitions** (core + theme/plugin-declared), stored in an
**append-only `transform_registry`** (PK `(workspace_id, name, version)`) that **outlives its
declaring theme/plugin** — disabling or uninstalling a declarer never deletes registry rows;
`(name, version)` is immutable, redefinition is a new version. There are **no arbitrary
`?w=&h=` transforms** in v1 (amplification + URL-grammar freeze); the deferred seam is
HMAC-named transforms. Generation is **hybrid**: eager for a small hot set via the ADR-009
worker, lazy-on-first-request (single-flight) for the rest, run **out-of-process** (§1) to keep
sharp from OOM-ing the host process.

**Public URL contract (FROZEN):**
`https://{mediaOrigin}/m/{assetId}/{transformName}.v{version}/{slug}.{ext}`

- **Immutable by construction:** `assetId` binds write-once to one `sha256` (§2), and
  `transformName.v{version}` names one immutable registry definition, so a given `/m/` URL serves
  the same bytes for its whole life — or `404`/`410`, **never different bytes**. (Chosen over
  Codex's `media_url_bindings` table and Gemini's hash-in-path variants — this needs neither an
  extra table nor a hash in the URL. The `media_url_bindings` table is the documented fallback if
  a version-less URL is later required.)
- **`slug`/`ext` are cosmetic** — lookup uses `(assetId, transformName, version)` only.
- **Serve-if-exists + bounded generate-if-defined:** any existing `(sha256, name, version)`
  rendition serves regardless of declarer status. **Anonymous** lazy generation is bounded to a
  `(name, version)` that is either referenced by published content **or** the latest registry
  version of that name — older/unreferenced versions **serve-if-exists only** (never lazily
  materialized on an anonymous request), which closes the registry-history amplification vector
  (an attacker can't force generation of every historical version). Renditions are evictable
  (rebuildable by definition), so eviction never loses data. A URL published under a now-disabled
  theme still materializes because its `(name, version)` is referenced by that published content.
- **Source replacement mints a NEW media entry** (`$.replaces = oldAssetId`) and performs a
  **batched, chokepoint-legal ref-rewrite** of referrers via ADR-026 write envelopes; old URLs
  keep serving old bytes until the old entry is explicitly purged (409-guarded).
- **`bodyJson` stores refs `{assetId, transformName}`, never URLs**, so internal content never
  freezes on the URL shape — only published/external output does.
- **Cache:** renditions `Cache-Control: public, max-age=31536000, immutable`; 404 short-TTL;
  purged assets `410 no-store`.

### 5. References, deletion, and GC (never-brick)

References take two forms, both extracted at the ADR-022 write chokepoint into the derived,
rebuildable **`entry_refs`** index: TipTap image nodes (`{assetId, transformName}`) in `bodyJson`,
and registry `ref` fields. "Where-used" is one indexed query.

Deletion ladder: **trash** (soft, revision-recorded) → **purge blocked with `409` + referencing
list** while live refs exist (force-purge behind a separate permission, flags dangling refs).

**Blob GC — the audited protocol (INV-1):**

- **"Unreferenced" (normative):** evaluated inside the deleting transaction — no media entry in
  the workspace in any non-purged state (including trashed) has `$.source.sha256 = sha256`, AND no
  live `entry_refs` targets it, AND no retained snapshot references it.
- **Ordering (INV-1a):** bytes are written **before** the row is inserted and unlinked **only
  after** the row deletion commits. Rows never exist without bytes; orphan bytes are swept.
- **Serialization:** every `asset_blobs` transition runs under `BEGIN IMMEDIATE` on `content.db`
  (SQLite single-writer; `SELECT … FOR UPDATE` on Postgres). A dedup "skip write" decision is
  valid only when the row is observed `active`/`tombstoned` in-transaction (tombstoned ⇒ resurrect
  in the same tx); an uploader observing no row writes its own bytes under a fresh epoch.
- **Two-phase, journaled:** tombstone-pass → delete-pass (re-checks the full predicate in-tx,
  writes `blob_gc_journal`, deletes the row) → unlink-pass drains the journal (crash-safe: a fresh
  epoch means a stale unlink can never hit live bytes) → monthly orphan sweep.
- **Grace ≥ retention:** `gc_grace = max(configured default 30d, age of the oldest retained snapshot
  at delete-pass time)`; the snapshot conjunct is evaluated by comparing snapshot timestamps against
  the blob's live interval, so a blob restorable from a snapshot still has its bytes. Snapshot-retention
  policy is owned by the **pending Storage/Backups snapshot primitive** (not ADR-023, which defines no
  retention window); snapshot restore enqueues a `media.fsck` job that reports (never fabricates)
  `bytes_missing`.

### 6. Security and byte-ingress

- **One `MediaIngressPolicy`** governs every byte entry point — direct upload, `upload_from_url`
  remote fetch, lazy-transform input, future importers. Normative: `https` allowlist;
  **resolve-then-connect IP pinning + re-verify per redirect hop** (DNS-rebinding defense); deny
  RFC1918/link-local/loopback/metadata (169.254.169.254); redirect cap; streaming size cap +
  fetch timeout; **pre-decode pixel cap** (pixel-bomb guard); **magic-byte sniff decides policy**
  (extension/Content-Type advisory only).
- **Renditions are always re-encoded** (strip EXIF/GPS, kill polyglots). Originals keep EXIF and
  are access-controlled.
- **Originals never leave the media origin (INV-2):** the admin origin exposes **no media
  byte-route**. `media.download_original` is **mint-only** — `authorize()` (ADR-021) → short-TTL
  (≤90s) HMAC-signed URL on the **cookie-less media origin**, served `Content-Disposition:
  attachment` + `X-Content-Type-Options: nosniff` + `private, no-store`. The media origin holds no
  session/cookies. Private renditions use the **same** mint path — one `mintSignedMediaUrl()`, no
  second gated-bytes path — but **serve inline** (`X-Content-Type-Options: nosniff` +
  `Cache-Control: private, no-store`, **no** `Content-Disposition: attachment`); **only originals
  force `attachment`**. This keeps re-encoded, EXIF-stripped renditions viewable in-page without
  opening an admin-origin bypass route (INV-6), while the risky raw bytes (originals) still force a
  download. Origin separation is **process-level** (a second listener/host), so the single-binary
  export (ADR-012) survives.
- **MIME allowlist keyed by pipeline:** jpeg/png/webp/gif/avif + sanitized svg (behind
  `media.upload_svg`) → public renditions; **pdf/audio/video/archives → private-only** (mint-path
  download, never a public `/m/` URL) until their pipeline ships. Promotion is a named gate + table
  amendment, not a config flip.
- **SVG is IN v1** — sanitized at ingest and served only origin-isolated, behind `media.upload_svg`
  (default-deny fallback if origin isolation ever slips).
- **No live virus scanner in v1**; `quarantined` state pre-wired; a live scanner is a
  **launch-blocking gate** before enabling public/member/form-plugin uploads or untrusted import.
- **`blob_kind: local|remote`:** remote is **metadata-only in v1** (entry carries `$.source.remoteUrl`,
  no `asset_blobs` row, no `/m/` path); remote serving is a deferred feature requiring fetch → hash-verify → local blob → renditions.

### 7. Surfaces (admin + AI)

One capability registry. Flat `media.*` permission strings: `media.read`, `media.upload`,
`media.update`, `media.delete`, `media.delete.force`, `media.download_original`, `media.upload_svg`,
`media.manage`. The Tier-5 admin media screen and the AI tools are both clients of the **same
gateway handlers** (no back door — §3.5 dogfood rule, INV-6). AI tools: `media.search`,
`media.get`, `media.where_used`, `media.update_metadata`, `media.upload_from_url` (SSRF-guarded via
§6), `media.delete` (HITL); agents are delegated principals (`grant ∩ delegator`).

### 8. v1 scope

**IN v1:** direct + presign-*surface* upload, content-addressed local store, hybrid entry+sidecar
model, named + theme-declared transforms, eager+lazy out-of-process generation, `entry_refs`
where-used + safe-delete + journaled 2-phase GC, folders+tags, focal/alt/caption, bulk ops,
origin-isolated serving, immutable versioned URL contract, `blob_kind` remote metadata seam, video
pipeline seam (states only), quota+rate-limit, pixel-bomb guard, AI tools, sha256 dedup.

**DEFERRED (each with a named seam already in the schema):** TUS resumable uploads, arbitrary/
signed URL transforms, live virus scanner, video transcoding engine, the S3 `BlobStorePort` adapter.

**External blob root (A6):** v1 ships only the local `<install-dir>/uploads/` root. When an external
root lands (with the S3 adapter), `tovu build`/clone/export **MUST** take `--blobs=gather` (copy+verify
bytes into the artifact) or `--blobs=relink` (emit a manifest + first-boot verify); a bare export with
an external root **fails loudly** and **never silently omits bytes**. Acceptance test:
`media.export.external-root-gather-and-relink`.

## Consequences

- **Never-brick holds for bytes:** the only irreversible operation (blob deletion) is now governed
  by an audited, race-proof protocol (epochs + `BEGIN IMMEDIATE` + journal + grace≥retention) with
  named acceptance tests, rather than the hand-wave "2-phase GC" the audit rejected.
- **Published URLs are truly immutable** without an extra binding table or a hash in the path,
  because identity is carried by write-once `assetId` + versioned transform name. Theme churn and
  source replacement can never repoint a live URL.
- **One origin-isolation story** across theme JS (ADR-020), plugin JS (ADR-025), and now uploaded
  bytes — same mechanism, extended, not a third variant. SVG becomes safely shippable.
- **The content model is reused, not duplicated:** editorial half gets revisions/taxonomy/refs from
  ADR-022 for free; the operational half lives in single-writer sidecars that deliberately narrow
  INV-3 (stated, not silent) and carry their own attribution.
- **Rule-of-two is honest:** both ports have a real second adapter being built in v1 (blob: local
  now, S3 next-named; transform: node-worker + test-double). The presign surface is frozen-minimal
  and marked not-validated so it can't rot into a fake S3 shape.
- **DX cost, accepted:** every privileged media byte flows through the chokepoint / mint path /
  ingress policy — no direct `uploads/` serving, no admin-origin streaming, no bypass importer
  (bulk import is batched ADR-026 through the chokepoint, a named acceptance test).

## Open

- **Exact hot-set** of eagerly-generated transforms (perf tuning, not a contract).
- **`{mediaOrigin}` delivery mechanism** — second local port vs `media.` subdomain vs dedicated
  domain (shared with the ADR-020/025 origin question); the *rule* (cookie-less, credential-isolated)
  is fixed here regardless.
- **Deferred seams' triggers** — TUS (large-file demand), arbitrary transforms (headless client that
  can't pre-declare sizes), live scanner (any untrusted-upload feature), video transcoding, S3
  adapter — each named with its flip-on condition in the fixes bundle.

## Debate + Audit record

Design converged in a 2-round swarm debate (all four participants, ~0.92; two ties — SVG-in and
transform port-naming — resolved by the owner's default-to-Fable rule). Round-1 external audit
(Codex 8.1 FAIL, Fable-internal 8.0 FAIL, Gemini verdict timed out but contributed fixes) endorsed
the architecture and surfaced 3 blockers + 6 advisories, **all folded above** from converged drafted
fixes; the B1 GC protocol adopts Fable's per-generation-epoch mechanism, the B2 URL adopts Fable's
version-in-path shape (owner-chosen). A round-2 re-audit (diff-only vs TM-media-001) confirmed all 3
blockers closed and returned **PASS** (Fable 8.7 PASS; Codex 8.3 with only clause-gap findings; Gemini
degraded — agy timeout on the heavy verdict prompt); the 6 residual clause-gaps both auditors flagged
are folded as the amendments above (GC-grace formula, A6 export clause, INV-3 citation, four-table
canary, bounded anonymous lazy-gen, settable-once-from-absent + inline private renditions). Full trace
in the linked debate + audit reports and `.local-artifacts/external-audit/offloads/20260709-media-reaudit/`.
