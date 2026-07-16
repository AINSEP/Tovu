# UI Contract Spec: categories-and-tags

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-018`
- Feature: `FEAT-018-categories-and-tags`
- Version: `1.3.0`
- Content Hash: `sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60`
- Last Edited: `2026-07-15T02:00:00Z`

## Purpose

Defines the `apps/admin/src/sections/Taxonomy.tsx` screen (named in ADR-044's Wiring section) and
the term-assignment picker embedded in the post/page editor, independent of frontend framework
detail.

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `TaxonomySection` | Top-level admin screen wiring (taxonomy list + selected taxonomy's term tree) | Section 2.1 | Section 3.1 |
| `TaxonomyList` | Presents `category`/`tag`/operator-defined taxonomies | Section 2.2 | Section 3.2 |
| `TermTree` | Presents a taxonomy's terms (nested for hierarchical, flat list for non-hierarchical) | Section 2.3 | Section 3.3 |
| `TermEditorForm` | Captures create/rename input for one term | Section 2.4 | Section 3.4 |
| `ReparentTermControl` | Captures a term's new parent (hierarchical taxonomies only) | Section 2.5 | Section 3.5 |
| `MergeTermDialog` | Instantiates SPEC-016's plan→confirm→execute ceremony for `mergeTerm` | Section 2.6 | Section 3.6 |
| `TermAssignmentPicker` | Embedded in the post/page editor; assigns/unassigns terms on the content row being edited | Section 2.7 | Section 3.7 |
| `EmptyState` | Renders no-taxonomies / no-terms state | Section 2.8 | n/a |
| `ErrorBanner` | Renders recoverable errors (domain codes + reused SPEC-016 gateway codes) | Section 2.9 | Section 3.9 |

## 2) Input Contracts (Props/Inputs)

### 2.1 TaxonomySection
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `workspaceId` | yes | `string (ulid)` | none | passed to orchestrator |
| `selectedTaxonomyId` | no | `string (ulid) \| null` | `null` | drives which `TermTree` renders |
| `onTaxonomyCreated` | no | `callback(taxonomy)` | none | optional external hook |

### 2.2 TaxonomyList
| Input | Required | Type | Notes |
|---|---|---|---|
| `taxonomies` | yes | `array<Taxonomy>` | empty list never occurs post-seed — `category`/`tag` always exist (behavior.spec.md §3) |
| `isLoading` | yes | `boolean` | shows loading skeleton |
| `selectedTaxonomyId` | no | `string \| null` | selected row styling |

### 2.3 TermTree
| Input | Required | Type | Notes |
|---|---|---|---|
| `terms` | yes | `array<Term>` | empty list allowed (new taxonomy with no terms yet) |
| `hierarchical` | yes | `boolean` | `true` renders nested tree via `parentId`; `false` renders a flat list — never both |
| `isLoading` | yes | `boolean` | shows loading skeleton |
| `selectedTermIds` | no | `array<string>` | multi-select for bulk actions (e.g. opening `MergeTermDialog`) |

### 2.4 TermEditorForm
| Input | Required | Type | Notes |
|---|---|---|---|
| `mode` | yes | `enum[create, rename]` | drives submit action (`createTerm` vs `renameTerm`) |
| `initialLabel` | no | `string` | prefilled on `rename` |
| `initialSlug` | no | `string` | prefilled on `rename` |
| `isSubmitting` | yes | `boolean` | disables form during in-flight mutation |

### 2.5 ReparentTermControl
| Input | Required | Type | Notes |
|---|---|---|---|
| `termId` | yes | `string (ulid)` | the term being reparented |
| `taxonomyId` | yes | `string (ulid)` | constrains the parent picker to same-taxonomy terms only (REQ-09) — never renders for `hierarchical: false` taxonomies (REQ-10) |
| `currentParentId` | no | `string \| null` | preselected value |
| `candidateParents` | yes | `array<Term>` | pre-filtered by the orchestrator to exclude `termId` itself and its descendants (client-side mirror of `wouldCreateCycle`; the write chokepoint is still authoritative, per REQ-11) |

### 2.6 MergeTermDialog
| Input | Required | Type | Notes |
|---|---|---|---|
| `fromTermId` / `intoTermId` | yes | `string (ulid)` | the two terms being merged; must be distinct — the dialog is only ever opened from a 2-distinct-term multi-select (§6 Composition Rules), and the server-side `SAME_TERM_MERGE` rejection (REQ-15a) remains authoritative regardless |
| `mergePlan` | no | `MergePlanResponse \| null` | `null` until `planMergeTerm` resolves |
| `overlapDisclosure` | yes | `{overlappingContentCount: integer, willLoseAssignmentHistory: boolean}` | REQ-16's plan-time disclosure — MUST render before the confirm control is enabled |
| `confirmationStep` | yes | `enum[planning, awaiting-confirm, confirmed, executing, done, failed]` | drives which of plan/confirm/execute is in flight |

### 2.7 TermAssignmentPicker
| Input | Required | Type | Notes |
|---|---|---|---|
| `contentType` | yes | `enum[post, page]` | REQ-06 allow-list — the picker only ever renders for content types on it |
| `contentId` | yes | `string (ulid)` | the content row being edited |
| `assignedTermIds` | yes | `array<string>` | current assignment |
| `applicableTaxonomies` | yes | `array<Taxonomy>` | filtered client-side to what's applicable to `contentType` (server still re-validates, REQ-06/EC-08) |
| `isSubmitting` | yes | `boolean` | disables the picker during an in-flight assign/unassign call |

### 2.8 EmptyState
| Input | Required | Type | Notes |
|---|---|---|---|
| `context` | yes | `enum[no-terms-in-taxonomy]` | `TaxonomyList` never needs this (category/tag always seeded) |

### 2.9 ErrorBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `error` | yes | `TaxonomyError \| null` | domain code (`errors.spec.md`) or reused SPEC-016 gateway code |
| `onRetry` | no | `callback()` | shown only for retryable codes (`errors.spec.md` §2, SPEC-016 `errors.spec.md` §2) |

## 3) Event Contracts (Outputs)

### 3.1 TaxonomySection
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onTaxonomyCreated` | `Taxonomy` | successful `createTaxonomy` | parent notified once |
| `onTaxonomySelected` | `taxonomyId` | row click | `selectedTaxonomyId` updates, `TermTree` reloads |

