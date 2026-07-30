# External Audit Report — Tovu Media/Assets subsystem DESIGN (feeds ADR-027)

- **Date:** 2026-07-09 · **Command:** `/audit-work` (+ Fable internal verifier, owner-requested)
- **Threat model:** TM-media-001 · risk_tier=high · score_floor=8.5 · packet `PKT-media-design-2026-07-09` (hash `ac3823db7d46079a`)
- **Audit round:** 1 · **suggest_changes:** notes (design stage) → upgraded to drafted sample fixes in a follow-up dispatch
- **Subject:** the converged v1 media design (consensus report `reports/swarm-consensus/runs/20260709-media-admin-section-consensus-report.md`) about to be frozen as ADR-027

## Auditors (models)
| Auditor | Role | CLI | Resolved Model | CLI Ver | Status |
|---|---|---|---|---|---|
| Codex | external | codex | gpt-5.5 (reasoning=xhigh) | 0.144.0 | Responded (audit + fixes) |
| Gemini | external | agy | Gemini 3.1 Pro (High) | 1.1.0 | **Degraded** on verdict (3× `timeout waiting for response`); delivered fixes on retry |
| Fable | internal verifier | in-host subagent | Fable (Anthropic) | n/a | Responded (audit + fixes) |

Model proof: smoke-tested this session (artifact `reports/swarm-consensus/smoke-tests/2026-07-10T000917Z-cli-smoke-test.json`).

## Work Log
Audited a pre-implementation architecture (no code). Built the frozen threat-model packet (7 blocking domains D1–D7,
6 invariants INV-1..6, dual gate), dispatched to Fable (internal, falsification framing, author-rationale excluded) +
Codex + Gemini (external, different-family). Gemini's verdict timed out 3× (Gemini-side; agy auth verified healthy);
proceeded with Codex + Fable meeting min_auditors. Both returned FAIL with converging blockers. Ran a follow-up
sample-fix dispatch to all three (Gemini recovered) → merged drafts in `.local-artifacts/external-audit/proposed-fixes/20260709-media/`.

## Auditor Matrix
| Auditor | Score | Gate | Rationale (one line) |
|---|---|---|---|
| Codex GPT-5.5 xhigh | 8.1 | FAIL | Directionally strong + ADR-aligned, but immutable-URL and blob-GC-liveness rules too imprecise to freeze. |
| Fable (internal) | 8.0 | FAIL | Architecture right; 3 of 6 invariants (INV-1/2/4) falsifiable under natural implementations, all in irreversible domains. |
| Gemini 3.1 Pro | n/a | — | No scored verdict (transient timeout); contributed concrete fixes only. |

**Independent dual gate (coordinator-recomputed): `FAIL` (round 1)** — validated blockers present AND both scores below the 8.5 floor.

## Degraded Coverage
Gemini's audit **verdict** is missing (3 transient `timeout waiting for response`; retry budget exhausted). Impact is low:
Codex (external) + Fable (internal) independently converged, and Gemini did contribute to the fix round. A round-2 re-audit
can re-include Gemini for full external coverage.

## Per-Auditor Scope Checks
- **Codex:** read the consensus report, draft `media-api.spec.md`, ADR-006/007/009/012/021/022/023/025/026, ADR-INDEX, and `tovu-architecture.md` §13–14. Noted `tovu/PROJECT_MEMORY.md`/`tovu/src/INFO.md` absent — treated as scope limit, not blocker.
- **Fable:** read packet + consensus report (design sections; author rationale discounted) + ADR-006/007/009/012/021/022/023/024/025/026 + draft spec. Noted the itemized 22-item IN-v1 ledger lives in R2 context artifacts, not the report — lowered confidence where a probe depended on it (MIME scope), did not classify blocking on it.

## What The External LLMs Said (+ Fable)
Unanimous: **the converged architecture is sound and ADR-aligned** (hybrid entry+sidecars, content-addressing, origin
isolation, refs-not-URLs, 409-on-referenced-purge, freeze-URL-first). INV-5 (rule-of-two) and INV-6 (no back door) survived
falsification. The design is **not freeze-safe as written** because three irreversible surfaces are under-specified.

## Per-Finding Rationales (blocking)
- **B1 — D1/INV-1 GC/dedup byte-deletion race** (Codex F2 + Fable F1, high conf): "delete-if-unreferenced" is check-then-act
  across the fs/db split → a dedup-hit upload can skip writing bytes GC then deletes; tombstoned-blob dedup-hit unhandled;
  "unreferenced" undefined; keys must be workspace-prefixed. Byte deletion is the only irreversible op in a never-brick product.
