# Recon: App-wide chat FAB for the Tovu desktop app

Software Architect (Direct), read-only recon. 2026-09-12.

> **Erratum (2026-09-13):** This report is a dated historical snapshot and its body is left
> unchanged below. `apps/desktop/main.js` and `one-chat-fab-wiring.test.js`, as named throughout,
> have since been renamed to `apps/desktop/main.ts` and
> `apps/desktop/src/renderer/one-chat-fab-wiring.test.ts` (commit `95206dd9`). Read every `.js`
> reference to those two files below as historical.

## Correction to the dispatch's premise (important — changes the whole shape of the answer)

The dispatch assumes sites are shown via `WebContentsView`/`BrowserView`/`<webview>` and warns that
native views paint above the shell's DOM, so a host-page FAB "cannot overlay them." **That trap does
not apply here.** The Sites Home window (the default boot mode) embeds each open site as an Electron
`<webview>` tag — a real DOM element, laid out and composited by the ordinary page (Chromium's guest
view is OOPIF-based in this Electron version, not a separate native surface). Proof is in the code
itself: `apps/desktop/src/renderer/App.tsx:166-183` documents that a previous host-page FAB
(`position: fixed`, same corner, same `z-index` as the guest's own in-webview FAB) **composited on
top of the guest and swallowed its clicks** — i.e. normal CSS stacking already governs a
webview-vs-host FAB. The real constraint is not Electron's compositor; it's a **product decision the
owner already made and locked with a regression test** (below).

## What exists today (apps/desktop)

- **Shell**: Electron 43, `apps/desktop/main.js` (~1400 lines). Renderer is React 19, ported from a
  sibling project, Tovu-Runner (`/Users/la/Programming/Tovu-Runner`) — its Projects/fleet UI, not a
  Tovu fork. Three boot modes; **Sites Home is default since commit `a53c80df` (2026-09-06)**:
  one window, `App.tsx`, with a horizontal `TopNav` (Sites, Templates[hidden], **Marketplace**,
  Tasks[hidden], Media, Activity, Updates, Deploy[hidden], Diagnostics[hidden], Keys[hidden],
  **Settings[hidden]**, Account[hidden]) plus a `TabStrip`, one tab per open site
  (`contracts/sections.ts:36-49,88-219`). Only the `projects` nav item is enabled
  (`App.tsx:237,309`, guarded by `marketplace-nav-wiring.test.js`).
- **Site embedding**: `<webview>` per open tab (`App.tsx`'s `SiteWorkspace`, `main.js:420-482`
  `openSitesHomeWindow`, `webviewTag: true`). Own session partition per site
  (`desktop-auth.js`/`sitePartition`), navigation policy enforced via
  `registerGuestNavigationPolicy` (`main.js:908-935`).
- **Per-site chat (the "right chat")**: lives *inside* the webview — it's Tovu's own admin
  `ChatFab`/assistant (`apps/admin/src/components/ChatFab/`), backed by that site's own
  `tovu serve` agent daemon (`apps/website/src/server/inbound/assistant/agent-daemon-server.ts`) and
  that site's content DB. Confirmed via `sites-mcp-registration.js`/`sites-mcp-server.js`/
  `bin/mcp-bridge.mjs` (`main.js:604-650`): the desktop shell registers an MCP tool server with each
  booted site so *that site's* assistant can also reach a handful of desktop verbs (list/add
  websites, reveal a folder) — one-directional, desktop→site-assistant, not a fleet-wide chat.
