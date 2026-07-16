# API Contract Spec: categories-and-tags

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-018`
- Feature: `FEAT-018-categories-and-tags`
- Version: `1.3.0`
- Content Hash: `sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60`
- Last Edited: `2026-07-15T02:00:00Z`

## Purpose

Defines the human admin CRUD route surface for taxonomies/terms/term-assignment, and the
agent-tool catalog for the same capabilities plus `mergeTerm`'s instantiation of SPEC-016's
gated-mutation gateway. Ordinary mutations (everything except `mergeTerm`) are direct single-call
routes/tools; `mergeTerm` alone follows SPEC-016's `plan → confirm → execute` shape (REQ-15).

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `TAXONOMY_LIST` | `GET` | `/api/admin/v1/taxonomy/taxonomies` | List all taxonomies in the workspace | `AUTH_TAXONOMY_READ` | `TAXONOMY_READ` |
| `TAXONOMY_CREATE` | `POST` | `/api/admin/v1/taxonomy/taxonomies` | Create a taxonomy (e.g. an operator-defined one; `category`/`tag` are seeded) | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `TAXONOMY_DEPRECATE` | `POST` | `/api/admin/v1/taxonomy/taxonomies/{taxonomyId}/deprecate` | Deprecate a taxonomy | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `TERM_LIST` | `GET` | `/api/admin/v1/taxonomy/taxonomies/{taxonomyId}/terms` | List terms under a taxonomy | `AUTH_TAXONOMY_READ` | `TAXONOMY_READ` |
| `TERM_CREATE` | `POST` | `/api/admin/v1/taxonomy/taxonomies/{taxonomyId}/terms` | Create a term under a taxonomy | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `TERM_RENAME` | `PATCH` | `/api/admin/v1/taxonomy/terms/{termId}` | Rename a term (label/slug) | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `TERM_REPARENT` | `POST` | `/api/admin/v1/taxonomy/terms/{termId}/reparent` | Change a term's parent (categories only) | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `TERM_DEPRECATE` | `POST` | `/api/admin/v1/taxonomy/terms/{termId}/deprecate` | Deprecate a term | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `TERM_MERGE_PLAN` | `POST` | `/api/admin/v1/taxonomy/terms/merge/plan` | Read-only preview of merging `fromTermId` into `intoTermId` | `AUTH_TAXONOMY_READ` | `TAXONOMY_READ` |
| `TERM_MERGE_CONFIRM` | `POST` | `/api/admin/v1/taxonomy/terms/merge/confirm` | Human-only acknowledgment; mints a single-use token (SPEC-016 REQ-10) | `AUTH_TAXONOMY_CONFIRM` | `TAXONOMY_GATED_WRITE` |
| `TERM_MERGE_EXECUTE` | `POST` | `/api/admin/v1/taxonomy/terms/merge/execute` | Redeems the token and runs the merge (SPEC-016 REQ-11 – REQ-13) | `AUTH_TAXONOMY_EXECUTE` | `TAXONOMY_GATED_WRITE` |
| `CONTENT_TERMS_LIST` | `GET` | `/api/admin/v1/taxonomy/content/{contentType}/{contentId}/terms` | List terms assigned to a content row | `AUTH_TAXONOMY_READ` | `TAXONOMY_READ` |
| `CONTENT_TERMS_ASSIGN` | `POST` | `/api/admin/v1/taxonomy/content/{contentType}/{contentId}/terms` | Assign one or more terms to a content row | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `CONTENT_TERMS_UNASSIGN` | `DELETE` | `/api/admin/v1/taxonomy/content/{contentType}/{contentId}/terms/{termId}` | Remove a term from a content row | `AUTH_TAXONOMY_MANAGE` | `TAXONOMY_WRITE` |
| `TERM_CONTENT_REVERSE_LOOKUP` | `GET` | `/api/admin/v1/taxonomy/terms/{termId}/content` | List all content assigned to a term (REQ-04 reverse lookup) | `AUTH_TAXONOMY_READ` | `TAXONOMY_READ` |

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Principal Kinds | Notes |
|---|---|---|---|---|---|
| `AUTH_TAXONOMY_READ` | `true` | Session cookie, Bearer API key, or agent delegation token | `admin.taxonomy.read` | `user, agent, api_key` | REQ-20/AC-31 — read is safely callable by any principal kind holding the permission |
| `AUTH_TAXONOMY_MANAGE` | `true` | Session cookie, Bearer API key, or agent delegation token | `admin.taxonomy.manage` | `user, agent, api_key` | REQ-17/REQ-20 — ordinary mutations; `authorize()` evaluated before idempotency (SPEC-016 REQ-14) |
| `AUTH_TAXONOMY_CONFIRM` | `true` | Session cookie only | `admin.taxonomy.manage` | `user` only | REQ-15 — mirrors SPEC-016 `AUTH_GATEWAY_CONFIRM`; no other principal kind may call this endpoint at all |
| `AUTH_TAXONOMY_EXECUTE` | `true` | Session cookie, Bearer API key, or agent delegation token | `admin.taxonomy.manage` | `user, agent, api_key` — subject to SPEC-016's actor-class redemption rule (REQ-13) | REQ-15 — `authorize()` re-evaluated fresh at this call (SPEC-016 REQ-11) |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `TAXONOMY_READ` | `60` | `120` | `20` | `principalId` | Listing/browsing/reverse-lookup traffic, including agent polling |
| `TAXONOMY_WRITE` | `60` | `30` | `5` | `principalId` | Ordinary CRUD mutations (create/rename/reparent/deprecate/assign/unassign) — a `SAFE DEFAULT` NFR assumption; may be tightened by Software Architect, should not need loosening |
| `TAXONOMY_GATED_WRITE` | `60` | `5` | `0` | `principalId` | `mergeTerm`'s confirm/execute — rare, high-stakes calls, matching SPEC-016's `GATED_WRITE` profile shape |

## 4) Request Contracts

### Endpoint: `TAXONOMY_CREATE` (`POST /api/admin/v1/taxonomy/taxonomies`)
```yaml
key:
  type: string
  required: true
  pattern: "^[a-z][a-z0-9_-]{0,63}$"
