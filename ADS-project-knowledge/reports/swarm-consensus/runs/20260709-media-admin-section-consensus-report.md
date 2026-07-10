# Swarm Consensus Report — Tovu "Media / Assets" admin subsystem

- **Date:** 2026-07-09
- **Prompt / packets:** R1 `.local-artifacts/swarm-consensus/context/CTX-media-admin-section-2026-07-09.md` · R2 `…/CTX-media-2026-07-09-R2.md` (Primary frozen first-pass `…/CTX-media-2026-07-09-PRIMARY-frozen.md`)
- **Mode:** `/debate` · 2 rounds (R1 blind → R2 informed rebuttal + maximize-v1 ledger)
- **Controls:** `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300`; models pinned per-run
- **Primary model:** Opus 4.8 (host)
- **Outcome:** Architecture **unanimously converged** (agreement ≈0.92, ≥min_confidence). Two owner-adjudicated
  deltas resolved via the "default-to-Fable, keep fallback" rule. **Not-yet-ADR-ready:** a fold-list of
  10 items (3 now-resolved decisions + 7 must-fold) to carry into `/audit-work` → **ADR-027 (media)**.

## The Swarm

| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | claude (host) | opus-4-8 | Opus 4.8 | 2.1.201 | host | Responded (frozen R1) | 1 |
| Peer (in-host) | Task/subagent | fable | Fable (Anthropic voice) | n/a | user-requested addition | Responded R1+R2 | 2 |
| Peer | codex | gpt-5.5 | gpt-5.5 (reasoning=xhigh) | codex-cli 0.144.0 | per_run_override | Responded R1+R2 | 2 |
| Peer | agy | Gemini 3.1 Pro (High) | Gemini 3.1 Pro (High) | agy 1.1.0 | per_run_override | Responded R1+R2 | 2 |

## Dispatch Diagnostics

| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| codex | json (jsonl) | last `agent_message` item | clean; tool-use smoke passed (0.144.0 not in the Intel-macOS 0.141–0.142 crash band) | 0 |
| agy | text | full stdout, ANSI-stripped, end-marker | clean; pty-wrapped (`script -q /dev/null`), cwd=/tmp | 0 |
| Fable | in-host subagent | final message | reads repo/ADRs directly | 0 |

- Model proof: smoke-tested this session — codex gpt-5.5 + agy Gemini 3.1 Pro (High) returned `<<SWARM_END>>`
  markers; artifact `reports/swarm-consensus/smoke-tests/2026-07-10T000917Z-cli-smoke-test.json`.
- Codex + Fable given repo read access (design within accepted ADRs); agy packet-only.
- All four Round-1 + Round-2 responses carried the ACK handshake and the end marker (none truncated).

## Debate Trace

**R1 confidences:** Gemini 0.95 · Codex 0.86 · Fable 0.72 · Primary 0.72 (frozen).
**R2 confidences:** Gemini 0.92 · Fable 0.87 · Codex 0.86 · Primary moved up.

Round-2 movement (informed rebuttal is where the structure locked):

- **D-A ports:** Gemini ONE←TWO; Codex ONE←THREE; Fable TWO←ONE (out-of-process worker makes the 2nd
  adapter *real today*: in-process test-double + `utilityProcess` worker, ADR-006-clean). Net: BlobStorePort
  is the one hard external-provider port unanimously; the transform boundary is the only wobble (port vs module).
- **D-B scan:** Codex no-live-scanner←ClamAV-now; Gemini seam←subscriber. Unanimous: no v1 scanner, `quarantined`
  pre-wired, live scanner is a launch-gate on untrusted uploads.
- **D-C sidecar:** Gemini TWO←ONE; Codex TWO←THREE. Unanimous: `asset_blobs` + `asset_renditions`, no
  `media_assets` (the entry is the identity); `processing_status` on the blob.
- **D-D transforms/SVG:** unanimous named-only + arbitrary deferred (HMAC-named seam). SVG: 3 defer, Fable
  moved to conditional-IN (safe *because* origin isolation is now v1).
