# Can Tovu's assistant read `agentHandle()` / `data-agent-element` tags today?

**Date:** 2026-08-15
**Type:** Read-only investigation, no code changed
**Verdict: YES.** A real, wired, end-to-end path exists from a tagged DOM element in the admin
browser tab to a running CLI agent's tool call, and back. This is not "the code exists with zero
callers" — every link in the chain is a real production call site, not a demo/test-only path.

This gates the owner-requested GitHub repo picker for Static Site publish (replace the manual
`owner`/`repo` inputs). Read the "Recommended approach" section at the end before building it —
there is one important scope split the owner's phrasing does not spell out.

## 1. Is there a real read path? — yes, traced end to end

Seven links, each a real production call site (not a test fixture, not a demo route):

1. **The DOM driver reads/writes the live tree.**
   `/Users/la/Programming/Jini/packages/agentic/src/core/dom/dom-page-driver.ts` — `createDomPageDriver()`.
   - `findElements()` (line 341) — every `[data-agent-element]` under `root`, with handle/role/label.
   - `describeState()` (line 365) — reads the CURRENT value (`control.value`), `checked`, `disabled`,
     `visible`, dropdown `options`.
   - `fill()` / `selectOption()` / `click()` (lines 481–579) — WRITE, through the React-controlled
     prototype setter + `dispatchEvent('input'|'change')`, so React's own state actually updates
     (a plain `.value =` would leave React's tracked value stale — the driver accounts for this).
   - Scoped to a `root` the host passes in, never `document` — confirmed by `App.hooks.tsx:339-342`'s
     own doc: the chat pane's own UI sits outside the scanned subtree on purpose.

2. **Tovu wires this driver to the admin's own `<main>`.**
   `/Users/la/Programming/Tovu/apps/admin/src/App.hooks.tsx:355-379` (`useAgentPageBridge`) —
   `createDomPageDriver({ root: contentEl, pages: agentPages })`, `contentEl` is `App.tsx`'s real
   `<main>` ref. Mounted unconditionally whenever the admin renders (`App.tsx:243,437`), not behind
   a flag.

3. **A live SSE channel carries invocations from the daemon into the browser.**
   `/Users/la/Programming/Jini/packages/chat/src/react/agent-bridge/frontend-session-bridge.ts` —
   `createFrontendSessionBridge()` opens `EventSource('/api/frontend-sessions/stream?capability=page.*...')`,
   executes each `invocation` frame via `executePageCapability(pageDriver, ...)`, POSTs the result to
   `/api/frontend-sessions/:id/responses`. The module's own header names the exact bug this fixed:
   *"`ChatPaneAgentBridgeAccess` declared the contract this satisfies and had zero implementations,
   which is why an agent could reach a tool and the tool could reach nothing."* — i.e. this file is
   the fix for exactly the failure mode this investigation was asked to rule out.

4. **The bind token — which tab a run may drive — is plumbed from browser to daemon, field-name
   matched on both ends:**
   - Client sets it: `AssistantDock.tsx:433` → `resolveRunContext({ bindToken: agentBridge?.bindToken(), ... })`
     → `assistant-transport.ts:561` → `contextRef.frontendBindToken = frontendBindToken` →
     `JSON.stringify(contextRef)` sent as the run-create request's `contextRef` (`assistant-transport.ts:640`).
   - Server reads it: `src/assistant/agent-daemon-server.ts:319-328` — `resolveBindToken` parses
     `request.contextRef` and reads `parsed.frontendBindToken`. Same key, both ends.

5. **The daemon actually registers `page.*` as real, executable tools — not gated shut.**
   `src/assistant/agent-daemon-server.ts:306-345`:
   ```
   const frontendControl = createFrontendControl({
     capabilities: FRONTEND_CONTROL_CAPABILITIES,   // = PAGE_CAPABILITIES + 6/7 chat.* verbs
     resolveBindToken: ...,
     policy: { authorize: () => "allow" },           // explicit ALLOW, not the package's own default-deny
     ...
   });
   for (const registration of frontendControl.toolRegistrations) {
     registry.register(registration);                // same registry that feeds createToolExecutor below
   }
   ```
   `FRONTEND_CONTROL_CAPABILITIES` (`src/assistant/frontend-control-capabilities.ts:55-58`) is
   literally `[...PAGE_CAPABILITIES, ...CHAT_CAPABILITIES.filter(c => !c.requiresConfirmation)]` —
   none of `PAGE_CAPABILITIES`'s seven verbs (`find_elements`, `highlight`, `scroll_to`, `click`,
   `fill`, `select_option`, `navigate`) declare `requiresConfirmation`, so all seven pass the filter
   and get registered unconditionally.

6. **That same registry backs the tool executor the running CLI agent actually calls into.**
   `agent-daemon-server.ts:361` — `createToolExecutor({ registry })` → wrapped and handed to
   `registerDelegatedToolRoutes(app, { toolExecutor, ... })` (`agent-daemon-server.ts:602`).

