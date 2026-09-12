# Feature Spec: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-051 |
| version | 0.1.0 |
| status | REVIEW (one clarification pending owner decision — see NC-1) |
| content_hash | sha256:34b945f1505a09129b420f993e36b7e0cbf5f3ee0988d5d3001625353dc77d5a |
| feature_name | FEAT-051-desktop-app-chat |
| last_edited | 2026-09-12T20:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

A single, app-level agent chat lives in the Tovu desktop shell's own chrome — never inside a site's `<webview>` — and always carries the fleet-management (`desktop.*`) tool set. When a site tab is the active addressee of a turn, that turn's tool set additionally, temporarily includes that one site's own tools, executed inside that site's own process against its own `content.db`. This replaces "build a fleet chat" ambiguity with the owner's already-decided shape (one agent, borrowed tools, no per-site agent loop) and specifies the wiring this repo is missing: the site-side inbound tool surface, the client-side DOM-tool bridge, the main-process daemon, the confirmation minimum, and the responsive panel.

---

## Problem Statement

**Current state.** The desktop app (`apps/desktop`) has a fully built, fully wired site-scoped chat *inside* each open site's `<webview>` (Tovu's own admin `ChatFab`/`AssistantDock`, backed by that site's own `tovu serve` agent daemon). It also has a fully speced, half-wired, deliberately unrendered app-level "left chat": the IPC contract (`contracts/workspace-chat.ts`), the renderer transport (`renderer/workspace-chat-transport.ts`), the preload bridge (`preload/preload.mts`), and the panel component (`renderer/App.tsx`'s `WorkspaceChatPane`, defined at line 1057) all exist, but `apps/desktop/main.js` registers no `ipcMain.handle` for any `WORKSPACE_CHAT_CHANNELS` entry — confirmed directly by the comment at `App.tsx:171-172` and by the tripwire test `renderer/one-chat-fab-wiring.test.js`, which currently asserts this main-process half is absent. No `AgentExecutor`/`ToolExecutor`/`DelegatedToolBridge`/`ToolRegistry` construction exists anywhere in `apps/desktop` today. A working reference exists unported at `Tovu-Runner/src/main/runner-daemon.ts` (+ `runner-tools.ts`, `runner-agent-prompt.ts`).

**Desired state.** A single app-level agent, reachable from the shell's own chrome (never a second floating FAB — the owner's explicit, tested decision), answers questions across the whole fleet using `desktop.*` tools, and — only while a site tab is the active addressee — also reaches that one site's own tools without running any agent loop inside that site's process.

**Why now.** Quality-of-life / product-completeness improvement: the pieces already built (transport, contract, panel) are unreachable dead code until the main-process half exists. No external deadline.

**Success signal.** `one-chat-fab-wiring.test.js`'s tripwire flips from "reaches nothing" to reachable in the same commit that adds the `ipcMain.handle` registrations (its own comment says this is the expected trigger to revisit it, not a regression), and a chat turn against the All tab (no site) and a chat turn against an open site's tab both complete and render a response using the correct, distinct tool sets (Behavior Summary).

---

## Evidence (verified against code, 2026-09-12)

Primary input: `ADS-memory/reports/2026-09-12-desktop-global-chat-recon.md`. Its Addendum 4 (owner-decided architecture) is current design; Addendum 3 §4/§5 (the (a)/(b) route comparison and the full-overlay recommendation) is superseded by Addendum 4 and by the owner's layout ruling below. Every citation below was re-verified against the working tree on 2026-09-12, not merely copied from the recon.

