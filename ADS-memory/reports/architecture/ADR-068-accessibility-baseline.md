# ADR-068: Accessibility baseline and regression ownership

- Status: **PROPOSED — documentation deliverable; no acceptance or compliance certification**
- Date: 2026-10-17
- Authors: Software Architect + Spec personas (Codex)
- Input: TRIAGE s4-21 (original TODO line 1288), Admin Section Spec Sweep’s separately requested Accessibility ADR, architecture sections 13/14 (especially UF-16), constitution, and existing feature accessibility requirements.
- Related: SPEC-002 UI §5; SPEC-043/047 authoring surfaces; ADR-027 media; ADR-020 theme trust; ADR-025 plugin UI isolation.
- Planning Preflight: not supplied for a dedicated accessibility delivery package. This proposal records the requested cross-cutting direction for review; it does not authorize implementation or promote a governance rule.

## Context and evidence

The shared accessibility decision is missing even though individual feature specs require labels, keyboard operation, focus on validation errors and status announcements. `ADS-memory/specs/002-content-entry-authoring/ui.spec.md:109` is one existing owner of such requirements. An alt field alone does not certify editor, admin, public-theme or extension accessibility.

Reuse-first inspection found existing native controls, installed Radix controls, shared Jini UI primitives/focus-trap hook, Jini admin ConfirmDialog, React Testing Library/user-event and Playwright. These are the starting mechanisms. No accessibility service, new component toolkit, duplicate focus manager, or testing dependency is added by this ADR. Existing primitives still need evidence; a dependency name is not a conformance claim.

## Proposed decision

Use **WCAG 2.2 Level AA as the product accessibility target** for first-party admin, desktop renderer, public first-party themes/components and supported authoring flows. This is a proposed engineering baseline, not a statement about legal obligations, a certification of the current product, or a claim that an automated scan can prove conformance.

Apply the baseline at existing owners: generic component and interaction behavior in `@jini-ai/ui` / `@jini-ai/admin`; Tovu-specific navigation, content validation and public rendering in Tovu; installed plugins/themes responsible for their supplied output, with host-owned validation/fallback and release admission. Existing behavior stays with its named owner. Any missing generic mechanism must be proposed in Jini before a Tovu implementation.

### Observable baseline

| ID | Required outcome | Regression evidence |
|---|---|---|
| A11Y-01 | Every operable control has an accessible name, role and state. Native button/link/input/select is the first option; icon-only buttons have names. Inputs and errors are programmatically associated. | Role/name assertions in owning component tests; keyboard/assistive-technology pass for custom controls. |
| A11Y-02 | All workflows work with keyboard alone. Focus order follows reading order, focus is visible and not fully hidden by sticky chrome. No keyboard trap except an intentionally modal dialog with a working exit. | Tab/Shift-Tab/Enter/Space/Escape journey from navigation through edit/save/error/cancel. Dialog initially focuses an appropriate target and restores focus to its invoker or a documented surviving target. |
| A11Y-03 | Routes and panels provide a main landmark, meaningful page title and heading structure, and a skip-to-content route through persistent chrome. | Direct URL and client navigation checks, including empty, loading, denied and failure states. |
| A11Y-04 | Validation preserves the user’s draft, identifies the failing field and offers a recoverable action. Status updates and asynchronous failures are announced without unexpectedly moving focus. | Save failure and retry with a screen reader; assert associated error and appropriate live region in component tests. |
| A11Y-05 | At 200% text zoom and 320 CSS-pixel viewport width, essential content and controls remain operable without two-dimensional page scrolling, except content intrinsically requiring two dimensions such as data tables. | Browser checks for shell/sidebar, editor toolbar, dialogs, long labels and tables; test light/dark and collapsed/expanded navigation. |
| A11Y-06 | Text contrast target is at least 4.5:1 (3:1 for large text); essential UI boundaries and states target 3:1. Color alone never conveys status. | Token/component contrast check in both modes plus manual disabled/hover/focus/error state review; do not certify arbitrary theme/user colors from first-party defaults. |
| A11Y-07 | Motion respects prefers-reduced-motion; flashing content and essential-action timeouts need explicit accessible handling. Drag-only actions have a keyboard/button alternative. | Reduced-motion journey and reorder without pointer; no autoplay animation required to operate a screen. |
| A11Y-08 | Media authoring supports meaningful alternatives. Informative images require an author-supplied text alternative; decorative images explicitly use empty alt. Video/audio workflows surface captions/transcript requirements and their current availability rather than implying automatic generation. | Render tests for alt/decorative behavior; content quality checks distinguish missing from deliberately empty alternatives. Captions/transcripts are a scoped follow-up where the current media model lacks them. |
| A11Y-09 | First-party content output preserves semantic headings, lists, links, tables and form labels; reusable embeds expose accessible player/control names. | Public page and preview checks of representative document + HTML + Liquid output. Arbitrary trusted author HTML is assessed separately, not certified by the renderer’s existence. |
| A11Y-10 | Touch/pointer controls target at least 24×24 CSS pixels or a documented spacing/equivalent-control exception, and do not require precision gestures alone. | Responsive inspection of dense toolbars, row actions, resize/reorder and dismiss controls. |

## Boundaries and ownership