### 3.2 TaxonomyList Events
| Event | Payload | Trigger |
|---|---|---|
| `onTaxonomySelect` | `taxonomyId` | row click / Enter key |
| `onCreateTaxonomyRequest` | none | "New taxonomy" control activation |

### 3.3 TermTree Events
| Event | Payload | Trigger |
|---|---|---|
| `onTermSelect` | `termId` | row click / Enter key |
| `onCreateTermRequest` | `parentId \| null` | "New term" / "New child term" control activation |
| `onRenameTermRequest` | `termId` | rename control activation |
| `onReparentTermRequest` | `termId` | drag-drop or "Move to..." control activation (hierarchical taxonomies only) |
| `onMergeTermRequest` | `{fromTermId, intoTermId}` | "Merge into..." control activation after a 2-term multi-select |
| `onDeprecateTermRequest` | `termId` | deprecate control activation |

### 3.4 TermEditorForm Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSubmit` | `{label, slug?}` or `{termId, label?, slug?}` | form submit | calls `createTerm` or `renameTerm`; form disables during flight |
| `onCancel` | none | cancel control | form closes without mutation |

### 3.5 ReparentTermControl Events
| Event | Payload | Trigger |
|---|---|---|
| `onReparent` | `{termId, newParentId}` | parent selection confirmed |

### 3.6 MergeTermDialog Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onPlanRequested` | `{fromTermId, intoTermId}` | dialog opens | calls `planMergeTerm`; `confirmationStep` → `planning` |
| `onConfirm` | `{planId, planHash}` | human clicks "Confirm merge" (only enabled after `overlapDisclosure` has rendered) | calls `confirmMergeTerm`; `confirmationStep` → `awaiting-confirm` then `confirmed` |
| `onExecute` | `{confirmationToken}` | automatically follows a successful `onConfirm`, or a distinct "Run merge" control | calls `executeMergeTerm`; `confirmationStep` → `executing` then `done`/`failed` |
| `onCancel` | none | cancel control at any step before `executing` | dialog closes; any minted-but-unredeemed token is simply left to expire (SPEC-016 does not require explicit token revocation) |

