# Error Code Registry Spec: analytics

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-014`
- Feature: `FEAT-014-analytics`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Documents the as-built error/drop-reason vocabulary for `analytics`. **This feature does
not use the project's structured error-envelope convention** (Constitution Article VIII
calls for structured, machine-readable errors with a `correlationId`) — the ingest path
uses a plain `{ accepted: boolean, reason?: string }` result union instead of thrown,
coded errors, and the one HTTP-level error (`404` on recent-hits) uses a bare
`{ error: string }` body, not the generic envelope other newer features (e.g. settings)
use. Both are recorded here as the honest as-built shape, not upgraded to look more
structured than they are.

## 1) Error Envelope (Base Payload)

**Ingest path (`ingestHit`) — NOT the generic envelope.** No `code`/`message`/
`occurredAt`/`correlationId`/`details` shape exists. Instead:

```yaml
IngestHitResult:
  accepted: boolean
  reason: string|undefined   # only set when accepted === false; see §2 for the closed enum
```

**Recent-hits `404` — a bare, non-generic envelope:**
```yaml
error: string   # fixed literal "workspace was not found"; no code, no correlationId
```

**Thrown class (internal, not surfaced over HTTP as anything but the always-`204`
response — see api.spec.md §6):**
```yaml
AnalyticsPiiRejectedError extends Error   # message-only; no structured fields
```

## 2) Error / Drop-Reason Code Registry

| Code | Category | Layer | HTTP Status (as observed by caller) | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `workspace_unresolved` | ingest-drop | `service` (`ingestHit`) | `204` (beacon never distinguishes this) | no | None surfaced — the public beacon has no user-facing message channel by design. |
| `analytics_disabled` | ingest-drop | `service` | `204` | no | None surfaced. |
| `dnt` | ingest-drop (policy) | `service` | `204` | no | None surfaced. |
| `gpc` | ingest-drop (policy) | `service` | `204` | no | None surfaced. |
| `excluded_path` | ingest-drop (policy) | `service` | `204` | no | None surfaced. |
| `excluded_ip` | ingest-drop (policy) | `service` | `204` | no | None surfaced. |
| `pii_rejected` | ingest-drop (validation) | `service` | `204` | no | None surfaced (see rationale in §4 — a distinguishable response would be a PII-shape oracle). |
| `dropped_by_hook` | ingest-drop (extension) | `service` | `204` | no | None surfaced. |
| `ANALYTICS_WORKSPACE_NOT_FOUND` | resource | `api` (recent-hits route) | `404` | no | Admin-facing: "Workspace was not found." (the route's literal body string). |
| `UNAUTHENTICATED` | auth | `api` (upstream `requireAdminSession`, not this route's own code) | `401` | maybe | Standard session-expired messaging owned by the identity library, not analytics. |

Note: `AnalyticsDisabledError`, `AnalyticsValidationError`, and
`AnalyticsWorkspaceUnresolvedError` are declared as empty `Error` subclasses in
`src/analytics/ports.ts`, but **none of them is actually thrown anywhere in the current
code** — `ingestHit` reports the equivalent conditions via the `reason` string union above
instead. They are recorded here as declared-but-unused, not as live error codes, so a
future implementer does not assume they are wired to anything.

## 3) Per-Code Details Schema

None of the codes above carry a `details` object — the `IngestHitResult`/`404` shapes in
§1 are the complete payloads; there is no per-code schema to extend.

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `workspace_unresolved` / `analytics_disabled` / `dnt` / `gpc` / `excluded_path` / `excluded_ip` / `pii_rejected` / `dropped_by_hook` | `ingestHit` (`src/analytics/ingest.ts`) | Nowhere over HTTP — `registerAnalyticsIngestRoute` deliberately discards the `IngestHitResult` and always responds `204`. Only test code observes these reasons directly (by calling `ingestHit` in-process). | This is intentional: per the beacon route's file header, leaking accept/reject (or a distinct status per reason) back to an anonymous caller would let that caller probe a site's exclusion rules, DNT/GPC handling, or PII-shape validation — turning the beacon into an oracle. The trade-off (zero operator visibility into *why* a hit was dropped, from outside a debugger/test) is accepted, not accidental. |
| `ANALYTICS_WORKSPACE_NOT_FOUND` | `registerAdminAnalyticsRecentHitsRoute` (`src/server/routes/admin/analytics/recent-hits.ts`) | Directly in the HTTP response body | The only place this feature's own code produces an HTTP-visible error. |
| `UNAUTHENTICATED` | `requireAdminSession` (`src/server/middleware/dev-auth.ts`) | Directly in the HTTP response, before analytics route code ever runs | Not owned by `analytics`; listed here only because it is the one error a caller of the recent-hits route can actually observe besides `404`. |

## 5) Acceptance Checklist
- [x] Every reason/code emitted by feature code appears in Section 2 (cross-checked
      against `IngestDropReason`'s full union in `src/analytics/ingest.ts`).
- [x] Every code's retry behavior is stated (all `no` — none of these are transient).
- [x] Every code used in `api.spec.md` appears here.
- [x] The absence of the project's generic structured-error envelope is stated explicitly
      (Constitution Article VIII EXCEPTION, cross-referenced in `feature.spec.md`), not
      silently assumed present.
