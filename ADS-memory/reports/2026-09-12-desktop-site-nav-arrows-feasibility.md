# Feasibility: back/forward arrows + toolbar reorder for desktop site tabs

Software Architect(Direct) — read-only feasibility check. No edits, no commits, app not launched.

`AI-Dev-Shop/agents/software-architect/skills.md` loaded and confirmed. This is a scoped ad-hoc
feasibility question dispatched directly by the Coordinator, not a spec-pipeline feature — no
`spec-manifest.md`/ADR workflow was invoked; answering the seven questions directly, as directed.

Caveat: `apps/desktop` is mid JS→TS rename by another agent. Everything below is cited by symbol
plus the file:line seen at read time (2026-09-12, this session) — extensions may move under this.

## 1. Where the toolbar lives, and how Reload is wired today

- Component: `SiteWorkspace` in `apps/desktop/src/renderer/App.tsx:483-641`. This is the *only*
  place the toolbar exists — there is no separate `Toolbar.tsx`/`.hooks.tsx` file. All of its state
  (`view`, `reloadNonce`) is declared inline in the `.tsx` with plain `useState`
  (`App.tsx:496,499`), not extracted to `App.hooks.ts`, unlike most other stateful pieces of this
  screen (`App.hooks.ts` holds ~15 other `useState`/`useEffect` blocks for siblings). So the
  "logic belongs in hooks files" convention is not currently applied to this component's own local
  UI state — worth knowing going in, since the natural instinct will be to extract new nav state
  into a hook that doesn't yet exist for this component.
- CSS: `apps/desktop/src/renderer/app.css:534-599` (`.workspace__bar`, `.workspace__views`,
  `.workspace__url`, `.workspace__spacer`, `.workspace__act`). Plain flexbox, **no `order:`
  properties anywhere** — visual order is DOM order. Reordering markup is a pure JSX move, not a
  CSS rewrite.
- Current DOM order in `App.tsx:529-582`: status dot → `.workspace__views` (View admin/View site
  segmented toggle) → `.workspace__url` (the URL text) → `.workspace__spacer` (flex:1, pushes the
  rest right) → Reload button → Open in browser button → expand icon.
- Reload wiring: **not** `webview.reload()`. `App.tsx:497-499,552` — clicking Reload increments
  `reloadNonce`, which is the React `key` on the `<webview>` (`App.tsx:610`). Changing `key`
  unmounts and remounts a brand-new guest node. The comment at `App.tsx:497-499` is explicit that
  this is deliberate: "Remounting the guest IS the reload." Also bumped by the same setter on
  `did-fail-load`/stall recovery (`App.tsx:510,621,634`, via `useWebviewLoadFailure` in
  `App.hooks.ts:665-714`).

## 2. Can back/forward use the `<webview>` API? Does admin's router actually push history?

- The webview type augmentation (`electron-webview.d.ts:1-60`) currently declares only `src` and
  `partition` as recognized JSX props, plus a `did-fail-load` event-shape merge onto
  `HTMLWebViewElement`. It does **not** currently type `goBack`/`goForward`/`canGoBack`/
  `canGoForward`/`did-navigate`/`did-navigate-in-page` — those exist on Electron's real
  `WebviewTag` at runtime regardless of the `.d.ts`, but calling them today needs either widening
  this file's `HTMLWebViewElement` interface merge (same pattern already used for the fail-load
  event) or a local cast. Small, precedented addition — not a blocker.
- **Admin router — checked, and it is real history, not a phantom.** `apps/admin/src/lib/router.ts`
  is a thin adapter over the external `@jini-ai/admin` package (resolved via the `node_modules`
  symlink to `/Users/la/Programming/Jini/packages/admin`). The actual navigation primitive lives in
  `Jini/packages/admin/src/browser/navigation.ts`: `navigate()` calls
  `window.history.pushState(null, '', url)` by default (line 59), only falling back to
  `replaceState` when the caller explicitly passes `{ replace: true }` (line 58) — used exactly
  once in Tovu's own code, for the legacy hash-URL migration (`router.ts:106`, with its own comment
  explaining why that one case must NOT become a Back stop). The package also wires a `popstate`
  listener (`navigation.ts:109-114`) that `useRouteLocation` (`router.ts:134-140`) subscribes
  through. So: **admin route changes are real same-document history entries**, and Chromium's
  session history (which `goBack`/`canGoBack` read) includes `pushState` entries — a webview
  `goBack()` inside the admin will correctly land on the previous admin route and fire `popstate`,
  which the router already listens for. This was the single question that could have killed the
  whole feature, and it clears.