- **D-E origin isolation:** Gemini + Codex moved to IN-v1; Fable held and tightened the coupling to the URL freeze.
  Unanimous IN-v1.
- **Item #10 out-of-process worker:** Codex IN, Fable IN, Gemini DEFERRED-but-named-OOM-as-residual-risk → decided IN.

## Individual Responses

### Primary — Opus 4.8 (host, frozen R1)
Media = Tier-2 core lib; asset-as-entry with promoted typed columns; `MediaBlobPort` + `ImageTransformPort`;
content-addressed keys; hybrid eager/lazy derivatives; entry-id refs + usage index + safe-delete; magic-byte +
EXIF-strip + authorize()+signed URL; scan = no-op seam. Confidence 0.72. Moved toward the two-sidecar-table
shape and origin-isolation-as-v1 after seeing peer positions.

### Gemini 3.1 Pro (High) — via agy
R1 (0.95): hybrid entry+`asset_blobs`, 2 ports, content-addressed, hybrid derivatives; **sharpest blind spot —
in-process transforms OOM the Node/SQLite host → external worker from day one**; flagged TUS + video. R2 (0.92):
moved to ONE port, two-table sidecar, named-only+SVG-deny, origin-isolation IN-v1, scan-seam. Ledger defers
presign, TUS, out-of-process worker, arbitrary transforms, SVG. Residual risk: in-process OOM (its own deferral).

### Codex GPT-5.5 (xhigh)
R1 (0.86): THREE ports (+`MediaScanPort` ClamAV-now); hybrid entry + 3 sidecars; named transforms, lazy only for
declared; blind spot — "editorial graph vs operational pipeline" reframe + PDFs/SVG/archives drive more security
complexity than images. R2 (0.86): moved to ONE port, two sidecars, scan-seam; ledger keeps out-of-process worker
IN-v1 ("Sharp/OOM must not take down Node/SQLite"), presign-surface IN, adds raw-original policy + blob-locality-
separate-from-site-dir. Residual risk: URL/identity contract must represent remote assets + source-replacement +
video from day one.

### Fable — Anthropic (in-host)
R1 (0.72): ONE port (`BlobStorePort`); hybrid entry + `asset_blobs` + `asset_renditions`; content-addressed +
`capabilities()` presign probe; cookie-less serving origin as the load-bearing defense; **three high-value blind
spots — remote/external assets (`blob_kind`), "the URL contract is the irreversible freeze", `uploads/` won't fit
the ADR-012 site folder (40GB video)**. R2 (0.87): moved to TWO ports (out-of-process worker makes the 2nd adapter
real); held two-table sidecar, no-scanner-with-hard-gate, named-only, origin-isolation; moved SVG to IN-conditional-
on-origin; ledger ships 22/24 + 3 additions (pixel-bomb guard, refs-not-URLs in bodyJson, originals-never-public).
Residual risk: bulk-import write amplification through the ADR-022 chokepoint → a "bypass importer" would break the
core discipline; pre-commit a batched chokepoint-legal import path as a v1 acceptance test.

## Synthesis

### Agreement (all four, independently)
- **Hybrid data model:** seeded `media` **entry** (editorial + revisions + taxonomy + `entry_refs`) + **two
  physical sidecars** `asset_blobs` (PK `(workspace_id, sha256)` = dedup) + `asset_renditions` (PK
  `(workspace_id, sha256, transform_name, transform_version)`). No third `media_assets` table.
- **Storage:** `BlobStorePort`, content-addressed SHA-256 keys; local `uploads/` now → S3 later; blob locality
  configurable/separable from the site folder.
- **Transforms:** declarative **named** only (core + theme/plugin-declared); no arbitrary `?w=&h=` (deferred
  behind an HMAC-named seam); hybrid eager(hot set)/lazy(rest); version-in-key regeneration; **out-of-process worker**.
- **References + deletion:** derived `entry_refs` where-used; **soft-delete → 409-on-referenced-purge → 2-phase
  blob GC**. `bodyJson` stores asset *refs*, not URLs.