7. **The delegated-tool-call route is the daemon-side half of the MCP round trip a spawned CLI
   agent (Claude Code, Codex, …) actually uses.**
   `/Users/la/Programming/Jini/packages/http-kit/src/delegated-tools.ts` — `POST /api/delegated-tool-calls`
   → `createDelegatedToolBridge({ lifecycle, toolExecutor })` → `bridge.execute({ toolId, input, ... })`.
   The module's own header: an MCP server subprocess spawned alongside a `claude` run (`mcpJsonInjection`,
   `agent-daemon-server.ts:421`) calls back into the daemon over loopback HTTP with `{runId, toolUseId,
   toolId, input}` — this route decodes it and runs it through the SAME `toolExecutor` that now has
   `page.*` registered. **This is the same mechanism visible from inside this very session** — the
   "jini" MCP server this agent had connected at session start exposed exactly `execute_delegated_tool`
   / `describe_tool` / `search_tools` against "a Jini-registered tool", matching this route's contract
   verb-for-verb. (It had disconnected by the time of this investigation — a session-local fact, not
   evidence against the mechanism; the code path above does not depend on this particular session.)

## 2. Does it have callers, or is this another zero-caller capability?

**Real callers, not zero.** This repo has a documented pattern of fully-built, fully-tested,
never-invoked capabilities (the GitHub App deployment provider; `installAgentPlugin` — see
[[project_tovu_agent_plugin_consumption]]). This is not that pattern:

- `useAgentPageBridge` is called unconditionally from `App.tsx:243`, every admin page load.
- `resolveRunContext`'s `bindToken` is read and sent on every chat run, not behind a flag
  (`AssistantDock.tsx:433`).
- `createFrontendControl(...)` in `agent-daemon-server.ts` is module-scope, evaluated on daemon boot,
  not inside an `if (featureFlag)`.
- `registerDelegatedToolRoutes` mounts unconditionally.

Every link is on the code path a real chat message in the real admin actually walks. There is no
step here that exists only in a test file or an unreferenced export.

## 3. Can it read a value, only existence, or also write?

All three, and they are three distinct, deliberately-scoped capabilities:

| Capability | What it does |
|---|---|
| `page.find_elements` (no `withState`) | Existence + `handle`/`role`/`label` only — "what is on this page and what is it for." |
| `page.find_elements` with `withState: true` | Adds current `value`/`text`/`checked`/`disabled`/dropdown `options`. Credential, payment, and anti-forgery field values are withheld even then (`page-capabilities.ts:43`, enforced by a read guard, not the driver). |
| `page.fill` / `page.select_option` / `page.click` | Writes — through the React-controlled-input setter dance so React's own state actually updates, not just the DOM. |

`role: "region"` (what the just-restored `deployment-static-site-credentials-section` tag uses) and
`role: "field"` (what every input tag on this page uses) are both members of the real, enforced role
enum (`page-capabilities.ts:34`) — `find_elements(role: "field")` is a real, useable filter today.

## 4. Does it work on a client-rendered SPA at all?

Yes, by construction — and this was clearly designed for exactly that case, not retrofitted. The
read path is **not** a server-side scrape of initial HTML (which would find nothing behind a Vite
SPA's empty `<div id="root">`). It is the DOM driver running **inside the already-hydrated React
app, in the user's real browser tab**, pushed live invocations over the SSE channel opened from that
same tab. `App.hooks.tsx:344-346`'s own doc is explicit about this: *"the driver reads
`data-agent-page` off the live DOM on every call, so a navigation actually changes what elements
report themselves as belonging to"* — i.e. it tracks live client-side routing, not a static snapshot.

## 5. Where would it break, if anywhere?

Nowhere structural. The one thing this investigation could **not** verify (read-only, static trace
only, no browser was driven): an actual live round trip — start a real chat run, have it call
`page.find_elements` against a real rendered admin tab, confirm a real response comes back. Every
individual link has its own dedicated unit tests
(`frontend-session-registry.test.ts`, `frontend-capability-tools.test.ts`, `frontend-sessions.test.ts`
in `@jini-ai/daemon`/`@jini-ai/http-kit`; `AssistantDock.hooks.unit.test.tsx` in Tovu) and the field
names match exactly at every client/server boundary crossed, but no live end-to-end browser
verification was performed as part of this pass. If a live smoke test is wanted before building on
top of this, that is the one gap left to close — not a code gap, a verification gap.

## Recommended approach for the repo picker

The owner's directive — drive it via `data-agent-element`/`agentHandle()` tagging, not a bespoke API
tool — applies cleanly to **half** of what "get my profile and fill it in for me and save" needs, and
the other half is a different kind of work the directive isn't really about:

1. **Fetching the user's GitHub repos is a normal server-side feature, not a page-reading problem.**
   Listing a GitHub account's repos requires calling GitHub's API with the user's stored credential —
   `page.*` has no channel for that (it only reads/writes what's already rendered in the DOM), and
   nothing in the owner's request implies replacing normal server-side API work with DOM tricks. This
   still needs an ordinary Tovu feature: a route that calls GitHub's API using the already-saved
   `github-pages` credential token, and a picker UI (`<select>` or list) that renders the results.

2. **Once that picker exists and is tagged, driving it is exactly what `page.*` is for.** Give the
   picker's control(s) real `agentHandle()` tags (a `role: "field"` `<select>`, or one `role: "button"`
   per repo row) the same way every other control on this page already is. Then the assistant reads
   the current picker state via `find_elements(..., withState: true)`, picks the right option via
   `page.select_option`/`page.click`, and the existing Save button (already tagged) finishes the job —
   with zero new agent-specific API surface, matching the owner's instruction precisely for this half.

So: one small new server-side feature (list-repos endpoint + picker UI), tagged the same way the rest
of this page already is, driven by the `page.*` path this report just confirmed is real and wired.
No new bespoke *agent* tool is needed for the driving half — only for the listing half, and that one
was never in question.