label:
  type: string
  required: true
hierarchical:
  type: boolean
  required: true
```

### Endpoint: `TERM_CREATE` (`POST /api/admin/v1/taxonomy/taxonomies/{taxonomyId}/terms`)
```yaml
label:
  type: string
  required: true
slug:
  type: string
  required: false   # derived from label if omitted
parentId:
  type: string
  format: ulid
  required: false
  nullable: true
  constraint: "must be null when the taxonomy's hierarchical=false (REQ-10); must resolve to an existing term (404 TERM_NOT_FOUND otherwise, Red-Team RT-012) belonging to the same taxonomyId (400 PARENT_CROSS_TAXONOMY otherwise, REQ-09, Red-Team RT-011)"
```

### Endpoint: `TERM_RENAME` (`PATCH /api/admin/v1/taxonomy/terms/{termId}`)
```yaml
label:
  type: string
  required: false
slug:
  type: string
  required: false
```

### Endpoint: `TERM_REPARENT` (`POST /api/admin/v1/taxonomy/terms/{termId}/reparent`)
```yaml
newParentId:
  type: string
  format: ulid
  required: true
  nullable: true   # null is valid — moves a category term to top-level
```

### Endpoint: `TERM_MERGE_PLAN` (`POST /api/admin/v1/taxonomy/terms/merge/plan`)
```yaml
fromTermId:
  type: string
  format: ulid
  required: true
intoTermId:
  type: string
  format: ulid
  required: true
```

### Endpoint: `TERM_MERGE_CONFIRM` (`POST /api/admin/v1/taxonomy/terms/merge/confirm`)
```yaml
planId:
  type: string
  format: ulid
  required: true
planHash:
  type: string
  pattern: "^sha256:[0-9a-f]{64}$"
  required: true
```

### Endpoint: `TERM_MERGE_EXECUTE` (`POST /api/admin/v1/taxonomy/terms/merge/execute`)
```yaml
confirmationToken:
  type: string
  required: true
```

### Endpoint: `CONTENT_TERMS_ASSIGN` (`POST /api/admin/v1/taxonomy/content/{contentType}/{contentId}/terms`)
```yaml
termIds:
  type: array
  items: { type: string, format: ulid }
  required: true
  minItems: 1
```
- Path Params:
```yaml
contentType:
  type: string
  enum: [post, page]   # REQ-06 hardcoded allow-list; grows only via a future migration ADR
  required: true
contentId:
  type: string
  format: ulid
  required: true
```

## 5) Response Contracts

### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `TAXONOMY_LIST` | `200` | `TaxonomyListResponse` | |
| `TAXONOMY_CREATE` | `201` | `TaxonomyResponse` | |
| `TAXONOMY_DEPRECATE` | `200` | `TaxonomyResponse` | |
| `TERM_LIST` | `200` | `TermListResponse` | |
| `TERM_CREATE` | `201` | `TermResponse` | |
| `TERM_RENAME` | `200` | `TermResponse` | |
| `TERM_REPARENT` | `200` | `TermResponse` | |
| `TERM_DEPRECATE` | `200` | `TermResponse` | |
| `TERM_MERGE_PLAN` | `200` | `MergePlanResponse` | No durable state change (REQ-15, mirrors SPEC-016 REQ-09) |
| `TERM_MERGE_CONFIRM` | `200` | `MergeConfirmResponse` | Mints a single-use token (mirrors SPEC-016 `GatewayConfirmResponse`) |
| `TERM_MERGE_EXECUTE` | `200` | `MergeExecuteResponse` | Runs the merge exactly once on success |
| `CONTENT_TERMS_LIST` | `200` | `TermListResponse` | |
| `CONTENT_TERMS_ASSIGN` | `200` | `AssignResult` | |
| `CONTENT_TERMS_UNASSIGN` | `204` | (empty) | |
| `TERM_CONTENT_REVERSE_LOOKUP` | `200` | `ContentRefListResponse` | Backs REQ-04's reverse-lookup requirement |

### Contract Definitions
```yaml
Taxonomy:
  id: { type: string, format: ulid }
  workspaceId: { type: string, format: ulid }
  key: { type: string }
  label: { type: string }
  hierarchical: { type: boolean }
  status: { type: string, enum: [active, deprecated] }
  updatedAt: { type: string, format: date-time }
  version: { type: integer }