- **Security:** authz-before-bytes · magic-byte sniff · re-encode renditions (EXIF/GPS strip + polyglot kill) ·
  quota+rate-limit · **cookie-less serving origin (IN-v1, load-bearing)** · private via `authorize()`→short-TTL
  signed URL · **no live scanner v1**, `quarantined` state + launch-gate · pixel-bomb guard · SSRF guard on
  `upload_from_url` · originals never on public URLs (`media.download_original` gated).
- **Surfaces:** one capability registry; flat `media.*` strings (`upload/read/update/delete/purge/transform/manage`,
  + `download_original`, + `upload_svg`); admin screen + AI tools = same gateway handlers; HITL on destructive.
- **URL contract (frozen first):** `https://{mediaOrigin}/m/{assetId}/{transformName}/{slug}.{ext}` — immutable,
  renditions-only, origin-isolated.

### Divergence (resolved)
- **D-A transform boundary — port vs module.** Fable: `ImageTransformPort` (worker + test-double = 2 real
  adapters). Codex/Gemini: internal module, promote later. **RESOLVED (owner default-to-Fable):** name it
  `ImageTransformPort`; fallback = demote to internal module if the contract leaks `utilityProcess` specifics.
- **SVG in v1.** Codex/Gemini/Primary: default-deny/defer. Fable: IN, sanitized + origin-isolated + `media.upload_svg`.
  **RESOLVED (owner default-to-Fable):** SVG IN-v1; fallback = revert to default-deny (only the permission +
  sanitizer toggle change).