- Public site view: no `pushState`/client router found anywhere under `apps/website/src` or
  `apps/website/themes` (checked both). The public front end is ordinary server-rendered
  multi-page navigation, which `goBack`/`goForward` handle natively with zero extra wiring.

## 3. How View admin / View site switches, and what Back should do across it

- One webview, not two. `App.tsx:496,500,608-615`: `view` is local state; the `url` fed to `src` is
  recomputed from `view` (`/admin/` vs `/`) and set as a **prop change**, not a `key` change. The
  comment at `App.tsx:603-607` is explicit that this is deliberate — Electron's webview navigates
  the *existing* guest in place, "so a toggle costs one navigation instead of destroying a process."
  A `src` prop change on a live `<webview>` is exactly a `webContents.loadURL()`-style navigation,
  which Chromium also records as a session-history entry.
- Consequence: the admin↔site toggle is already, today, a real history entry on the same guest.
  Once goBack/goForward exist, pressing Back after using the toggle will step back across it the
  same way Chrome would step back across a link click — no special-casing needed, and this
  actually matches the intuitive "like Chrome's" ask directly. `view` (the segmented control's
  highlighted state) would need to be resynced from `did-navigate`'s URL rather than only from the
  toggle's own `onClick`, or the pill will show the wrong side highlighted after a Back/Forward
  that crosses admin/site. Small addition to the same listener that tracks canGoBack/canGoForward.

## 4. Per-tab history, hidden tabs, and the guest navigation policy

- Hidden tabs stay mounted. `SiteWorkspaces`' own doc (`App.tsx:421-426`) and the CSS
  (`is-hidden` class, not `display:none` via unmount) confirm every open project's `<webview>` is a
  live, running guest at all times; only visibility is toggled. Each guest is therefore its own
  Chromium process with its own independent session history — per-tab back/forward history is
  already structurally guaranteed by the existing "never unmount" design, no extra state needed
  beyond what each guest's own history already holds.
- `registerGuestNavigationPolicy` (`main.js:908-935`) does **not** interfere with back/forward: it
  only intercepts `setWindowOpenHandler` (new-window/popup requests) and `will-navigate` for
  **cross-origin** navigations (`main.js:921-933`, compares `new URL(url).origin` against
  `new URL(contents.getURL()).origin` and only acts when they differ). Same-origin history
  traversal — which is exactly what `goBack`/`goForward` inside one project's admin or site do —
  never reaches this handler's cross-origin branch, so it's a free pass. Confirmed by reading the
  handler, not inferred from a comment.

## 5. Cheap extras

- **Cmd+[ / Cmd+]**: cheap. `main.js` already builds the app menu with `accelerator` entries
  (`main.js:983`, `CmdOrCtrl+O` for Open Site…). Add two more menu items (or a
  `globalShortcut`/menu-only accelerator) that send an IPC ping to the renderer to call
  `goBack()`/`goForward()` on the active tab's guest. Electron menu accelerators fire regardless of
  which DOM element has focus, including inside a `<webview>`, so this works even with focus
  inside the guest — no extra focus plumbing needed.
- **Mouse back/forward buttons**: not free, and possibly moot. Electron's `app-command` event
  (the API for extra mouse buttons) is Windows-only; this app ships mac-first (`Tovu Helper`
  bundle names, `.icon-icns` in the release dirs) so this input has no OS-level signal to hook on
  the primary platform. Skip unless a Windows build is in scope.
- **Trackpad swipe**: not free — don't assume it. macOS's swipe-to-navigate gesture is a
  system + Chromium overscroll feature, not something this shell currently opts into anywhere
  (no `swipe` event listener or `scrollBounce` config found in `main.js`). Whether Electron's
  `<webview>` guest honors the OS-level "swipe between pages" trackpad setting out of the box needs
  a real run to verify (explicitly out of scope for this read-only check) — treat as "maybe free,
  unverified" rather than "free."

## 6. Tests/guards that touch this toolbar today

- `src/renderer/webview-partition-wiring.test.js:25-69` — text-scrapes `SiteWorkspace`'s function
  body (by `indexOf("function SiteWorkspace(")`) to assert the `partition` prop and that each open
  project gets its own `<SiteWorkspace key={project.id} project={project} …>` instance. It does
  **not** assert button order or count, so reordering the toolbar's JSX will not trip it — only
  removing/renaming `partition` would.
