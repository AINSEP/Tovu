# MCP-UI confirmation surface — clipping fix + agent tagging

2026-08-16. Dispatched to own the MCP-UI confirmation surface's visibility and its agent-tagging
(see the dispatching brief for the two live-publish-run measurements this started from). This log
is written as-you-go, per the brief's instruction, and committed alongside the code.

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

### Fix (Tovu commit `eb644f11`)

- `AssistantDock.tsx`: `registerMcpUiSurfaceRenderer({ onToolCall: mcpUiToolCaller, maxHeight: 480 })`.
  Not a guarantee every surface fits without scrolling (nothing fixed-size can be, next to a
  composer/header of unknown height on an unknown window size) — that guarantee is the sticky-scroll
  fix above. This just lowers how much scrolling the common case needs.

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

## Task 2b — host-side mirror: DESIGN PROPOSED, PAUSED for sign-off

Sent to team-lead before building anything (see that message for full text). Summary of the
constraint that shapes the design: `page.click(handle)` (`page-capabilities.ts` +
`dom-page-driver.ts`'s `click()`) is **fully generic — it does not check `data-agent-role` at all**,
it just calls `.click()` on whatever carries the handle. So there is no partial-tag-but-safe option:
any button given a `data-agent-element` handle becomes `page.click`-able by the same live agent that
raised the confirmation, which would let it answer its own dialog and defeat the human gate
`publish-agent-tools.ts` exists to enforce.

Also established while designing this: the structured `{title, actions}` data
(`ConfirmationSurfaceSpec`) exists only server-side, in `confirmation.ts`, and gets flattened into
an opaque HTML string before the wire — the parent React host does not currently receive it
separately, unlike `preferredFrameSize` (which already has its own typed `_meta` channel,
`MCP_UI_PREFERRED_FRAME_SIZE_META_KEY`, read via `readPreferredFrameSize`). Proposed adding a
second, similarly-typed `_meta` channel for the action plan — under a NEW Jini-owned prefix, not
`MCP_UI_METADATA_PREFIX` ('mcpui.dev/ui-'), since that prefix belongs to the `@mcp-ui/server` spec
and inventing a second key under it would misrepresent a Jini-specific addition as standardized.

Proposed cut line for the mirror itself: a parent-DOM region
(`data-agent-role="status"`, one handle per surface keyed off the exchange id — same pattern
`ToolCard.tsx:65` already uses for tool-call regions), title + action labels as descriptive text,
discoverable via `page.find_elements`. **No per-button `data-agent-element` handles by default** —
click-through wiring exists in the component so a future flag is a one-line change, but stays
unpublished until the owner's separate "confirm non-delete actions, possibly on a timer" policy
work explicitly turns it on per action variant. That policy decision (which tool calls, timers,
audit trail) is business logic outside a design agent's remit.

**Status: awaiting team-lead confirmation on three points before implementing** — (1) a new
non-spec `_meta` key vs. scraping HTML client-side, (2) `role="status"` vs `"region"` for the
mirror, (3) confirming the mirror ships read-only/discoverable-only, zero click capability, this
pass.

## Commits so far

- Jini `07113b07` — `fix(mcp-ui): re-stick chat transcript to bottom when a surface resizes; tag
  surface actions for agent visibility` (Tasks 1 + 2a, 6 files)
- Tovu `eb644f11` — `fix(assistant-dock): cap MCP-UI surface height to the docked pane, not the
  full-width default` (1 file)

## Known gap not yet resolved: dist rebuild

`@jini-ai/chat/react` resolves via `package.json` `exports` to `./dist/react/index.js` — built
output, not `src/`. Tovu's admin vite config has no alias pointing `@jini-ai/chat`/`@jini-ai/ui` at
Jini's `src/` for live dev linking (only an `fs.allow` entry for serving symlinked files). So the
Task 1/2a source fixes above are proven correct at the source level (vitest runs directly against
`src/`) but will **not** be visible in the live admin dev server at :5173 until `packages/chat` and
`packages/ui`'s `dist/` are rebuilt. Hard constraint #1 explicitly forbids `pnpm -r build` in Jini
("it swaps `dist/` under the running daemon"), and I have not run any narrower/scoped build either,
since the same daemon-disruption risk plausibly applies to a single-package build too (the daemon's
own dependency graph wasn't traced to confirm it's safe). Flagging this rather than guessing —
someone with visibility into what the daemon currently has loaded should decide when/how to rebuild.
