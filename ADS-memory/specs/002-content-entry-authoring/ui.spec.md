# UI Contract Spec: Content Entry Authoring — Create and Edit Pages + Posts

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-002`
- Feature: `FEAT-002-content-entry-authoring`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:05:00Z`

## Purpose
Framework-independent contracts for the admin-shell authoring surfaces (REQ-12). The current implementation is the Vite/React shell in `apps/admin` (`Posts.tsx`, `PostEditor.tsx`, `nav.ts` `pages` placeholder); contracts are written so a future shell can satisfy them identically.

## 1) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `EntryListSection` | Lists entries of one kind; hosts the create action (renders as "Posts" or "Pages" section) | Section 2.1 | Section 3.1 |
| `EntryEditor` | Creates (create mode) or edits (edit mode) one entry | Section 2.2 | Section 3.2 |
| `SlugField` | Slug input with auto-derive affordance | Section 2.3 | Section 3.3 |
| `StatusSelect` | Draft/Published selector | Section 2.4 | Section 3.4 |
| `EmptyState` | Renders when a kind list is empty | Section 2.5 | n/a |
| `ErrorBanner` | Renders recoverable API errors in list and editor | Section 2.6 | Section 3.6 |

## 2) Input Contracts (Props/Inputs)

### 2.1 EntryListSection
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `kind` | yes | `enum[post, page]` | none | selects endpoint family (`…/posts` vs `…/pages`) and labels |
| `workspaceId` | yes | `string` | none | path scoping |
| `entries` | yes | `array<AdminEntrySummary>` | none | `{id, title, slug, status, updatedAt}`; server order preserved (TB-01) |
| `isLoading` | yes | `boolean` | none | skeleton state |
| `errorMessage` | no | `string\|null` | `null` | forwarded to `ErrorBanner` |

### 2.2 EntryEditor
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `mode` | yes | `enum[create, edit]` | none | create mode has no `entryId` |
| `kind` | yes | `enum[post, page]` | none | selects create/update endpoint family; never user-editable |
| `workspaceId` | yes | `string` | none | |
| `entryId` | edit only | `string` | none | required iff `mode == edit` |
| `initialEntry` | edit only | `AdminPost` | none | full envelope entry incl. `kind`, `version` |

### 2.3 SlugField
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `value` | yes | `string` | `""` | empty in create mode means "derive on server" |
| `mode` | yes | `enum[create, edit]` | none | edit mode requires non-empty value (update contract) |
| `placeholder` | no | `string` | `"auto — generated from title"` | create mode only |

### 2.4 StatusSelect
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `value` | yes | `enum[draft, published]` | `draft` (create mode) | |
| `disabled` | no | `boolean` | `false` | disabled while a save is in flight |

### 2.5 EmptyState
| Input | Required | Type | Notes |
|---|---|---|---|
| `kind` | yes | `enum[post, page]` | copy varies ("No posts yet" / "No pages yet") with the create call-to-action |

### 2.6 ErrorBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `message` | yes | `string` | human-readable `error` from the API envelope |
| `code` | no | `string\|null` | machine code when present (e.g. `SLUG_CONFLICT` selects the slug-help copy) |

## 3) Event Contracts (Outputs)

### 3.1 EntryListSection
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onCreateRequest` | `kind` | "New Post"/"New Page" control activation | shell navigates to `EntryEditor` in create mode for that kind |
| `onEntrySelect` | `entryId` | row click / Enter key | shell navigates to `EntryEditor` in edit mode |

### 3.2 EntryEditor
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onCreated` | `AdminPost` (created entry) | 201 from `POST_CREATE`/`PAGE_CREATE` | fired exactly once; shell transitions to edit mode for `entry.id` without losing editor state (AC-17) |
| `onSaved` | `AdminPost` (updated entry) | 200 from update endpoint | editor reflects the returned entry (incl. incremented `version`) |
| `onError` | `{message, code}` | non-2xx response | `ErrorBanner` shows; user input preserved (never cleared on failure) |

### 3.3 SlugField
| Event | Payload | Trigger |
|---|---|---|
| `onChange` | `string` | user edit (lowercased as typed; illegal chars not silently stripped — validation happens server-side) |

### 3.4 StatusSelect
| Event | Payload | Trigger |
|---|---|---|
| `onChange` | `enum[draft, published]` | selection change |

### 3.6 ErrorBanner
| Event | Payload | Trigger |
|---|---|---|
| `onDismiss` | none | dismiss control activation |

## 4) Rendering and Interaction Rules

- [ ] `EntryListSection` with `kind "page"` replaces the current `pages` nav placeholder (`apps/admin/src/nav.ts` id `pages`); the nav id and href are unchanged.
- [ ] Empty state renders when `entries.length == 0` and not loading, and includes the create call-to-action.
- [ ] Create mode renders an empty TipTap editor, `status` preset to draft, slug field empty with the auto placeholder; the save control is disabled until `title` is non-empty (mirror of BR-03 step 1 only — all other validation is server-owned).
- [ ] Exactly one save request is in flight per editor at a time; the save control is disabled while in flight (prevents accidental double-create; `Idempotency-Key` may additionally be sent — optional in this slice).
- [ ] On `SLUG_CONFLICT`, the editor keeps all user input and focuses the slug field.
- [ ] After `onCreated`, the visible URL/route reflects edit mode for the new id (reload-safe).
- [ ] A published entry's list row indicates status visually (draft vs published) — exact styling is shell-owned.

## 5) Accessibility Requirements

| Area | Requirement |
|---|---|
| Semantic roles | Lists use `list`/`listitem` or table semantics; New Post/New Page are `button`s; the editor form is a labelled `form`. |
| Labels | Title, slug, and status controls have programmatic labels; the slug auto-derive behavior is described via `aria-describedby`. |
| Keyboard | Full keyboard operation: list rows reachable and activatable, save via keyboard, focus moves to the first error on failure. |
| Status updates | Save success/failure announced via an ARIA live region. |
| Error clarity | `ErrorBanner` text is associated with the failing field when the code implies one (`SLUG_CONFLICT` → slug field). |

## 6) Composition Rules

- `EntryListSection` and `EntryEditor` are the only public entry components; both are instantiated per kind by the shell router.
- `SlugField`, `StatusSelect`, `EmptyState`, `ErrorBanner` render only inside the two public components.
- The existing `Posts.tsx`/`PostEditor.tsx` satisfy this contract by generalizing to `kind`-parameterized components (or by thin `kind`-bound wrappers) — implementation's choice; the contract only fixes inputs/events.
- No component talks to the API directly except through the shell's api client (`apps/admin/src/lib/api.ts` today), which gains `createEntry`, `listPages`, `getPage`, `updatePage` calls.

## 7) Acceptance Checklist

- [x] Each public component has explicit input and event contracts
- [x] Rendering conditions are deterministic
- [x] Accessibility requirements are testable
- [x] Entity names and statuses align with state.spec.md (`AdminPost` + `kind`, `draft`/`published`)
