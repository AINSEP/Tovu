# Traceability Matrix: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-051 |
| feature_name | FEAT-051-desktop-app-chat |
| version | 0.1.2 |
| content_hash | sha256:cbd3265b6bfcca7f596c573447fc902048435f8cfc7e28e3d1b63a6f0d295121 |
| last_edited | 2026-09-16T00:00:00Z |
| traceability_status | NOT STARTED — every row PENDING (spec stage) |

**How to read the Status column.** Nothing in this feature is implemented. `PENDING` is the correct and expected value for every row at spec stage (spec-dod.md item E-07). The Impl and Test columns name the file a row is *expected* to land in, derived from the Evidence section of `feature.spec.md` and re-verified against the working tree on 2026-09-16 — they are targets for TDD, not claims about existing code. Where a target cannot be named without first answering an Open Question, the cell carries an `[OQ-0N OPEN]` marker.

**Delivery-phase column.** `feature.spec.md`'s Delivery Plan splits this feature into three phases with a hard rule (INV-08) about what may not ship apart. The phase column is reproduced here so a TDD agent picking up one phase can see its whole row set without re-deriving it.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Phase | Impl File (target) | Impl Function (target) | Test File (target) | Test ID | Status |
|-----------|-------------|----------|-------|--------------------|------------------------|--------------------|---------|--------|
| REQ-01 | Exactly one app-level agent serves every turn; no site process runs an agent loop | — | 1 | `apps/desktop/src/main/workspace-chat-daemon.ts` (new, ported from `Tovu-Runner/src/main/runner-daemon.ts`) | daemon singleton construction | `apps/desktop/src/main/__tests__/workspace-chat-daemon.test.ts` | "constructs exactly one AgentExecutor for the app" | PENDING |
| AC-01 (REQ-01) | Three sites open; a turn from any tab is served by the app-level daemon only | P1 | 1 | same | same | same | "no site daemon starts an agent loop for a workspace-chat turn" | PENDING |
| REQ-02 | Every turn's tool set always includes the `desktop.*` set, minus settings and Marketplace | — | 1 | `apps/desktop/src/main/turn-tool-set.ts` (new); reads `apps/desktop/src/contracts/sections.ts` | `alwaysOnDesktopTools()` | `apps/desktop/src/main/__tests__/turn-tool-set.test.ts` | "the always-on set is the same for every nav section" | PENDING |
| AC-02 (REQ-02) | All tab: tool list has every non-excluded `desktop.*` verb, no settings, no Marketplace | P1 | 1 | same | same | same | "excludes desktop.settings.get/set and every Marketplace tool" | PENDING — **[OQ-01 OPEN]**: whether hidden sections' 14 verbs are in the set decides whether this asserts 15 names or 27. See report §2 OQ-01 |
| REQ-03 | A site-tab turn additionally gets that site's allowlisted tools, executed in that site's process | — | 2 | `apps/desktop/src/main/turn-tool-set.ts`; `apps/desktop/src/main/site-tool-client.ts` (new) | `siteToolsForTurn()` | `apps/desktop/src/main/__tests__/turn-tool-set.site-tools.test.ts` | "a site-tab turn's tool list is the always-on set plus that site's allowlist" | PENDING |
| AC-03 (REQ-03, REQ-06) | Site A active: list gains site A's allowlisted tools; a call hits site A's `content.db` | P1 | 2 | same + the new site route | same | `apps/website/src/assistant/__tests__/desktop-tool-calls-route.integration.test.ts` (new) | "an allowlisted tool executes against this site's own registry" | PENDING — **[OQ-02 OPEN]**: the allowlist's contents decide what this test calls |
| REQ-04 | Non-site addressee yields exactly the `desktop.*` set; no site tool offered or callable | — | 1 | `apps/desktop/src/main/turn-tool-set.ts` | `assembleTurnToolSet()` | `turn-tool-set.test.ts` | "All / Marketplace / Settings / zero-sites each yield the desktop-only set" | PENDING |
| AC-04 (REQ-04) | Marketplace, Settings, or zero sites: tool list is exactly REQ-02's set | P1 | 1 | same | same | same | same | PENDING |
| REQ-05 | The turn's tool set is captured once at turn start and never changes mid-turn | — | 2 | `apps/desktop/src/main/turn-tool-set.ts` | `freezeTurnContext()` | `turn-tool-set.test.ts` | "a tab switch after freeze does not alter the frozen set" | PENDING |
| AC-05 (REQ-05) | Switch A→B mid-turn: in-flight calls still resolve against A; next turn uses B | P1 | 2 | same | same | same | same | PENDING |
| REQ-06 | Site daemon exposes a new authenticated inbound tool-call route, reached via `net` + the site's partitioned session | — | 2 | `apps/website/src/assistant/desktop-tool-calls-route.ts` (new, sibling of `mcp-ui-tool-calls-route.ts`); mount in `apps/website/src/server/runtime/composition/modules/assistant.ts`; caller in `apps/desktop/src/main/site-tool-client.ts` | `registerDesktopToolCallsRoute`, `callSiteTool` | `apps/website/src/assistant/__tests__/desktop-tool-calls-route.integration.test.ts`; `apps/desktop/src/main/__tests__/site-tool-client.test.ts` | "executes an allowlisted tool through ToolExecutor with a synthetic RunRef"; "binds net to session.fromPartition(sitePartition(siteDir))" | PENDING — **[OQ-03 OPEN]**: plain HTTP (report §2 OQ-03 option A, recommended) vs inbound MCP server (option B) changes this row's whole impl column |
| AC-06 (REQ-06) | Call is authenticated via `net` bound to the site's partition; never a bare renderer `fetch` | P1 | 2 | `apps/desktop/src/main/site-tool-client.ts` | `callSiteTool` | `site-tool-client.test.ts` | "refuses to issue the call from the top-level renderer session" | PENDING |
| REQ-07 | Only allowlisted tools are callable through REQ-06's route; others refused by name | — | 2 | `apps/website/src/assistant/desktop-tool-calls.ts` (new allowlist module, sibling of `mcp-ui-tool-calls.ts`) | `isDesktopToolCallAllowed` | `apps/website/src/assistant/__tests__/desktop-tool-calls.test.ts` | "a name absent from the allowlist is refused, not dropped" | PENDING — **[OQ-02 OPEN]** |
| AC-07 (REQ-07) | Non-allowlisted tool: refused by name, model sees the refusal, turn continues | P1 | 2 | same | same | same | same | PENDING |
| AC-08 (REQ-07) | A destructive-annotation tool enters the allowlist only with confirmation coverage | P1 | 2 | same | same | same | "no entry opens a SurfaceExchangeStore exchange while the panel has no mcp-ui host" | PENDING — see report §3: the gating condition should be "opens an exchange", not "has a destructive trust annotation" |
| REQ-08 | Admin page exposes a `window`-level bridge into `createFrontendSessionBridge`; shell calls it via `webview.executeJavaScript` | — | 3 | `apps/admin/src/App.hooks.tsx` (expose); `apps/desktop/src/main/dom-tool-bridge.ts` (new) | `window.tovuDesktopBridge`, `executeDomTool` | `apps/desktop/src/main/__tests__/dom-tool-bridge.test.ts` | "targets the webview node for the turn's own siteDir" | PENDING |
| AC-09 (REQ-08) | `page.navigate` reaches site A's own `<webview>`, not another open site's | P1 | 3 | same | same | same | same | PENDING |
| REQ-09 | The bind token is read live per call from that site's mounted admin page; never cached | — | 3 | `apps/desktop/src/main/dom-tool-bridge.ts` | `readBindTokenLive` | `dom-tool-bridge.test.ts` | "reads a fresh token per call" | PENDING |
| AC-10 (REQ-09) | Token used is from this call's own round trip, never an earlier turn's | P1 | 3 | same | same | same | same | PENDING |
| AC-11 (REQ-09) | Admin page not yet mounted: call refused by name for that turn; no hang | P2 | 3 | same | same | same | "refuses rather than waiting for a token that may never arrive" | PENDING |
| REQ-10 | Main process gains the ported daemon and registers all five invoke channels; emits both push channels | — | 1 | `apps/desktop/main.ts`; `apps/desktop/src/main/workspace-chat-daemon.ts`; **`apps/desktop/src/runner-ipc-stubs.ts` (remove the five `workspace:chat:*` names)** | `registerWorkspaceChatHandlers` | `apps/desktop/src/main-workspace-chat-wiring.test.ts` (new); `apps/desktop/src/runner-ipc-stubs.test.ts` (update) | "each of the five invoke channels has exactly one handler" | PENDING |
| AC-12 (REQ-10) | `invoke(WORKSPACE_CHAT_CHANNELS.start, …)` reaches a registered `ipcMain.handle` | P1 | 1 | same | same | same | same | PENDING — **correction to AC-18/AC-12 wording**: today the channel is registered as a throwing stub returning `RUNNER_MAIN_NOT_PORTED`, not "reaches nothing" |
| AC-13 (REQ-10) | Notifications go over `.event`, and `desktop.navigate` also over `.navigate`; neither is an `ipcMain.handle` | P1 | 1 | same | same | same | "push channels are sends, not handles" | PENDING |
| REQ-11 | Confirmation mechanism for destructive tools: pause the call, render inline confirm/cancel, resume | — | 1 | `apps/desktop/src/main/workspace-chat-daemon.ts`; `apps/desktop/src/renderer/App.tsx` (`WorkspaceChatPane`) | pending-call store + `.runner-chat-pane__confirm` reuse | `apps/desktop/src/main/__tests__/confirmation.test.ts` | "a confirmable call pauses and emits a confirmation-request record" | PENDING — **mechanism correction required**, see report §3: `ExecutionDelegate` + `descriptor.requiresConfirmation` is the shape this codebase documented as a hang. Split by tool origin: site tools use the shipped mcp-ui two-step; `desktop.*` tools use an in-daemon pending-call store |
| AC-14 (REQ-11) | `desktop.project.delete`: execution pauses, record emitted, exactly one affordance renders | P1 | 1 | same | same | same | same | PENDING |
| AC-15 (REQ-11) | Cancel: that call ends cancelled, the turn continues, nothing is deleted | P1 | 1 | same | same | same | same | PENDING |
| AC-16 (REQ-11) | Confirm: the paused call resumes and completes | P1 | 1 | same | same | same | same | PENDING |
| AC-17 (REQ-11) | Two calls, one confirmable: the other is unaffected and may complete | P2 | 1 | same | same | same | "only the confirmable call is paused" | PENDING |
| REQ-12 | Admin exposes an embed signal; `ChatFab`/`AssistantDock` hide inside the desktop `<webview>` | — | 1 | `apps/desktop/src/speech/preload-speech.cts` (set the flag, following `window.tovuVoice`); `apps/admin/src/App.tsx` | `window.tovuDesktopEmbedded` | `apps/admin/src/__tests__/App.embedded-chat-hidden.test.tsx` (new); `apps/desktop/src/renderer/one-chat-fab-wiring.test.ts` (update tripwire only) | "no ChatFab renders when the embed flag is set" | PENDING |
| AC-18 (REQ-12) | Embedded: no `ChatFab`/`AssistantDock`; one-chat-rule assertions still hold; tripwire flips on purpose | P1 | 1 | same | same | same | same | PENDING |
| AC-19 (REQ-12) | Standalone admin: `ChatFab`/`AssistantDock` render exactly as today | P1 | 1 | same | same | same | "the embed signal changes nothing outside the shell" | PENDING |
| REQ-13 | ≥900px: panel renders DOCKED as a full-height right column, squeezing `.main`; window size unchanged | — | 1 | `apps/desktop/src/renderer/App.tsx`; `apps/desktop/src/renderer/app.css:154-156,163,1364-1375` | `WorkspaceChatPane` mount + grid column | `apps/desktop/e2e/workspace-chat-panel.spec.ts` (new, `_electron`) | "docked at 1360px: .main narrows, window does not" | PENDING |
| AC-20 (REQ-13) | ≥900px open: `.main` narrower by the panel width; window size unchanged | P1 | 1 | same | same | same | same | PENDING |
| REQ-14 | <900px: panel renders OVERLAY, fixed, above `.main` and the active `<webview>` | — | 1 | same | same | same | "overlay at 700px: .main width unchanged" | PENDING |
| AC-21 (REQ-14) | <900px open: computed `position: fixed`, z-index above `.main`; `.main` width unchanged | P1 | 1 | same | same | same | same | PENDING |
| REQ-15 | The docked/overlay switch is JS-state-driven, mirrored to a `data-layout` attribute | — | 1 | `apps/desktop/src/renderer/App.hooks.ts` | `useChatPanelLayout()` | `apps/desktop/src/renderer/__tests__/use-chat-panel-layout.test.ts` (new) | "the boolean flips at the threshold, not the media query alone" | PENDING |
| AC-22 (REQ-15) | 901px→899px while open: boolean flips, mode switches, conversation survives | P2 | 1 | same | same | `workspace-chat-panel.spec.ts` | same | PENDING |
| REQ-16 | Drag-to-resize is out of scope; docked width uses a static formula | — | 1 | `apps/desktop/src/renderer/app.css` | static width token | `workspace-chat-panel.spec.ts` | "no resize handle exists" | PENDING — **CONFLICT**: `ADS-memory/.local-artifacts/owner-worklist.md:105` records an undated owner decision for "drag-to-resize", the opposite of REQ-16. Settle before TDD writes this row's RED test |
| AC-23 (REQ-16) | Dragging the panel edge resizes nothing; no affordance exists | P2 | 1 | same | same | same | same | PENDING — same conflict |
| REQ-17 | `desktop.navigate` moves nav/tab via existing `selectSection`/`setActiveTab` and pushes the navigate event | — | 1 | `apps/desktop/src/renderer/App.tsx:76-87`; daemon navigate handler | `selectSection`, `setActiveTab` | `apps/desktop/src/renderer/__tests__/desktop-navigate.test.ts` (new) | "a navigate call moves the visible section" | PENDING |
| AC-24 (REQ-17) | Valid section id: `TopNav` changes via `selectSection`; `workspace:chat:navigate` pushed | P1 | 1 | same | same | same | same | PENDING |
| REQ-18 | Conversations persist only through the existing app-level sqlite store | — | 1 | `apps/desktop/src/renderer/App.hooks.ts:829,1111,1204` (unchanged) | `useRunnerConversations` | `apps/desktop/src/renderer/__tests__/workspace-conversations.test.ts` | "no row lands in any site's /api/assistant/chats store" | PENDING |
| AC-25 (REQ-18) | A conversation is found in the sqlite store and in no site's transcript store | P1 | 1 | same | same | same | same | PENDING |
| REQ-19 | Site daemon unreachable at turn start: site tools excluded, turn proceeds, transcript says so, no hang | — | 2 | `apps/desktop/src/main/site-tool-client.ts`; `turn-tool-set.ts` | `probeSiteToolSurface()` | `apps/desktop/src/main/__tests__/site-down-degradation.test.ts` (new) | "a down site yields the desktop-only set plus a visible note" | PENDING |
| AC-26 (REQ-19) | Site A's daemon stopped: tool list is REQ-04's set, turn completes, transcript states unavailability | P1 | 2 | same | same | same | same | PENDING |
| AC-27 (REQ-19) | Under AC-26's conditions the panel does not hang, freeze or crash | P1 | 2 | same | same | same | same | PENDING |
| REQ-20 | Settings and Marketplace tools stay named but unimplemented and uncallable | — | 1 | `apps/desktop/src/main/turn-tool-set.ts` | exclusion list | `turn-tool-set.test.ts` | "settings and Marketplace ids never appear in an offered tool list" | PENDING — **CONFLICT**: `owner-worklist.md:105` records "Marketplace install + settings in v1", the opposite of REQ-20. Settle before TDD |
| AC-28 (REQ-20) | No offered tool list ever contains the settings or Marketplace ids | P2 | 1 | same | same | same | same | PENDING — same conflict |
| REQ-21 | Panel visibility is operator-controlled only; no navigation or layout state opens or closes it | — | 1 | `apps/desktop/src/renderer/App.hooks.ts` | `useChatPanelOpen()` | `apps/desktop/src/renderer/__tests__/use-chat-panel-open.test.ts` (new) | "expanded mode does not change the open flag" | PENDING |
| AC-29 (REQ-21) | Entering/leaving `expanded` mode leaves the panel rendered and its open state unchanged | P1 | 1 | same | same | `workspace-chat-panel.spec.ts` | same | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File (target) | Test ID | Status |
|--------|-----------------------------------------|--------------------|---------|--------|
| INV-01 | The desktop app must never run more than one app-level agent process at a time | `apps/desktop/src/main/__tests__/workspace-chat-daemon.test.ts` | "a second start does not construct a second AgentExecutor" | PENDING |
| INV-02 | No site's own process must ever run an agent loop or LLM call for this chat | `apps/website/src/assistant/__tests__/desktop-tool-calls-route.integration.test.ts` | "the route executes a tool and never starts a run" | PENDING |
| INV-03 | A site tool call must never execute against a `content.db` other than the addressed site's | `apps/desktop/src/main/__tests__/site-tool-client.test.ts` | "the call's origin is derived from the turn's frozen siteDir" | PENDING |
| INV-04 | The tool set of an in-flight turn must never change once the turn has started | `apps/desktop/src/main/__tests__/turn-tool-set.test.ts` | "the frozen set is immutable for the turn's duration" | PENDING |
| INV-05 | At most one visible chat affordance renders while the admin page is inside the desktop shell | `apps/desktop/src/renderer/one-chat-fab-wiring.test.ts`; `apps/admin/src/__tests__/App.embedded-chat-hidden.test.tsx` | existing one-chat assertions + the new embedded-hide test | PENDING |
| INV-06 | A call requiring confirmation must never execute without an operator confirmation collected through the pane | `apps/desktop/src/main/__tests__/confirmation.test.ts` | "no confirmable call executes before a confirm arrives" | PENDING — the assertion is right; the mechanism named in REQ-11 is not (report §3) |
| INV-07 | REQ-06's route must never be reachable outside the desktop shell's authenticated per-site session | `apps/website/src/assistant/__tests__/desktop-tool-calls-route.integration.test.ts` | "an unauthenticated request is refused at the proxy, before the daemon" | PENDING |
| INV-08 | No commit may make a confirmable tool callable, or add site-tool assembly, without its safeguard in the same commit | Review gate, not a unit test; enforce in the phase's own commit checklist | — | PENDING — **no automated surface**. Candidate: extend `apps/desktop/scripts/check-gates.ts` with a source-text check, the same technique `one-chat-fab-wiring.test.ts` already uses |
| INV-09 | The panel's open/closed state must never change as a side effect of navigation or layout state | `apps/desktop/src/renderer/__tests__/use-chat-panel-open.test.ts` | "no navigation or layout transition writes the open flag" | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File (target) | Test ID | Status |
|-------|-----------------------------------------|--------------------|---------|--------|
| EC-01 | Message sent with zero sites ever created (`NoWebsitesYet`) | `turn-tool-set.test.ts` | "zero sites yields the desktop-only set" | PENDING |
| EC-02 | Tab switch A→B while a turn started against A is streaming | `turn-tool-set.test.ts` | "an in-flight turn keeps A's tools" | PENDING |
| EC-03 | Panel opened while the Marketplace tab is active | `turn-tool-set.test.ts` | "Marketplace offers no Marketplace-specific tool" | PENDING |
| EC-04 | Active site's daemon unreachable at turn start (crashed, or still booting) | `site-down-degradation.test.ts` | "a crashed daemon degrades rather than hanging" | PENDING |
| EC-05 | The agent calls `desktop.project.delete` | `confirmation.test.ts` | "pauses, renders one affordance, cancel ends only that call" | PENDING |
| EC-06 | Window resized across 900px while the panel is open and a turn is in flight | `workspace-chat-panel.spec.ts` | "mode switches without losing the conversation or the turn" | PENDING |
| EC-07 | A site tab enters `expanded` mode while the panel is open | `workspace-chat-panel.spec.ts` | "the panel keeps rendering through expanded mode" | PENDING |
| EC-08 | `page.navigate` against a site tab that is not the one currently focused | `dom-tool-bridge.test.ts` | "targets the turn's own site, not the focused tab" | PENDING |
| EC-09 | A tool call names a tool absent from REQ-06's allowlist | `desktop-tool-calls.test.ts` | "refused by name; the turn continues" | PENDING |
| EC-10 | Two confirmable calls in one turn | `confirmation.test.ts` | "each pauses independently; resolving one does not resolve the other" | PENDING |
| **EC-11 (PROPOSED)** | The addressed site has `TOVU_ADMIN_ASSISTANT=off`, so it has **no agent daemon and no `ToolRegistry` at all** | `site-down-degradation.test.ts` | "a deliberately-disabled assistant degrades the same way a crashed one does" | PENDING — **gap in `feature.spec.md`**: EC-04 covers "crashed or still booting" but not "switched off". `apps/website/src/server/runtime/boot/agent-daemon-wanted.ts:26-37` and `composition/admin-assistant-enabled.ts:29` make this a permanent, boot-time state, not a transient one, so the transcript note should say something different from "temporarily unavailable". Add to `feature.spec.md` at the next version bump |

