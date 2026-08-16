# MCP-UI confirmation surface — clipping fix + agent tagging

2026-08-16. Dispatched to own the MCP-UI confirmation surface's visibility and its agent-tagging
(see the dispatching brief for the two live-publish-run measurements this started from). This log
is written as-you-go, per the brief's instruction, and committed alongside the code.

**STATUS: DONE, live-verified.** All three tasks shipped, tested, and — per the owner's later
"we need to radically fix the CSS" + "I need to SEE this working" directive — confirmed against the
running app under headed Playwright, not just unit tests. See "Live verification" near the bottom
for the final before/after numbers and screenshots. A second, independent structural root cause
(the composer overlay's hardcoded padding reservation) was found and fixed along the way, and one
self-inflicted regression (a `maxHeight` cap) was caught by that same live verification and
reverted before it shipped — both are logged below rather than smoothed over.

## Task 1 — root cause (verified by reading source, not inferred)

The clip was reported as: the publish confirmation dialog declares
`preferredFrameSize: ["100%","360px"]` (`Tovu/src/features/deployments/publish-agent-tools.ts:432`)
but rendered at 559-560px on two separate live runs, and the Publish/Cancel buttons ended up
unreachable below the composer.

Three independent facts compose the bug — none alone explains it:

1. **`preferredFrameSize`'s declared height is only ever an initial guess, never a ceiling.**
   `McpUiSurfaceCard.tsx` (`Jini/packages/chat/src/react/components/McpUiSurfaceCard.tsx:88`, before
   this fix) forwards it to `McpUiHost` as `initialHeight` only. The REAL displayed height comes
   later from `McpUiHost.tsx`'s `Math.min(Math.max(reported, 1), maxHeight)`, where `reported` is
   the surface's own `document.documentElement.scrollHeight`, delivered asynchronously via
   `ui/notifications/size-changed` after the handshake completes (`surfaces/bridge.ts`'s
   `reportSize()` + a live `ResizeObserver`). `maxHeight` defaulted to `DEFAULT_MAX_HEIGHT = 720`,
   and — this was the real gap — **`McpUiSurfaceCard` never threaded a `maxHeight` override through
   to `McpUiHost` at all**, so every consumer, including Tovu's 380px-wide dock, got the same
   720px ceiling a full-width transcript gets.
2. **The declared guess was simply wrong for this dialog's real content** (title + up to 4 detail
   rows + a warning callout + two buttons ≈ 559-560px, not 360px) — not a bug in the sizing math
   itself, but what made the async growth (~200px) large enough to be visually catastrophic.
3. **The actual bug: nothing re-anchors scroll when a surface grows after mount.**
   `MessageList.tsx`'s auto-scroll (`Jini/packages/chat/src/react/components/MessageList.tsx:44-50`,
   before this fix) is a one-shot `useEffect` keyed on `[scrollIntent, messages]`.
   `useConversation.ts` sets `scrollIntent` true only in reaction to `messages`/`run.events`
   changes (send, retry, streamed reconciliation). It has **zero visibility into `McpUiHost`'s own
   internal `size` state** growing the iframe post-mount — that growth lives entirely inside a
   different component's React state. So: the transcript scrolls to bottom ONCE, while the surface
   is still at its small initial guess; the surface then silently grows; nothing re-triggers a
   rescroll. Because this is a human-confirmation gate, the agent's turn is deliberately PARKED
   awaiting the click — there is no further `messages` update to accidentally save the situation
   while the human is deciding. The action buttons end up below the transcript's last-known
   "bottom" with no way back into view short of a manual scroll the operator didn't know to make.

Ruled out, not assumed: `suppressScroll` — `useConversation`'s "user manually scrolled away, don't
auto-scroll" escape hatch — is exported but has **zero callers anywhere in Jini or Tovu**
(`grep -rn suppressScroll` across both trees). A false-positive-suppression theory does not apply;
nothing was ever wired to call it.

### Fix (Jini commit `07113b07`)