- **B2 — D2/INV-4 immutable URL + transform lifecycle** (Codex F1 + Fable F3): frozen URL carried neither hash nor version →
  same URL serves different bytes on source-replace/version-bump; theme-declared transform names in published URLs 404 when the
  theme is switched off.
- **B3 — D3/INV-2 original-serving origin** (Fable F2, high conf, NEW): `download_original` gated by `authorize()` but the serving
  origin is unspecified → natural impl streams from the admin origin → SVG-IN-v1 inline render = operator-session theft.

Advisories: A1 byte-ingress unification · A2 remote=metadata-only · A3 sidecar attribution/INV-3 narrowing · A4 non-image
MIME private-only · A5 worker-adapter naming + minimal presign · A6 external-blob-root export.

## Cross-Auditor Synthesis
Codex and Fable **converged on the two headline blockers** (URL immutability, GC liveness) independently; Fable added the
original-serving-origin blocker (heightened by the owner's SVG-IN-v1 call). No auditor found an architecture-level defect —
every finding is a specification gap fixable in a paragraph. Convergence + independence makes the FAIL high-confidence.

## Suggested Changes By Auditor
Concrete drafted fixes (clauses + schema/DDL + protocol pseudocode + named acceptance tests) from all three auditors are in
`.local-artifacts/external-audit/proposed-fixes/20260709-media/proposed-fixes.md`. On the one divergence (B2 URL shape) the
three proposed: Fable version-in-path (no extra table), Codex pretty-URL + `media_url_bindings` table, Gemini version+hash-in-path.

## Coordinator Response → Agree
Agree with all three blockers and all six advisories — they are real gaps in the irreversible surfaces, and the drafted fixes
stay inside the accepted architecture (ADR-006/007/012/021/022/023/025/026) without reopening decided calls.

## Coordinator Response → Change
None — no auditor finding rejected or materially altered. B1's default adopts Fable's per-generation-epoch mechanism over
plain locking (strictly stronger). B2 resolved by owner decision (below).

## Coordinator Response → Disagree
None.

## Coordinator Response → Proposed Fix Handling (disposition gate — 9/9, no silent drops)
| Finding | Disposition | Note |
|---|---|---|
| B1 GC/dedup race | agree-implement→ADR-027 | Fable per-epoch protocol + workspace-prefixed keys + grace≥retention + tests |
| B2 URL immutability/lifecycle | agree-implement→ADR-027 | **owner chose Fable version-in-path** `/m/{assetId}/{transformName}.v{version}/{slug}.{ext}`; append-only `transform_registry`; serve-if-exists; source-replace=new identity |
| B3 original-serving origin | agree-implement→ADR-027 | mint-only signed URL on cookie-less media origin; admin origin has no media byte-routes |
| A1 byte-ingress unification | agree-implement→ADR-027 | one `MediaIngressPolicy`; resolve-then-connect SSRF guard |
| A2 remote=metadata-only | agree-implement→ADR-027 | no /m/ path for remote in v1 |
| A3 sidecar attribution | agree-implement→ADR-027 | `created_by_principal`/`plugin_id`; single-writer canary; INV-3 narrowed explicitly |
| A4 non-image MIME | agree-implement→ADR-027 | pdf/av/archives private-only until pipeline ships |
| A5 worker adapter/presign | agree-implement→ADR-027 | host-agnostic `NodeWorkerImageTransformAdapter`; minimal frozen presign |
| A6 external blob root export | agree-implement→ADR-027 | gather/relink, never silent byte omission |

All folds are ADR-authoring work (next stage), so none are code-implemented this session; tracked follow-up = ADR-027.

## Audit Outcome
**`FAIL` (round 1) — architecture endorsed, not yet freeze-safe.** 3 blockers + 6 advisories, all with converged concrete
fixes drafted and dispositioned. Fold the fixes into ADR-027, then **round-2 re-audit** (diff-only compliance vs TM-media-001,
re-include Gemini) to confirm closure before freeze. Auditors' own estimate: re-audit clears the 8.5 floor comfortably.

## Decision Points For User
1. **B2 URL shape — RESOLVED:** owner chose **Fable version-in-path** (`/m/{assetId}/{transformName}.v{version}/{slug}.{ext}`);
   Codex `media_url_bindings` table is the documented fallback if a version-less URL is later wanted.
2. **Path-to-10 advisories** (raise score to 10, non-blocking): named acceptance tests for URL-immutability across
   version/source changes; GC dedup + cross-workspace + snapshot-restore tests; the 10k-image bulk-import chokepoint test;
   export behavior for external blob root; private/public dedup-sharing semantics. All are folded via the fix set's acceptance tests.
3. **Round-2 re-audit** recommended before ADR-027 freeze (high-risk work; convergence-protocol diff-only).
