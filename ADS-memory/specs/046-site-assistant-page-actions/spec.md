# SPEC-046 — Client action channel for the site assistant

Status: **DRAFT (v2) — awaiting owner approval**
Author: Coordinator (Review Mode), 2026-08-04
Builds on: ADR-054 (public visitor assistant), ADR-053 (MCP-UI confirmation redemption),
SPEC-006 REQ-14 (rate-limit primitive)

**v2 supersedes v1.** v1 specced three hard-coded verbs (`navigate`/`scroll_to`/`highlight`) as the
feature. That was scoped wrong: it would have built a bespoke transport for one use case, and every
later agentic workflow — MCP-UI surfaces, a2ui, pickers, forms — would have needed its own. **The
deliverable is the channel. The verbs are its first consumer.**

---

## 1. Intent

Give the public visitor assistant a way to **do things in the visitor's browser**, not just answer
questions — and make that a general capability so future agentic workflows plug in without new
transport work.

### What already exists (do not rebuild)

| piece | where | state |
|---|---|---|
| MCP-UI surfaces | `@jini-ai/ui/mcp-ui/surfaces` | Built, used by the admin assistant |
| Redemption allowlist | `src/assistant/mcp-ui-tool-calls.ts` (ADR-053) | Built, server-side gate for tool calls originating in rendered UI |
| Client-side tool caller | `@jini-ai/chat`'s `create-mcp-ui-tool-caller.ts` | Built; performs **no** validation by design — the server allowlist is the gate |
| Rate limiting | `SITE_ASSISTANT_PER_IP` | **Shipped** — see §6 |

The admin assistant already has the agentic-UI loop: a tool returns UI → it renders in the chat →
the human clicks → the click redeems through a server-side allowlist. **The public widget simply is
not wired to any of it.** This spec is mostly *wiring and hardening for a hostile caller*, not
invention.

---

## 1a. REQ-0 — Separate the capability layer from the transport

**The most important structural requirement, and the cheapest to do now.**

Today the tool surface is *defined* in `src/assistant/site/tools.ts` but *dispatched* by a closed
`switch` hard-wired inside the SSE route (`site-assistant.ts:168`). Capability and transport are
fused. Every future caller — WebMCP, A2A, a second UI — would have to re-implement dispatch,
validation, and the allowlist, and they would drift.

**Extract a capability registry.** One place that answers *"who is asking, what may they invoke,
what does it return"*. The SSE route becomes **one adapter** over it.

```
capability registry  ──  authorization by caller identity
        ▲
        ├── SSE adapter        (today: the visitor widget)
        ├── WebMCP adapter     (future: in-page API for browser agents)
        ├── A2A adapter        (future: remote agents, agent cards, task lifecycle)
        └── admin adapter      (future: converge with the daemon surface)
```

Requirements:

- **Caller identity is a first-class parameter**, not an ambient assumption. Minimum today:
  `anonymous-visitor`. The registry authorizes per capability *per caller class* — it must be
  impossible to expose a capability to a new caller merely by adding an adapter.
- **Default deny.** A capability absent from a caller's grant set is refused before execution,
  the way the current closed switch already behaves. Preserve that property; do not regress to a
  registry lookup that resolves anything registered.
- **Validation lives with the capability, not the adapter.** Target resolution (REQ-6) must run
  once, in the registry, so no adapter can skip it.
- **Do not build the WebMCP or A2A adapters.** This is shape only. The test is that adding one later
  requires no change to the capability definitions.
- Preserve today's behaviour exactly: the same three read-only capabilities, same refusal semantics,
  same privacy property (no `tool_use`/`tool_result` echoed to the client).

**Explicit non-goal:** do not generalize into a plugin system, dynamic loading, or config-driven
registration. A typed registry with static definitions and an authorization function is the whole
requirement. ADR-054 chose a closed switch over a registry lookup deliberately, because *"an unknown
tool name cannot resolve to anything"* — REQ-0 must keep that guarantee while making the closed set
addressable by more than one adapter.

---

## 2. Prerequisite — the transcript must survive navigation

Any client action that causes a page load destroys the conversation today. This is current
behaviour, not a risk:

- `apps/site-chat/src/main.tsx` is a self-mounting IIFE; every page load renders a fresh root into
  an empty mount node.
- No `sessionStorage`/`localStorage` anywhere in `apps/site-chat/src`.
- `site-assistant-transport.ts` states it: *"nothing about the run is persisted server-side"*,
  transcript *"never persisted across a page load"*.

The public site is server-rendered, so navigation is a **full document load** — new JS realm, new
React root, empty transcript.

### REQ-1 — Persist and rehydrate the transcript

**`sessionStorage`, not `localStorage`.** Per-tab, dies with the tab: the right privacy default for
an anonymous visitor, and it must not leak into a later visit on a shared machine.

- Versioned, namespaced key: `tovu.site-assistant.transcript.v1`.
- **Fail-soft rehydrate.** Any parse/shape error clears the key and starts empty. A corrupt entry
  must never block mount. Extend `check-bundle-mounts.mjs` to cover a poisoned-storage case.
