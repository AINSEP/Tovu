# Error Code Registry Spec: categories-and-tags

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-018`
- Feature: `FEAT-018-categories-and-tags`
- Version: `1.3.0`
- Content Hash: `sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60`
- Last Edited: `2026-07-15T02:00:00Z`

## Purpose

Domain-specific error registry for taxonomy/term mutations and the term/content join. The
`mergeTerm` gated mutation reuses SPEC-016's `PLAN_STALE`, `TOKEN_EXPIRED`,
`TOKEN_ALREADY_REDEEMED`, `FORBIDDEN`, `UNAUTHENTICATED`, `VALIDATION_ERROR`,
`RATE_LIMIT_EXCEEDED`, and `INTERNAL_ERROR` codes verbatim from SPEC-016's `errors.spec.md` — they
are not redefined here.

## 1) Error Envelope (Base Payload)
All errors MUST include (identical shape to SPEC-016's envelope, for consistency across every
gateway/domain a caller interacts with):

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry (domain-owned codes)

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `TAXONOMY_NOT_FOUND` | not-found | `api` | 404 | no | "This taxonomy no longer exists." |
| `TERM_NOT_FOUND` | not-found | `api` | 404 | no | "This term no longer exists." |
| `TAXONOMY_NOT_HIERARCHICAL` | validation | `api` | 400 | no | "Tags can't have a parent term." |
| `PARENT_CROSS_TAXONOMY` | validation | `api` | 400 | no | "A term's parent must belong to the same taxonomy." |
| `HIERARCHY_CYCLE_DETECTED` | validation | `api` | 400 | no | "That change would make a term its own ancestor." |
| `WORKSPACE_MISMATCH` | authz | `api` | 400 | no | "This term and content don't belong to the same workspace." |
| `CONTENT_TYPE_MISMATCH` | authz | `api` | 400 | no | "This content isn't the type you specified." |
| `TAXONOMY_NOT_APPLICABLE` | validation | `api` | 400 | no | "This taxonomy can't be applied to this content type." |
| `SAME_TERM_MERGE` | validation | `api` | 400 | no | "A term can't be merged into itself." |

## 3) Per-Code Details Schema

```yaml
TAXONOMY_NOT_HIERARCHICAL:
  details:
    taxonomyId: string
    hierarchical: false

PARENT_CROSS_TAXONOMY:
  details:
    childTaxonomyId: string
    parentTaxonomyId: string

HIERARCHY_CYCLE_DETECTED:
  details:
    termId: string
    attemptedParentId: string

WORKSPACE_MISMATCH:
  details:
    callerWorkspaceId: string
    resolvedTermWorkspaceId: string
    resolvedContentWorkspaceId: string

CONTENT_TYPE_MISMATCH:
  details:
    suppliedContentType: string
    resolvedContentKind: string

TAXONOMY_NOT_APPLICABLE:
  details:
    taxonomyId: string
    contentType: string
    reason: string   # e.g. "post/page allow-list does not include this taxonomy"

SAME_TERM_MERGE:
  details:
    termId: string   # the single term supplied as both fromTermId and intoTermId
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `TAXONOMY_NOT_FOUND` / `TERM_NOT_FOUND` | `TaxonomyWriteService` lookup step | Admin UI (`ui.spec.md`) and agent tool caller | Produced identically for human and agent callers. `TERM_NOT_FOUND` is also produced by `createTerm`/`reparentTerm` when the supplied `parentId`/`newParentId` does not resolve to any existing term (REQ-09, Red-Team RT-012), distinct from `PARENT_CROSS_TAXONOMY` (parent exists, wrong taxonomy). |
| `TAXONOMY_NOT_HIERARCHICAL` / `PARENT_CROSS_TAXONOMY` / `HIERARCHY_CYCLE_DETECTED` | `TaxonomyWriteService`'s hierarchy-validation step (REQ-09 – REQ-11) | Admin UI's term-editor / reparent dialog | Rejected before any write, per `behavior.spec.md` §1 |
| `WORKSPACE_MISMATCH` / `CONTENT_TYPE_MISMATCH` | `TaxonomyWriteService`'s join-validation step (REQ-07 – REQ-08) | Admin UI's assign-terms picker and agent tool caller | Same vocabulary whether the caller is human or agent |
| `TAXONOMY_NOT_APPLICABLE` | `TaxonomyWriteService`'s allow-list check (REQ-06) | Admin UI's assign-terms picker (which should not offer an inapplicable taxonomy in the first place) and agent tool caller | Belt-and-suspenders check even if the UI already filters |
| `SAME_TERM_MERGE` | `TaxonomyWriteService`'s `planMergeTerm` self-merge check (REQ-15a), run before any overlap computation | Admin UI's merge dialog (which should not offer merging a term into itself in the first place) and agent tool caller | Belt-and-suspenders check even if the UI already filters — a 2-term multi-select trigger should never supply the same term twice |
| `PLAN_STALE` / `TOKEN_EXPIRED` / `TOKEN_ALREADY_REDEEMED` / `FORBIDDEN` (merge ceremony) | SPEC-016's `GatedMutationGateway`, instantiated by this domain's `executeMergeTerm` | Admin UI's merge dialog + agent tool caller | Reused verbatim from SPEC-016 — see SPEC-016 `errors.spec.md` §4 |

## 5) Acceptance Checklist
- [x] Every error emitted by this domain appears in Section 2, plus the SPEC-016 codes reused for
      the merge ceremony (declared, not restated).
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here or in SPEC-016's `errors.spec.md`.
- [x] User-safe message guidance is provided.