---

## 4. Error-Code Traceability

| Error Code | Defined In | Raised By (target) | Test File (target) | Test ID | Status |
|---|---|---|---|---|---|
| `WORKSPACE_CHAT_DAEMON_UNAVAILABLE` | errors.spec.md §2 | daemon construction at app boot | `apps/desktop/src/main/__tests__/workspace-chat-daemon.test.ts` | "a failed construction surfaces an explicit unavailable state" | PENDING |
| `TOOL_NOT_ALLOWLISTED` | errors.spec.md §2 | REQ-06 route, allowlist check | `desktop-tool-calls-route.integration.test.ts` | "a non-allowlisted name is refused by name" | PENDING |
| `SITE_TOOL_SURFACE_UNREACHABLE` | errors.spec.md §2 | `site-tool-client.ts` turn-start probe | `site-down-degradation.test.ts` | "an unreachable surface yields this code, not a hang" | PENDING |
| `SITE_SESSION_NOT_ESTABLISHED` | errors.spec.md §2 | `site-tool-client.ts`, before issuing the call | `site-tool-client.test.ts` | "no partition cookie yet yields this code" | PENDING |
| `BIND_TOKEN_UNAVAILABLE` | errors.spec.md §2 | `dom-tool-bridge.ts` live token read | `dom-tool-bridge.test.ts` | "an unmounted admin page yields this code" | PENDING |
| `CONFIRMATION_CANCELLED` | errors.spec.md §2 | confirmation resolution, operator cancel | `confirmation.test.ts` | "cancel ends the call with this code" | PENDING |
| `CONFIRMATION_EXPIRED` | errors.spec.md §2 | confirmation deadline | `confirmation.test.ts` | "an unanswered confirmation expires rather than parking forever" | PENDING |
| `UNAUTHENTICATED`, `VALIDATION_ERROR`, `FORBIDDEN`, `CONFLICT`, `GATEWAY_TIMEOUT`, `INTERNAL_ERROR`, `TOOL_CALL_FAILED` | errors.spec.md §2a (existing, reused) | REQ-06 route, via the shared `respondToExecutionResult` | `desktop-tool-calls-route.integration.test.ts` | "maps every ToolExecutionResult status exactly as the MCP-UI route does" — one table-driven test, not seven | PENDING |
| `RUNNER_MAIN_NOT_PORTED` | existing, `apps/desktop/src/runner-ipc-stubs.ts` | the five stubs REQ-10 replaces | `apps/desktop/src/runner-ipc-stubs.test.ts` | "the five workspace:chat channels are no longer stubbed" | PENDING — this code must STOP being raised for these five channels |

