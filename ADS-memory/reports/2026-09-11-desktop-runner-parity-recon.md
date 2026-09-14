# Desktop Fleet UI ↔ Tovu-Runner parity recon

- **Date:** 2026-09-11
- **Agent:** CodeBase Analyzer (persona: `AI-Dev-Shop/agents/codebase-analyzer/skills.md`)
- **Scope:** `/Users/la/Programming/Tovu/apps/desktop` — RECON ONLY, no source file written
- **Branch / HEAD:** `restructure/apps-website-phased` @ `c85b933c`
- **Tooling:** codebase-memory-mcp (`index_status`: 55394 nodes / 89031 edges, `status: ready`), `rg`, direct reads, live test runs

## Headline

**The visual parity the owner asked for is essentially already built.** All three screenshots
describe UI that exists in `src/renderer/` today, at high fidelity — the floating pill toolbar, the
trapezoid tab strip, the project cards, the per-project bar, and the expand/contract behaviour of
screenshot 3 including an Escape handler. Of 20 reference elements enumerated below, **17 are
present, 2 are partial, 1 is absent** (and the absent one is a deliberate design departure, not an
oversight).

The real gaps are **functional, not visual**, and there are four of them:

1. `dist/renderer/` — what the app actually loads — is **~20 hours stale** and predates the current source.
2. **Attach mode (`TOVU_DESKTOP_URL`) has no session at all** and does show a login form.
3. `RunnerChatPane` is a **fully built component with zero call sites**, blocked behind 19 throwing IPC stubs.
4. The webview `partition` wiring — the single line that makes the seeded session visible to the guest — **has no test**, though it is correctly wired today.

---

## 1. Parity table

Legend: **P** present · **~** partial · **A** absent

### Screenshot 1 — Projects / front page

| Reference element | | Evidence |
|---|---|---|
| Centered floating **pill** toolbar | **P** | `src/renderer/app.css:145-161` — `max-width: fit-content; margin: 0.875rem auto 0; border-radius: var(--r-pill)` (`--r-pill: 999px`, `app.css:60`), plus `backdrop-filter: blur(14px)` and `box-shadow`. Rendered at `App.tsx:104-112`. |
| Circular brand mark | **P** | `App.tsx:222` (`topnav__mark`); styled `app.css:186-193` from a real PNG — `src/renderer/public/brand/tovu-mark.png` + `@2x` (both exist on disk). |
| Wordmark **"Runner"** | **~** | `App.tsx:223` renders **`Tovu`**, not `Runner`. Window title is also `"Tovu"` (`main.cjs:395`), not `"Tovu Runner"`. One-word copy change in two places. |
| 7 pill icons, house→gear | **P** | `sections.ts:299` `visibleSections()` returns the 6 non-`hidden` sections — **home, projects, tasks, generation(Media), activity, updates** — rendered `App.tsx:227-244`; gear is the 7th, separately in `topnav__tools` (`App.tsx:247-249`). Glyphs: `icons.tsx:13` house, `:21` 2×2 grid, `:36` checklist, `:45` video camera, `:51` pulse, `:52` circular arrow, `GearIcon` `:116`. |
| Grid icon shown **ACTIVE** | **P** | `App.tsx:230` `isActive = onFleet && section.id === activeId`; styled `.topnav__link.is-active`. |
| Tab strip, one trapezoid **"All"** tab, dark/active | **P** | `App.tsx:387-395`; `.tab--fleet`, label literally `"All"` (`:394`). Trapezoid is an **SVG mask**, not `clip-path` — `app.css:417-434`, with a long docblock (`:394-416`) on why `clip-path: shape()` failed in this Chromium build. Active = `background: var(--fg); color: var(--bg)` (`app.css:438`). |
| Heading "Projects" left | **P** | `App.tsx:833` `{isCreating ? 'Create a website' : activeLabel}`; `activeLabel` is the section's own `label` (`sections.ts:96`). |
| Rust **`+ Create website`** button right | **P** | `App.tsx:842-845`, `button button--create`. Accent is `--primary: oklch(55.29% 0.1129 43.4)` (`app.css:44`) — burnt orange/rust, documented at `app.css:22` as "the exact admin swatch". |
| Dashed **"Add project"** card, `+` circle, subtext "New site on its own port" | **P** | `ProjectGrid.tsx:46-54` — all three strings verbatim, including `"New site on its own port"` (`:53`). |
| Project card: port panel (top) | **P** | `ProjectGrid.tsx:120-121` `card__tile` → `card__port` = `{project.port}`. Comment at `:117-119` explains the port stands in for a screenshot. |
| Project card: name | **P** | `ProjectGrid.tsx:140` `card__name`. |
| Project card: bullet + status | **P** | `ProjectGrid.tsx:142-145` — `state__dot` + `STATUS_LABEL[project.status]` (`project-status.ts`). |
| Project card: mono `SQLite · Tovu 1.0.0` | **P** | `ProjectGrid.tsx:152-155` — `databaseLabel(project)` (`ProjectGrid.hooks.ts:60-64`) + `{' · Tovu ' + templateVersion}`. |
| Bottom-right rust sparkle FAB | **~** | `App.tsx:168` renders `<DisabledChatFab />`; the button is real but `aria-disabled="true"`, `tabIndex={-1}`, and its `onClick` is an early `preventDefault()` (`App.tsx:176-190`). Styled `app.css:1151-1169`, disabled state `:1209`. **Present, deliberately inert** — see gap 3. |