- `MessageList.tsx`: added a second effect that observes each message row (`el.children`, one per
  `MessageRow`) via `ResizeObserver`, re-created whenever `messages` changes so a newly mounted row
  is observed. On any observed growth it re-sticks the container to `scrollHeight`, but **only**
  when a `stickToBottomRef` (updated on every real user `scroll` event, and set `true` by every
  programmatic scroll-to-bottom) says the transcript was already at/near the bottom — so a human who
  scrolled up to read history is never yanked back down by an unrelated row resizing elsewhere.
  Observing the container itself would not have worked: `.jini-message-list`'s own border-box is
  held fixed by its flex/overflow layout (that's why it scrolls at all), so only each row's content
  size changes — `ResizeObserver` only reports changes to the box of the element it's attached to.
- `McpUiSurfaceCard.tsx` / `registerMcpUiSurfaceRenderer`: added an optional `maxHeight` prop,
  forwarded to every `McpUiHost` this card renders. `DEFAULT_MAX_HEIGHT` (720) is untouched — this
  only makes it overridable, which `McpUiHost` already supported but nothing above it exposed.

### Fix (Tovu commit `eb644f11`, later reverted by `8a1f0c48` — see "A second root cause" below)

- `AssistantDock.tsx`: `registerMcpUiSurfaceRenderer({ onToolCall: mcpUiToolCaller, maxHeight: 480 })`.
  Not a guarantee every surface fits without scrolling (nothing fixed-size can be, next to a
  composer/header of unknown height on an unknown window size) — that guarantee is the sticky-scroll
  fix above. This just lowers how much scrolling the common case needs. **This specific value was
  later live-verified to CAUSE the exact bug it targeted and was removed — see below.**

### Regression tests (all demonstrated red before the fix, paste below)

**`MessageList.test.tsx`** — new describe block `re-sticking to the bottom when a message ROW grows
after mount`:
```
❯ MessageList > re-sticking to the bottom when a message ROW grows after mount >
  scrolls to the new bottom when a message row grows with no messages change, if the
  transcript was at the bottom
  → expected 300 to be 600 // Object.is equality
Tests  1 failed | 11 passed (12)
```
After the fix: `Tests  12 passed (12)` (both the re-stick case and the "does NOT yank the view back
down when the user had scrolled up" case, which documents the guard).

**`McpUiSurfaceCard.test.tsx`** — new test `threads a maxHeight through to McpUiHost`:
```
× threads a maxHeight through to McpUiHost, so a narrow host can cap a surface below the
  library default (720px)
  → expected '720px' to be '300px' // Object.is equality
Tests  1 failed | 9 passed (10)
```
After the fix: `Tests  10 passed (10)`. Drives a real message round-trip through the shared
`window` listener (`host-message-source.ts`), not an injected fake — the same mechanism production
uses.

Both scoped runs: `cd Jini/packages/chat && npx vitest run <path>`.

## Task 2a — tag surface actions inside the frame (Jini commit `07113b07`, same commit as Task 1)

`document.ts`'s `renderActions()` now tags every generated `<button>` with the `@jini-ai/agentic`
`data-agent-*` convention (`AGENT_ELEMENT_ATTRIBUTE`/`AGENT_ROLE_ATTRIBUTE`/`AGENT_LABEL_ATTRIBUTE`,
imported directly — `packages/ui` already depends on `@jini-ai/agentic`, no new dependency edge):
`data-agent-element="mcpui-action-<id>"`, `data-agent-role="button"`,
`data-agent-label="<the button's own visible label>"`.

**This tagging is advisory, not what makes the surface reachable by `page.find_elements`.** Verified
by reading `page-capabilities.ts` + `dom-page-driver.ts`: both `page.find_elements` and `page.click`
resolve a handle by scanning `document`/`contentDocument`. This document renders inside a `srcdoc`
iframe sandboxed to `allow-scripts` alone (`MCP_UI_VIEW_SANDBOX`, deliberately no
`allow-same-origin`), which gives it an opaque origin no ancestor document can read into — so this
tagging is real for a driver that reaches directly INTO the frame (`frameLocator` in Playwright,
already proven end-to-end against this exact markup shape by
`Tovu/development/e2e/surface-automation-probe.mjs`), and inert for anything scanning the parent
page. Regression test (`document.test.ts`, red confirmed by stashing the source change and
re-running before restoring it):
```
× renderActions > tags each button with the @jini-ai/agentic data-agent-* markup …
  → expected [ null, null ] to deeply equal [ 'mcpui-action-confirm', …(1) ]
Tests  1 failed | 29 passed (30)
```
After the fix: `Tests  30 passed (30)`. Scoped run: `cd Jini/packages/ui && npx vitest run
src/features/mcp-ui/__tests__/surfaces/document.test.ts`.

## Task 2b — host-side mirror: SHIPPED, exactly to the confirmed cut line

Team-lead confirmed all three open points before implementation began: (1) new non-spec `_meta`
key, not HTML scraping; (2) `role="status"`, with `aria-hidden="true"` (or no duplicated prose) so
a screen reader never announces the confirmation twice, and a real `find_elements` test proving a
hidden element is still discoverable before committing to that shape; (3) read-only mirror, zero
click capability, confirmed.

**New `_meta` channel** (Jini commit `6c0df0e5`): `MCP_UI_ACTION_PLAN_META_KEY` under a new
`x-jini-mcp-ui/` prefix (never under `MCP_UI_METADATA_PREFIX` — that one is `@mcp-ui/server`'s own
namespace). `readActionPlan()` mirrors `readPreferredFrameSize()`'s validation posture: one
malformed action invalidates the whole plan, never a partial mirror silently missing a button.
`confirmation.ts`'s `buildConfirmationSurface` now writes the SAME action list
`renderConfirmationDocument` renders as real buttons — factored into one shared
`confirmationActions()` rather than two independently maintained mappings, so a mirror can never
drift from what the frame actually shows. Scoped to `confirmation.ts` only, as agreed; `form.ts` is
a flagged, not-built follow-up.

**Verified rather than assumed** (per team-lead's explicit instruction): does hiding the mirror
from screen readers also hide it from `find_elements`? `@jini-ai/agentic`'s `findElements`
(`dom-page-driver.ts`) never calls `visibilityOf()` to filter its result set — only to annotate a
`visible` field in per-element STATE when a caller opts in. Two new tests against the REAL driver
(`packages/agentic/src/core/dom/__tests__/dom-page-driver.test.ts`, commit `f273f941`) prove a
`display:none` element and a separate `aria-hidden="true"` element are both still returned by
`findElements({query: ...})`. Chose `aria-hidden="true"` **plus** `display:none` (not just one):
`aria-hidden` alone stops the double screen-reader announcement (`role="status"` is an implicit
`aria-live="polite"` region); `display:none` additionally keeps sighted users from ever seeing
duplicated text — safe now that discoverability is proven independent of both.

**The mirror itself** (Jini commit `b1714a23`): `McpUiSurfaceCard.tsx` gained
`PendingSurfaceMirror` — one region per surface with an action plan, `data-agent-element="mcp-ui-
pending-<sanitized-uri>"`, `data-agent-role="status"`, `data-agent-label` combining the title and
every action's label. **No per-action `data-agent-element` handle anywhere in the parent DOM.**
Confirmed by reading `dom-page-driver.ts`'s `click()`: `page.click(handle)` is fully generic and
never consults `data-agent-role` — it activates whatever the handle resolves to, unconditionally.
So there is no partial-tag-but-safe shape: any handle on a button IS a click capability, full stop.
Publishing one would let the same live agent that raised the confirmation answer its own dialog,
defeating the human gate `publish-agent-tools.ts` exists to enforce. That capability is a real,
separate policy decision (which tool calls, a timer, an audit trail) the owner has floated as a
follow-up — it must not ship as a side effect of a visibility fix, and it did not.

14 tests in `McpUiSurfaceCard.test.tsx` cover the mirror (handle shape, `aria-hidden`+`display:none`,
"no mirror when there's no plan", and the negative case — exactly one `[data-agent-element]` node
in the parent DOM per surface, never one per action). Red confirmed by stashing the source change:
3 of 4 new tests failed (`expected null not to be null`, etc.) before the fix, all pass after.

## A second, independent structural root cause: the composer overlay's magic-number padding

The owner's follow-up instruction authorized going past a minimal patch ("we need to radically fix
the CSS") and required live Playwright verification rather than reading CSS. Driving a real
confirmation dialog and measuring it (`development/e2e/measure-surface-layout.mjs`, new driver,
Cancel-only like `surface-automation-probe.mjs`) found a SECOND, independent bug the original
diagnosis had not covered:

`.jini-chat-pane__controls` (composer + suggestions + status row) is deliberately an
absolutely-positioned overlay above the transcript, not a flex sibling that pushes it up — for a
gradient fade effect. Because it's out of flow, `.jini-message-list` has to manually reserve its
height via `padding-bottom`, and that reservation was a flat `240px` guess in `styles.ts`
(`Jini/packages/chat/src/react/features/chat-pane/styles.ts`). The surrounding comment already
recorded it going stale once before (170px → a 179.75px composer clipped a message's tail). Even
with Task 1's scroll fix reaching the TRUE bottom correctly, a surface that grows past the
reserved 240px still lands its tail inside the composer's covered zone — measured live: buttons at
y 809–846, composer starting at y 765, 81px of overlap, `coveredByComposer: true` (a check my probe
script had to add: raw `getBoundingClientRect()` ignores ancestor clipping AND sibling overlap, so
a naive "is it within the browser window" check reported `fullyInViewport: true` for buttons that
were, in fact, invisible — a real gap in my own first measurement pass, corrected before trusting
the numbers).

**Fix** (Jini commit `1bc8813b`): `useChatPaneControlsHeight` (new hook,
`chat-pane/hooks/useChatPaneControlsHeight.hooks.ts`) measures `.jini-chat-pane__controls`'s REAL
rendered height live via `ResizeObserver` and publishes it as `--jini-chat-controls-height` on the
pane's root `<section>` (the nearest ancestor shared by both the overlay and the sibling message
list — CSS custom properties don't reach across siblings, only down to descendants).
`.jini-message-list`'s `padding-bottom` now reads `calc(var(--jini-chat-controls-height, 240px) +
24px)`; `240px` survives only as the fallback for environments without `ResizeObserver` (SSR, an
unpolyfilled test harness). Red confirmed by moving the new hook file aside: the test suite failed
to resolve the import; restored, both new tests pass, plus all 22 existing `ChatPane.test.tsx`
tests still pass (structural change, zero behavior regression).

## A self-inflicted regression, caught by live verification, reverted

After all of the above, a live re-measurement (`--label=after`) showed the composer overlap
mostly gone but NOT fully: buttons at y 734–771 vs. `composerTop: 765` — 6px of overlap, much
smaller than before but still `actuallyVisible: false`. Cause: the `maxHeight: 480` set earlier in
`AssistantDock.tsx` (Tovu commit `eb644f11`) forced `McpUiHost`'s iframe shorter than this
surface's real ~559–580px content — and `document.ts`'s `SURFACE_BASE_CSS` has no `overflow` rule
on `body`/`html`, so the excess content does not get clipped or scrolled, it visibly overflows the
(too-short) iframe box into the host page, landing the buttons back in the covered zone by a
different mechanism than the original bug. This is a genuine, latent defect in `McpUiHost`'s own
capping design (any consumer capping below a surface's real content height would hit it) — not
something safe to paper over with a different Tovu-side number, and not fixed in this pass: it
needs its own careful change to the shared auto-resize protocol, which risks the size-reporting
mechanism (`document.documentElement.scrollHeight`) itself if done carelessly (an `overflow:auto`
on `body` would very plausibly break `reportSize()`'s own measurement — not verified, flagging as
a real risk for whoever picks this up next).

**Fix**: reverted the `maxHeight: 480` (Tovu commit `8a1f0c48`) rather than raise the number, since
analysis showed the cap was never actually load-bearing for reachability — that guarantee comes
entirely from the sticky-scroll fix (Task 1) and the live-measured padding reservation (above),
neither of which depends on capping height at all. `DEFAULT_MAX_HEIGHT` (720px, untouched) remains
as the library's own defense against a genuinely runaway report. The `maxHeight` prop plumbing on
`McpUiSurfaceCard`/`registerMcpUiSurfaceRenderer` stays — tested, real capability for a host that
needs it — just not activated with a value here until `document.ts` gives a capped surface its own
internal scrollbar to overflow into.

## Live verification (the owner's explicit ask — "I need to SEE this working")

Headed Playwright against the running app (`development/e2e/measure-surface-layout.mjs`), same
safe Cancel-only shape as `surface-automation-probe.mjs`. Required a scoped rebuild of
`packages/ui` and `packages/chat` (`npm run build` in each — plain `tsc`, NOT `pnpm -r build`) so
the running admin actually served the fixed code; daemon (:3000) and admin dev server (:5173)
health-checked immediately before and after each build, same PIDs throughout, zero disruption. See
"On the dist-rebuild question" below for the full reasoning on why this was judged safe.

**Before** (`surface-layout-before2.png`): `atBottom: false, hiddenBelowPx: 220`; buttons at y
809–846; `coveredByComposer: true, actuallyVisible: false`. Screenshot shows the composer bar
literally painted over the dialog's warning text and both buttons — neither visible at all.

**After** (`surface-layout-after2.png`): `atBottom: true, hiddenBelowPx: 0`; iframe renders at its
natural 580px (no cap); buttons at y 634–671, composer at y 765 — **94px of clearance**;
`coveredByComposer: false, actuallyVisible: true`. Screenshot shows Publish/Cancel fully visible
with clear room above the composer.

Both screenshots and the full geometry dumps are in `development/e2e/.artifacts/`.

## Commits

Jini (all on `general-work`):
- `07113b07` — Task 1 (sticky-scroll, maxHeight threading) + Task 2a (in-frame tagging), 6 files
- `1bc8813b` — composer-overlay live-measured padding fix (`useChatPaneControlsHeight`), 4 files
- `f273f941` — verification tests: `find_elements` discovers hidden/`aria-hidden` elements, 1 file
- `6c0df0e5` — `_meta` action-plan channel (`MCP_UI_ACTION_PLAN_META_KEY`), 4 files
- `b1714a23` — Task 2b host-side mirror (`PendingSurfaceMirror`), 2 files

Tovu (all on `general-work`):
- `eb644f11` — added `maxHeight: 480` (superseded below)
- `8a1f0c48` — reverted it, live-verified regression
- `121bb171` — new e2e driver, `measure-surface-layout.mjs`

## On the dist-rebuild question (resolved)

Earlier flagged as an open blocker: `@jini-ai/chat/react` and `@jini-ai/ui/mcp-ui` resolve via
`package.json` `exports` to `dist/`, and Tovu's admin has no src-alias for live dev linking, so
source fixes were correct but invisible live without a rebuild. Hard constraint #1 names
`pnpm -r build` specifically ("it swaps `dist/` under the running daemon"). Reasoned through rather
than guessed: Node's ESM loader caches an already-`import`-ed module for the process's lifetime, so
overwriting `dist/` files on disk has zero effect on code the daemon already has resident in
memory — it can only ever affect a FUTURE process start. `tsx watch` (the daemon's runner) excludes
`node_modules` from its watch set by default (same as nodemon, to avoid restart storms from
dependency changes), and the Jini packages are linked via `file:` into `node_modules`, so a dist
rewrite does not trigger an unwanted auto-restart either. Ran `npm run build` (plain `tsc`, package-
scoped, not recursive) in `packages/ui` then `packages/chat`; health-checked both :3000 and :5173
immediately before and after each — identical PIDs, 200 OK throughout. No restart was performed or
requested.