- Cap stored bytes and message count, dropping oldest first — an unbounded transcript is a
  quota-exceeded exception mid-conversation.
- Persist pane open/closed state, so the widget does not slam shut on arrival at the page it just
  sent the visitor to.
- "New thread" must clear the persisted copy, not just in-memory state.

### REQ-2 — A single-shot post-navigation action queue

An action targeting the destination page (scroll, highlight, render a surface) cannot run before the
load. Queue it in `sessionStorage` beside the transcript; **drain exactly once** on mount. A queued
action surviving a reload and re-firing on every subsequent page is the failure mode to prevent —
delete-before-execute, not after.

### REQ-3 — Bounded conversation history

The route accepts no history today, so every message is standalone and multi-step flows cannot work.
Send prior turns, but: cap the window (count and characters), and treat client-supplied history as
**untrusted** — it comes from the browser and can be forged. It may shape the reply; it must never
widen authorization. All validation (REQ-6) stays server-side and history-independent.

---

## 3. The channel

### REQ-4 — A typed client-directive event on the SSE stream

Add **one** new event type carrying a discriminated union, rather than one event type per feature:

```
client_directive: { kind: "page_action", ... }
                | { kind: "ui_surface",  ... }   // MCP-UI resource to render
```

Extension = adding a `kind` and its handler. No transport change.

**Preserve the existing privacy property:** the stream deliberately does *not* echo
`tool_use`/`tool_result`, so internal tool names and raw lookup results stay private from visitors.
A `client_directive` carries **only the resolved directive**, never the tool call that produced it.

### REQ-5 — Two trust tiers, and the rule for which applies

This is the core security decision. Directives are not equivalent, and collapsing them is how this
becomes a general remote-execution surface.

| tier | example | human in loop | authorization |
|---|---|---|---|
| **A — autonomous** | navigate, scroll, highlight | No | Server resolves and validates the target *before* emitting. Client executes verbatim. |
| **B — redeemed** | MCP-UI surface with actionable controls | **Yes, a click** | Existing ADR-053 path: click redeems a tool id against `mcp-ui-tool-calls.ts`'s allowlist. |

**The rule: a directive may be Tier A only if its worst case, given a fully hijacked model, is
acceptable with no human confirmation.** For `navigate`, worst case is "visitor is sent to a
different published page of this site" — acceptable. Anything whose worst case exceeds that is Tier
B or is not built.

`mcp-ui-tool-calls.ts` already warns that a tool-call surface reachable from rendered content, with
no server allowlist, is *"worse than no gate"*. That applies with more force here: the admin path has
a session and an accountable user; this one is **anonymous and internet-reachable**.

### REQ-6 — Server-side target resolution

The model **never emits a raw URL or selector**. It names a content id; the server resolves it to a
published path or refuses. The client resolves nothing.

Refuse: off-site URLs, `javascript:`/`data:` schemes, admin paths, unpublished or soft-deleted
content.

⚠️ `posts.deleted_at` is **independent of `status`** — a trashed post still reads
`status: "published"`. Validation must go through `listPublishedPosts` / the same predicate
`readPublished()` uses. A hand-rolled status check leaks trashed content.

### REQ-7 — Public-safe MCP-UI posture

The admin surface assumes a logged-in operator. Before the public widget renders any MCP-UI:

- **Separate, smaller allowlist** for public redemption. Do not reuse admin's list. Default empty —
  a tool earns its way on.
- Surface HTML is untrusted (it came from a tool author). Confirm the sandboxing the existing
  surfaces apply, and that it holds against a *public* caller.
- No surface may render workspace-internal data. Published content only.

### REQ-8 — Prompt-injection boundary

Assistant input includes published post content, so a post can attempt to steer it. With client
directives, that becomes an attempt to act on a visitor.

The mitigation is architectural, not a prompt instruction: because Tier A targets are
server-validated against published content, **the worst case of a successful injection is sending a
visitor to another published page of your own site.** That is the invariant to preserve. Any new Tier
A directive must be checked against it; exceeding it requires a new ADR.

---

## 4. First consumers — page actions

`navigate` (published slug), `scroll_to` (anchor), `highlight` (validated target). All Tier A. These
prove the channel; they are not the point of it.

### Highlight treatment (owner-specified: outline, ~20s, then fade)

- **Layout-neutral only** — `outline` + `outline-offset` + `box-shadow`, never `border`. The target
  is arbitrary theme content and must not reflow. `box-shadow` clips under an `overflow: hidden`
  ancestor; `outline` is the reliable half.
- Brief pulse (~2 cycles, ~1.2s) → hold → fade over the final ~2s. One `@keyframes`,
  `animation-fill-mode: forwards`.
- `prefers-reduced-motion`: no pulse, no smooth scroll; static outline, same duration and fade.
- **No dark variant.** The public site has no dark mode; `widget.css` carries a standing warning and
  a prior session already had to undo one.