- **App-wide "left chat" (Runner operator agent) — fully speced, half-wired, deliberately NOT rendered
  today:**
  - `contracts/sections.ts`: every nav section already declares its own `desktop.*` tool surface —
    `desktop.navigate`, `desktop.create_site`, `desktop.project.{list,start,stop,restart,open,delete}`,
    `desktop.generate_{image,video}`, `desktop.activity.tail`, `desktop.migration.*`,
    `desktop.settings.{get,set}` (Settings section, hidden), and **Marketplace is registered with
    `tools: []`** — i.e. marketplace itself is explicitly "not built yet," confirmed by
    `marketplace-nav-wiring.test.js:50-55` and no other marketplace code anywhere in the app
    (`grep` turned up only the nav registration + icon).
  - `contracts/workspace-chat.ts`: full IPC contract — `workspace:chat:{start,reattach,detach,stop,
    status,event,navigate}` — including MCP-name mapping (`desktop.project.list` →
    `desktop_project_list`) for exposing these verbs to an agent CLI.
  - `renderer/workspace-chat-transport.ts` (423 lines) + `preload/preload.mts:71-103`: **fully
    implemented and wired**, `ChatTransport` over `ipcRenderer.invoke`/`contextBridge`, ready to
    drive `@jini-ai/chat`'s `ChatPane`.
  - `App.tsx:1057-1189` `WorkspaceChatPane`: a **fully built** chat panel component (conversation
    list, delete-confirmation, folder-drop-to-path, attachment upload, model/reasoning picker) — but
    **zero call sites**. Not rendered anywhere in the current tree.
  - **What's missing**: the main-process half. `main.js` has no `ipcMain.handle(WORKSPACE_CHAT_
    CHANNELS...)` anywhere — confirmed directly by `App.tsx:170-172` and by
    `one-chat-fab-wiring.test.js:75-87`, which is a **tripwire test that currently asserts this gap
    exists** ("the fleet chat still has no main-process half — if this fails, revisit where the
    workspace chat is reached from"). No `RunLifecycle`/`AgentExecutor`/`ToolExecutor`/
    `DelegatedToolBridge` construction exists in Tovu's `apps/desktop` at all today.
- **Reference implementation exists, unported**: Tovu-Runner's own `src/main/runner-daemon.ts` (372
  lines) is exactly this — a co-located Jini daemon (`@jini-ai/daemon`'s `createAgentExecutor`,
  `createDelegatedToolBridge`, `createRunLifecycle`, `createToolExecutor`) plus `runner-tools.ts`
  (verb implementations + `requiresOperatorConfirmation` gating for destructive tools) plus
  `runner-agent-prompt.ts` (fleet-operator system prompt). Tovu's `apps/desktop` ported Tovu-Runner's
  **renderer and contracts**, not its **main-process daemon** — that's the missing piece, not a
  design gap.
- **Owner's explicit, tested decision — `one-chat-fab-wiring.test.js`**: *"there should only be one
  chatfab and not two (whether disabled or not)."* A second floating host-page FAB was tried, caused
  the click-swallowing bug above, and was deliberately removed. The test comment states the intended
  future shape outright: *"When a workspace-level chat is actually built it should be a PANEL
  reachable from this app's own chrome, not a second floating button competing with the guest's."*
  Any recommendation that reintroduces a floating host FAB fights this test and this decision.
- **Conversation storage**: app-level, not per-site — `App.hooks.ts:829` `useRunnerConversations` +
  `persistable-messages.ts`, backed by `database === 'sqlite'` (`App.hooks.ts:1111,1204`), i.e. a
  Runner/desktop-level store, independent of any site's `content.db`. Good: this is exactly what's
  needed for conversation continuity across site switches.
- **Model/provider/BYOK config**: not yet located at the desktop level in this pass (out of budget to
  chase fully) — the picker's model/reasoning selection is passed per-turn via `ChatPaneRunContext`
  (`App.tsx:1052-1055`), so BYOK/provider config for the fleet agent itself is a separate open
  question from wiring the transport.

## Recommendation

**Build the missing main-process half of the already-speced "left chat," and surface it as a docked
panel toggled from `TopNav`/`SettingsControl` chrome — never a second floating FAB.** Concretely:

1. Port `Tovu-Runner/src/main/runner-daemon.ts` + `runner-tools.ts` + `runner-agent-prompt.ts` into
   `apps/desktop/src/main/` (new directory), adapted to Tovu's own `openSites`/`project-ipc.js`
   surface instead of Runner's. Add `@jini-ai/daemon` and `@jini-ai/core` to `package.json`
   (`@jini-ai/protocol` is already a devDependency).
2. Register `ipcMain.handle` for all six `WORKSPACE_CHAT_CHANNELS` in `main.js`, backed by that
   daemon. This alone flips `one-chat-fab-wiring.test.js`'s tripwire — which is correct and expected;
   that test's own comment says to revisit the entry point at that point, not to keep it failing.
3. Give `WorkspaceChatPane` a real render path: a toggle in `TopNav` (a new icon-only button, same
   pattern as `SettingsControl`) that opens it as a **docked `<aside>` panel** (it already renders as
   one, `App.tsx:1096`) alongside `<main>`, not layered over the `<webview>`. This satisfies "one FAB"
   literally — the panel isn't a FAB at all — and keeps the two chats visually and spatially distinct
   (top-nav-launched panel vs. the guest's own corner button).
4. Wire `desktop.navigate` to the existing `selectSection`/`setActiveTab` handlers already in
   `App.hooks.ts` (trivial — the tool taxonomy already names the right verbs).
5. Confirmation/safety: reuse Tovu-Runner's `requiresOperatorConfirmation` pattern from
   `site-assistant-tools.ts` for destructive verbs (`desktop.project.delete`, future
   `desktop.marketplace.install`) — render the existing inline confirm pattern the codebase already
   uses (`App.tsx:1126-1147`'s conversation-delete confirm, `commit 204f3e6`'s project-delete
   precedent) rather than `window.confirm` (blocks IPC in this renderer, per that code's own note).
6. Marketplace itself is **unbuilt product surface**, not just unwired — no install pipeline, no
   registry, nothing beyond the nav stub with `tools: []`. Wiring the chat does not give the agent
   anything to call there until that ships separately; scope it out of this slice explicitly.

**Size: M.** The transport/contract/panel/preload layers are done. Remaining work is the daemon port
(~400-600 lines adapted, close copy of a working reference), `ipcMain` registration (~50-100 lines in
`main.js`), one new `TopNav` toggle + panel-mount wiring in `App.tsx` (~50 lines), and a
`package.json` dependency bump. Estimate 8-12 files touched, most of them new
(`apps/desktop/src/main/runner-daemon.ts` and siblings) rather than edits to guarded existing ones.

**Open decisions for the owner:**
- Exact panel trigger affordance/placement in `TopNav` (icon next to `SettingsControl`? its own
  slot?) — no existing mock to match.
- Whether the fleet agent's model/provider/BYOK config is configured per-conversation only (current
  `ChatPaneRunContext` picker) or needs a persisted app-level default — not chased down this pass.
- Whether `desktop.settings.{get,set}` (currently hidden/unbuilt) should be scoped into this slice or
  deferred with Marketplace — both are stubs today.

Context used: moderate (~45K tokens of this budget).

## Addendum 2026-09-12: full-height right panel + one-chat-vs-two

### 1. Layout — where the panel would actually sit

`apps/desktop/src/renderer/app.css:144-158` (`.app`): `display:grid;
grid-template-rows: auto auto minmax(0,1fr); grid-template-columns: minmax(0,1fr) auto`. Row 1 =
TopNav, row 2 = TabStrip, row 3 = content. **Both `.topnav` (`app.css:163`) and `.tabstrip`
(`app.css:395`) declare `grid-column: 1 / -1`** — they span *both* columns, sitting *above* the
two-column split entirely. The existing (unused, kept-for-later) `.runner-chat-pane` rule is scoped
to `grid-row: 3; grid-column: 2` (`app.css:1364-1383`) — i.e. it only occupies the *content* row,
**below** TopNav and TabStrip, not full height. That's true whether what's on screen today is the
per-site `AssistantDock` rendered inside the webview (which fills all of row 3/column 1, per
`App.tsx`'s `SiteWorkspace`) or, if `WorkspaceChatPane` were ever mounted as-is, Runner's own pane —
neither reaches "from the title bar down." No `titleBarStyle`/`frame:false` is set anywhere in
`main.js`'s `BrowserWindow` configs, so the OS-native title bar sits above the whole `.app` box; "full
height from the title bar" is simply `.app`'s own `height: 100%` (already set). The per-tab "URL bar"
(`workspace__url`, `App.tsx:547`) is not global chrome either — it's part of `.workspace__bar` inside
each `SiteWorkspace`, itself confined to row 3/column 1.

**To get a true full-height right column beside TopNav/TabStrip/URL bar**: wrap the existing three
top-level children (`TopNav`, `TabStrip`, `<main>`) in one new container (e.g. `.app__shell`) that
becomes column 1 of a *new* outer grid on `.app`; the chat pane becomes column 2, spanning the full
height on its own (a single-row outer grid, so no `grid-row` juggling needed). Critically, `.topnav`,
`.tabstrip`, and `.main`'s own rules need **no changes** — they'd describe positions inside
`.app__shell` exactly as they do today, just no longer inside `.app` directly. This is a contained,
low-risk CSS change (est. ~20-30 lines in `app.css` + one wrapper `<div>` in `App.tsx`), not a
rewrite — the existing `.runner-chat-pane` block just needs its `grid-row: 3` dropped (single row in
the new outer grid) and its `grid-column: 2` kept.

**Resize**: not built today. The pane's width is a static CSS formula, `min(27rem, 40vw)`
(`app.css:1375`), with a doc comment explaining it's chosen so the pane "SQUEEZES the content rather
than covering it" (`app.css:152-155`) — there's no drag handle anywhere in this app's CSS or
components. A real resizer (pointer-drag splitter, clamped min/max, width persisted somewhere) is new
work, not a wire-up — small (~60-100 lines) but genuinely new.

**Collapse**: already free by construction. Column 2 is `auto`-width and *"collapses to zero width
when the pane is not rendered — no layout shift when it closes"* (`app.css:152-153`'s own comment).
Collapsing is just "stop rendering the panel component"; no separate collapse state/animation is
structurally required.

**480px min width**: `main.js:449-457` sets `minWidth: 480` on the Sites Home window, with a comment
noting the owner chose it "after they verified the previous 960 in the real window" and that "layout
between 480 and 960 has not been measured" *at all* — i.e. even without a chat panel. The existing
(unused) `40vw` cap would give a ~192px-wide pane at exactly 480px width, leaving ~288px for content —
plausible, but unverified for any content, let alone content minus a full-height panel next to a
site's own admin sidebar. This needs the owner's explicit choice (a hard floor width to auto-hide the
panel below, or a widened app `minWidth` when the panel is open), verified live the same deliberate
way 480 itself was chosen — not inferred from the formula alone.

**Behavior on All / Marketplace / Settings / no site open**: once the panel is restructured as a
sibling of `.app__shell` rather than nested inside `.main`, it becomes structurally independent of
`inSites`/`showSiteTab`/`activeTab` — so it can render identically regardless of which section or tab
is active, including the empty-state All tab (`NoWebsitesYet`, `App.tsx:937-946`) with zero sites
ever created. One state needs an explicit decision: **`expanded` mode** (a site's webview filling the
whole window, `App.tsx`'s `{!expanded && <TopNav.../>}` / `{inSites && ... !expanded && <TabStrip/>}`)
hides both TopNav and TabStrip already — the panel likely should hide there too for consistency
("beside TopNav and TabStrip" implies it goes away when they do), but that's the owner's call, not
inferred from existing code.

### 2. One chat vs. two

**Embed signal — exists, precedented.** `apps/desktop/src/speech/preload-speech.cjs:7`: *"`window
.tovuVoice` existing at all is also the renderer's own capability signal"* — the admin's voice-input
composer already gates on `typeof window.tovuVoice !== 'undefined'` to change its own UI only when
running inside the Tovu desktop webview (confirmed via `applyGuestWebPreferences`,
`main.js:472-478`, which explicitly assigns the shell's speech preload to every guest webview). The
exact same pattern — a preload-injected flag the admin checks at mount — can gate hiding
`ChatFab`/`AssistantDock` (`apps/admin/src/components/ChatFab/`, `apps/admin/src/components/
AssistantDock/AssistantDock.tsx`) when embedded. Recommend a dedicated flag (e.g.
`window.tovuDesktopEmbedded`) rather than overloading `tovuVoice`'s presence, since voice
availability and "am I embedded" are different facts that could diverge later.

**Reach — shell can talk to a site's own daemon directly, without building a second agent runtime for
that case.** `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:9-10` documents a
plain HTTP+SSE API on the site's own loopback port: `POST /api/runs` (start), `GET /api/runs/:runId/
events` (native `EventSource`/SSE), `GET /api/runs/:runId` (status), `POST /api/runs/:runId/cancel`.
The desktop shell **already** authenticates to exactly this origin per site — `desktop-auth.js`'s
partition-scoped cookie jar, used today for boot-session redemption (`main.js`'s `startSiteBackend`/
`ensureSiteSession`, via Electron's `net` module bound to `session.fromPartition(partition)`). The
same mechanism can `net.request` those routes for a site-scoped chat turn; main would need to parse
the raw SSE chunked response itself (no browser `EventSource` in the main process), but
`readSseFrames` (referenced in `apps/admin/src/lib/assistant-transport.ts:33`) is documented as a
pure, dependency-free parser — portable to a main-process consumer.

**What the reverse option (site's agent does everything) actually gets you today — smaller than it
sounds.** The site's assistant, when active, already has *some* `desktop.*` reach via the existing
`sites-mcp-registration.js`/`bin/mcp-bridge.mjs`/`sites-mcp-tools.js` seam (`main.js:604-650`). But
`sites-mcp-tools.js:1-51` shows that seam implements exactly **three** verbs today — `listSites`
(read-only), `addSitePointerTool`, `revealSiteFolder` — not the `desktop.*` taxonomy `sections.ts`
declares (project lifecycle, media generation, activity, settings, etc. are all still nameless
stubs, on either side of the fence). So "the site's agent can already reach desktop tools" is true
for 3 verbs and not yet true for the rest, regardless of which architecture wins.

**The gap the reverse option can't close**: on the All tab, Marketplace, Settings, or with zero sites
ever created (`NoWebsitesYet`), there is no active site daemon to proxy to, and picking an arbitrary
"last used" site to answer an app-level question would be semantically wrong — and breaks outright on
a fresh install, the one state the Sites-Home default (`a53c80df`, 2026-09-06) is explicitly built to
support.

**Options:**
- **A — Full app-level daemon for every turn** (port `runner-daemon.ts` wholesale; site-scoped turns
  get site context as tool arguments rather than routing to that site's own daemon). Simplest mental
  model, but re-derives read access to a site's own DB from outside its process — friction against
  this codebase's explicit one-writer-per-`content.db` discipline (`main.js`'s own extensive comments
  on avoiding two writers over one sqlite file). Not recommended for site-scoped turns.
- **B — Hybrid (recommended)**: a minimal app-level Runner daemon answers turns when no site is the
  addressee (All/Marketplace/Settings/no-site — exactly `desktop.navigate` plus whatever `desktop.*`
  verbs get scoped into this slice); a site-scoped turn (a site tab is active) is proxied straight to
  *that* site's own `agent-daemon-server`, which already carries `desktop.*` reach via the existing
  sites-mcp seam. One shell-level panel, one IPC contract (`WORKSPACE_CHAT_CHANNELS` as already
  speced); `main.js` picks the backend per turn from current nav state (`inSites && activeTab !==
  null`). Keeps "one chat" true as a single transport/UI while not duplicating each site's own
  tool/session/DB access.
- **C — Reverse/site-only**: never build an app-level daemon; always proxy to a site's daemon,
  nominating a default/last-used site for app-level states. Rejected — breaks on zero sites, and
  makes "what does Settings do" depend on an unrelated site's health.

**Pick: B.** It's the only option that satisfies the owner's one-chat rule (single panel, single
transport) without either re-deriving site-owned state from outside its process (A) or breaking the
zero-site/app-level states the current default UI is built around (C).

**Size (revised, incorporating the layout work): M**, roughly 12-16 files, mostly new rather than
edits to guarded files: CSS restructure + wrapper (2 files), new resizer component (1-2 new files),
embed-signal flag + admin-side hide of `ChatFab`/`AssistantDock` (2-3 files in `apps/admin`),
main-process per-turn backend router + SSE-consuming proxy for site-scoped turns (2-3 new files),
minimal app-level daemon port for the no-site-addressee case (3-4 files adapted from Tovu-Runner),
TopNav toggle button (edit to `App.tsx`).

**Blockers / open decisions**:
- 480px-with-panel-open width policy is unmeasured — owner needs to verify live, same as the 480/960
  choice itself was.
- No existing drag-resize primitive in this app to build from — genuinely new, not a port.
- Most `desktop.*` verbs in `sections.ts` have no handler anywhere yet (site-side or app-side) — true
  under every option, not specific to the chosen one.
- Expanded-mode behavior (panel hides with TopNav/TabStrip, or persists) needs an owner call.
- Dedicated embed flag vs. reusing `window.tovuVoice` — recommend dedicated (~5 lines), to avoid
  conflating two different facts later.

Context used: ~74K tokens of this budget.

## Addendum 3 (2026-09-12): tool routing — reusing `@jini-ai/chat` once in the shell

### 1. How the admin's ChatFab reaches its site's agent today

`apps/admin/src/lib/assistant-transport.ts:35`: `const RUNS_URL = "/api/runs"` — plain same-origin
HTTP+SSE: `POST /api/runs` (start, `:1132`), `GET /api/runs/:runId/events` (SSE via native
`EventSource`, `:490`), `GET /api/runs/:runId` (status, `:1167`), `POST /api/runs/:runId/cancel`
(`:1183`) — every call carries `credentials: "same-origin"` (`:715,1135,1167,1186`), i.e. ordinary
cookie auth, same session the admin page itself is loaded under.

**Does a site expose its tools to an external agent?** Not generally. Two narrow, non-reusable
surfaces exist, neither is "any external caller gets the tool set":
- `/api/delegated-tool-calls` (`agent-daemon-server.ts`, referenced at `:1038`): *"whose only
  legitimate caller is this run's own spawned `jini-mcp`"* — scoped to that run's own spawned
  process, not a general external client.
- The `sites-mcp-*` seam (`apps/desktop/src/sites-mcp-registration.js`, `sites-mcp-server.js`,
  `sites-mcp-tools.js`, `main.js:604-650`) is the *reverse* direction already covered in Addendum
  1/2 — desktop tools exposed *to* the site's agent, not the site's tools exposed outward.

So the only sanctioned way into a site's tools remains: start a run against that site's own
`/api/runs` as an authenticated admin session (Q3 below).

### 2. Client-side vs. server-side tools — and the load-bearing catch

Confirmed split, with file:line: `apps/website/src/assistant/frontend-control-capabilities.ts:8-9`
— `PAGE_CAPABILITIES` (`@jini-ai/agentic`, the `page.navigate`/`find_elements`/`click`/`scroll_to`
family) plus six of `CHAT_CAPABILITIES`'s seven `chat.*` verbs (`@jini-ai/chat/core`,
`chat.reset_conversation` excluded, `:25-34`) plus Tovu's own `admin.capture_screenshot`
(`:43-60`) are **client-side** — executed against the live admin DOM by
`apps/admin/src/App.hooks.tsx`'s `useAgentPageBridge` (`:739-764`), which builds a
`createFrontendSessionBridge` (from `@jini-ai/chat/react`) bound to `contentEl` (the admin's own
mounted `<main>`). Everything else (CMS/content tools, `desktop.*` via sites-mcp) executes
server-side in the daemon's `ToolExecutor`.

**The catch: binding is per-RUN, via a token, not "whatever page is open."**
`agent-daemon-server.ts:444-466`'s `createFrontendControl({ resolveBindToken, ... })` reads a
`frontendBindToken` out of the run's own `contextRef`, **"put there by the admin's
`FrontendSessionBridge` (`apps/admin/src/lib/assistant-transport.ts`)"** (`:448`) at the moment
*that page* starts the run. The comment at `:471-472` is explicit: *"An agent therefore cannot
reach a tab other than the one whose own admin started it."* `:451-453`: a run with **no** bind
token is legitimate but every `page.*`/`chat.*`/`admin.*` call it makes is **"refused by name
rather than hanging"** — an explicit per-call error the agent sees, not a silent omission.

**Consequence for "the ChatPane lives in the shell":** if the shell starts a site-scoped run via a
bare main-process HTTP proxy (no token), every client-side tool call on that run gets refused —
`page.navigate`, `find_elements`, `admin.capture_screenshot`, five of the six live `chat.*` verbs,
all of it. **This is not solved merely by "route the transport to the site's own daemon"** (Addendum
2's Route (a)) — that gets you the *server-side* tools and the sites-mcp `desktop.*` verbs for
free, but DOM tools additionally require the shell to *relay a live bind token sourced from that
site's own still-mounted admin page* into the `contextRef` it sends on `start`. The admin page
never unmounts on tab switch (`App.tsx`'s own doc: *"Open workspaces are hidden with CSS, never
unmounted"*), so the token-holding `FrontendSessionBridge` stays alive — but exposing that live
token out of the guest to the host renderer is new code that doesn't exist today (a small
guest-side addition, e.g. a `postMessage`/preload-IPC channel, in the same family as the existing
speech-preload bridge). Skipping it is a legitimate, honest fallback — "yes, a shell-hosted chat
loses DOM tools on a site-scoped turn, by design, unless this relay is built" — not a caveat to
bury.

### 3. Auth — must proxy through main

Confirmed: `main.js:446-467` (`openSitesHomeWindow`) sets **no** `partition` on the Sites Home
window's own `webPreferences` — it runs on Electron's default session. Each site's `<webview>`
guest, by contrast, is explicitly given `partition={project.partition}` (`App.tsx:613`,
`sitePartition(siteDir)` from `desktop-auth.js`). So the shell's own top-level renderer (where a
shell-hosted `ChatPane` would live) holds none of any site's session cookies — a bare `fetch()`
from there to a site's `/api/runs` is unauthenticated. Must proxy through main, using `net` bound to
`session.fromPartition(partition)` — exactly the pattern `desktop-auth.js`/`main.js`'s
`ensureSiteSession`/`authenticateSiteSession` (`main.js:501-526`) already use for the boot-session
cookie.

### 4. Two routes, compared

**(a) Transport switches endpoint to the active site's own daemon (no tool injection).**
Main proxies `POST /api/runs`/SSE/`cancel` to that site's `agent-daemon-server`, authenticated via
its partition (Q3). Server-side site tools and sites-mcp's `desktop.*` verbs work immediately — the
daemon already owns them. DOM tools work **only if** the bind-token relay above is built; otherwise
they're refused per-call (Q2). Tab-switch mid-run: no problem — the run lives in that site's own
daemon process regardless of shell focus; the shell just detaches/reattaches its subscription,
which is *exactly* what `contracts/workspace-chat.ts:60-68`'s `reattach`/`afterCursor` was already
speced for. Conversation history: naturally splits along the existing seam — a site-scoped
conversation persists via that site's own `/api/assistant/chats` (`apps/admin/src/lib/
assistant-chats.ts:19`, same-origin, per-site), an app-level (no-site) conversation uses the
already-speced Runner-level sqlite store (`App.hooks.ts:1111,1204`). Size: Addendum 2's hybrid
estimate **plus** the bind-token relay (2-4 more files: guest-side token exposure, shell-side
inclusion in `contextRef`, a defined fallback when no token is available yet, e.g. admin page still
mounting).

**(b) One app-level agent loads the active site's tools as MCP/delegated tools.** Strictly worse
once the bind-token fact is known: DOM tools *still* require a live, per-run-bound admin-page
frontend session no matter which daemon orchestrates the conversation — there is no way to execute
`page.navigate` without the admin's own DOM, regardless of tool-loading strategy. This route would
*also* require building a wholly new inbound tool-exposure surface on the site (the only near-analog,
`/api/delegated-tool-calls`, is explicitly scoped to "this run's own spawned `jini-mcp`," not a
general caller, per Q1) — new server surface, same DOM-tool problem, plus the conversation-history
and one-writer-per-`content.db` friction already flagged in Addendum 2. Dominated by (a).

**Pick: (a)**, with the bind-token relay treated as required scope if DOM tools (`page.*`,
`admin.capture_screenshot`) must keep working from a shell-hosted turn — flag "accept DOM-tool loss
on shell-initiated site turns" explicitly to the owner as the cheaper fallback if that's tolerable.

### 5. Owner's layout call: overlay, not squeeze

**Feasible, and actually simpler than Addendum 2's grid restructure.** Electron's `<webview>` here is
DOM-composited (established in the main report's correction) — normal `position:fixed`/`z-index`
stacking already governs it, which is precisely how the ORIGINAL bug happened: a host-page FAB
"`position: fixed` on the HOST page... the same corner and the same `z-index`" as the guest's own
FAB, and it *"composited on top of it and swallowed every click"* (`App.tsx:166-176`, restated in
the regression test `one-chat-fab-wiring.test.js:8-10`). That is direct, if unfortunate, proof an
overlay panel CAN sit above the webview and intercept its own input correctly. An overlay needs no
grid work at all — just `position:fixed/absolute` + a `z-index` above `.main`, mirroring the exact
mechanism the old FAB used, done deliberately and full-height this time.

**Click/focus traps — real, and this is the historical bug at panel scale.** Whatever screen region
the panel covers becomes unreachable in the guest underneath it for as long as it's open — no
click, scroll, or keyboard event reaches the covered area of the site view. **This makes hiding the
embedded `ChatFab`/`AssistantDock` (Addendum 2's embed-signal work, `window.tovuVoice` precedent at
`preload-speech.cjs:7`) a hard prerequisite for the overlay layout, not optional polish**: that dock
sits "at the same corner and the same z-index" as the old host FAB did (same file, same lines) —
i.e. bottom-right, which is exactly where a full-height right-side overlay would sit permanently
whenever open. Without hiding it first, the overlay reproduces the shipped bug at full-column scale,
every time it's open, not just once during a debugging session. Focus handoff between the host page
and a webview guest is a known area of Electron/Chromium rough edges (tab order, IME composition) —
worth a real manual pass, not assumed to just work.

**480px min width — same open item, inverted failure mode.** Because overlay never resizes the site
view, the risk flips from "not enough room for both side by side" (Addendum 2's squeeze concern) to
"the panel itself, at whatever width formula is chosen, could cover most of a 480px-wide window,"
since the site's own content keeps its full width underneath. Still needs the owner's explicit,
verified floor/collapse width — same unresolved item as Addendum 2, just a different way it fails.

**All tab / no site open**: unaffected either way — an overlay panel is a sibling layer over `.main`
regardless of what's rendered inside it (grid or empty state), so it needs no special-casing for
those states.

Context used: ~89K tokens of this budget.

## Addendum 4 (2026-09-12): owner-decided architecture

**Supersedes Addendum 3 §4 (the (a)/(b) route comparison) and §5 (the full-overlay recommendation).**
The owner has decided: **one agent only**, app-level, never one per site — it always has the
`desktop.*` tools, and gains the active site's tools "like its own" when a site is showing; a
site's process may still *host and execute* its own tools (it owns `content.db`) but runs no agent
loop/LLM of its own for this chat. **Layout is responsive**: docked (squeezes content) at regular
width, overlay only when the window goes narrow.

### 1. How a site exposes its tools to the single app agent today — and what's missing

**Server-side tools.** `tovu serve` does not run one process — `startAssistantDaemon`
(`apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:547`) spawns the whole agent
daemon (`AgentExecutor`+`ToolExecutor`+`DelegatedToolBridge`+every `/api/*` route in
`agent-daemon-server.ts`) as a **separate supervised child process on its own port**
(`daemonPortOverride`/`getAgentDaemonPortForSpawnEnv`, `:565`) — matching the codebase's own
"assistant tools run in a separate process" precedent. The admin page's `RUNS_URL = "/api/runs"`
(`assistant-transport.ts:35`) is a *relative*, same-origin path, so the main server transparently
proxies to that child; the shell's existing per-site authenticated `net`+
`session.fromPartition(...)` call against `server.adminUrl` (Addendum 3 §3) already reaches it
without needing to know the child exists.

**What's missing**: there is still no *inbound* surface for an external caller (the app-level
agent) to invoke a site's own content/CMS tools by name. The only two existing inbound tool-call
paths are both scoped elsewhere — `/api/delegated-tool-calls` is *"whose only legitimate caller is
this run's own spawned `jini-mcp`"* (`agent-daemon-server.ts:1038`), and `sites-mcp-tools.js`
(`main.js:604-650`) exposes exactly **three** desktop-owned verbs *to* the site, not the site's own
tools *outward*. Building the missing piece is a genuinely new, but narrow, addition: a new
authenticated route (or a proper inbound MCP server, mirroring the pattern `sites-mcp-server.js`
already demonstrates in the opposite direction) in the site's daemon child that the app-level
agent's `ToolExecutor` can call by tool name, using the SAME site-partition cookie the shell already
holds. The site's own tool *implementations* (its `ToolRegistry`, already built for its own
`AgentExecutor`) do not need to be rewritten — only a new caller-facing entry point into them.

### 2. Client-side page tools — the concrete bridge

Electron's **`webview.executeJavaScript(code)`**, called from the shell's host renderer, which
already holds a live ref to each open site's `<webview>` DOM node (`App.tsx`'s `guestRef`,
`:507-510,608-609`) — no new IPC plumbing needed for the call-out itself; `executeJavaScript`
resolves with the executed code's return value (or an inner Promise's resolution), so a single
`await webview.executeJavaScript('window.__tovuAgentBridge.invoke(id, input)')` is a complete
one-shot call/result round trip. Rather than reimplementing DOM automation, expose a small `window`
method inside the admin page that forwards into the **already-built** `createFrontendSessionBridge`
machinery (`pageDriver`/`executors`, `apps/admin/src/App.hooks.tsx:750-754`) — the same
`page.navigate`/`find_elements`/`admin.capture_screenshot` executors the admin's own `AssistantDock`
uses today, just given a second caller. Confirmations/MCP-UI surfaces that need a human-in-the-loop
pause hit a *pre-existing* gap, not a new one: `frontend-control-capabilities.ts:14-23` documents
that this host wires `createToolExecutor` with **no `ExecutionDelegate`**, so any
`requiresConfirmation: true` capability parks forever with nothing to resume it — which is exactly
why `chat.reset_conversation` is filtered out today (`:25-34`). A real confirmation transport is a
prerequisite for confirmable client tools regardless of where the chat UI lives; it does not need
solving to preserve what already works.

### 3. Tool-set switching mid-run, and namespacing against cross-site DB corruption

Tool lists should not be mutated mid-stream — this daemon design already re-sends full context
per turn rather than keeping a continuing CLI session (Tovu-Runner's own daemon doc: *"prior context
reaches the agent through the rendered transcript... resumeSessionId/newSessionId continuation is
deliberately not wired"*), so the natural, lowest-risk rule is: **the active tab's tool set is
captured once at the START of each turn** and stays fixed for that turn's duration; a tab switch
mid-run only affects the *next* turn. Namespacing safety should reuse a principle this exact
codebase already states and follows: `sites-mcp-tools.js:9-16` — *"There is deliberately no notion
of 'the current site' here... every tool that names a site takes a `siteDir`"* — i.e. every mounted
tool call closes over the specific site identity/partition captured at turn start, never a mutable
"whichever tab is active now" lookup, so an in-flight call can never land on a different site's
`content.db` than the one the turn began against.

### 4. Can `tovu serve` run with its agent daemon disabled but still serve tools?

**Not via any existing flag — and it doesn't need to.** `TOVU_ADMIN_ASSISTANT=off`
(`agent-daemon-wanted.ts:26-38`) skips starting `startAssistantDaemon`'s child **entirely** when
external MCP is also unconfigured — *"the daemon owns external-MCP federation too, not just chat"*
(`:26-27`). Since that child is a single process hosting both the LLM loop AND every tool-serving
route together, there is no existing split between "agent off, tools on." The pragmatic answer for
the one-agent model is to not need one: each opened site's daemon child already runs today exactly
as it does now (desktop opens a site, `tovu serve` starts its daemon unless the operator explicitly
opted out) — the app-level agent simply never calls that site's own `/api/runs` conversational loop;
it only calls the new inbound tool route from §1. The existing on/off flag stays what it already is
(a per-site "no assistant at all" switch), untouched by this feature.

### 5. Conversation store

Confirmed, already speced, no change needed: the app-level `useRunnerConversations` /
`database === 'sqlite'` store (`App.hooks.ts:829,1111,1204`) is the one conversation history for
this single agent, independent of any site's own `/api/assistant/chats` (`assistant-chats.ts:19`),
which stays exactly what it is today — the per-site admin's own separate transcript store, unused
by this feature.

### 6. Responsive breakpoint — where it lives, and relative to 480px

Recommend **React state**, not a pure CSS media/container query, as the source of truth: the
docked→overlay switch changes real DOM placement and behavior (grid column vs. `position:fixed`
layer), not just visual reflow, and this codebase already drives exactly that class of
behavior-affecting layout switch from JS state (`expanded`, `appearanceOpen` in `App.hooks.ts`), not
CSS alone. A `ResizeObserver`/`window.resize` listener feeding one boolean (mirrored as a
`data-layout` attribute for CSS to key off of) keeps one source of truth instead of a JS threshold
and a CSS breakpoint that can drift apart. A CSS **container query** (this file already uses one
deliberately, `.onboarding`, `app.css:1160-1182`, precisely because a viewport media query "cannot
see" the chat pane's own width effect) remains the right primitive if any part of the *geometry*
alone should react to available width rather than the raw window — but the mode switch itself
should stay JS-driven.

**Threshold vs. the 480px floor**: `main.js:449-457`'s `minWidth: 480` comment already states
*"layout between 480 and 960 has not been measured"* — true even without a panel. The breakpoint
must sit **above** 480, chosen so the window's absolute floor always gets the simpler overlay mode
(docked mode should never be reachable at the narrowest the window can go) — an exact pixel value is
the owner's call, verified live the same deliberate way 480/960 were chosen, not inferred from a
formula.

### Size and blockers

**Size: M**, similar order to the earlier estimates — new work is: (i) the new inbound
tool-call route in the site's daemon child (§1); (ii) the `window`-exposed client-tool invocation
surface in the admin page + its `webview.executeJavaScript` caller in the shell (§2); (iii)
per-turn tool-set assembly + site-identity-bound call closures in the app-level daemon (§3); (iv)
the responsive docked/overlay toggle (§6, CSS + one `ResizeObserver`-driven boolean) replacing the
earlier full-grid-restructure and full-overlay proposals with one mode-switching component. Roughly
10-14 files, mostly new.

**Blockers**: no confirmation transport exists for any client tool that needs one (§2, pre-existing
gap, not new); the exact docked/overlay breakpoint is unmeasured and owner-decided (§6); most
`desktop.*` verbs in `sections.ts` still have no handler anywhere (unchanged from Addendum 1/2);
the new inbound site tool-call route (§1) needs its own auth/trust review before shipping, given
`sites-mcp-tools.js`'s own extensive trust-declaration discipline is the closest precedent and this
is the reverse, currently-unbuilt direction.

Context used: ~99K tokens of this budget.