---

## 5. Behavior-Rule Traceability

| Rule ID | Rule (from behavior.spec.md) | Test File (target) | Test ID | Status |
|---|---|---|---|---|
| BR-01 | Turn-start tool-set precedence (addressee → tool set) | `turn-tool-set.test.ts` | "each of the six contexts yields its own tool set" | PENDING |
| BR-02 | Freeze ordering: capture addressee before the first tool schema is built | `turn-tool-set.test.ts` | "the addressee is read exactly once per turn" | PENDING |
| BR-03 | Degradation precedence: an unreachable site downgrades to the desktop-only set and annotates | `site-down-degradation.test.ts` | "degradation wins over site-tool inclusion" | PENDING |
| BR-04 | Confirmation pause is per-call, not per-turn | `confirmation.test.ts` | "a sibling call proceeds while one is paused" | PENDING |
| BR-05 | Layout precedence: operator open/closed state outranks every layout and navigation state | `use-chat-panel-open.test.ts` | "layout transitions never write the open flag" | PENDING |
| BR-06 | Docked/overlay threshold and its default | `use-chat-panel-layout.test.ts` | "899 is overlay, 900 is docked" | PENDING |
| BR-07 | Tool-name mapping: `desktop.*` dots become underscores across MCP and back | `apps/desktop/src/contracts/__tests__/workspace-chat.test.ts` (existing) | existing `mcpToolNameForVerb`/`desktopVerbForAgentToolName` coverage | PENDING — existing coverage; re-point when the daemon starts using it |

---

## 6. Verification Notes

- Nothing in this feature is implemented as of 2026-09-16. Every Impl/Test path above is a target derived from `feature.spec.md`'s Evidence table plus a fresh working-tree pass, not an existing artifact.
- Two rows (REQ-16/AC-23 and REQ-20/AC-28) carry a live conflict between the approved spec and an undated owner decision recorded in the worklist. TDD must not author RED tests for them until that is settled — a RED test written against the losing side is wasted work and, worse, becomes a regression guard for a decision the owner reversed.
- REQ-11's row names the mechanism the approved spec asks for, and flags that three files in `apps/website/src/assistant/` argue it is a hang. The ADR is where that gets resolved; the AC-level behavior (pause, one affordance, cancel ends only that call) is unaffected either way, which is why those rows are not blocked.
- The `_electron` end-to-end rows (REQ-13/14/15/16/21) additionally depend on the 480px-vs-900px measurement that has never been done (`apps/desktop/main.ts:499-502` says so in its own comment). The measurement is a prerequisite for the threshold's *value*, not for the mechanism.

---

## 7. Untraced Requirements

_None. Every REQ, AC, INV, EC, error code and behavior rule in this package has a row above._