Bonus, **not** in the owner's transcription but present: a quiet **`Rescan`** button left of `+ Create website` (`App.tsx:839-841`), and a per-card delete/remove control with an inline confirm overlay (`ProjectGrid.tsx:122-137`, `:182-223`) whose copy correctly distinguishes "Delete" (erases the folder) from "Remove" (drops the card only) — `ProjectGrid.hooks.ts:92-116`.

### Screenshot 2 — a project tab, site stopped

| Reference element | | Evidence |
|---|---|---|
| Grid icon no longer filled | **P** | `App.tsx:230` — no section reads active while a project tab is on screen. |
| `"All"` inactive + active dark tab with **status dot** and **✕** | **P** | `App.tsx:397-419` — `tab__dot is-{status}` (`:406`), `tab__label` (`:407`), `tab__close` with `aria-label={`Close ${displayName}`}` (`:409-418`). |
| Per-project bar: status dot | **P** | `App.tsx:534-536`. |
| Segmented **`View admin \| View site`** | **P** | `App.tsx:537-549`; `PROJECT_VIEWS = ['admin','site']` (`App.tsx:34`), labels at `:546`, `aria-pressed` at `:544`. Styled as one segmented control, not two buttons — `app.css:526-531`. **All three behaviours from screenshot 4 confirmed — see §1a.** |
| Mono URL `http://127.0.0.1:3001/admin/` | **P** | `App.tsx:504` builds it (trailing slash on `/admin/` deliberate — comment `:473-474`: `/admin` 301s, and spending the guest's first navigation on a redirect is a visible flash); rendered `:551`. |
| Right-aligned **`Reload`**, **`Open in browser`**, greyed while stopped | **P** | `App.tsx:552` spacer, `:553-560` Reload with `disabled={!running}`, `:561-569` Open in browser with `disabled={!running}`. |
| Small bordered **expand** glyph | **P** | `App.tsx:570-585`, `workspace__act--icon`, two different SVG paths for expand vs contract (`:579-583`). |
| Centred `"Harbor & Vine"` / `"Stopped on port 3001."` / rust `Start site` | **P** | `App.tsx:660-701` `ProjectStartPanel` — `<h2>{displayName}</h2>` (`:678`), `` `${STATUS_LABEL[status]} on port ${port}.` `` (`:681`), `Start site` on `button--create` (`:689-697`). |

### Screenshot 3 — expanded

| Reference element | | Evidence |
|---|---|---|
| Pill toolbar collapses away | **P** | `App.tsx:103` — `{!expanded && <TopNav …>}`. |
| Tab strip collapses away | **P** | `App.tsx:115` — `inProjects && !appearanceOpen && !expanded`. |
| Per-project bar survives, flush at top | **P** | `App.tsx:530-532` — the bar is rendered unconditionally inside `ProjectWorkspace`, with a comment stating this is deliberate: it is the only chrome left, so it is the only always-available way out (Escape does not reach this document while focus is in the guest). |
| Expand glyph now contracts | **P** | `App.tsx:574-583` — title/`aria-label` and the SVG path both swap on `expanded`. |
| Site admin fills the window | **P** | `App.tsx:612-619` `<webview className="workspace__frame" src={url} partition={project.partition} allowpopups>`. The sidebar/Dashboard content in the screenshot is `apps/admin`'s own, rendered inside the guest — nothing in this renderer draws it. |
| Sparkle FAB centred at bottom **in expanded mode** | **A** | `App.tsx:168` — `{!expanded && <DisabledChatFab />}`. Tovu **deliberately hides** the FAB while expanded; the comment at `:166-167` states the reason ("the admin filling the window has no room left for a second chat entry point"). This is the one place the implementation knowingly diverges from the reference. |

**Verdict counts: 17 present · 2 partial · 1 absent.**

### 1a. Screenshot 4 — `View site` in the expanded state

Three specific behaviours were asked about. **All three are implemented**, with one scoping caveat on (c).

**(a) Swaps the webview URL between `/admin/` and `/` on the same origin — YES.**

```
App.tsx:504   const url = `http://127.0.0.1:${project.port}${view === 'site' ? '/' : '/admin/'}`;
App.tsx:551   <span className="workspace__url">{url}</span>
App.tsx:616   <webview … src={url} … />
```

One `url` value feeds both the monospace display and the guest's `src`, so the displayed URL **cannot** drift from what is loaded — it is the same expression, not two. The comment at `:550` states this intent: *"The url is the toggle's answer written out, so it tracks the active view."*

The mechanism is worth pinning, because it is a deliberate choice documented at `App.tsx:607-610`: switching views is a **`src` change and NOT a `key` bump**. React mutates the attribute and Electron navigates the guest that is already running, so a toggle costs **one navigation instead of destroying a process and building another**. `key={reloadNonce}` (`:614`) stays the reload affordance — and because the guest remounts with whichever `src` is current, **Reload reloads the view on screen rather than always the admin**. A related detail at `:514`: the failure hook's reset key is `` `${reloadNonce}:${view}` ``, so switching views also clears a stale load failure from the other view.

**(b) `Reload` / `Open in browser` enablement tied to running state — YES.**

```
App.tsx:505   const running = project.status === 'running';
App.tsx:557   disabled={!running}    // Reload
App.tsx:565   disabled={!running}    // Open in browser
```

Matches screenshot 2 (both greyed, stopped) and screenshot 4 (both enabled, running). `status` is refreshed by `App`'s 4s poll (`useProjectsPolling`, `App.hooks.ts:58`), so enablement follows the real process rather than a local guess.

`Open in browser` also correctly opens **the view currently selected**, not always the admin: `openInBrowser` sends `{ projectId, view }` (`App.tsx:519-523`), and main rebuilds the path with the identical rule — `project-ipc.cjs:308`, `` `${openEntry.server.origin}${input.view === "site" ? "/" : "/admin/"}` ``. Deliberately sends an id and a view, **never a url**, so the bridge is not an "open any url" button.

**(c) Persists across expanded/contracted — YES, for the expand toggle.**

`view` is `useState<ProjectView>('admin')` **inside `ProjectWorkspace`** (`App.tsx:500`), and per-workspace on purpose: the comment at `:498-499` notes every open project stays mounted at once, so one value lifted into `App` would swing every other tab's guest simultaneously. `expanded` lives in `App` and arrives as a *prop* (`:490`); `ProjectWorkspace` is keyed on `project.id` alone (`:451`). Toggling expanded therefore **re-renders without remounting** — the selected view, the guest's process, its scroll position and any half-written form all survive, in both directions. Tab switches are likewise CSS-only (`:428-430`, `app.css:509-510`).

**The caveat, and a comment that overstates itself.** `ProjectWorkspaces` opens with `if (!inProjects) return null` (`App.tsx:445`), where `inProjects = activeId === 'projects'` (`App.hooks.ts:438`). So navigating to a *different section* unmounts every workspace and resets `view` to `'admin'` — discarding exactly what the `:428-430` docblock says is never discarded (*"Open workspaces are hidden with CSS, never unmounted… unmounting one on a tab switch would throw away the site's admin route, scroll position and any half-written form"*). That claim is true of tab switches and of Appearance (which only sets `visibleWorkspaceId` to null, `App.hooks.ts:449`, leaving workspaces mounted) but **false of section navigation**.

Currently near-unreachable: the other five nav links are hard-disabled (`App.tsx:241`) and the gear is too (`:313`), so the only live route into it is the **`runner.navigate` agent tool** (`useRunnerNavigation`, `App.hooks.ts:157`). It becomes a real user-facing bug the moment item 5 (Homepage) or item 7 (Marketplace) makes a second section reachable — which puts it on the critical path for both. Cheap fix, noted but **not implemented**: render the workspaces unconditionally and let `visibleWorkspaceId` hide them, which is the mechanism already in use for Appearance.

### Expand/contract, specifically

The owner asked whether "collapsing the toolbar + tab strip is implemented at all". **It is, completely**, and with two safety rules the reference transcription does not mention:

`src/renderer/App.hooks.ts:471-499` — `useExpandedMode(showProjectTab)`:
- `:480-482` — an effect forces `expanded` back to `false` whenever `showProjectTab` goes false. Expanded hides the only navigation there is, so closing the tab, deleting the project, or a `runner.navigate` call moving the nav can never leave the chrome hidden with nothing to be immersed in.
- `:487-494` — **Escape collapses**, via a `window` keydown listener installed only while expanded. The comment correctly notes this only sees keys pressed in Tovu's own chrome (a `<webview>` is a separate browsing context and does not bubble keydowns out), so it is a convenience and the bar's button is the exit that always works.

---

## 2. Stubs, and absent-vs-unwired

### The `main.cjs` header claim: **VERIFIED, and understated**

The header (`main.cjs:18-20`) says `list`/`create`/`delete`/`open-external`/`start` are real and `stop` "stays a throwing stub". Both halves confirmed:

- Real handlers: `src/project-ipc.cjs:416-421` — `list`, `create`, `delete`, `openExternal`, `start`, **and `rescan`**. `rescan` is a **sixth** real handler the header does not mention.
- `stop` is in the throwing-stub list: `src/runner-ipc-stubs.cjs` (`"runner:projects:stop"`), with the contract itself documenting it as not implemented (`src/contracts/project.ts:105-106`).

### `stop` is absent *and* unwired — three layers deep

| Layer | State | Evidence |
|---|---|---|
| Main handler | throwing stub | `runner-ipc-stubs.cjs` channel list |
| Preload bridge | **real and exposed** | `src/preload/preload.mts:79` — `stopProject: (id) => ipcRenderer.invoke(RUNNER_PROJECT_CHANNELS.stop, id)` |
| Renderer type | **declared** | `src/renderer/runner-api.ts:29` — `stopProject: (id: string) => Promise<ProjectRecord>` |
| Renderer call site | **NONE** | `rg "stopProject\|projects:stop\|\.stop\("` across `src/renderer/` returns only the type declaration. Zero callers. |

So there is no control to press *and* nothing behind it if there were. Today a fleet-opened site stops only on `app.on("before-quit")` (`main.cjs:1110-1122`) or via `handleDelete`. Note `openSiteServer`'s own doc (`main.cjs:614-619`): closing a **tab** deliberately leaves the site running, matching Tovu-Runner.

### `RunnerChatPane` — the textbook "built primitive, unwired call site"

`App.tsx:1005` defines `RunnerChatPane`, a complete component: it consumes `useRunnerChatTransport()` (`App.hooks.ts:722`), `useRunnerConversations()` (`:829`), renders `ConversationList` from `@jini-ai/chat/react` (`App.tsx:1057`) and a `ChatPane`, and threads model/reasoning through a `ChatPaneRunContext` (`App.tsx:1000-1003`).

**It has zero call sites.** `rg "RunnerChatPane" src/` returns the definition plus three *comments* referring to it (`fleet-chat-transport.ts:305`, `App.hooks.ts:718`, `:1062`, `:1072`). Nothing renders it. The FAB that would open it is hard-disabled (`App.tsx:176-190`).

This is blocked, not forgotten: every channel it needs is a throwing stub — `runner:chat:start|reattach|detach|stop|status` and all six `runner:conversations:*` (`runner-ipc-stubs.cjs`). `runner-ipc-stubs.cjs`'s header states the reason: `Tovu-Runner/src/main/` is phase 2.

### Full throwing-stub inventory (19 channels)

From `src/runner-ipc-stubs.cjs` — every one rejects with code `RUNNER_MAIN_NOT_PORTED`:

- `runner:agents:list`, `runner:agents:rescan`, `runner:daemon:online`
- `runner:projects:stop`
- `runner:chat:start|reattach|detach|stop|status`
- `runner:working-directory:pick|recent|exists|normalize`
- `runner:chat-attachments:save`
- `runner:conversations:list|create|rename|delete|load-messages|save-message`

This module's design is worth noting as a **positive** finding: *every* stub throws, and the header (`runner-ipc-stubs.cjs:11-15`) explains why an empty array from a stubbed list channel would be worse — "a real, correct, empty result — a lie the UI has no way to detect". `runner-ipc-stubs.test.cjs` parses the contract sources and fails if any literal drifts.

### Other "not built" surfaces (honest placeholders, not silent failures)

- **5 of 6 nav sections are inert.** `App.tsx:241` — `disabled={section.id !== 'projects'}`. Disabled via `aria-disabled` + `tabIndex={-1}` on a real `<button>`, *never* the native `disabled` attribute, so the `data-tip` tooltip naming the destination still works (`App.tsx:258-263`).
- **The gear is hard-disabled.** `App.tsx:313` — `const disabled = true;`. The theme dropdown and `AppearancePage` behind it are built but unreachable.
- Their bodies render `NotBuilt` (`App.tsx:925-927`, `:1139-1146`) — `"{label} isn't built yet"` plus the section's `agentDescription`.
- `AppearancePage` (`App.tsx:1154-1162`) is self-labelled `TEMPORARY SCAFFOLD`.
- 6 further sections are registered but `hidden: true` — templates, deploy, diagnostics, api-keys, settings, account (`sections.ts`).
- `ProjectStartPanel`'s `'blocked'` branch (`App.tsx:688`) is **dead in practice** — its own comment says so, since every project is sqlite today — kept because the contract still declares the value.

### ⚠ The stale bundle (not a stub, but it governs everything above)

`openFleetWindow` loads `FLEET_RENDERER_PATH` = `dist/renderer/index.html` (`main.cjs:383, 417`).

```
dist/renderer/index.html            Sep  6 22:50:31 2026
dist/renderer/assets/index-*.js     Sep  6 22:50:31 2026
src/renderer/App.hooks.ts           Sep  7 19:13:04 2026
src/renderer/ProjectGrid.tsx        Sep  7 19:14:10 2026
```

The bundle is **~20 hours behind source** and predates the `ProjectGrid.tsx` / `ProjectGrid.hooks.ts` split entirely. Anything the owner sees by launching the app today is the Sep 6 build, not the code in this report. `npm run build:renderer` is needed before any visual comparison against the screenshots is meaningful. Nothing detects this skew — `openFleetWindow` only checks that the file *exists* (`main.cjs:383`).

---

## 3. Login / auth per boot mode

### Mode 0 — Fleet UI (default): **NO login form. Fully wired end to end.**

Traced `handleStart` → `openSiteServer` → `startSiteBackend` → `ensureSiteSession` → the guest:

1. `project-ipc.cjs:420` — `runner:projects:start` → `handleStart`, which calls the injected `openSiteServer` (`main.cjs:1054`).
2. `main.cjs:627-634` `openSiteServer` → `startSiteBackend(siteDir, ctx, options)`.
3. `main.cjs:488-528` `startSiteBackend`:
   - `:489` `const partition = sitePartition(siteDir)`
   - `:501-507` spawns `tovu serve` with `emitBootToken: true` — **always**, per DS-01
   - `:520-525` `await ensureSiteSession({ session: session.fromPartition(partition), redeem: () => authenticateSiteSession(...) })`, **awaited before returning** so the cookie is in the jar before the guest's first navigation
4. `main.cjs:438-463` `authenticateSiteSession` → `redeemBootSession` (`desktop-auth.cjs`) — POSTs the single-use boot token to `/api/admin/v1/auth/boot-session`.
5. `project-ipc.cjs:83` — `buildProjectRecord` sets `partition: sitePartition(row.siteDir)`, the *same pure function of the same input*.
6. `App.tsx:617` — `<webview … partition={project.partition}>`.

The loop closes: main seeds a session cookie into `sitePartition(siteDir)`, and the guest is pinned to that exact partition string. **The fleet `<webview>` tab path does get a session.**

Per-site partitioning is a **correctness requirement**, not hardening: cookies ignore port, so `127.0.0.1:3001` and `:3002` would otherwise share one jar and each open would overwrite the other's session (`desktop-auth.cjs` header, property 2).

### Mode 2 — Own server: **NO login form.** Same `startSiteBackend` (`main.cjs:563`), then `createWindow(server.adminUrl, readSiteName(siteDir), partition)` (`:567`) passing the partition through.

### Mode 1 — Attach (`TOVU_DESKTOP_URL`): **THE GAP. A login form appears.**

```
main.cjs:1084    const attachUrl = process.env.TOVU_DESKTOP_URL?.trim();
main.cjs:1085    if (attachUrl) {
main.cjs:1087      if (SELFTEST) selftestTracker = buildSelftestTracker(1);
main.cjs:1088      createWindow(attachUrl, "Tovu");
main.cjs:1089      return;
main.cjs:1090    }
```

Two things are missing and both are visible in that one call:

- **No third argument.** `createWindow(url, title, partition)` (`main.cjs:318`) spreads the partition only when truthy (`:333`), so the attach window falls back to Electron's default session. Acknowledged in that very comment (`:331-332`): *"Undefined in attach mode, which is single-site by definition and keeps the default session it always used."*
- **No session seeding at all.** `ensureSiteSession` / `redeemBootSession` are reached only from `startSiteBackend` (`main.cjs:520`), and attach mode returns at `:1089` without ever calling it. It also has no boot token to redeem — it spawns nothing, so no child ever mints one.

**What a fix would have to touch — and the trap in it.** This is *not* a one-line change:

1. Attach mode has **no boot token**. The token is minted by the child at boot and read off its stdout (`desktop-auth.cjs` header). Attach mode attaches to a server someone else started, whose stdout this process does not own. A fix needs a *different* credential path, or cooperation from `development/scripts/dev.mjs` to surface a token.
2. **`assertLoopbackAdminUrl` would refuse the normal dev stack anyway.** `desktop-auth.cjs:91-93` throws unless `parsed.protocol === "http:"`. Per this workspace's own recorded environment facts, `npm run dev` serves **:3000 and :5173 over HTTPS**. So even with a token in hand, the existing redeem path rejects the very origin attach mode is usually pointed at. Either the guard needs an `https:`-on-loopback branch (weakening a deliberately narrow check) or the dev stack needs an http loopback origin.
3. A partition decision. Attach mode is single-site, so the default session is defensible — but if a token path is added, whichever jar it lands in has to be the one the window reads.

Given (1) and (2), attach mode is the *hardest* of the three to give a no-login experience, and it is also the mode the owner is least likely to be using: the fleet UI is the default and already login-free. **Recommendation: confirm the owner actually means attach mode before anyone builds this.** If what they meant is "no login page in the desktop app" as a user, mode 0 already satisfies it.

### Two-sentence answer

The fleet UI and own-server modes both already mint and redeem a single-use boot token into the site's own Electron session partition before the window or `<webview>` ever navigates, so no login form appears in either — the `<webview>` tab path is fully wired, `main.cjs:520` through `App.tsx:617`. Attach mode (`TOVU_DESKTOP_URL`) gets **no session at all** — `main.cjs:1088` calls `createWindow(attachUrl, "Tovu")` with no partition and never reaches `ensureSiteSession` — and it cannot trivially be given one, because it spawns no child to mint a boot token and `assertLoopbackAdminUrl` (`desktop-auth.cjs:91`) refuses the HTTPS origin the dev stack actually serves.

---

## 4. Marketplace / homepage headroom

### Navigation shape: **conditional rendering, no router**

There is **no routing library at all** — `package.json` lists only `@jini-ai/chat` as a dependency; no `react-router`, `wouter`, or history usage anywhere in `src/renderer/`. Navigation is:

- `useSectionNav(setActiveTab)` (`App.hooks.ts:203`) holding an `activeId: RunnerSectionId` in `useState`
- `deriveFleetView({...})` (`App.hooks.ts:424-464`) — a **plain function, not a hook**, computing the whole "which surface should be showing" rule set from `{activeId, appearanceOpen, activeTab, openTabs, projects, isCreating}`
- `MainContent` switching on it: `App.tsx:925` — `if (activeId !== 'projects') return <NotBuilt … />`

### The good news: the scaffolding the owner wants **already exists**

The pill's house and grid icons are not decorative placeholders — they are entries in a real registry, and `home` is already a first-class section:

```
sections.ts   id: 'home', group: 'fleet', label: 'Home',
              agentDescription: 'Fleet overview. How many projects exist, …',
              tools: ['runner.fleet.status']
```

`RUNNER_SECTIONS` (`sections.ts`) is the single source of truth for: the nav (`visibleSections()`, `:299`), the agent tool surface (`runnerToolNames()`, `:322`), and the `RunnerSectionId` union. `RUNNER_SECTION_GROUPS` (`fleet`/`work`/`operations`/`access`) is declared and currently unused by the nav — its own comment (`:290-293`) names a future overflow menu as the obvious place it matters again.

**Adding a Homepage** is therefore *not* new scaffolding. It is:
1. Flip nothing — `home` is already visible and already renders `NotBuilt`.
2. Remove `home` from the `disabled` predicate at `App.tsx:241` (currently `section.id !== 'projects'`).
3. Add a branch to `MainContent` (`App.tsx:925`) instead of falling through to `NotBuilt`.

**Adding a Marketplace** needs one new registry entry, not a new system. There is **no `marketplace` id and no placeholder for one** — `rg -i marketplace src/` in this package returns nothing. The work is:
1. One entry in `RUNNER_SECTIONS` (`sections.ts`) with `id: 'marketplace'`, a group, a label, an `agentDescription`, and its `runner.*` tools. The `as const satisfies` at the end of the array (`sections.ts`) keeps the literal types, so the new id joins `RunnerSectionId` and its verbs join `RunnerToolName` automatically.
2. One glyph in `icons.tsx`'s `paths` record — `Record<RunnerSectionId, JSX.Element>`, so **omitting it is a compile error**, not a blank icon. This is a genuinely good constraint.
3. One branch in `MainContent`.
4. If it declares tools, a mirror check in `contracts/site-assistant-tools.ts` (which mirrors `runnerToolNames()` as of 2026-08 — see `sections.ts`'s header).

### The headroom caveat

`activeId` is `useState`, not a URL. `sections.ts`'s header says `RunnerSectionId` values "appear in agent tool schemas **and in URLs**" — but no URL routing exists in this renderer today. A marketplace with deep links (a product page, a share link, back/forward) is the point at which conditional rendering stops being enough and this needs a real router. Worth deciding *before* the marketplace is built rather than retrofitting, since `deriveFleetView` would become the router's derived state rather than `useState`'s.

---

## 5. Test coverage

### What runs, and the real exit codes

Per `package.json`: `node --test "src/**/*.test.cjs" && node --import tsx --test "src/**/*.test.ts"`. Both run clean; exit codes captured directly, **not through a pipe**:

| Suite | Tests | Result | Exit |
|---|---|---|---|
| `src/**/*.test.cjs` | 328 | 328 pass, 0 fail | **0** |
| `src/**/*.test.ts` | 9 | 9 pass, 0 fail | **0** |

337 tests, all green. 16 `.test.cjs` files + 2 `.test.ts` files.

### Fake-gate audit

The owner asked for tests whose *name* promises coverage the assertions don't deliver. One finding, and it needs stating precisely:

**`src/renderer/App.hooks.test.ts` — the FILENAME overpromises; the docblock does not.**

The name claims coverage of `App.hooks.ts`, a 58KB module exporting **~19 hooks and functions**. The file contains **5 tests covering exactly 2 of them** — `siteSlug` and `computeCanCreate`, both pure string/boolean helpers. Its own header (`:1-3`) is honest about this: *"Behavioural tests for the plain rules `App.hooks.ts` keeps out of the components — `siteSlug` and `computeCanCreate`"*. So this is **not** a deceptive gate in the sense found elsewhere in this repo today — no assertion tolerates a bug it claims to catch. But a reader scanning the file list will read "App.hooks is tested", and that inference is wrong by 17 exports.

The 5 tests themselves are good, and worth noting for a real reason: they cover the **non-Latin slug defect** — `[^a-z0-9]+` erased every character of a Japanese/Hindi/Greek/Cyrillic/Arabic site name, leaving an empty slug that `computeCanCreate` read as "no name typed", so `Create website` could never be enabled for those names (`App.hooks.test.ts:44-52`).

`ProjectGrid.hooks.test.ts:38-50` deserves the opposite call-out — it is a **model wiring guard**. Its own comment names the risk explicitly: *"the predicate above could be correct and simply not called — the exact shape of 'correct primitive, unwired call site'"*, and it asserts the import, the call, and the **absence** of the inline check it replaced.

### Genuinely untested — ranked by consequence

**A. The webview `partition` attribute. The highest-consequence untested line in the package.**

Three of the four links in the auth chain are pinned:

- `desktop-auth.test.cjs:73,83` — partition is stable per dir, and leaks no path
- `project-ipc.test.cjs:98-114` — `buildProjectRecord`'s partition is stable and distinct per dir
- `main-auth-wiring.test.cjs:46-51` — main seeds into `session.fromPartition(partition)`

The fourth link — **`App.tsx:617`'s `partition={project.partition}`** — has no test. `rg "partition" src/*.test.cjs src/renderer/*.test.cjs` returns nothing touching `App.tsx`. Delete that one attribute and: the guest falls back to the default session, the seeded cookie is invisible to it, **every project tab silently shows a login form**, two sites start sharing one cookie jar — and **all 337 tests stay green**.

The fix is **one assertion in a file that already exists**. `webview-failure-wiring.test.cjs:49` already matches `/<webview\s+ref=\{guestRef\}/` against `App.tsx`'s source — the same element, the same technique, one attribute away. `ProjectGrid.hooks.test.ts:38-50` is the other precedent. Neither was extended to `partition`.

**A2. The `view` → path rule is duplicated across two processes, and only one side is tested.**

The same literal rule exists twice, independently written:

- `project-ipc.cjs:308` (main) — **tested**: `project-ipc.test.cjs:272-281` asserts both surfaces, `assert.deepEqual(opened, ["http://127.0.0.1:4321/admin/", "http://127.0.0.1:4321/"])`.
- `App.tsx:504` (renderer) — **untested**. No renderer test references the URL, the view, or that expression.

The duplication is defensible (main must not accept a renderer-supplied url — see `App.tsx:516-518`), so the rule genuinely has to live on both sides. But the drift is one-sided and silent: flip the ternary at `App.tsx:504` and the bar would display *and load* the wrong surface while `Open in browser` kept opening the right one, with the suite green. Worth folding into the same source-text test as A1, since both assertions target the same few lines of `App.tsx`.

**B. Attach mode: zero tests.** `rg -l TOVU_DESKTOP_URL src/` returns **nothing**. No test exercises the branch at `main.cjs:1085-1090`, and none pins its (current, deliberate) absence of a session. Whatever is decided in §3 needs a test either way — including a test that *asserts the gap*, if the answer is "leave it".

**C. Every renderer hook driving the owner's three screenshots.** No test for `deriveFleetView` (`App.hooks.ts:424`), `useExpandedMode` (`:471`), `useProjectTabs` (`:267`), or `useSectionNav` (`:203`). These own tab state and the entire expand/contract behaviour of screenshot 3.

`deriveFleetView` is the cheapest win in the package: its own docblock (`App.hooks.ts:420-422`) says *"A plain function, not a hook, and that is the point. It holds no state and calls nothing from React, so the whole 'which surface should be showing' rule set is exercisable by calling it with an object — no renderer, no component, no hook harness."* It was written to be testable and then not tested. Seven interacting boolean rules (`:438-453`), zero assertions.

**D. No component rendering anywhere.** There is no DOM test runner in this package (no jsdom, no `@testing-library`). Every renderer "test" is either a pure-function call or a **regex over source text** (`rescan-wiring.test.cjs`, `webview-failure-wiring.test.cjs`, `main-*-wiring.test.cjs`). `rescan-wiring.test.cjs`'s header states this openly. Consequence: no test proves *anything renders*. The pill toolbar, the tab strip, the per-project bar, the expand button — none is asserted to appear.

Source-text assertions are a reasonable answer to having no runner, and they do catch the unwired-call-site defect. But they are brittle under refactor (they match formatting, not behaviour) and they cannot catch a render-time failure. If any renderer investment is made, a DOM runner has the highest ceiling.

---

## 5b. The blue right-edge artifacts (low priority, as asked)

**Almost certainly the reference app's own scrollbar, not a defect ours would reproduce.** Not chased further, per instruction. What our sizing actually does:

```
app.css:589   .workspace__guest { position: relative; flex: 1; min-height: 0; }
app.css:591   .workspace__frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--bg); }
```

An absolutely-positioned `inset: 0` guest cannot overflow its container horizontally, and `border: 0` leaves no edge to clip. Any scrollbar inside the guest belongs to the site's own document — a separate browsing context this stylesheet cannot reach, and where the `basic` theme's dark-mode scrollbar would plausibly render blue-ish.

**There is one known clipping bug in this area, and it is vertical, not horizontal — and already fixed.** `app.css:586-588` documents it: `min-height: 0` is load-bearing, because *"without it this flex item is sized by its content, and a `<webview>` reports none, collapsing the guest to a zero-height strip under the bar"*. That is the real trap in this component — a `<webview>` has no intrinsic content size, so any flex ancestor that loses `min-height: 0` collapses it. It is correct today on both `.workspace__guest` (`:589`) and `.workspace` (`:509`). **Untested**, like the rest of the rendering (§5D) — worth one assertion if a DOM runner ever lands, since the symptom is a blank window rather than an error.

## 6. Prioritised build list

Sized by **call sites that need touching**, per the owner's instruction — not by file length.

| # | Item | Call sites | Size | Why this rank |
|---|---|---|---|---|
| **1** | **Rebuild `dist/renderer/`** | 0 (one command) | **XS** | `npm run build:renderer`. Blocks everything else: any visual comparison against the screenshots is currently measuring a Sep 6 bundle. Do this first, before judging parity by eye. |
| **2** | **Wordmark → "Runner"** (if wanted) | 2 | **XS** | `App.tsx:223` and `main.cjs:395`. Pure copy. Flagged because it is the only *visible* text mismatch with screenshot 1, and it is 30 seconds. Confirm the owner wants "Runner" and not "Tovu" — this app is Tovu's shell, and the brand mark is already Tovu's own logo. |
| **3** | **Test the `partition` attribute + the renderer's `view`→path rule** | 1 new test (or 2 assertions in an existing file) | **XS** | Closes link 4 of 4 in the auth chain (§5A) and the untested half of the two-process duplication (§5A2). Highest consequence-per-minute in the list: a silent regression reintroduces the login form on every tab *and* the shared-cookie-jar bug, with the suite green. `webview-failure-wiring.test.cjs:49` already asserts against the very same `<webview>` element — this is one attribute away. |
| **4** | **Test `deriveFleetView`** | 1 new test file | **S** | 7 interacting rules, already written as a pure function specifically to be callable with a plain object. No harness needed. Protects tab/expand state — exactly the behaviour of screenshots 2 and 3. |
| **4b** | **Stop section navigation from unmounting open workspaces** | 1 | **XS** | `App.tsx:445` — `if (!inProjects) return null` discards every guest's process, selected view, scroll position and half-written forms, contradicting the `:428-430` docblock (§1a(c)). Render unconditionally and let `visibleWorkspaceId` hide them, which is already the mechanism for Appearance. Near-unreachable today (only the `runner.navigate` tool), but **on the critical path for items 5 and 7** — the moment a second section is reachable this becomes a real bug. Fix it *with* whichever of those lands first, not after. |
| **5** | **Homepage section** | 3 (+ item 4b) | **S** | `App.tsx:241` (drop `home` from `disabled`), `App.tsx:925` (a branch instead of `NotBuilt`), + the body component. The registry entry, icon, tools and agent description **already exist** (`sections.ts`). Cheapest real feature on the list. |
| **6** | **Wire `stop`** | 4 | **M** | (a) implement `runner:projects:stop` in `project-ipc.cjs` alongside `handleStart`; (b) **remove `"runner:projects:stop"` from `runner-ipc-stubs.cjs`** — `ipcMain.handle` throws on duplicate registration, so this is mandatory, not cleanup; (c) update the contract doc (`contracts/project.ts:105`); (d) add a control to the per-project bar (`App.tsx:553-585`). The bridge (`preload.mts:79`) and type (`runner-api.ts:29`) already exist. Design question first: `openSiteServer`'s doc (`main.cjs:614-619`) says closing a tab deliberately leaves the site running, matching Runner — so decide whether `stop` belongs in the bar or on the card. |
| **7** | **Marketplace section (shell)** | 4 (+ item 4b) | **M** | One `sections.ts` entry, one `icons.tsx` glyph (compile-enforced by `Record<RunnerSectionId, …>`), one `App.tsx:925` branch, one `site-assistant-tools.ts` mirror entry if it declares tools. The *shell* is M; actual marketplace content/backend is out of scope here and much larger. |
| **8** | **DOM test runner for the renderer** | infra | **M** | No component rendering is tested at all today (§5D). Unlocks real tests for the pill, tab strip, bar, and expand — and would let items 3 and 4 assert behaviour instead of source text. Note this workspace's recorded jsdom traps (no `<details>` toggle; React root delegation makes `stopPropagation()` a false RED — assert `event.defaultPrevented` from a document capture listener). |
| **9** | **URL routing** | pervasive | **L** | Needed *before* a marketplace with deep links, not after. `activeId` becomes router state and `deriveFleetView` becomes derived-from-route. Deciding this late is a rewrite of every navigation call site; deciding it early is cheap. |
| **10** | **Fleet chat (FAB → `RunnerChatPane`)** | 11+ | **L** | `RunnerChatPane` is already built (`App.tsx:1005`) and so is its transport (`fleet-chat-transport.ts`, `App.hooks.ts:722,829`). But **11 throwing stubs** must become real main-process handlers — 5 `runner:chat:*` + 6 `runner:conversations:*` — which is the `Tovu-Runner/src/main/` phase-2 port (daemon, conversation store, fleet-chat IPC). The renderer is the small half. Also decide the screenshot-3 divergence: the reference shows the FAB while expanded, Tovu deliberately hides it (`App.tsx:166-168`). |
| **11** | **Attach-mode login bypass** | 3+, blocked | **L / needs a decision first** | Per §3, this is blocked on two independent problems: no child to mint a boot token, and `assertLoopbackAdminUrl` (`desktop-auth.cjs:91`) refusing the HTTPS origin the dev stack serves. **Do not build before confirming the owner means attach mode** — the fleet UI, which is the default, is already login-free. If they meant "no login page in the desktop app" as a user, this is already done. |

### Deliberately not on the list

- **Settings/gear** — `App.tsx:313`'s `const disabled = true` and `AppearancePage`'s `TEMPORARY SCAFFOLD` label say the shape is unsettled. A one-character change makes the theme dropdown live; whether that is wanted is a product call, not a gap.
- **The 4 other inert nav sections** (tasks, Media, activity, updates) — each is an independent feature, not parity work.
- **`ProjectStartPanel`'s `'blocked'` branch** (`App.tsx:688`) — dead in practice per its own comment, correct to keep while the contract declares the value.

---

## 7. Corrections to the screenshot transcription

Five items where the transcription and the code disagree:

1. **"circular-arrow reload" is not a reload button.** It is the **Updates** section — schema-version drift and staggered upgrades across the fleet (`sections.ts`, `updates`), glyph at `icons.tsx:52-57`. A circular arrow, but a nav destination, not an action.
2. **"video camera" is the Media section, id `generation`.** `sections.ts` keeps the id `generation` (a public contract in tool schemas and URLs) while labelling it "Media". The icon was *deliberately changed* from a sparkle to a video camera — `icons.tsx:43-44`: *"a sparkle read as 'AI magic' rather than 'images and video'"*. Worth knowing: the *only* sparkle in this UI is the chat FAB.
3. **The wordmark reads "Tovu", not "Runner"** (`App.tsx:223`), and the window title is `"Tovu"` (`main.cjs:395`). The brand *mark* is Tovu's own `logo.png` from the tovu-com theme — `app.css:171-185` records that Runner's `gold-runner-*.png` files were referenced by nothing and were **deleted rather than carried over**.
4. **The sparkle FAB is disabled everywhere, and absent in expanded mode.** Screenshot 3 shows it centred at the bottom; `App.tsx:168` renders it only when `!expanded`. The divergence is deliberate and documented (`App.tsx:166-167`). In screenshots 1 and 2 it is present but inert — real button, `aria-disabled`, early-return click handler, `tabIndex={-1}`, with `data-tip` so the destination is still named on hover.
5. **Already handled, not mentioned:** a quiet **`Rescan`** button sits left of `+ Create website` (`App.tsx:839-841`) — it adopts sites found on disk that the shell is not tracking, and deliberately never resurrects a project the operator removed. Not in any screenshot; it is Tovu's own addition.

**Screenshot 4 added nothing to correct** — every behaviour it shows is implemented, and one detail it shows is *better* than described: because `key={reloadNonce}` remounts the guest with whichever `src` is current (`App.tsx:607-614`), `Reload` reloads **the view on screen**, not always the admin. `Open in browser` likewise follows the selected view rather than defaulting to the admin (`App.tsx:519-523` → `project-ipc.cjs:308`).

And one item the transcription got exactly right that is worth confirming, since it was the owner's specific question: **"the button at the right end expands and contracts"** — yes, `App.tsx:570-585`, and the collapse is complete (toolbar and tab strip both gone, bar flush at top), with an Escape handler and a safety effect that can never leave the chrome hidden with nothing to be immersed in (`App.hooks.ts:471-499`).

---

## Appendix: verification notes

- codebase-memory-mcp `index_status` reported `ready` at `head_sha c85b933c` — matching the working-tree HEAD. Structural questions were still cross-checked against direct file reads, since `apps/desktop` is largely CommonJS `.cjs` (weaker graph coverage than the TS tree).
- Exit codes captured by redirecting to a file and reading `$?` directly — never through a pipe.
- `rg` used throughout in preference to `grep` (this machine's `grep` is `ugrep`: ignores `--include`/`--exclude`, silently skips NUL-byte files).
- No `timeout` used (absent on macOS; would have returned a plausible-looking rc=127).
- Tests were run read-only. No source file in `apps/desktop` was created, edited, or deleted.
- Negative results verified per-file rather than by aggregate pass: `rg "RunnerChatPane" src/` and `rg -l TOVU_DESKTOP_URL src/` were each run against the whole package tree, and their output inspected, rather than inferred from a broader sweep.
