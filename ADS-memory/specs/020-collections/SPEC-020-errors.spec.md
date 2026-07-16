# Error Code Registry Spec: collections

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-020`
- Feature: `FEAT-020-collections`
- Version: `1.4.0`
- Content Hash: `sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6`
- Last Edited: `2026-07-15T03:30:00Z`

## Purpose

Canonical error registry for Collections. Codes that belong to SPEC-016's gated-mutation
gateway/watermark contract are reused directly (never redefined); the codes below that are new are
specific to the content-type registry and entry field-bag validation this spec owns.

## 1) Error Envelope (Base Payload)

All errors MUST include (identical shape to SPEC-016 `errors.spec.md` §1):

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry

### 2.1 New codes owned by this spec

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `RESERVED_CONTENT_TYPE_KEY` | validation | `api` | 409 | no | "'post' and 'page' are reserved names. Choose a different key." |
| `INVALID_KEY_GRAMMAR` | validation | `api` | 400 | no | "Content type keys must start with a lowercase letter and contain only lowercase letters, numbers, and underscores." |
| `INVALID_FIELD_NAME_GRAMMAR` | validation | `api` | 400 | no | "Field names must start with a lowercase letter and contain only lowercase letters, numbers, and underscores." |
| `INVALID_FIELD_KIND` | validation | `api` | 400 | no | "Choose a supported field type." |
| `QUERYABLE_FIELD_CAP_EXCEEDED` | validation | `api` | 400 | no | "This content type already has the maximum number of searchable fields." |
| `CONTENT_TYPE_KEY_CONFLICT` | resource | `api` | 409 | no | "A content type with this key already exists." |
| `CONTENT_TYPE_NOT_FOUND` | resource | `api` | 404 | no | "This content type could not be found." |
| `CONTENT_TYPE_NOT_ACTIVE` | conflict | `api` | 409 | no | "This content type is disabled and cannot accept new entries." |
| `ENTRY_NOT_FOUND` | resource | `api` | 404 | no | "This entry could not be found." |
| `ENTRY_SLUG_CONFLICT` | resource | `api` | 409 | no | "An entry with this URL slug already exists for this content type." |
| `CLEANUP_NOT_ELIGIBLE` | conflict | `api` | 409 | no | "This content type cannot be permanently removed yet." |
| `VERSION_CONFLICT` | conflict | `api` | 409 | yes (re-fetch the current record and resubmit with its current `version`) | "This item was changed by someone else since you loaded it. Refresh and try again." |

### 2.2 Reused directly from SPEC-016 `errors.spec.md` §2 (not redefined)

| Code | HTTP Status | Notes |
|---|---:|---|
| `PLAN_STALE` | 409 | Cleanup `execute()` rejects a plan recomputed against drifted live state (SPEC-016 REQ-12) |
| `TOKEN_EXPIRED` | 410 | Cleanup confirmation token past its ~10-minute TTL (SPEC-016 REQ-10) |
| `TOKEN_ALREADY_REDEEMED` | 409 | Cleanup confirmation token already redeemed once (SPEC-016 INV-03) |
| `FORBIDDEN` | 403 | `authorize()` denial at any Collections route or tool |
| `UNAUTHENTICATED` | 401 | No valid session/token/API key |
| `VALIDATION_ERROR` | 400 | Reused directly for entry field-bag violations (REQ-14) — see §3 below for the Collections-specific `details` shape |
| `RATE_LIMIT_EXCEEDED` | 429 | Any Collections rate-limit profile exhausted |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## 3) Per-Code Details Schema

```yaml
RESERVED_CONTENT_TYPE_KEY:
  details:
    key: string

INVALID_KEY_GRAMMAR:
  details:
    key: string
    pattern: string   # "^[a-z][a-z0-9_]{0,63}$"

INVALID_FIELD_NAME_GRAMMAR:
  details:
    fieldName: string
    pattern: string   # "^[a-z][a-z0-9_]{0,63}$"

INVALID_FIELD_KIND:
  details:
    fieldName: string
    suppliedKind: string
    allowedKinds: array of string   # [text, integer, real, boolean, datetime]

QUERYABLE_FIELD_CAP_EXCEEDED:
  details:
    currentQueryableCount: integer
    cap: integer   # 20 (REQ-05)

CONTENT_TYPE_KEY_CONFLICT:
  details:
    key: string

CONTENT_TYPE_NOT_ACTIVE:
  details:
    key: string
    status: string   # deprecated | tombstone

ENTRY_SLUG_CONFLICT:
  details:
    workspaceId: string
    type: string
    slug: string