- Cleanup on animation end, on a new highlight, and on navigation. One highlighted element at a time.
- `scroll-margin-top` so a sticky theme header cannot cover the target.
- Namespace `tovu-site-assistant__highlight`. **Never reuse a `jini-*` class** — `eefb34e` fixed a
  live bug where borrowing `jini-chat-pane__cancel` inherited `position: absolute` from the package's
  injected stylesheet and threw the control 505px off.
- Never highlight inside the widget's own pane.

---

## 5. Explicitly out of scope

General DOM read/write, arbitrary selector injection, form filling, click synthesis, and anything
that can exfiltrate page content. The widget is on **every** page; a DOM-read primitive on an
anonymous, injection-reachable assistant is a different risk class needing its own ADR. Revisit for
the **admin** assistant, where there is a session and an accountable user.

---

## 6. Rate limiting — SHIPPED

Was §4 of v1; delivered before this rewrite.

- `SITE_ASSISTANT_PER_IP` — 10 requests / 5 min / IP, keyed by `resolveClientIp(req)`, checked before
  any mode/config branch. Clean 429 + `Retry-After`; the transport's existing `!response.ok` branch
  surfaces it via `onError` + `finish()`, so no widget change was needed. Commit `6d8086b`.
- Expired-window eviction (amortized sweep-on-write) so map growth is no longer attacker-controlled.
  Commit `506a7ae`.
- Admin roadmap row removed; the unit test asserts its **absence**. Commit `67da3a5`.
- Still true: single-process, in-memory. Instances behind a load balancer each get their own budget.

---

## 7. Acceptance criteria

Browser-verified. Per the standing rule for this workstream, **"tests pass" is not evidence for
anything a browser runs** — assert the mount node has children, measure properties, don't eyeball.

1. Ask → answer → "take me there": page navigates **and the transcript is still present**, pane open.
2. Highlight appears on the destination, pulses, holds, fades ~20s, leaves no residue.
3. Reloading the destination does **not** re-fire the queued action.
4. `prefers-reduced-motion: reduce` → no pulse, no smooth scroll, still highlighted.
5. Crafted targets (off-site URL, admin path, unpublished slug, trashed-but-`published` post) are
   refused server-side and never reach the client.
6. Layout unchanged by highlighting — `getBoundingClientRect()` before/after.
7. Mount succeeds with corrupted `sessionStorage`.
8. A Tier B surface renders, and its action does **not** execute without a click.
9. A tool id absent from the public allowlist is refused even when the rendered HTML requests it.

---

## 8. Decisions and open questions

### DECIDED (owner, 2026-08-04)

**D-1 — Propose by default; auto-navigate only on explicit request.** The assistant renders a
clickable link/button as its default behaviour. It navigates directly only when the visitor asks in
so many words ("take me there").

This makes the injection posture materially stronger than v1 assumed, and the reason is worth
stating because it constrains later work: in the default path a hijacked model **cannot move
anyone** — it can only render a proposal that a human then chooses. Auto-navigation is gated behind
a visitor's own explicit request, so the dangerous path requires visitor intent that the injected
content cannot supply.

Implementation consequence: the *proposal* is itself a client directive (a rendered affordance), not
a plain text link the model writes. It must go through the same server-side target validation
(REQ-6) — a proposal carrying an unvalidated URL would reintroduce exactly the risk this decision
removes. **Do not let "it's only a link" skip validation.**

**D-2 — Same tab.** Normal browsing feel, and the chat follows the visitor. This is what makes REQ-1
(transcript persistence) mandatory rather than optional; new-tab would have sidestepped it at the
cost of a worse experience, popup-blocker fragility, and two assistant instances.

### Still open

1. **Which tools, if any, go on the public MCP-UI allowlist in v1?** Recommended: **none.** Ship the
   channel with Tier A page actions only, add Tier B tools individually with their own review.
2. **ADR-054's unresolved question** — does a logged-in admin get the visitor assistant or the admin
   one? Client directives make the overlap more visible.

---

## Handoff Contract

- **Inputs used:** `src/assistant/site/tools.ts`, `src/server/modules/site-assistant.ts`,
  `src/assistant/mcp-ui-tool-calls.ts`, `apps/site-chat/src/{main.tsx,site-assistant-transport.ts,widget.css}`,
  `src/server/middleware/rate-limit.ts`, `apps/admin/src/{sections/AiAssistant.tsx,lib/assistant-dock-bus.ts}`;
  ADR-053, ADR-054, the 2026-08-04 handoffs.
- **Output summary:** a general client-directive channel with a two-tier trust model, page actions as
  its first consumer, and the transcript-persistence prerequisite that gates all of it.
- **Risks:** REQ-1/REQ-2 are prerequisites, not parallel work. REQ-5's tier rule is the load-bearing
  security decision — collapsing the tiers turns this into a public remote-execution surface.
- **Suggested next assignee:** Software Architect (ADR for the tier model), then Programmer.