TaxonomyResponse:
  taxonomy: Taxonomy

TaxonomyListResponse:
  taxonomies: { type: array, items: Taxonomy }

Term:
  id: { type: string, format: ulid }
  workspaceId: { type: string, format: ulid }
  taxonomyId: { type: string, format: ulid }
  parentId: { type: string, format: ulid, nullable: true }
  slug: { type: string }
  label: { type: string }
  status: { type: string, enum: [active, deprecated] }
  updatedAt: { type: string, format: date-time }
  version: { type: integer }

TermResponse:
  term: Term

TermListResponse:
  terms: { type: array, items: Term }

MergePlanResponse:
  planId: { type: string, format: ulid }
  planHash: { type: string, pattern: "^sha256:[0-9a-f]{64}$" }
  domain: { type: string, example: "taxonomy.merge" }
  createdAt: { type: string, format: date-time }
  details:
    fromTerm: Term
    intoTerm: Term
    overlappingContentCount: { type: integer }   # REQ-16 disclosure
    willLoseAssignmentHistory: { type: boolean }  # true iff overlappingContentCount > 0

MergeConfirmResponse:
  confirmationToken: { type: string }
  expiresAt: { type: string, format: date-time }   # exactly 600 seconds (10 minutes), no jitter, per SPEC-016 REQ-10
  boundTo:
    planHash: { type: string }
    scopeId: { type: string }   # workspaceId, for this domain
    confirmerPrincipalId: { type: string }

MergeExecuteResponse:
  mergedTermId: { type: string, format: ulid }   # == intoTermId
  deprecatedTermId: { type: string, format: ulid }   # == fromTermId

AssignResult:
  contentType: { type: string, enum: [post, page] }
  contentId: { type: string, format: ulid }
  assignedTermIds: { type: array, items: { type: string, format: ulid } }

ContentRefListResponse:
  contentRefs:
    type: array
    items:
      contentType: { type: string }
      contentId: { type: string, format: ulid }
```

## 6) Error Mapping

Reference canonical codes in `errors.spec.md` (this domain's own codes) and SPEC-016's
`errors.spec.md` (reused gateway codes for the merge ceremony).

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `TAXONOMY_CREATE` | `400` | `VALIDATION_ERROR` |
| `TAXONOMY_CREATE` | `401` | `UNAUTHENTICATED` |
| `TAXONOMY_CREATE` | `403` | `FORBIDDEN` |
| `TERM_CREATE` | `400` | `VALIDATION_ERROR, TAXONOMY_NOT_HIERARCHICAL, PARENT_CROSS_TAXONOMY` |
| `TERM_CREATE` | `403` | `FORBIDDEN` |
| `TERM_CREATE` | `404` | `TAXONOMY_NOT_FOUND, TERM_NOT_FOUND` |
| `TERM_RENAME` | `404` | `TERM_NOT_FOUND` |
| `TERM_REPARENT` | `400` | `PARENT_CROSS_TAXONOMY, TAXONOMY_NOT_HIERARCHICAL, HIERARCHY_CYCLE_DETECTED` |
| `TERM_REPARENT` | `404` | `TERM_NOT_FOUND` |
| `TERM_MERGE_PLAN` | `400` | `SAME_TERM_MERGE` |
| `TERM_MERGE_PLAN` | `401` | `UNAUTHENTICATED` |
| `TERM_MERGE_PLAN` | `403` | `FORBIDDEN` |
| `TERM_MERGE_PLAN` | `404` | `TERM_NOT_FOUND` |
| `TERM_MERGE_CONFIRM` | `400` | `VALIDATION_ERROR` |
| `TERM_MERGE_CONFIRM` | `403` | `FORBIDDEN` |
| `TERM_MERGE_EXECUTE` | `409` | `PLAN_STALE, TOKEN_ALREADY_REDEEMED` |
| `TERM_MERGE_EXECUTE` | `410` | `TOKEN_EXPIRED` |
| `TERM_MERGE_EXECUTE` | `403` | `FORBIDDEN` |
| `CONTENT_TERMS_ASSIGN` | `400` | `VALIDATION_ERROR, WORKSPACE_MISMATCH, CONTENT_TYPE_MISMATCH, TAXONOMY_NOT_APPLICABLE` |
| `CONTENT_TERMS_ASSIGN` | `403` | `FORBIDDEN` |
| `CONTENT_TERMS_ASSIGN` | `404` | `TERM_NOT_FOUND` |
| `CONTENT_TERMS_UNASSIGN` | `404` | `TERM_NOT_FOUND` |
| any | `429` | `RATE_LIMIT_EXCEEDED` |
| any | `500` | `INTERNAL_ERROR` |

## 7) Agent Tool Catalog Contract

```yaml
AgentToolDefinition:
  name: string
  description: string
  params: object
  returns: object
  sideEffects: enum[none, mutates-durable-state, mints-token]
  authorization:
    permission: string   # "admin.taxonomy.read" | "admin.taxonomy.manage"
    deniesIfMissing: "FORBIDDEN"
  actorClassRule: enum[confirmer-must-equal-own-delegatedBy, none]