### 3.7 TermAssignmentPicker Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onAssign` | `{termIds}` | picker selection confirmed | calls `assignTerms`; picker disables during flight |
| `onUnassign` | `{termId}` | remove-chip control | calls `unassignTerm`; picker disables during flight |

### 3.9 ErrorBanner Events
| Event | Payload | Trigger |
|---|---|---|
| `onRetry` | none | retry control activation (retryable codes only) |
| `onDismiss` | none | dismiss control activation |

## 4) Rendering and Interaction Rules
- [x] `EmptyState` (`no-terms-in-taxonomy`) renders when `terms.length == 0` and `isLoading ==
      false`; `TaxonomyList` never renders an empty state (category/tag always seeded,
      `behavior.spec.md` §3).
- [x] Loading skeletons render while the initial `TaxonomyList`/`TermTree` load is in-flight.
- [x] `ReparentTermControl` is never rendered for a term whose taxonomy has `hierarchical: false`
      (REQ-10) — this mirrors the server-side rejection, it does not replace it.
- [x] `MergeTermDialog`'s confirm control (`onConfirm`) is disabled until `mergePlan` has resolved
      and `overlapDisclosure` has rendered (REQ-16) — a human must see the disclosure before they
      can confirm, never a race between the plan response and an already-enabled button.
- [x] `MergeTermDialog` never renders an "execute" affordance reachable without a prior successful
      `onConfirm` in the same dialog session (mirrors REQ-15/EC — no UI-level fast path around the
      gateway).
- [x] `TermAssignmentPicker` never offers a taxonomy that the client-side `applicableTaxonomies`
      filter excludes, but a server-side `TAXONOMY_NOT_APPLICABLE` rejection (EC-08) is still
      handled by `ErrorBanner`, not assumed impossible.
- [x] Disabled/in-flight states are deterministic for every mutation control (`isSubmitting`
      pattern, consistent across `TermEditorForm`, `ReparentTermControl`, `MergeTermDialog`,
      `TermAssignmentPicker`).
- [x] `ErrorBanner` displays the latest recoverable error and a retry affordance only for codes
      marked retryable in `errors.spec.md` §2 / SPEC-016 `errors.spec.md` §2.
- [x] `MergeTermDialog` is never opened with `fromTermId === intoTermId` — the 2-term multi-select
      trigger (`onMergeTermRequest`) inherently supplies two distinct terms (§6 Composition Rules);
      the server-side `SAME_TERM_MERGE` rejection (REQ-15a) remains the authoritative check
      regardless of this client-side precondition.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | `TermTree` uses `role="tree"`/`role="treeitem"` for hierarchical taxonomies and `role="list"`/`role="listitem"` for flat ones; `MergeTermDialog` uses `role="dialog"` with `aria-modal="true"`. |
| Labels | Every control (create/rename/reparent/merge/deprecate/assign/unassign) has an accessible name distinguishing which term/taxonomy it acts on. |
| Keyboard | Full keyboard operation for tree navigation, term selection, and the merge ceremony's plan→confirm→execute steps, with visible focus states throughout. |
| Status updates | `confirmationStep` transitions in `MergeTermDialog` and `isSubmitting` transitions elsewhere are announced via an ARIA live region. |
| Error clarity | Validation errors (`TAXONOMY_NOT_HIERARCHICAL`, `PARENT_CROSS_TAXONOMY`, `HIERARCHY_CYCLE_DETECTED`, `WORKSPACE_MISMATCH`, `CONTENT_TYPE_MISMATCH`, `TAXONOMY_NOT_APPLICABLE`) are announced and associated with the specific control that produced them (e.g. the reparent picker, not a generic page-level banner alone). |

## 6) Composition Rules
- `TaxonomySection` is the only public entry component for the admin screen.
- `TermTree` is rendered only within `TaxonomySection` (for the selected taxonomy).
- `MergeTermDialog` may be rendered only when a 2-term merge is pending (never for a single term or
  more than two).
- `ReparentTermControl` is rendered only within `TermTree` for a hierarchical taxonomy's term.
- `TermAssignmentPicker` is composed into the post/page editor screen (owned by an existing,
  out-of-scope editor feature) as an embedded widget, not part of `TaxonomySection`'s own tree.
- Internal helper components (row renderers, drag handles) are implementation detail and excluded
  from this contract.

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `orchestrator.spec.md` and `state.spec.md`.
