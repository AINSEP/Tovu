# UI Contract Spec: analytics

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-014`
- Feature: `FEAT-014-analytics`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Documents the single admin UI component that exists for analytics today:
`apps/admin/src/sections/Analytics.tsx`. There is no chart/graph/breakdown component —
none exists in the codebase (no charting library is even a dependency for this screen).

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `Analytics` | Top-level (and only) component for the admin Analytics section. Fetches recent hits on mount and renders loading/error/empty/table states. | Section 2.1 | Section 3.1 |

There is exactly one component. `Analytics.tsx` does not decompose into `ItemList`/
`ItemCard`/etc. — it is a single function component with inline JSX, mirroring
`sections/Posts.tsx`'s shape per the file's own header comment.

## 2) Input Contracts (Props/Inputs)

### 2.1 `Analytics`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| *(none)* | — | — | — | `Analytics` takes no props; it is mounted directly by the admin router/section registry and owns its own data fetching via `api.listRecentAnalyticsHits()`. |

## 3) Event Contracts (Outputs)

### 3.1 `Analytics`
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| *(none — no callback props)* | — | — | `Analytics` emits no events to a parent; it is a leaf screen, not a reusable widget. |

Internal (non-prop) interaction:
| Interaction | Trigger | Expected Outcome |
|---|---|---|
| initial data fetch | component mount (`useEffect` with `[]` deps) | Calls `api.listRecentAnalyticsHits()` once; on success sets `hits`, on failure sets `error` |

There is no manual refresh control, no pagination control, and no filter control in the
UI — the screen fetches once on mount and never refetches.

## 4) Rendering and Interaction Rules
- [x] Error notice (`.notice.error`) renders and takes precedence over every other state
      when `error !== null`.
- [x] Loading notice (`"Loading recent hits…"`) renders when `error === null && hits ===
      null`.
- [x] A fixed, always-shown honesty notice (`"Raw ingest data only... There is no
      aggregation/rollup layer yet..."`) renders above the table/empty-state whenever
      `hits !== null` (i.e., once loading/error have cleared) — this notice is not
      conditional on hit count.
- [x] Empty-state notice (`"No hits recorded yet..."`) renders when `hits !== null &&
      hits.length === 0`, in place of the table.
- [x] Table renders when `hits !== null && hits.length > 0`, with one `<tr>` per hit, keyed
      by `` `${hit.occurredAt}-${index}` `` (composite key — `occurredAt` alone is not
      guaranteed unique across hits in the same minute, so `index` is folded in).
- [x] No loading skeleton, no disabled-state control, and no retry affordance exist — the
      error notice is a static message with no retry button (a real gap versus the generic
      template's expectation of a "retry affordance"; recorded here rather than invented).

## 5) Accessibility Requirements
| Area | Requirement | As-built status |
|---|---|---|
| Semantic roles | Table uses native `<table>/<thead>/<tbody>/<tr>/<th>/<td>` elements | Met — plain semantic HTML, no ARIA grid pattern needed. |
| Labels | Interactive elements have accessible names | N/A — the screen has no interactive controls (no buttons, no inputs, no links). |
| Keyboard | Full keyboard operability | N/A by the same reasoning — nothing to focus or activate. |
| Status updates | Async state changes announced via ARIA live region | **Not implemented.** Loading/error/empty transitions are plain conditional renders with no `aria-live` region or equivalent announcement. This is a real, disclosed accessibility gap, not a satisfied requirement. |
| Error clarity | Errors are announced and associated with context | Partial — the error message is rendered as visible text (`.notice.error`) but with no ARIA role (e.g. `role="alert"`) to programmatically announce it. |

## 6) Composition Rules
- `Analytics` is the only component in this file/section; there is no internal
  sub-component to constrain composition of.
- `Analytics` must only be rendered once per admin section mount (it fetches on every
  mount with no dedupe/caching — remounting refetches).

## 7) Acceptance Checklist
- [x] The one public component (`Analytics`) has an explicit (empty) input contract.
- [x] Rendering conditions (error > loading > empty > table) are deterministic and
      documented in priority order.
- [x] Accessibility gaps are stated explicitly (ARIA live region, error `role="alert"`) —
      not silently assumed satisfied.
- [x] Entity names (`AdminAnalyticsHit` fields) align with `state.spec.md` and
      `api.spec.md`.