```

| Tool Name | Maps To | `sideEffects` | `actorClassRule` |
|---|---|---|---|
| `taxonomy_list_taxonomies` | `TAXONOMY_LIST` | `none` | `none` |
| `taxonomy_create_taxonomy` | `TAXONOMY_CREATE` | `mutates-durable-state` | `none` |
| `taxonomy_deprecate_taxonomy` | `TAXONOMY_DEPRECATE` | `mutates-durable-state` | `none` |
| `taxonomy_list_terms` | `TERM_LIST` | `none` | `none` |
| `taxonomy_create_term` | `TERM_CREATE` | `mutates-durable-state` | `none` |
| `taxonomy_rename_term` | `TERM_RENAME` | `mutates-durable-state` | `none` |
| `taxonomy_reparent_term` | `TERM_REPARENT` | `mutates-durable-state` | `none` |
| `taxonomy_deprecate_term` | `TERM_DEPRECATE` | `mutates-durable-state` | `none` |
| `taxonomy_plan_merge_term` | `TERM_MERGE_PLAN` | `none` | `none` |
| `taxonomy_execute_merge_term` | `TERM_MERGE_EXECUTE` | `mutates-durable-state` | `confirmer-must-equal-own-delegatedBy` |
| `taxonomy_list_content_terms` | `CONTENT_TERMS_LIST` | `none` | `none` |
| `taxonomy_assign_terms` | `CONTENT_TERMS_ASSIGN` | `mutates-durable-state` | `none` |
| `taxonomy_unassign_term` | `CONTENT_TERMS_UNASSIGN` | `mutates-durable-state` | `none` |
| `taxonomy_list_term_content` | `TERM_CONTENT_REVERSE_LOOKUP` | `none` | `none` |

Rules (REQ-22):
- `taxonomy_plan_merge_term` MUST be agent-callable, require only `admin.taxonomy.read`, and have
  `sideEffects: none`. It MUST reject with `SAME_TERM_MERGE` when `fromTermId === intoTermId`
  (REQ-15a), before any overlap computation.
- `taxonomy_execute_merge_term` MUST be agent-callable, require `admin.taxonomy.manage`, have
  `sideEffects: mutates-durable-state`, and carry `actorClassRule:
  confirmer-must-equal-own-delegatedBy` (SPEC-016 REQ-13).
- No agent-callable tool in the catalog — regardless of its name — may map to or otherwise invoke
  `confirmMergeTerm` (the merge ceremony's token-minting action). This is a **functional**
  prohibition on performing the `confirm()` step, matching SPEC-016 REQ-22's actual wording ("MUST
  NOT expose any agent-callable tool that performs the `confirm()` step"), not a name-pattern check
  against `taxonomy_confirm_*` alone (Red-Team RT-003) — a tool named e.g.
  `taxonomy_finalize_merge_step2` that internally invokes `confirmMergeTerm` violates this rule
  exactly as a literally-named `taxonomy_confirm_merge_term` tool would. Verification MUST inspect
  each tool definition's mapped orchestrator action, not its name. An agent that needs a human to
  confirm a merge receives no lever at all for that step — only the human-only
  `TERM_MERGE_CONFIRM` HTTP endpoint exists, with no agent-tool counterpart.
- All other tools in this catalog are ordinary (non-gated) mutations or pure reads, per REQ-17 —
  they carry `actorClassRule: none` because SPEC-016's actor-class redemption rule (REQ-13) applies
  only to gated-mutation token redemption, which only `taxonomy_execute_merge_term` performs.

## 8) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md` (domain-owned) or SPEC-016's
      `errors.spec.md` (reused gateway codes for the merge ceremony).
- [x] Names and enums align with `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`.
