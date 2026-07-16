# Error Code Registry Spec: media-assets

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-021`
- Feature: `FEAT-021-media-assets`
- Version: `1.0.0`
- Content Hash: anchored in feature.spec.md
- Last Edited: `2026-07-15T00:00:00Z`

## Purpose
Canonical error registry for this feature. **As-built disclosure:** the real HTTP responses do NOT use the envelope in §1 below — they are plain `{error: string}` (or, for the 409 purge case, `{error, referencing}`) bodies with no `code`/`occurredAt`/`correlationId` field at all. §1 documents the target/canonical shape this repo's template defines; §2's "Real Body Shape" column documents what the code actually returns. This gap is Constitution Article VIII EXCEPTION in `feature.spec.md` (GAP-OBSERVABILITY), not silently glossed over.

## 1) Error Envelope (Base Payload) — CANONICAL TARGET, NOT what media routes currently return

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry

| Code | Category | Layer | HTTP Status | Retryable | Real Body Shape (as shipped) | Thrown By (typed error class) |
|---|---|---|---:|---|---|---|
| `WORKSPACE_NOT_FOUND` | resource | `api` | 404 | no | `{error}` | n/a — inline `res.status(404).json(...)`, no typed error class; checked before any service call on every admin route |
| `MEDIA_NOT_FOUND` | resource | `api` | 404 | no | `{error}` | `MediaNotFoundError` (`src/media/types.ts`) |
| `MEDIA_VALIDATION_ERROR` | validation | `api` | 400 | no | `{error}` | `MediaValidationError` (base class; `MediaSourceImmutableError` is a subclass but is not currently reachable through any exposed route — see `feature.spec.md` REQ-08) |
| `MEDIA_STILL_REFERENCED` | resource-conflict | `api` | 409 | no (retry after trashing) | `{error, referencing: string[]}` | `MediaStillReferencedError` (subclass of `MediaConflictError`) |
| `TRANSFORM_VALIDATION_ERROR` | validation | `internal` (registration only; no HTTP route exposes `registerTransform` in this build) | n/a (not HTTP-reachable) | no | n/a | `TransformValidationError` (`src/media/transform-types.ts`) |
| `MALFORMED_RENDITION_URL` | validation | `api` | 400 | no | `{error: "malformed media rendition URL"}` or `{error: "malformed transform version"}` | n/a — inline route check in `media-rendition.ts` |
| `RENDITION_NOT_FOUND` | resource | `api` | 404 | maybe (a later request for the same URL after the definition/reference exists may succeed) | `{error: "rendition not found"}`, `Cache-Control: public, max-age=60` | n/a — `resolveMediaRendition`'s `{outcome: "not-found"}` mapped by the route |
| `MEDIA_GONE` | resource | `api` | 410 | no | empty body, `Cache-Control: no-store` | n/a — `resolveMediaRendition`'s `{outcome: "gone"}` mapped by the route |
| `IMAGE_TRANSFORM_UNAVAILABLE` | dependency | `api` | 503 | yes (once `sharp` is installed/available) | `{error}`, `Cache-Control: no-store` | `ImageTransformUnavailableError` (`src/media/image-transformer.sharp.ts`) |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | `{error: "internal error"}` | any uncaught error, on every route's catch-all `else` branch |

**Codes never produced by this feature today:** `UNAUTHENTICATED` (401) and `FORBIDDEN` (403) do not appear anywhere in the media route handlers. `401` would come from upstream session middleware (out of this feature's code), and `403` never occurs because no media route checks a permission at all (`feature.spec.md` REQ-39) — there is no code path that could produce it. `RATE_LIMIT_EXCEEDED` (429), `UPSTREAM_TIMEOUT`/`UPSTREAM_ERROR` also never occur — no rate limiting or upstream dependency call exists on any media route.

## 3) Per-Code Details Schema

```yaml
MEDIA_STILL_REFERENCED:
  details:
    referencing:
      type: array
      items: string
      note: >
        As shipped, this is always exactly one human-readable sentence stating the asset
        is "still active" — a disclosed stand-in for the real ADR-027 §5 entry_refs
        where-used list (feature.spec.md GAP-ENTRYREFS), not a real list of referencing
        content items.
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `MEDIA_VALIDATION_ERROR` | `src/media/media-service.ts` (`uploadMedia`) | `upload.ts`, `update.ts` | Same error class covers content-type, empty-file, size-cap, and (in principle, unreachable today) source-immutability rejections |
| `MEDIA_NOT_FOUND` | `src/media/media-service.ts` (`getMediaById`, `updateMediaMetadata`, `trashMedia`, `purgeMedia`) | `update.ts`, `trash.ts`, `delete.ts` | Consistent across every mutating route |
| `MEDIA_STILL_REFERENCED` | `src/media/media-service.ts` (`purgeMedia`) | `delete.ts` only | The only route that returns a 409 |
| `IMAGE_TRANSFORM_UNAVAILABLE` | `src/media/image-transformer.sharp.ts` (`SharpImageTransformer.transform`, via `loadSharpFactory`) | `media-rendition.ts` (caught specifically, before the generic catch-all) | The only place a `503` is ever returned by this feature |
| `INTERNAL_ERROR` | any uncaught exception | every route's final `catch` `else` branch | Not error-code-differentiated further — no structured logging/correlation id is attached (GAP-OBSERVABILITY) |

## 5) Acceptance Checklist
- [x] Every error emitted by feature code appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided implicitly via the real (unstructured) `error` string field — no separate user-message-guidance layer exists in this build, which is itself part of the disclosed GAP-OBSERVABILITY gap rather than a template omission.
