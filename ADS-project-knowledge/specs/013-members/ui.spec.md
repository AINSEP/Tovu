# UI Contract Spec: Members (As-Built)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-013`
- Feature: `FEAT-013-members`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Documents the admin Members screen exactly as it exists in
`apps/admin/src/sections/Members.tsx` (51 lines) — a single read-only table component with no
interactive controls. This file also enumerates, explicitly, every management capability the
backend already supports that the UI does not expose (the "thin screen over a fuller backend" gap
called out in the dispatch directive).

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `Members` | The entire screen: fetch-on-mount, loading/error/table states, one static table | Section 2.1 | Section 3.1 (none — no events) |

There is exactly one component. `Members.tsx` defines no child components, no row-action buttons, no
modal/dialog, and no form.

## 2) Input Contracts (Props/Inputs)
### 2.1 Members
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| — | — | — | — | `Members` takes no props; it is mounted as a router-level section and calls `api.listMembers()` directly in a `useEffect` on mount. |

Internal state (not props, but the component's full state surface):
| State | Type | Initial | Notes |
|---|---|---|---|
| `members` | `AdminMember[] \| null` | `null` | `null` renders the loading notice; a set array (even `[]`) renders the table. |
| `error` | `string \| null` | `null` | Set from a caught fetch error; renders the error notice and suppresses the table/loading notice. |

## 3) Event Contracts (Outputs)
### 3.1 Members
No output events exist — `Members` has no `onXxx` callback props and emits nothing to a parent. There
is no click handler anywhere in the component.

## 4) Rendering and Interaction Rules
- [x] The error notice (`<div className="notice error">{error}</div>`) renders whenever `error` is
      non-null, and takes precedence over both the loading and table states (checked first in the
      component's early-return chain).
- [x] The loading notice (`<div className="notice">Loading members…</div>`) renders whenever
      `members` is `null` and `error` is `null`.
- [x] The table renders once `members` is a non-null array (including an empty array — an empty
      table with headers and zero body rows, no dedicated "no members yet" empty state).
- [x] Each row always renders all four cells; `name` falls back to the literal string `"—"` when
      absent; `createdAt` is rendered as `member.createdAt.slice(0, 16).replace("T", " ")` (a raw
      string transform, not a locale-aware date formatter).
- [ ] **Not implemented — explicit gap, not a design decision to omit:** no disable action, no
      resend-magic-link action, no member detail view/drill-in, no tier assignment/comp-subscription
      control, no session list/revoke control, no create-member or invite-member action, no search or
      filter control, no pagination control (despite the list API supporting `afterId`/`limit`
      keyset pagination — the UI always calls `listMembers()` with no arguments and therefore only
      ever sees the first page, silently truncated at the in-memory adapter's 100-row cap).

## 5) Accessibility Requirements
| Area | Requirement | As-built status |
|---|---|---|
| Semantic roles | Table uses `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>` | Met — standard semantic table markup. |
| Labels | Status cell wraps the raw status string in a `<span className="status status-{status}">` | Met for visual styling hook; no `aria-label` beyond the visible text (the visible text is itself descriptive, e.g. "active"). |
| Keyboard | No interactive elements exist to focus | N/A — there is nothing to operate by keyboard because there are no controls. |
| Status updates | No ARIA live region for the loading→loaded transition | Not implemented — a screen-reader user gets no announcement when the table replaces the loading notice. |
| Error clarity | Error notice is plain text in a `div`, not associated with any field (there is no form) | Partially met — the message is visible and readable, but not a `role="alert"` region. |

## 6) Composition Rules
- `Members` is the only component in this file and the only public entry point for the Members
  section.
- No sub-components exist to enumerate composition rules for.

## 7) Acceptance Checklist
- [x] The one public component has an explicit (empty) input contract and (empty) event contract.
- [x] Rendering conditions are deterministic and documented, including the precedence of
      error > loading > table.
- [x] Accessibility gaps are stated explicitly rather than omitted.
- [x] The gap between backend capability (list w/ pagination, get-by-id, disable, request-magic-link)
      and UI surface (list only, first page only, no actions) is itemized in Section 4, not implied.
