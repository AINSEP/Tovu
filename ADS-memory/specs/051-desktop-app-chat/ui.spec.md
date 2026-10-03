# UI Contract Spec: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/ui.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-051 |
| feature_name | FEAT-051-desktop-app-chat |
| version | 0.1.2 |
| last_edited | 2026-09-16T00:00:00Z |

## Purpose

The visible half of this feature: a full-height chat panel in the desktop shell's own chrome, a toggle that opens it, an inline confirmation affordance, and an embed signal that hides the admin's own chat inside the shell's `<webview>`. Most of it already exists as unmounted code; this file records what mounting it must satisfy.

---

## 1) Component Registry

| Component | Location | Status Today | Responsibility | REQ |
|---|---|---|---|---|
| `WorkspaceChatPane` | `apps/desktop/src/renderer/App.tsx:1057` | **Built, zero JSX call sites.** Conversation list, delete-confirm, attachment upload and model picker all present | Renders the chat itself | REQ-13, REQ-14, REQ-18 |
| Chat panel toggle | `TopNav`, `apps/desktop/src/renderer/App.tsx` | Does not exist | The only thing that opens or closes the panel (REQ-21, INV-09) | REQ-21 |
| Panel shell / layout host | `apps/desktop/src/renderer/app.css:154-156,163,1364-1375` | **CSS built, never mounted.** Already documents itself as a second grid column that "SQUEEZES the content rather than covering it", collapsing to zero width when absent | Docked column or fixed overlay, per the layout boolean | REQ-13, REQ-14, REQ-15 |
| Inline confirm/cancel affordance | `apps/desktop/src/renderer/App.tsx:1120-1147` (`.runner-chat-pane__confirm`) | Built, used today for conversation deletion | Reused for tool-call confirmation. **Never `window.confirm`** — it blocks IPC in this renderer | REQ-11 |
| mcp-ui surface host | Does not exist in `apps/desktop` | `@jini-ai/chat` 0.3.7 ships `createMcpUiToolCaller` and `McpUiSurfaceCard`; nothing in `apps/desktop/src/renderer/App.tsx` registers a renderer | Renders a site tool's confirmation dialog and relays the human's click | REQ-11 (site tools), see `api.spec.md` §4.3 |
| Admin `ChatFab` / `AssistantDock` | `apps/admin/src/components/ChatFab/`, `apps/admin/src/App.tsx` | Built and rendering | Must NOT render when embedded (REQ-12, INV-05) | REQ-12 |

---

## 2) Input Contracts (Props/Inputs)

### 2.1 Chat panel layout state

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `open` | `boolean` | yes | `false` | Written **only** by the operator's toggle (INV-09). No navigation or layout transition may write it |
| `layout` | `'docked' \| 'overlay'` | yes | derived | Derived from measured width, not from a bare CSS media query (REQ-15). Mirrored to the panel root as `data-layout` so CSS can follow without owning the decision |
| `addressee` | `{ kind: 'none' } \| { kind: 'site'; siteDir: string }` | yes | `{ kind: 'none' }` | Read once per turn at turn start, never per render (REQ-05) |

### 2.2 Inline confirmation affordance

| Field | Type | Required | Notes |
|---|---|---|---|
| `callId` | `string` | yes | One affordance per pending call. Two pending calls render two affordances (EC-10) |
| `toolName` | `string` | yes | Named in the prompt text; the operator must be able to tell two pending deletes apart |
| `summary` | `string` | yes | What will happen in plain words, e.g. which project directory is about to be erased |
| `onConfirm` | `() => void` | yes | Resumes that one call |
| `onCancel` | `() => void` | yes | Ends that one call as cancelled; the surrounding turn continues (AC-15) |

### 2.3 Embed signal

| Field | Type | Required | Notes |
|---|---|---|---|
| `window.tovuDesktopEmbedded` | `boolean \| undefined` | no | Set by the shell's guest preload, following the `window.tovuVoice` precedent (`apps/desktop/src/speech/preload-speech.cjs:7,42`). Read once at mount by the admin app. `undefined` outside the shell, which is what makes AC-19 hold |

---

## 3) Event Contracts (Outputs)

### 3.1 Panel-level

| Event | Payload | When | REQ |
|---|---|---|---|
| toggle | — | The operator clicks the `TopNav` toggle. The ONLY producer of an open/close transition | REQ-21, INV-09 |
| layout change | `'docked' \| 'overlay'` | The measured width crosses the threshold. Does not affect `open` | REQ-15, AC-22 |

### 3.2 Confirmation

| Event | Payload | When | REQ |
|---|---|---|---|
| confirm | `{ callId }` | Operator clicks Confirm | AC-16 |
| cancel | `{ callId }` | Operator clicks Cancel | AC-15 |

### 3.3 Navigation

| Event | Payload | When | REQ |
|---|---|---|---|
| `workspace:chat:navigate` | section id and/or tab id | A `desktop.navigate` call resolves. Applied through the **existing** `selectSection`/`setActiveTab` handlers (`App.tsx:76-87`), not a parallel path | REQ-17, AC-24 |

---

## 4) Rendering and Interaction Rules

