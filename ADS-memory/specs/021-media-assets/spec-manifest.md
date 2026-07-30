# Spec Manifest: media-assets

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-021 |
| feature_name | FEAT-021-media-assets |
| version | 1.0.0 |
| last_edited | 2026-07-15T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/021-media-assets |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow for FEAT-021. **This package is a lightweight as-built backfill** for a feature that shipped as a walking-skeleton implementation of ADR-027 (ACCEPTED 2026-07-09) without a formal spec package — it documents real, already-existing code, not a design proposal.

**Naming-convention deviation from dispatch instruction, disclosed:** the Coordinator dispatch instructed defaulting to `spec_naming: prefixed` on the stated premise that "every existing spec folder in this repo uses the prefixed convention." That premise does not hold: a direct grep of every existing `spec-manifest.md`'s `spec_naming` field found only the earliest 5 folders (`001`–`005`) use `prefixed`; every spec folder from `006-identity-and-authorization` onward (`006`, `007`, `008`, `009`, `010`, `011`, `012`, `013`, `014`, `015` — 10 of 15 folders, including the two most recent, `014-analytics` and `015-integrations`) uses `standard`. This spec follows the actual current, settled convention (`standard`, matching every filename below with no `SPEC-021-` prefix) rather than the dispatch's factually-incorrect premise. Flagged here for visibility, not silently substituted.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary as-built requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Six real, wired HTTP routes (5 admin + 1 public rendition route) are in scope |
| `state.spec.md` | PRESENT | `state.spec.md` | Real durable-shaped state (5 record types: `MediaRecord`, `AssetBlobRecord`, `AssetRenditionRecord`, `BlobGcJournalEntry`, `TransformDefinitionRecord`), backed today only by in-memory adapters — adapted from the template's frontend-store shape to the backend durable-record shape, mirroring the `015-integrations` precedent |
| `orchestrator.spec.md` | OMITTED | — | No client-side orchestration/coordinator abstraction exists — the one admin UI component (`Media.tsx`) talks directly to the API via the shared thin fetch wrapper (`apps/admin/src/lib/api.ts`), mirroring the SPEC-007/SPEC-009/SPEC-015 precedent's identical omission reasoning |
| `ui.spec.md` | PRESENT | `ui.spec.md` | One real, shipped admin screen (`Media.tsx`) is in scope |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Real typed error classes with a real (non-canonical-envelope, disclosed) wire shape are documented |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Substantial ordering/precedence/dedup/bound rules exist in the real code: blob dedup-by-hash, append-only transform versioning, the anonymous-generation OR-gate bound, single-flight generation locking, the GC grace formula, write-before-insert/unlink-after-delete-commit ordering |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | As-built matrix — every REQ/AC/INV/EC/error-code/behavior-rule resolved to a real impl file/function and (where one exists) a real test |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate, adapted for an as-built backfill (see its own header note) |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` (for the still-missing surfaces only — authz gap OQ-01, and the named GAP list) | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus ADR-027 in full, `src/media/*` (all 18 files, already read for this pass), `src/server/routes/admin/media/*`, `src/server/routes/site/media-rendition.ts`, `src/server/http/admin/media.ts`, `src/identity/permissions.ts`, `apps/admin/src/sections/Media.tsx` |
| `tdd` (for hardening the untested rows in `traceability.spec.md` §6.2, and for the OQ-01 authz remediation once approved) | `feature.spec.md`, `traceability.spec.md`, `behavior.spec.md`, `errors.spec.md` |
| `programmer` (for GAP/OQ work) | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADR-027, the real source files already cited throughout this package |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield` — specifically, a **lightweight as-built backfill** of already-shipped, already-tested code (per Coordinator dispatch instruction: no System Design blueprint was ever produced, none is needed, and the full 5-pass reverse-spec pipeline was not requested — this is a direct read-the-code-and-formalize pass against the governing ADR).

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/architecture/ADR-027-media-assets-subsystem.md` | architecture (ACCEPTED 2026-07-09) | Governing ADR; read in full. Primary source of truth for what the FULL design intends — this spec documents how far the real code implements it, disclosing every gap rather than silently normalizing the walking-skeleton build as the complete design. |
| `src/media/{types,ports,transform-types,media-service,rendition-service,blob-gc,blob-gc-lock,transform-lock,transform-registry,blob-key,blob-store.fs,blob-store.memory,repo.memory,image-transformer,image-transformer.sharp,index}.ts` | source touchpoint (read in full) | The library's real, tested implementation — every REQ in `feature.spec.md` traces here. |
| `src/media/INFO.md` | source touchpoint (read in full) | A Programmer-authored disclosure document that already named most of this spec's GAP list before this spec pass began — used as a primary extraction source, cross-checked against the actual code rather than trusted blindly. |
| `src/media/__tests__/{media-service,blob-gc,blob-store,image-transformer.sharp,rendition-service,transform-registry}.test.ts` | test touchpoint (read in full) | Real, passing tests cited by name throughout `traceability.spec.md`. |
| `src/server/routes/admin/media/{list,upload,update,trash,delete}.ts` | source touchpoint (read in full) | The real, wired admin HTTP API this package's `api.spec.md` documents — also where the REQ-39 authz-absence finding was confirmed (direct grep for `authorize`/`permission` across all five files returned zero matches). |
| `src/server/routes/site/media-rendition.ts` | source touchpoint (read in full) | The real, public, unauthenticated rendition-serving route implementing ADR-027 §4's frozen URL contract. |
| `src/server/http/admin/media.ts` | source touchpoint (read in full) | The real response-DTO projection functions `api.spec.md` §5 mirrors exactly. |
| `src/server/__tests__/admin-media-routes.test.ts` | test touchpoint (read in full) | Real, passing integration-level route tests cited throughout `traceability.spec.md`. |
| `src/server/__tests__/media-rendition-route.test.ts` | test touchpoint (read in full) | Real, passing integration-level tests for the public rendition route, including the audited-protocol behaviors (bounded anonymous generation, single-flight, cache headers). |
| `apps/admin/src/sections/Media.tsx` | source touchpoint (read in full) | The real, shipped admin UI `ui.spec.md` documents, including its own now-stale "no byte-serving route" comment (GAP-UI-STALE). |
| `apps/admin/src/lib/api.ts` (media section, lines ~129-139 and ~418-446) | source touchpoint | The real fetch-client shapes (`AdminMedia`) `api.spec.md`/`ui.spec.md` cross-reference. |
| `src/identity/permissions.ts` | source touchpoint (grepped + read) | Confirms the only registered media-related permission is `media.write` (owner `"core"`), and that it is referenced nowhere else in the repo (REQ-40 finding). |
| `src/server/middleware/dev-auth.ts` | source touchpoint (read in full) | Confirms the real session-auth mechanism (`tovu_session` cookie, ADR-021/SPEC-006) that gates the admin origin generally, and that `getAuthedPrincipal` is used by `upload.ts` for attribution only, not as a gate. |
| `src/server/routes/admin/menus/delete.ts` | source touchpoint (read for comparison) | The pattern every sibling admin section follows (`deps.authorize(...)` called before the write) — used to confirm media's absence of the same pattern is a real deviation, not this repo's normal style. |
| `src/server/__specs__/50-media/media-api.spec.md` | pre-existing design-intent doc (read in full) | An earlier, generic (non-ADR-027-specific) media-API design note already in the repo; cross-checked against the real shipped code — consistent in spirit (processing-state contract, background handoff) but the real code does not implement its `pending`/`processing`/`ready`/`failed`/`quarantined` processing-state vocabulary at all (`MediaStatus` is only `active`/`trashed`) — not re-litigated here, just disclosed as a pre-existing doc this spec supersedes for the media library specifically. |
| `ADS-memory/reports/architecture/ADR-INDEX.md` (Media row, line 36) | index entry | Cross-checked against the real code; the ADR-INDEX summary accurately describes ADR-027's DESIGN (not the build), consistent with this spec's own separation of design-vs-build. |

---

## Validation Notes

- Validator run: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/021-media-assets --phase spec --update-hash`.
- First run flagged 7 mechanical issues in `spec-dod.md` (a non-canonical `B-04` status string, three `NA` rows in Sections C/F missing a concrete per-row justification even though the reason was stated in a sibling row, `G-06`/`G-08` status cells containing the word "FAIL" even though the intent was a documented PASS-as-EXCEPTION, and a non-ISO-8601 Sign-Off date) — all seven fixed, second run: **PASS, zero warnings**.
- `content_hash` in `feature.spec.md` is `sha256:8517330957578346a96c9e5f48ede2e8f388c882469889e662f33ca471ac3bc0`, computed and written by the validator's `--update-hash`, not invented.
- **One real, previously-undisclosed deviation found between ADR-027 and the shipped code, disclosed rather than silently resolved either way:** the admin media routes enforce **zero** per-action authorization, despite ADR-027 §7 explicitly specifying a flat `media.*` permission registry and despite every sibling admin section already enforcing `deps.authorize(...)`. This is NOT one of the many gaps `src/media/INFO.md` itself already names (that file's own extensive self-disclosure covers origin isolation, ingress policy, the entries model, GC stubs, transform-generation scope, etc. — but never authorization). See `feature.spec.md` REQ-39/REQ-40, Constitution Article VI EXCEPTION, and OQ-01/OQ-02.
- No brownfield `ANALYSIS-*`/`MIGRATION-*`/`TESTABILITY-*` reports exist for this feature (none were requested or produced) — this package's own read-the-code-and-tests pass (listed above) is the evidence base instead, per the dispatch instruction (no System Design blueprint needed; small/no-blueprint change).