| # | Claim | Evidence |
|---|---|---|
| E1 | `WORKSPACE_CHAT_CHANNELS` has 7 entries, 5 invoke-direction (`start`, `reattach`, `detach`, `stop`, `status`) and 2 push-direction, main→renderer (`event`, `navigate`) | `apps/desktop/src/contracts/workspace-chat.ts:26-41`, each entry's own doc comment states its direction |
| E2 | The renderer already calls all 5 invoke channels and subscribes to both push channels; nothing on the main-process side answers any of them | `apps/desktop/src/preload/preload.mts:97-105`; no `ipcMain.handle`/`ipcMain.on` for any of these channels exists in `apps/desktop/main.js` (grep confirms zero matches) |
| E3 | `WorkspaceChatPane` is fully built (conversation list, delete-confirm, attachment upload, model picker) but has zero render call sites | `apps/desktop/src/renderer/App.tsx:1057` defines it; no other file references it as JSX |
| E4 | The owner's one-chat rule is enforced by a regression test whose own comment states the intended future shape: a **panel** reachable from this app's own chrome, never a second floating FAB | `apps/desktop/src/renderer/one-chat-fab-wiring.test.js:1-16` |
| E5 | `contracts/sections.ts` already declares the full `desktop.*` tool taxonomy per nav section, including `Marketplace: tools: []` (explicitly "not built yet") and `Settings: tools: ['desktop.settings.get','desktop.settings.set']` (section `hidden: true`) | `apps/desktop/src/contracts/sections.ts:95-218` |
| E6 | A site's own daemon (`agent-daemon-server.ts`) already constructs a `ToolRegistry`, `ToolExecutor`, and `AgentExecutor` for its own chat; the only existing inbound tool-call surface, `/api/delegated-tool-calls`, is explicitly scoped to "this run's own spawned `jini-mcp`", not a general external caller | `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:372` (`createToolRegistry()`), `:1038` (scoping comment) |
| E7 | A site-scoped tool call needs a `frontendBindToken` sourced from the run's own `contextRef`; a run with no token has every `page.*`/`chat.*`/`admin.*` call refused by name, not silently dropped | `agent-daemon-server.ts:457-461` (`resolveBindToken`), `:451-453` |
| E8 | No `ExecutionDelegate` is wired anywhere in this codebase for a capability with `requiresConfirmation: true`; that is why `chat.reset_conversation` is filtered out of the admin's own capability set today | `apps/website/src/assistant/frontend-control-capabilities.ts:12-31` |
| E9 | The desktop shell's own reverse-direction tool surface (desktop tools exposed *to* a site's assistant) implements exactly 3 read/write verbs, each with an explicit, deliberate trust annotation, reviewed by `mcp-federation/trust.ts` | `apps/desktop/src/sites-mcp-tools.js` (file-level doc comment); `apps/website/src/assistant/mcp-federation/trust.ts` |
| E10 | The Sites Home window's own top-level renderer has no site session cookies; each site's `<webview>` guest is given its own partitioned session, and the shell already authenticates to a site's origin via `net` bound to `session.fromPartition(...)` for boot-session redemption | `apps/desktop/main.js:501-527` (`authenticateSiteSession`), `:592-596` (`ensureSiteSession`) |
| E11 | An embed-signal precedent (a `window`-level flag the admin page checks at mount to change its own UI only inside the Tovu desktop `<webview>`) already exists for voice input | `apps/desktop/src/speech/preload-speech.cjs:7,42` (`window.tovuVoice`) |
| E12 | The chat panel's own (currently unmounted) CSS already documents itself as a second grid column that "SQUEEZES the content rather than covering it", collapsing to zero width when not rendered | `apps/desktop/src/renderer/app.css:154-156,163,1364-1375` |
| E13 | `expanded` mode (a site's `<webview>` filling the whole window) already hides both `TopNav` and `TabStrip`; it is driven by `useExpandedMode`, a plain boolean, not CSS alone | `apps/desktop/src/renderer/App.tsx:90,105,117`; `App.hooks.ts:471` |
| E14 | `desktop.navigate` has an obvious wiring target already in the renderer: `selectSection`/`setActiveTab`, both already passed through `useNav`/`useTabs` | `apps/desktop/src/renderer/App.tsx:76-87` |
| E15 | The app-level conversation store already exists and is independent of any site's own transcript store | `apps/desktop/src/renderer/App.hooks.ts:829,1111,1204` (`useRunnerConversations`, `database === 'sqlite'`) vs. `apps/admin/src/lib/assistant-chats.ts:19` (per-site, untouched by this feature) |
| E16 | A reference implementation for the missing main-process daemon exists, unported, in the sibling project this app's renderer/contracts were ported from | `/Users/la/Programming/Tovu-Runner/src/main/runner-daemon.ts`, `runner-tools.ts`, `runner-agent-prompt.ts` |
| E17 | Tovu-Runner's own precedent for confirming a destructive tool from a caller with no operator-facing surface is to refuse unconditionally, not to invent a confirmation it cannot collect — the opposite case from this feature, whose chat *is* the operator's own first-party surface | `Tovu-Runner/src/main/runner-daemon.ts:315-327` |
| E18 | An inline confirm/cancel UI pattern (not `window.confirm`, which blocks IPC in this renderer) already exists in this exact panel, for conversation deletion | `apps/desktop/src/renderer/App.tsx:1120-1147` (`.runner-chat-pane__confirm`) |
| E19 | `apps/desktop/main.js` is still the actual Electron main-process entry point (not yet renamed to `.ts`) as of 2026-09-12; the ongoing JS→TS pass elsewhere in this app does not change that file's current name | direct `ls`/`grep` against the working tree |

---

## User Journey

1. **Trigger (app-level):** The operator opens the chat panel from the shell's own chrome (a `TopNav` toggle) while on the All tab, Marketplace, Settings, or with zero sites ever created.
2. **Steps:**
   1. Operator asks a fleet question ("which sites are running?").
   2. The app-level agent answers using only `desktop.*` tools (Behavior Summary row 2).
3. **Outcome:** A response renders in the panel; the turn is saved to the app-level conversation store.
4. **Alternate paths:** If the operator switches to a site tab mid-turn, the in-flight turn is unaffected (REQ-05); the next turn gains that site's tools.

1. **Trigger (site-scoped):** The operator has an open site's tab active and asks something about that site ("add a blog post about our new feature").
2. **Steps:**
   1. The agent's turn-start tool set is `desktop.*` plus that site's own allowlisted tools (REQ-03).
   2. A content tool call executes inside that site's own daemon process, against its own `content.db` (REQ-06); a DOM tool call (`page.navigate`) executes via `webview.executeJavaScript` against that same tab's live `<webview>` (REQ-08).
   3. If the call is to a `requiresConfirmation: true` tool (e.g. `desktop.project.delete`), the pane shows an inline confirm/cancel affordance before it executes (REQ-11).
3. **Outcome:** The response renders in the same app-level panel; the operator never sees a second chat affordance (the site's own `AssistantDock`/`ChatFab` is hidden while embedded, REQ-12).
4. **Alternate paths:** If that site's daemon is unreachable when the turn starts, the turn proceeds with `desktop.*` tools only and says so plainly (REQ-19). If the operator cancels a pending confirmation, that one tool call ends as cancelled and the turn continues.

---

## Scope

**In scope:**
- The main-process daemon (ported from Tovu-Runner) and its `ipcMain` wiring for every `WORKSPACE_CHAT_CHANNELS` entry (REQ-10).
- Turn-start tool-set assembly: always `desktop.*`; plus the active site's own tools only while a site tab is the turn's addressee, fixed for that turn (REQ-01 through REQ-05).
- A new authenticated inbound tool-call route in the site daemon, reusing its existing `ToolRegistry`, gated by an explicit allowlist and a trust review (REQ-06, REQ-07).
- A client-side bridge for DOM tools (`page.navigate`, `find_elements`, `click`, `screenshot`, …) via `webview.executeJavaScript` into the admin's existing `FrontendSessionBridge`, including how the bind token is obtained per call (REQ-08, REQ-09).
- A minimum confirmation mechanism for `requiresConfirmation: true` tools, since none exists anywhere in this codebase today (REQ-11).
- The one-chat rule: an embed signal that hides the admin's own `ChatFab`/`AssistantDock` inside the desktop shell, keeping `one-chat-fab-wiring.test.js` passing (REQ-12).
- The responsive docked (≥900px)/overlay (<900px) full-height right panel, JS-state-driven (REQ-13 through REQ-16).
- `desktop.navigate` wiring to the existing `selectSection`/`setActiveTab` handlers (REQ-17).
- Confirming the existing app-level conversation store is the only store this feature uses (REQ-18).
- Degradation when a site-scoped turn's site daemon is unreachable (REQ-19).

**Out of scope:**
- Implementing a working handler for any `desktop.*` verb other than `desktop.navigate`. Most verbs in `contracts/sections.ts` (project lifecycle beyond what already exists, media generation, activity, migration, diagnostics, API keys, account) have no handler anywhere today, site-side or app-side — that gap is pre-existing and unaffected by this feature.
- Marketplace install/list tools and `desktop.settings.{get,set}` — both are unbuilt product surfaces (Marketplace has no install pipeline at all; Settings is `hidden: true`); named as future work (REQ-20).
- Resizing the panel by dragging its edge (owner's explicit call).
- Any change to a site's own in-webview `AssistantDock`/`ChatFab` behavior beyond hiding it when embedded (REQ-12) — its own tool set, transport, and per-site conversation store are untouched.
- Choosing the exact allowlist of site tools exposed through REQ-06 beyond a first, narrow slice (OQ-02).
- Any new admin UI for authoring trust declarations; REQ-07 reuses the existing `mcp-federation/trust.ts` review process as-is.

---

## Requirements

- **REQ-01:** Exactly one app-level agent process serves every chat turn in the desktop app. No site's process ever runs an agent loop or LLM call for this chat.
- **REQ-02:** The agent's tool set for every turn always includes the `desktop.*` tools declared in `contracts/sections.ts`, except `desktop.settings.get`, `desktop.settings.set`, and any Marketplace tool (REQ-20) — regardless of which nav section or tab is active.
- **REQ-03:** When the turn's addressee (captured at turn start, REQ-05) is an open site's tab, that turn's tool set additionally includes that one site's own tools, sourced through REQ-06's route; those tools execute inside that site's own process against its own `content.db`, never inside the app-level agent process.
- **REQ-04:** When the turn's addressee at turn start is not an open site's tab (the All tab, Marketplace, Settings, or zero sites ever created), the turn's tool set is exactly REQ-02's `desktop.*` set; no site tool is offered or callable.
- **REQ-05:** The tool set for a turn — including which site's tools, if any — is captured once when the turn starts and does not change for that turn's remaining duration. A tab switch while a turn is in flight affects only the next turn.
- **REQ-06:** The site daemon (`agent-daemon-server.ts`) exposes a new authenticated inbound route that lets the app-level agent's `ToolExecutor` invoke a tool from that site's own `ToolRegistry` by name. It is authenticated using that site's own partitioned session (`session.fromPartition(sitePartition(siteDir))`, the same session `ensureSiteSession` already establishes) via Electron's `net` module in the main process — never a bare `fetch` from the shell's unpartitioned top-level renderer.
- **REQ-07:** Only tools on an explicit allowlist (modeled on `mcp-federation/trust.ts`'s `allowedToolNames`/`writeAllowedToolNames` split) are callable through REQ-06's route. A tool call naming a tool absent from that allowlist is refused by name, in the same style as the existing bind-token refusal (`agent-daemon-server.ts:451-453`) — never silently dropped, never a hang. No tool with a destructive trust annotation may be added to the allowlist unless REQ-11's confirmation mechanism already covers it.
- **REQ-08:** The admin page mounted inside each open site's `<webview>` exposes a `window`-level bridge method that forwards into its own, already-built `createFrontendSessionBridge` machinery (`App.hooks.tsx:750-754`). The shell's host renderer calls it via `webview.executeJavaScript(...)` against that specific site's still-mounted `<webview>` node to execute a DOM tool (`page.navigate`, `find_elements`, `click`, `admin.capture_screenshot`, …).
- **REQ-09:** The bind token a DOM-tool call needs is read live from that site's own currently-mounted admin page at call time, via the same `executeJavaScript` round trip (REQ-08) — never a token cached from an earlier turn or a different site. If that site's admin page has not yet mounted a token (e.g., still loading), the call is refused by name for that turn, the same as the existing no-token case.
- **REQ-10:** `apps/desktop`'s main process gains a daemon, ported from `Tovu-Runner/src/main/runner-daemon.ts` + `runner-tools.ts` + `runner-agent-prompt.ts`, adapted to call REQ-06's route and REQ-08's bridge instead of Runner's own surfaces. It registers an `ipcMain.handle` for each of `WORKSPACE_CHAT_CHANNELS`'s 5 invoke-direction entries (`start`, `reattach`, `detach`, `stop`, `status`) and emits its 2 push-direction entries (`event`, `navigate`) back to the renderer.
- **REQ-11:** Any tool callable by the agent (`desktop.*` or a REQ-06 site tool) that carries a destructive trust annotation must declare `requiresConfirmation: true`. The app-level daemon's `ToolExecutor` gets this codebase's first `ExecutionDelegate`: on such a call, it pauses only that call (other calls in the same turn may proceed), emits a confirmation-request record over the existing `event` channel, and the pane renders exactly one inline confirm/cancel affordance per pending call, reusing the existing pattern (`App.tsx:1120-1147`) — never `window.confirm`. Confirming or cancelling resumes the paused call with the operator's answer. `desktop.project.delete` ships with `requiresConfirmation: true` from this feature's first commit that makes it callable, since it is already in REQ-02's always-on set.
- **REQ-12:** The admin app exposes a dedicated embed signal (e.g. `window.tovuDesktopEmbedded`, following the `window.tovuVoice` precedent) that its own `ChatFab`/`AssistantDock` checks at mount to hide itself when running inside the Tovu desktop shell's `<webview>`. This must keep every existing assertion in `one-chat-fab-wiring.test.js` passing.
- **REQ-13:** At window widths ≥900px, the chat panel renders DOCKED: a full-height right column, from below the OS title bar to the bottom of the window, squeezing `.main`'s available width. Opening or closing it never changes the window's overall size.
- **REQ-14:** At window widths <900px, the chat panel renders OVERLAY: full height, `position: fixed`, `z-index` above `.main` and the active `<webview>`, covering content underneath rather than squeezing it.
- **REQ-15:** The docked/overlay switch is driven by JS state (a boolean derived from a `ResizeObserver`/window-resize listener, mirrored as a `data-layout` attribute for CSS), not a bare CSS media query — consistent with this codebase's existing pattern for behavior-affecting layout switches (`expanded`, `appearanceOpen`).
- **REQ-16:** Resizing the panel by dragging its edge is out of scope for this feature. The panel's docked width uses a static formula.
- **REQ-17:** A successful `desktop.navigate` call moves the visible `TopNav` selection and/or active tab via the existing `selectSection`/`setActiveTab` handlers, and pushes a `workspace:chat:navigate` event.
- **REQ-18:** Every conversation for this chat is persisted through the existing app-level `useRunnerConversations`/sqlite store. No new per-site conversation store is introduced by this feature; a site's own `/api/assistant/chats` transcript store is untouched and unused by this chat.
- **REQ-19:** If, at turn start, the addressed site's daemon or REQ-06 route is unreachable, that site's tools are excluded from the turn's tool set (REQ-04's degradation path applies) and the turn proceeds with `desktop.*` tools only. The transcript states plainly that this site's tools were unavailable for this turn. No turn may hang or crash the panel because a site's daemon is down.
- **REQ-20:** `desktop.settings.get`/`desktop.settings.set` and any Marketplace install/list tool remain named in `contracts/sections.ts`'s taxonomy but are not implemented or made callable by this feature. They are explicit future work, gated on Settings and Marketplace shipping as real product surfaces.

---

## Clarifications Required

### NC-1 — Does the chat panel hide when a site's `<webview>` enters `expanded` mode, or does it persist?

`expanded` mode already hides both `TopNav` and `TabStrip` to maximize the site's own view (E13). The owner's docked/overlay layout ruling (REQ-13/REQ-14) says nothing about this state, and the recon this spec is built from flags it explicitly as needing the owner's own call, not something inferable from existing code.

| Option | Behavior | Consequence |
|---|---|---|
| **A. Panel hides with TopNav/TabStrip** | Entering `expanded` mode also hides the chat panel (docked or overlay); exiting restores its prior open/closed state. | Consistent with "this chrome goes away together" and preserves the full maximized site view `expanded` mode exists for — a docked panel would shrink that view, and an overlay panel would cover part of it, defeating the point of maximizing. |
| **B. Panel persists** | The panel keeps rendering (docked or overlay) regardless of `expanded` mode. | Chat stays reachable even while a site is maximized, at the cost of `expanded` no longer meaning "the whole window is this site" — and an overlay panel in this state reproduces the click-swallowing risk `one-chat-fab-wiring.test.js` exists to prevent, just against the maximized view instead of the normal one. |

**Recommendation:** A. `expanded` mode's own purpose — maximizing one site's view — is undermined by either sub-case of B (docked shrinks it, overlay covers part of it), and hiding together with `TopNav`/`TabStrip` needs no new state, since `expanded` is already a single boolean both of those already key off.

---

## Behavior Summary

| Context at turn start | Tool set | Governing REQ |
|---|---|---|
| An open site's tab is active | `desktop.*` + that site's allowlisted tools | REQ-02, REQ-03, REQ-06, REQ-07 |
| All tab, no site tab active | `desktop.*` only | REQ-02, REQ-04 |
| Marketplace tab | `desktop.*` only (Marketplace's own `tools: []` today) | REQ-04, REQ-20 |
| Settings tab | `desktop.*` only, excluding `desktop.settings.get`/`set` | REQ-04, REQ-20 |
| Zero sites ever created | `desktop.*` only | REQ-04 |
| Active site's daemon unreachable at turn start | `desktop.*` only, with a visible "unavailable" note | REQ-19 |
| Tab switch mid-turn | No effect on the in-flight turn; applies to the next turn only | REQ-05 |

---

## Delivery Plan

**The hazard, same shape as any partial rollout of tool access:** shipping "the agent can call `desktop.project.delete`" (REQ-02, true from turn one) without "destructive calls pause for confirmation" (REQ-11) in the same commit is a silent, standing footgun — every turn until the fix is a turn where that call, if made, executes with no human check. Likewise, shipping "turns against a site gain that site's tools" (REQ-03) without "a down site degrades gracefully" (REQ-19) in the same commit means the first unreachable-daemon turn hangs or errors ungracefully instead of degrading.

**Rule:** No commit may make a `requiresConfirmation`-eligible tool callable by the agent without REQ-11's confirmation mechanism already present in the same commit. No commit may add REQ-03's site-tool assembly without REQ-19's degradation guard in the same commit.

**Phase 1 — App-level chat, `desktop.*` only.**
- Port the main-process daemon (REQ-10) and register every `WORKSPACE_CHAT_CHANNELS` handler.
- Tool-set assembly ships as REQ-02 + REQ-04 only — every turn behaves as "no site is the addressee" (REQ-03 does not exist yet, so this is not a partial state; it is this phase's whole, coherent behavior).
- REQ-11 (confirmation minimum) lands in this same phase, because `desktop.project.delete` is already reachable from turn one.
- REQ-17 (`desktop.navigate`), REQ-12 (one-chat embed-hide), REQ-13/14/15/16 (responsive panel), and REQ-18 (conversation store, already built) land alongside.
- This phase alone flips `one-chat-fab-wiring.test.js`'s tripwire — expected, per that test's own comment.

**Phase 2 — Site-scoped server-side tools.**
- REQ-06 + REQ-07: the new inbound route and its allowlist, reviewed by `mcp-federation/trust.ts`.
- REQ-03 + REQ-05: turn-start assembly starts adding the active site's allowlisted tools.
- REQ-19 ships in this same commit, per the Delivery Plan rule above.

**Phase 3 — Client-side DOM tools.**
- REQ-08 + REQ-09: the `webview.executeJavaScript` bridge and the live bind-token relay.
- Depends on Phase 2's turn-start assembly already existing; DOM tools are simply another entry in that same per-turn site tool set.

---

## Acceptance Criteria

- **AC-01 (REQ-01) [P1]:** Given the desktop app is running with three sites open, when a chat turn is sent from any tab, then exactly one agent process (the app-level daemon) handles it — no site's own daemon starts or runs an agent loop for this chat.
- **AC-02 (REQ-02) [P1]:** Given the All tab is active, when a turn is sent, then the tool list offered to the model contains every non-excluded `desktop.*` tool named in `contracts/sections.ts` and contains neither `desktop.settings.get` nor `desktop.settings.set` nor any Marketplace tool.
- **AC-03 (REQ-03, REQ-06) [P1]:** Given site A's tab is active and REQ-06/07 have shipped, when a turn is sent, then the tool list additionally contains site A's allowlisted tools, and a call to one of them executes against site A's own `content.db`.
- **AC-04 (REQ-04) [P1]:** Given the Marketplace tab, the Settings tab, or zero sites ever created, when a turn is sent, then the tool list is exactly REQ-02's `desktop.*` set — no site tool appears.
- **AC-05 (REQ-05) [P1]:** Given a turn is in flight against site A's tab, when the operator switches to site B's tab before that turn finishes, then the in-flight turn's tool calls still resolve against site A; the next new turn's tool list is assembled against site B.
- **AC-06 (REQ-06) [P1]:** Given the shell's top-level renderer holds no site session cookie (E10), when it calls REQ-06's route for a site, then the call is authenticated via `net` bound to that site's own `session.fromPartition(...)`, and an unauthenticated bare `fetch` from the top-level renderer is never used for this purpose.
- **AC-07 (REQ-07) [P1]:** Given a tool name not present on REQ-06's allowlist, when the agent calls it, then the call is refused by name with a caller-facing error; the turn continues and the model sees the refusal text rather than a hang.
- **AC-08 (REQ-07) [P1]:** Given a tool with a destructive trust annotation, when it is considered for the allowlist, then it is added only together with REQ-11 confirmation coverage — never added alone.
- **AC-09 (REQ-08) [P1]:** Given site A's tab is open and mounted, when the agent calls `page.navigate`, then the shell calls `webview.executeJavaScript` against site A's own `<webview>` node (not any other open site's), which forwards into that page's `createFrontendSessionBridge`.
- **AC-10 (REQ-09) [P1]:** Given site A's admin page has a live bind token at call time, when a DOM-tool call is made, then the token used is read fresh from that call's own `executeJavaScript` round trip, never a value cached from an earlier turn.
- **AC-11 (REQ-09) [P2]:** Given site A's admin page has not finished mounting (no token yet), when a DOM-tool call targeting it is made, then the call is refused by name for that turn, and the turn does not hang waiting for a token that may never arrive this turn.
- **AC-12 (REQ-10) [P1]:** Given the app boots, when `ipcRenderer.invoke(WORKSPACE_CHAT_CHANNELS.start, …)` is called, then an `ipcMain.handle` registered for that exact channel responds (today it reaches nothing; this is the flip the tripwire test asserts).
- **AC-13 (REQ-10) [P1]:** Given a run is active, when the daemon needs to notify the renderer, then it pushes over `WORKSPACE_CHAT_CHANNELS.event` and, for a `desktop.navigate` call, additionally over `.navigate` — neither push is implemented as an `ipcMain.handle`.
- **AC-14 (REQ-11) [P1]:** Given the agent calls `desktop.project.delete`, when the call reaches the `ToolExecutor`, then execution pauses, a confirmation-request record is emitted over the `event` channel, and the pane renders exactly one inline confirm/cancel affordance for that call.
- **AC-15 (REQ-11) [P1]:** Given a pending confirmation, when the operator clicks Cancel, then that specific tool call ends as cancelled and the surrounding turn continues; no data is deleted.
- **AC-16 (REQ-11) [P1]:** Given a pending confirmation, when the operator clicks Confirm, then the paused call resumes and completes.
- **AC-17 (REQ-11) [P2]:** Given a turn makes two tool calls, one of them `requiresConfirmation: true`, when the confirmable call pauses, then the other call is unaffected and may complete independently.
- **AC-18 (REQ-12) [P1]:** Given the admin page is loaded inside the Tovu desktop shell's `<webview>`, when it mounts, then `ChatFab`/`AssistantDock` does not render, and `one-chat-fab-wiring.test.js`'s existing assertions still pass unmodified.
- **AC-19 (REQ-12) [P1]:** Given the same admin page loaded standalone (outside the desktop shell), when it mounts, then `ChatFab`/`AssistantDock` renders exactly as it does today — the embed signal changes nothing outside the desktop shell.
- **AC-20 (REQ-13) [P1]:** Given the window is ≥900px wide and the panel is open, when the window is measured, then `.main`'s rendered width is narrower than the window's full content width by the panel's width, and the window's own size is unchanged from before the panel opened.
- **AC-21 (REQ-14) [P1]:** Given the window is <900px wide and the panel is open, when the DOM is inspected, then the panel's computed `position` is `fixed` (or equivalent) with a `z-index` above `.main`, and `.main`'s own width is unchanged from the panel-closed state.
- **AC-22 (REQ-15) [P2]:** Given the window is resized from 901px to 899px while the panel is open, when the resize completes, then a JS-driven boolean (not a bare media query alone) flips and the panel switches from docked to overlay without losing the open conversation.
- **AC-23 (REQ-16) [P2]:** Given the panel is open, when the operator attempts to drag its edge, then nothing resizes — no drag-resize affordance exists.
- **AC-24 (REQ-17) [P1]:** Given a turn calls `desktop.navigate` to a valid section id, when the call resolves, then `TopNav`'s active section changes via `selectSection`, and a `workspace:chat:navigate` event is pushed to the renderer.
- **AC-25 (REQ-18) [P1]:** Given a conversation is created in this chat, when the app is queried, then it is found in the `useRunnerConversations`/sqlite store, and no row for it exists in any site's own `/api/assistant/chats` store.
- **AC-26 (REQ-19) [P1]:** Given site A's daemon is stopped, when a turn addressed to site A's tab starts, then the tool list is exactly `desktop.*` (REQ-04's set), the turn completes, and the transcript states site A's tools were unavailable.
- **AC-27 (REQ-19) [P1]:** Given the conditions of AC-26, when the turn completes, then the panel has not hung, frozen, or crashed.
- **AC-28 (REQ-20) [P2]:** Given the tool list offered for any turn, when it is inspected, then it never contains `desktop.settings.get`, `desktop.settings.set`, or a Marketplace tool.

---

## Invariants

- **INV-01:** The desktop app must never run more than one app-level agent process at a time.
- **INV-02:** No site's own process must ever run an agent loop or LLM call for this feature's chat.
- **INV-03:** A site tool call must never execute against a `content.db` other than the one owned by the site it was addressed to.
- **INV-04:** The tool set assembled for an in-flight turn must never change once that turn has started (REQ-05).
- **INV-05:** At most one visible chat affordance (FAB or panel) must ever render on screen at a time while the admin page is loaded inside the Tovu desktop shell.
- **INV-06:** A tool call carrying `requiresConfirmation: true` must never execute without an explicit operator confirmation collected through the chat pane itself.
- **INV-07:** REQ-06's inbound site tool-call route must never be reachable by any caller outside the desktop shell's own authenticated, per-site session.
- **INV-08:** No commit may make a `requiresConfirmation`-eligible tool callable by the agent, or add REQ-03's site-tool assembly, without its corresponding safeguard (REQ-11 confirmation, or REQ-19 degradation, respectively) already present in that same commit.

---

## Edge Cases

- **EC-01:** A chat message is sent while zero sites have ever been created (`NoWebsitesYet` empty state). Expected: REQ-04 applies; the agent answers with `desktop.*` tools only.
- **EC-02:** The operator switches from site A's tab to site B's tab while a turn started against site A is still streaming. Expected: REQ-05 — the in-flight turn keeps site A's tools; only the next turn gets site B's.
- **EC-03:** The chat panel is opened while the Marketplace tab is active. Expected: REQ-04 applies (Marketplace's `tools: []` today); `desktop.*` only, no Marketplace-specific tool exists to offer.
- **EC-04:** The active site's `tovu serve` daemon is unreachable when a turn starts (crashed, or still booting). Expected: REQ-19 — site tools excluded, `desktop.*`-only turn, an explicit "unavailable" note in the transcript, no hang and no crash.
- **EC-05:** The agent calls `desktop.project.delete`. Expected: REQ-11 — execution pauses, an inline confirm/cancel affordance renders; cancelling ends only that call as cancelled, and the turn continues.
- **EC-06:** The window is resized across the 900px boundary while the panel is open and a turn is in flight. Expected: REQ-13/14/15 — the panel's docked/overlay mode switches without losing the open conversation or the in-flight turn.
- **EC-07:** A site tab enters `expanded` mode while the chat panel is open. Expected: per NC-1 (pending the owner's decision; recommended option A), the panel hides together with `TopNav`/`TabStrip` and restores its prior state on exit from `expanded` mode.
- **EC-08:** The agent calls `page.navigate` against a site tab that is not the tab currently focused on screen. Expected: REQ-08/09 — every page-tool call is bound to the siteDir/`<webview>` captured at that turn's start (REQ-05), so it always targets the site the turn began against, never "whichever tab is focused right now."
- **EC-09:** A tool call names a tool absent from REQ-06's allowlist. Expected: REQ-07 — refused by name, with a caller-facing error visible to the model; the turn continues rather than hanging.
- **EC-10:** Two confirmable tool calls (e.g. two separate `desktop.project.delete` calls) are made in the same turn. Expected: REQ-11 — each pauses and renders its own confirm/cancel affordance; resolving one does not resolve the other.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|---|---|---|---|
| `@jini-ai/daemon` (`createAgentExecutor`, `createDelegatedToolBridge`, `createRunLifecycle`, `createToolExecutor`) | App-level agent-loop primitives, ported from Tovu-Runner's working reference | Daemon fails to construct at app boot | Chat panel shows an explicit "assistant unavailable" state; the rest of the desktop app (site tabs, project lifecycle) is unaffected |
| `@jini-ai/chat` (`ChatPane`, transport contract) | The already-built chat UI and IPC transport this feature reuses rather than rebuilding | An invoke throws | `WorkspaceChatTransport`'s existing error handling surfaces it inline in the pane |
| Each open site's own `tovu serve` agent daemon (`agent-daemon-server.ts`) | Hosts that site's `ToolRegistry`, the target of REQ-06's route | Site daemon down or unreachable | REQ-19 degradation: `desktop.*`-only turn, explicit note, no hang |
| Admin page's `FrontendSessionBridge` (`apps/admin`) | Source of the bind token and the DOM-tool execution surface for REQ-08/09 | Admin page not yet mounted in the `<webview>`, or bridge not yet initialized | Page-tool calls refused by name for that turn, same as today's no-token case |
| Electron session partitioning (`desktop-auth.js`, `sitePartition`, `ensureSiteSession`) | The authenticated, per-site session REQ-06 calls are proxied through | Session/cookie not yet established (boot race) | REQ-19-style exclusion of that site's tools until the session resolves |
| `mcp-federation/trust.ts` review | Gates which tools REQ-07's allowlist may include | A tool fails trust review | That tool stays off the allowlist; the feature ships with a narrower site-tool surface, not blocked outright |

---

## Open Questions

- **OQ-01:** Should a hidden section's tools (Templates, Tasks, Deploy, Diagnostics, Keys, Account) join the always-on `desktop.*` set automatically once/if that section ships a real handler, or does each future feature decide for itself? Owner: Leona Burime. Resolve by: 2026-09-19.
- **OQ-02:** What is the first slice's exact allowlist of site tools exposed through REQ-06 — a narrow starter set, or the site's full CMS tool catalog from day one? Owner: Leona Burime / Software Architect. Resolve by: 2026-09-19.
- **OQ-03:** Should REQ-06's new route be a plain authenticated HTTP route, or a proper inbound MCP server mirroring `sites-mcp-server.js` in the reverse direction? Bounded by REQ-07's trust review either way. Owner: Software Architect. Resolve by: 2026-09-19.

---

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| I — Library-First | COMPLIES | Reuses `@jini-ai/chat`, `@jini-ai/daemon`, `@jini-ai/core`'s existing `ToolRegistry`/`ToolExecutor`, and the admin's existing `createFrontendSessionBridge`; no new agent-loop or DOM-automation library is invented. |
| II — Test-First | COMPLIES | REQ-05 (tool-set fixed at turn start), REQ-11 (confirmation), REQ-19 (site-down degradation), and the `one-chat-fab-wiring.test.js` flip all need RED tests before implementation, per the Delivery Plan's phase boundaries. |
| III — Simplicity Gate | COMPLIES | Every new module (site tool route, DOM-tool bridge, main-process daemon, confirmation delegate, layout toggle) traces to a REQ above; no speculative abstraction beyond what REQ-06/07 need. |
| IV — Anti-Abstraction Gate | EXCEPTION (temporary) | REQ-06's new inbound route has exactly one caller today (the app-level daemon). The ADR must record why this doesn't need a second adapter yet, or name a concrete near-term second caller, per Article IV. |
| V — Integration-First Testing | COMPLIES | P1 ACs are framed at the IPC boundary (REQ-10's channels) and the HTTP boundary (REQ-06's route), not only at the unit level. |
| VI — Security-by-Default | COMPLIES | REQ-06's route is authenticated via the existing per-site partitioned session, never a new unauthenticated surface; REQ-07 requires trust review before any tool is exposed — consistent with the standing local-dev Art. VI exception already recorded for `tovu serve`'s other loopback-only endpoints. |
| VII — Spec Integrity | EXCEPTION (temporary) | `content_hash` computed by the provider-local validator's hash-only path (`--update-hash`), but the full package validator (`--phase spec`) was not run to a clean exit, because the companion package files are not yet written (see Implementation Readiness Gate). Must be resolved before `/plan`. |
| VIII — Observability | COMPLIES | REQ-19 requires a visible degraded-state note; REQ-11 requires a visible, structured confirmation-request event; REQ-07's refusals are structured and caller-facing, never silent. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (051 is the highest existing number in `ADS-memory/specs/`)
- [x] version set
- [ ] status APPROVED — currently REVIEW, pending the owner's decision on NC-1
- [x] content_hash computed by the provider-local validator's hash-only path (`--update-hash`); the full package validator was not run to a clean exit (see below)
- [x] feature_name matches the folder name
- [ ] Zero `[NEEDS CLARIFICATION]` markers — NC-1 (expanded-mode panel behavior) is open, awaiting the owner
- [x] Open Questions have an owner and a date
- [x] REQs testable; every REQ has at least one AC; every AC has a priority and uses Given/When/Then
- [x] Invariants absolute; edge cases have expected behavior; Dependencies table complete
- [x] Constitution table complete
- [x] Scope in and out present; Why-now present; User Journey complete
- [ ] Companion package files (`spec-manifest.md`, `traceability.spec.md`, `spec-dod.md`, and `api.spec.md`/`orchestrator.spec.md`/`ui.spec.md`/`errors.spec.md`/`behavior.spec.md` as applicable) not written: out of this dispatch's scope, same posture as SPEC-050
- [ ] `reports/pipeline/051-desktop-app-chat/pipeline-state.md` not created: out of this dispatch's scope
- [x] Brownfield evidence recorded (Evidence section; source report `ADS-memory/reports/2026-09-12-desktop-global-chat-recon.md`)

**Gate result:** CLARIFICATION PENDING. NC-1 blocks Software Architect dispatch until the owner resolves it (recommendation: option A). Also outstanding before `/plan`, independent of NC-1: package companions, pipeline state, and a clean full-package validator run (out of this dispatch's scope, matching SPEC-050's own posture).

---

## Agent Directives

Always:
- Treat Evidence line numbers as of 2026-09-12 and re-verify before editing — `apps/desktop` is mid JS→TS rename; a file named here as `.js` may already be `.ts` by the time this is implemented.
- Assert the tool set per context (site tab / All / Marketplace / Settings / zero sites / site-down), never through one representative case (Behavior Summary).

Ask before:
- Choosing REQ-06's exact route shape (plain HTTP vs. inbound MCP server) — OQ-03, Architect's call, but confirm with the owner if it changes the trust-review surface.
- Finalizing REQ-06/07's first-slice allowlist (OQ-02).

Never:
- Make `desktop.project.delete`, or any future `requiresConfirmation`-eligible tool, callable by the agent without REQ-11's confirmation mechanism in the same commit (INV-08).
- Add REQ-03's site-tool assembly without REQ-19's degradation guard in the same commit (INV-08).
- Reintroduce a second floating chat FAB — `one-chat-fab-wiring.test.js` exists specifically to catch that regression.