VALIDATION_ERROR:
  # Two distinct `details` shapes ride the same code, disambiguated by which endpoint/action
  # produced them (see Section 4 Ownership table below):
  # 1. Entry field-bag validation (REQ-14, ENTRY_CREATE/ENTRY_UPDATE/ENTRY_VALIDATE_FIELDS):
  details:
    fieldErrors:
      type: array
      items:
        field: string
        reason: string   # e.g. "not declared on this content type's current schema", "required field is missing"
  # 2. Content-type field-set floor violation (REQ-26, CONTENT_TYPE_UPDATE_FIELDS only):
  details:
    reason: string   # fixed value "fields_empty" — submitted `fields` array was present but empty

CLEANUP_NOT_ELIGIBLE:
  details:
    contentTypeKey: string
    reason: string   # enum: not_tombstoned | retention_window_not_elapsed | export_reference_missing
    retentionWindowDays: integer   # 30 (REQ-20), present only when reason=retention_window_not_elapsed
    tombstonedAt: string           # ISO-8601 UTC, present only when reason=retention_window_not_elapsed

VERSION_CONFLICT:
  details:
    currentVersion: integer          # the record's actual current version at rejection time
    suppliedExpectedVersion: integer # the caller's stale expectedVersion
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `RESERVED_CONTENT_TYPE_KEY` | Content-type write chokepoint (REQ-02) | Content-Type Builder form | First-failing-guard ordering means this is only reported when the key grammar check has already passed (REQ-24) |
| `INVALID_KEY_GRAMMAR` / `INVALID_FIELD_NAME_GRAMMAR` | Content-type write chokepoint (REQ-03) | Content-Type Builder form | Checked before any DDL is constructed |
| `INVALID_FIELD_KIND` | Content-type write chokepoint (REQ-04) | Content-Type Builder form | The supplied string is echoed back in `details.suppliedKind` for operator feedback only — never passed to DDL |
| `QUERYABLE_FIELD_CAP_EXCEEDED` | Content-type write chokepoint (REQ-05) | Content-Type Builder form | |
| `CONTENT_TYPE_NOT_ACTIVE` | Entry write chokepoint (REQ-10 — entry creation against `deprecated`/`tombstone`; REQ-28 — `update`/`publish`/`unpublish` against `tombstone` only) | Entry editor | Distinguishes `deprecated` (new-creation refused, but existing entries remain fully readable AND manageable — update/publish/unpublish still succeed, REQ-28) from `tombstone` (new-creation refused, existing entries excluded from public serving, AND update/publish/unpublish also refused, REQ-11/REQ-28) via `details.status` |
| `VALIDATION_ERROR` (entry field-bag case) | Entry write chokepoint (REQ-14) and `ENTRY_VALIDATE_FIELDS` (REQ-25) | Entry editor | The identical `fieldErrors` shape is produced by both the real write path and the dry-run validate-only path |
| `VALIDATION_ERROR` (content-type empty-fields case) | Content-type write chokepoint, `op='update-fields'` only (REQ-26) | Content-Type Builder form | `details.reason='fields_empty'` — produced only when a submitted `fields` array is present but has zero entries AND `expectedVersion` already matched the content type's current `version`; a stale `expectedVersion` is rejected with `VERSION_CONFLICT` first, before this check ever runs (REQ-26); distinct `details` shape from the entry field-bag case above, never conflated with it |
| `VERSION_CONFLICT` | Content-type write chokepoint (`op='update-fields'`, REQ-26) and entry write chokepoint (`UPDATE_ENTRY`/`PUBLISH_ENTRY`/`UNPUBLISH_ENTRY`, optimistic-concurrency `expectedVersion` mismatch) | Content-Type Builder form / Entry editor | Checked before any other precondition on the same call (REQ-26) — added 2026-07-15 per `/audit-work` internal + external audit convergence (3 independent auditors found this code was referenced by name in prose ("a version-conflict error") but never actually registered) |
| `CLEANUP_NOT_ELIGIBLE` | Cleanup gateway `plan()` (REQ-20) | Cleanup confirmation dialog | Never an HTTP failure state the UI treats as unexpected — it is the expected steady-state response until all three eligibility conditions hold |
| `PLAN_STALE` / `TOKEN_EXPIRED` / `TOKEN_ALREADY_REDEEMED` / `FORBIDDEN` | SPEC-016's gateway `execute()`/`confirm()` | Cleanup confirmation dialog + agent tool caller | Reused verbatim from SPEC-016 `errors.spec.md` — not redefined here |

## 5) Acceptance Checklist
- [x] Every error emitted by this feature's own code appears in Section 2.1, or is reused from
      SPEC-016 and listed in Section 2.2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided.