- `src/renderer/webview-failure-wiring.test.js` and `site-card-menu-wiring.test.js:69-74` — assert
  Reload/Open in browser are gated on `running`/failure state, not their position. Safe under
  reordering.
- No test asserts DOM order of the toolbar buttons anywhere searched.
- Complexity gate: `src/complexity-debt.js` is a **drift** gate over ESLint's `complexity` +
  `sonarjs/cognitive-complexity` per-function rule (via `scripts/check-complexity.mjs`), checked
  against a committed debt baseline — it blocks *new* violations, not file size. `SiteWorkspace` is
  already a large function inside an already-1214-line `App.tsx`; growing it further in place is
  the likeliest way to tip a function over the ceiling. Doing the new nav-state logic in a new
  hooks file (e.g. `use-site-workspace.hooks.ts`, mirroring `useWebviewLoadFailure`'s existing
  callback-ref pattern in `App.hooks.ts:665-714`) rather than inline in `SiteWorkspace` avoids that
  risk and matches the D-03 pattern already established for exactly this kind of guest-event
  listener.
- One doc-comment claim I could **not** independently verify: `electron-webview.d.ts:26-30` cites
  a `renderer-no-electron` dependency-cruiser rule in `.dependency-cruiser.cjs`. The repo's actual
  config is `.dependency-cruiser.mjs` at the repo root, and it contains no rule by that name or
  comment referencing `apps/desktop`. Either the rule moved/was renamed, or the comment is stale —
  flagging per "comments are claims," not blocking this assessment (it governs an unrelated import
  boundary, not toolbar order).

## 7. Size, risk, recommendation

**The one real risk:** Reload is implemented as "destroy and recreate the guest" (`key` bump on
`reloadNonce`, `App.tsx:497-499`), which wipes the webview's entire session history — including
whatever back/forward stack this feature would add. A real browser's reload button does *not*
clear history; this one currently does, by design, for an unrelated reason (recovering a wedged
guest). Once Back/Forward exist, every Reload click will silently zero them out — both arrows will
go disabled right after, which will look like a bug even though it's a direct consequence of an
existing, deliberate design choice. Worth a product decision before implementing: accept that
Reload also clears history (cheapest, consistent with "remount is reload"), or special-case it
later. Not a blocker, but the one thing likely to generate a "why did the arrows go gray" bug
report if unaddressed.

Everything else clears: the admin SPA's router genuinely uses `pushState` (the question that could
have killed this), the site view is plain multi-page nav, hidden tabs already keep independent
live history per guest, the guest navigation policy doesn't touch same-origin traversal, and the
toolbar CSS has no `order:` tricks to fight — reordering is a markup move.

**Size:** S/M. Touches:
- `apps/desktop/src/renderer/electron-webview.d.ts` — widen `HTMLWebViewElement` merge for
  `goBack`/`goForward`/`canGoBack`/`canGoForward` (+ maybe `did-navigate`/`did-navigate-in-page`
  event typing), same pattern as the existing `did-fail-load` merge.
- `apps/desktop/src/renderer/App.hooks.ts` — new hook (or extend `useWebviewLoadFailure`) tracking
  `canGoBack`/`canGoForward`, using the same callback-ref (`guestRef`) pattern for D-03 safety.
- `apps/desktop/src/renderer/App.tsx` (`SiteWorkspace`, `App.tsx:483-641`) — two new buttons, call
  the hook, reorder the bar's JSX (back/forward/reload left; url moved right next to Open in
  browser).
- `apps/desktop/src/renderer/app.css:534-599` — trivial: move `.workspace__spacer` to sit after the
  new left cluster instead of after the url; no new CSS mechanics.
- `apps/desktop/main.js` (`main.js:983` area) — optional, for Cmd+[/Cmd+] menu accelerators + IPC.

**Recommendation:** feasible, worth doing. Ship the arrows plus the reorder together (one JSX
pass, low interaction risk since no test pins order). Decide the Reload-clears-history question
explicitly rather than discovering it after ship. Treat Cmd+[/Cmd+] as an easy same-PR add;
leave mouse buttons and trackpad swipe out of scope (unverified/not applicable to a mac-first app).

**Context use:** light — one focused read-only pass (~15 tool calls: Bash/Read/Grep across
`apps/desktop`, `apps/admin`, and the sibling `Jini` package via its symlink), well under a
rotation threshold.