| Rule | Behavior | REQ |
|---|---|---|
| R-01 | At ≥900px with `open`, the panel is a full-height right grid column from below the OS title bar to the window bottom. `.main` narrows by the panel width. The window's own outer size does not change | REQ-13, AC-20 |
| R-02 | At <900px with `open`, the panel is `position: fixed`, full height, `z-index` above `.main` **and above the active `<webview>`**, covering rather than squeezing. `.main`'s width is identical to the closed state | REQ-14, AC-21 |
| R-03 | The docked/overlay decision is a JS boolean from a `ResizeObserver`/resize listener, mirrored to `data-layout`. A bare media query alone is not sufficient — this codebase already drives `expanded` and `appearanceOpen` this way | REQ-15, AC-22 |
| R-04 | The panel has no drag-resize affordance; its docked width is a static formula | REQ-16, AC-23 — **CONFLICT, see below** |
| R-05 | Entering or leaving `expanded` mode (which hides `TopNav` and `TabStrip`, `App.hooks.ts:471`) does not change `open` and does not unmount the panel. It stays docked or overlaid per R-01/R-02 | REQ-21, AC-29, EC-07 |
| R-06 | Crossing the threshold with a turn in flight preserves both the open conversation and the in-flight turn | AC-22, EC-06 |
| R-07 | Exactly one confirm/cancel affordance renders per pending call. Resolving one does not resolve another | REQ-11, EC-10 |
| R-08 | Inside the shell's `<webview>`, the admin's `ChatFab`/`AssistantDock` does not render. Outside it, both render exactly as today | REQ-12, AC-18, AC-19, INV-05 |
| R-09 | When a turn degrades because a site's tool surface is unreachable, the transcript carries a visible, plain-language note. It is not a silent omission and not a modal | REQ-19, AC-26 |

**R-04 conflict (must be settled before this rule is built).** `ADS-memory/.local-artifacts/owner-worklist.md:105` records an undated owner decision for **drag-to-resize**, which is the opposite of REQ-16/AC-23 ("owner's explicit call", per the approved spec). One of the two is stale. Building either way before it is settled risks writing a regression guard against a decision the owner reversed. Owner: Leona Burime.

**Measurement gap affecting R-01/R-02.** `apps/desktop/main.ts:499-502` sets `minWidth: 480` with the comment "480 is the owner's choice as of 2026-09-12 … Layout between 480 and 960 has not been measured." The 900px threshold exists only in this spec — there is no `900` anywhere in `app.css` or `App.tsx`. At 480px an overlay panel covers the whole window. The threshold's **value** needs one `_electron` pass at 480 / 700 / 899 / 901 / 1360 before it is fixed; the **mechanism** (R-03) does not depend on that answer.

---

## 5) Accessibility Requirements

| Component | Requirement |
|---|---|
| Panel toggle | A real `<button>` with an accessible name and `aria-expanded` reflecting `open`. Keyboard-reachable in `TopNav`'s tab order |
| Panel container | `role="complementary"` (docked) with an accessible name. In overlay mode it covers `.main`, so it takes focus on open and returns focus to the toggle on close |
| Overlay mode | Because the overlay sits above the active `<webview>`, it must be dismissible from the keyboard. `Escape` closes it — and that counts as an **operator action**, so it is consistent with INV-09 rather than an exception to it |
| Confirm/cancel affordance | Both controls are real buttons, reachable by keyboard, with names that say what they do to what (not bare "OK"/"Cancel"). The pending call's `summary` is associated with them, so a screen reader announces what is being confirmed |
| Degraded-turn note | Rendered as transcript text in the normal reading order, not as a tooltip, `title` attribute, or colour-only signal |
| Layout switch | Crossing the threshold must not move focus or interrupt an in-flight turn |

---

## 6) Composition Rules

- `WorkspaceChatPane` mounts once, at the app shell level — never inside a site's `<webview>`, and never more than once (INV-01, INV-05).
- The panel is a sibling of `.main` in the same grid, not a child of it. The existing CSS at `app.css:154-156,163` is already written for that shape; mounting it as a child of `.main` would make R-01's "squeeze" impossible.
- Per `no .tsx logic`: the layout boolean, the open flag and the pending-confirmation list live in hooks (`App.hooks.ts`), not inline in `App.tsx`.
- `WorkspaceChatPane` must stay referenced by name in a way `one-chat-fab-wiring.test.ts`'s `assert.match(read("App.tsx"), /function WorkspaceChatPane\(/)` continues to satisfy — that assertion is about the pane surviving, and mounting it satisfies it more strongly than leaving it unreferenced did.

---

## 7) Acceptance Checklist

- [x] Every component has a typed props/input definition (Section 2)
- [x] Display conditions cover show/hide/disabled for every interactive element (Section 4)
- [x] Accessibility requirements cover every component (Section 5)
- [x] Every optional field is marked optional and every nullable type is explicit
- [x] Events are named with their producers and the REQ they serve (Section 3)
- [ ] R-04's drag-to-resize conflict settled with the owner
- [ ] 900px threshold confirmed by a real `_electron` measurement across the 480px–1360px range