- **Out-of-process worker (#10).** Gemini DEFERRED (in-process bounded) vs Codex/Fable IN. **RESOLVED IN-v1** —
  Gemini itself named in-process OOM as its residual risk.
- **Presigned upload (#2).** **RESOLVED IN-v1 as port surface only** (`capabilities()` + presign methods on
  `BlobStorePort`; local adapter returns unsupported; no S3 adapter ships v1).

### Unique insights (single-peer, carried forward)
- Gemini: **in-process transform OOM** is the concrete failure that forces the out-of-process worker (which in
  turn makes the transform port's 2nd adapter real).
- Fable: **the published URL contract is the one irreversible surface** (lives in RSS/OG/Google forever) → freeze
  it FIRST in the ADR; **`blob_kind: local|remote`** one-column seam avoids WP forced-copy; **store refs not URLs**
  in content; **bulk-import chokepoint amplification** is the likeliest discipline-break.
- Codex: reframe **"editorial content graph vs operational asset pipeline"** changes defaults; **PDFs/SVG/archives**
  may drive more v1 security complexity than responsive images.

### Decision Ledger

| Decision Point | Primary Opus 4.8 | Codex GPT-5.5 xhigh | Gemini 3.1 Pro High | Fable | Agreement | Key why / movement |
|---|---|---|---|---|---|---|
| Data model = hybrid entry + sidecars | Hybrid | Hybrid | Hybrid | Hybrid | **Yes** | Machine writes would spam ADR-022 revision log; entry keeps editorial half |
| Sidecar shape | 2 | 3→2 | 1→2 | 2 | **Yes** | `asset_blobs`+`asset_renditions`; entry is identity, no `media_assets` |
| Storage = content-addressed BlobStorePort | Yes | Yes | Yes | Yes | **Yes** | dedup + idempotent retry + immutable URLs; rule-of-two local→S3 |
| Ports count / transform boundary | Port | Module→port-later | Module→port-later | Port | **Owner-resolved → Port** | `ImageTransformPort` (worker+test-double); fallback=module |
| Named-only transforms (no arbitrary) | Yes | Yes | Yes(moved) | Yes | **Yes** | amplification + URL-freeze; HMAC-named seam deferred |
| Out-of-process transform worker (v1) | — | IN | DEFER | IN | **Resolved IN** | Gemini's own residual risk = in-process OOM |
| entry_refs + soft-delete + 2-phase GC | Yes | Yes | Yes | Yes | **Yes** | kills WP silent-orphaning; refs derived, rebuildable |
| Origin-isolated serving (v1) | lean | IN(moved) | IN(moved) | IN | **Yes** | structural anti-XSS; coupled to URL freeze |
| SVG in v1 | defer | defer | defer | IN | **Owner-resolved → IN** | safe under origin isolation + sanitize; `media.upload_svg`; deny-fallback |
| Live virus scanner v1 | seam | ClamAV→seam | subscriber→seam | seam | **Yes** | no untrusted uploaders v1; hard launch-gate written |
| One capability registry + `media.*` | Yes | Yes | Yes | Yes | **Yes** | dogfood rule; admin + AI share handlers |
| Freeze public URL contract first | — | Yes | — | Yes | **Yes** | only surface no port can swap |

### Unresolved Deltas
None blocking. The two genuine splits (transform-port-naming, SVG) are resolved by the owner's default-to-Fable
rule with named fallbacks. Everything else converged independently.

## Final Recommendation

Ship the largest coherent v1 the swarm defined: **hybrid `media` entry + `asset_blobs` + `asset_renditions`;
`BlobStorePort` (content-addressed, local now) + `ImageTransformPort` (out-of-process worker + in-process test-
double); named declarative transforms (core + theme-declared), eager hot-set + lazy tail; `entry_refs` where-used
with 409-on-referenced-purge + 2-phase GC; cookie-less origin-isolated serving under a frozen immutable renditions-
only URL contract; magic-byte + re-encode + EXIF-strip + quota + pixel-bomb guard security baseline with a scan
seam (no live scanner) and SVG-IN behind `media.upload_svg`; one capability registry with admin + AI on the same
`media.*` gateway.** Defer only genuinely heavy runtimes — TUS, arbitrary/signed transforms, the live scanner,
video transcoding, and the S3 adapter — each with a named seam already in the shipped schema.

### Fold-list for `/audit-work` → ADR-027 (media)

**Decisions resolved this session (record as decided):**
1. Transform boundary = **`ImageTransformPort`** (fallback: internal module, promote later).
2. **SVG IN-v1** (sanitized + origin-isolated + `media.upload_svg`; fallback: default-deny).
3. **Out-of-process transform worker IN-v1**; presigned = **port surface only** (no S3 adapter v1).

**Must-fold before the ADR is clean (7):**
4. **Freeze the public URL contract FIRST** — `/m/{assetId}/{transformName}/{slug}.{ext}`, immutable, renditions-only,
   origin-prefixed even where a 2nd origin isn't yet obtainable.
5. **`bodyJson` stores asset refs (`{assetId, transformName}`), never URLs** — hard rule so URL/origin can evolve
   without rewriting published content.
6. **Originals never served on public URLs** — public = renditions only; original via `media.download_original` +
   `authorize()` (closes the "EXIF stripped on renditions but original leaks GPS" hole).
7. **Virus-scan launch-gate** — write "live scanner required before enabling public/member/form-plugin uploads or
   untrusted import" as a launch-blocking checklist item on those features.
8. **Bulk-import chokepoint amplification** — pre-commit a *batched, chokepoint-legal* import path (ADR-026 atomic
   multi-write; eager generation queued, not inline) and name a 10k-image import as a v1 acceptance test, so no
   "fast bypass importer" is ever built.
9. **`blob_kind: local|remote`** column present in v1 (nullable `storage_key`/`source_url`) — avoids baking in WP's
   forced-copy model for Unsplash/CDN/DAM/AI-generation URLs.
10. **Blob root configurable/separable from the ADR-012 site folder** — so a large-video site doesn't break clone/
    export/backup; origin separation is process-level, not infra-level (single-binary export survives).

**ADR wiring:** extends ADR-022 (media = seeded content-type + core-owned sidecars, not a plugin data-module) ·
ADR-012 (uploads/ + content.db) · ADR-006 (BlobStorePort + ImageTransformPort rule-of-two) · ADR-025 (origin
isolation generalized from plugin-JS to uploaded bytes) · ADR-021 (`authorize()` + `media.*` strings) · ADR-009
(outbox worker) · ADR-026 (batched import). Next free number = **ADR-027**.