| Boundary | Accountable implementation owner | Review owner |
|---|---|---|
| Shared focus, dialog, menu, tab and form primitives | Existing Jini UI/admin module | Component author + non-authoring accessibility/QA reviewer |
| Tovu route/nav, panel state and domain validation | Owning Tovu feature; logic in services/hooks | Feature reviewer, using the same baseline |
| Public themes and widgets | Existing theme/widget renderer and content owners; no new render layer | Theme/widget admission + public browser review |
| Plugin output / isolated frames | Plugin owns its content; host owns mounting, keyboard transition, accessible frame name, disable/fallback | Plugin trust/admission review and host QA |
| Author-provided content | Editor/domain validation supplies actionable diagnostics; author controls meaning | Content quality workflow, distinct from shell acceptance |

An inaccessible bundled plugin is not excused by its packaging. An unavailable third-party contribution must have the existing safe-disable/fallback path. Do not bypass origin isolation to make focus coordination easier.

## Alternatives and tradeoffs

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons / tradeoff | Verdict |
|---|---|---|---|---|---|---|
| Baseline at existing component/feature boundaries, native semantics first | Strong fit | High | prior_art: existing feature ACs and shared packages | Fix once at the real owner; test independently | Needs boundary integration checks as well as primitive tests | Selected proposal |
| Per-feature independent accessibility implementations | Weak fit | Low | analogical | Local delivery initially easy | Focus/keyboard/error rules drift and repeat | Rejected as shared behavior strategy |
| Global repair overlay after rendering | Rejected | Low | assumed | One apparent control point | Cannot supply missing semantics/meaning reliably; hides owning defects | Rejected |

Default heuristic: retain modular monolith/feature boundaries; no new architecture topology. Runner-up is feature-local checklists using shared controls; those remain useful evidence but cannot replace the shared baseline. Reversal cost is low because this is policy plus boundary tests, not a new runtime dependency.

Design-time scorecard (1–5, confidence **assumed**, no measurements): modularity 5, testability 4, maintainability 4, reliability 4, performance 4, security 4. The principal tension is delivery cost versus verifiable interaction coverage; automation alone is cheaper but misses reading order, announcements, meaning and real keyboard workflows. Mitigation: test changed primitives deeply and sample representative integrated journeys, then maintain a visible backlog for untouched legacy surfaces. No current conformance score is assigned.

## Enforcement and migration safety

New or materially changed first-party interactions must name applicable A11Y IDs in their spec and receive component/boundary tests before implementation. Do not fail an unrelated change merely because the entire legacy product lacks certification; record pre-existing failures with owner/surface/evidence, and block regressions or an unusable changed primary workflow. Baseline old failures explicitly rather than silencing scanner output.

Use installed testing-library/user-event for semantics and interaction tests; existing Playwright journeys for keyboard/viewport behavior; manual assistive-technology verification for changed complex interactions. No automated scanner is currently selected by this ADR. If one is needed, inspect installed capabilities and evaluate maintained tooling through normal dependency review rather than writing a custom accessibility engine.

Evidence must name surface/state, viewport/mode, browser and assistive-technology versions where used, action sequence, observed outcome, date, spec hash and unresolved failures. At minimum, the integrated sample covers sign-in, navigation, a list, editor save/failure, modal confirmation, media/embed selection and public content/form use. Desktop renderer is checked as well as browser-hosted admin. A green role/name unit assertion alone is not a release claim.

Directory structure: reusable Jini component tests beside existing tests in their owning package; Tovu component/hook tests beside the existing admin feature; public render/route tests beside existing server tests; browser journeys in the existing journey suite. No new test tree or shared mutable waiver registry. Exceptions need criterion, reason, affected users, accessible alternative, owner, expiry and accepting reviewer; owner approval is required before a release claim with an unresolved primary-flow failure.

Implementation Outline: SKIP for this documentation-only policy proposal; concrete feature slices must assess their own contracts. Critical Internal Constraints: NOT TRIGGERED for this policy-only artifact; no new stateful/security unit is designated. Re-evaluate if shared primitive ownership changes, a new extension execution surface is introduced, the baseline target changes, or repeated integration failures show primitive-only evidence is insufficient. Governance promotion is pending acceptance; no governance index rule is added now.

## Constitution check and handoff

| Article | Result | Basis |
|---|---|---|
| I | COMPLIES | Native/platform and existing maintained dependencies first; no new implementation dependency. |
| II | COMPLIES (proposal) | Delivery slices require tests before behavior changes; this ADR changes no code. |
| III | COMPLIES | Each criterion addresses observable authoring/navigation/content access. |
| IV | N/A | No new port or adapter seam. |
| V | COMPLIES (proposal) | Integrated keyboard/render journeys supplement component tests. |
| VI | COMPLIES | Permission checks and origin isolation are preserved. |
| VII | COMPLIES (proposal) | No active spec/approval is rewritten; a delivery package needs preflight/hash binding. |
| VIII | COMPLIES (proposal) | Existing error/status semantics remain observable; no second telemetry system. |

Complexity justification: no new runtime machinery. Risks: legacy coverage is incomplete; captions/transcripts and third-party content need scoped follow-up; this ADR has not been audited or accepted. Output: proposed baseline, ownership and evidence contract. Next assignee: Coordinator → owner/design/accessibility review, then scoped test-first delivery in the existing owners. No tests, builds, servers, typechecks or network commands were run.
