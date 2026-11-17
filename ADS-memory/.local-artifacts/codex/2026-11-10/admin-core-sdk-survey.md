Software Architect persona loaded (AI-Dev-Shop/agents/software-architect/skills.md v2.3.2). Read-only survey. Tovu `main` fad66fb87, Jini `origin/main` f6fa96ae3. No files changed except this one.

# Admin core, site-chat and @tovu/sdk: extraction survey (2026-11-10)

## BOTTOM LINE

- Most of the generic code is already in Jini. The work is mostly dedupe: Tovu has its own copies next to unused or half-used Jini versions.
- **@tovu/sdk** is the cheapest and most useful first step. Put the generic ABI at a new `@jini-ai/plugins/sdk` subpath and move the resolver into `@jini-ai/plugins/host/node`. Tovu keeps a ~40-line host SDK module with its hook catalog. Saved plugins keep working if three things hold: (1) every old specifier stays an alias; (2) the SDK ABI version stays `0.1.0`, separate from the npm version; (3) the module the resolver points at still exports the same runtime values.
- **site-chat** is the public visitor chat widget. About 770 of its 1,434 TS lines are copies of `@jini-ai/chat` embed-widget code that already exists. Its 3,270-line `remixicon.css` is a byte-identical copy of `@jini-ai/ui`'s. Moving it means ~520 lines of host config stay, and Jini gains two small additions: an idle timeout and a tool-confirmation directive.
- **Admin core**: Jini already has a full `AdminShell`, but nothing uses it. Tovu runs its own shell in `App.tsx`. Tovu's `api.ts` transport, admin theme mechanics and permission gate repeat Jini's. Roles is the one generic screen Jini lacks. The assistant dock is mostly Tovu wiring around Jini's `ChatPane`. About 2.1k of its 6.4k non-dictionary lines are generic.
- **Blockers before any move:**
  - Current Jini packages already import each other. `admin` imports `cms`, `agent-plugins`, `agentic`, `ui` and `ui-kit`. `user-management` imports `admin`. `chat` imports `agentic`, `db` and `diagnostics`. The owner needs to decide whether `*/react` subpaths may import `@jini-ai/ui` or must get it injected (the `ui-kit` `KitProvider` is the existing injection path).
  - `App.hooks.ts:1` imports a website server file.

## Area 1: Admin generic core

Counts are `git show main:` lines, excluding tests and fixtures. "i18n" means dictionary files.

| Area (Tovu, measured) | Already in Jini | Verdict: what moves where | Stays in Tovu | Host contract |
|---|---|---|---|---|
| **Shell/layout**: `App.tsx` 889, `App.hooks.ts` 1,234, `main.tsx` 84 = 2,207 | `@jini-ai/admin/react/shell` `AdminShell` with session, nav and theme ports and login, sidebar, topbar, overlay and assistant slots (`react/shell/*` ~450). **No consumer**: Tovu uses only `Sidebar`, `ConfirmDialog` and `matchRoute` (`App.tsx:13-14`) and has its own `AdminShell` at `App.tsx:578`. | **MOVE PART, ~800–1,000 lines to `admin/react/shell`.** Moves: `useLogoutConfirm` (`App.hooks.ts:568`, ~58); `useSidebarDrawer` (`:626`, ~47); the dock pane layout `useChatDockLayout` + `resolveChatFabClearance` (`:703-889`, ~186); `use-dock-auto-rail` 109; drawer centring 91; empty-click toggle 106; label tooltips 39; collapsible group labels; `use-list-table-cell-labels` 76. Then Tovu renders Jini `AdminShell` and deletes `App.tsx:578-889`. | Boot composition. Site-section gating (`App.hooks.ts:364-562`, ~200). Publish deep-link (`:282`). Assistant availability flag (`:332`). Agent page bridge composition (`:889-1189`). Desktop view release. Toast/publish dialog overlays. | Existing `AdminShellProps`. Add an optional `onSessionAccepted({session})` callback so Tovu can reset draft identity and refresh settings on identity change. Today those run inline at `App.hooks.ts:121-129`. |
| **Navigation**: `nav.ts` 76, `panels.tsx` 1,311 (51 panels), `panel-pages.ts` 61, `admin-nav-i18n.ts` 1,406 | `buildNav`, manifest types, `use-nav-sections` 130, `use-sidebar-rail` 122 | **Already moved.** Only `panel-access.ts` (94) moves; see the Permissions row. | Panel manifest, labels, groups, icons, nav dictionary. | `panels` + `translateNav` (both exist). |
| **Routing**: `lib/router.ts` 154, `addons-routes` 78, `import-export-routes` 27 | `admin/core/routing` 170, `browser/navigation` 144, `createAdminShellNavigation` | **MOVE PART, ~20 lines**: a `useRouteLocation(navigationPort)` hook into `admin/react`. `router.ts` is already a thin wrapper (`router.ts:1-3`). | `/admin` base, legacy hash redirect (`router.ts:85`), addons and import/export aliases. | `AdminShellNavigationPort` (exists). |
| **Sign-in/session/MFA**: `useAdminSession` ~205 (`App.hooks.ts:77-282`); `features/auth` 317; `authentication` 368; `boot-token-fragment` 55; `local-owner-signin` 46; `owner-mfa/passkey/recovery-api` 73 | `user-management/react`: `Login`, `TotpSettings`, `Passkeys`, `Users`, `Members`. Shell session hook already has a generation guard (`use-admin-shell-session.ts:36`). | **Mostly already moved.** `Login`, TOTP and passkeys already delegate (`auth/Login.tsx`, `security/Security.tsx` imports). `useAdminSession` becomes a ~80-line `AdminShellSessionPort` adapter. `Authentication.tsx` + `provider-schemas` (305, sign-in provider settings) is **MOVE PART** to `user-management/react` once OAuth provider schemas come through a port. | Boot-token redeem, local-owner bootstrap, owner recovery sign-in (`OwnerRecoverySignIn` 41), publish-to-live flag. | `AdminShellSessionPort.read` does the boot-token and local-owner steps inside the adapter. No Jini change. |
| **Permissions/roles**: `panel-access.ts` 94; `features/roles` 3,498 (1,524 i18n); `users` 1,910 (1,583 i18n, already delegates); `members` 802 (delegates) | `admin/core/permissions/rules.ts` `hasPermission` (`'*'` + exact match). Manifest `permissions` is **all-of** (`manifest/types.ts:168`). No roles screen. | **MOVE.** (1) Add `anyOfPermissions` to `AdminPanel`. Treat "permissions unknown" as "show all" (`panel-access.ts:49`). Then delete Tovu's file. (2) The Roles screen (~1,965 non-i18n: `Roles.tsx` 867, `use-roles` 626, deps 194, rules 112, `Roles.hooks` 128, port 38) moves to a **new `user-management/react/roles`**. | Grant catalog contents, Tovu role names, dictionary text (moves with the screen if neutral). | `RolesPort` {listRoles, readGrantCatalog, saveRole, deleteRole, assign}. Server stays authoritative. |
| **API client/query**: `lib/api.ts` 4,492. Lines 1–2,340: 194 types. Lines ~2,340–2,844: transport. Lines 2,844–4,492: 219 methods. Also `server-reconnect` 165, `settings-effective-reads` 64, `fetch-query/` 40, `tab-event-source` 75, `visible-interval` 72 | `admin/core/transport` 359 (`createHttpTransport`, `createAdminClient`, `AdminRouteGroupFactory`). It is a near-copy of Tovu's fetch/timeout/unreachable code, including the same "out of free connections" message. `@jini-ai/ui/fetch-query` (the Tovu provider is already a 35-line wrapper). | **MOVE PART, transport only (~450 net deleted from Tovu).** Add options to `createHttpTransport`: `onUnauthenticated`, an `errorFactory`/decode port, a `reconnect` port (ride out a restart), keepalive sizing, a `redact` port. Move `createServerReconnect` (165), `tab-event-source` and `visible-interval` into `admin/browser`. | The 219 methods and 194 types. Split them by domain into route-group factories next to each feature; this is mechanical. Workspace id (`api.ts:21`), `x-tovu-upstream-status` header name, the reconnect banner. | `AdminTransport` (exists). New options are ports. |
| **Theming/tokens**: `admin-themes/*.ts` 372; CSS: classic 442+89, glass 265+72, fonts; `use-admin-appearance` 135; `use-interface-preferences` 60; `styles.css` 6,799 | `ui/theme` (apply, color scheme). Shell `use-admin-theme` 61 + `theme-ports` 21. `admin/src/themes/default` (51+21 CSS, a different and much smaller theme). | **MOVE PART.** The registry, scheme resolution, storage and paint (`apply.ts`, `registry.ts`, `use-admin-theme.hooks.ts`) repeat Jini's shell theme. Fold them into `admin/react/shell` with a server-backed `AdminThemePreferenceStorePort`. Classic and glass CSS packs can ship as `admin/themes/classic|glass` **after renaming `--tovu-*` tokens** (9 and 8 refs). | `styles.css` and feature CSS until the features move. Accent and density persistence stay in Tovu settings. | `themePreferenceStore`, `themeEnvironment`, `AdminShellAppearance` (exist). |
| **Assistant dock**: `components/AssistantDock` 8,600 (2,196 i18n) | `chat/react` (23.1k lines: `ChatPane`, `A2uiSurfaceCard`, renderer registries, `FolderChips`); `ui/folder-path-drop`; `chat/transports/http` and `ag-ui` (Tovu's transport already uses them, `lib/assistant-transport.ts:1`) | **MOVE PART, ~2.1k + ~0.7k i18n to `chat/react` and `chat/core`.** Agent failure redaction and card (`agent-failure` 207, scanners 213, card hooks 82). Overflow modal and detection (~300). Routed A2UI and MCP-UI surface cards (~330). Dock renderer registry 191. Slow-run notice 105. Folder-drop notices (~194). Dock header, settings menu and display preferences (~650, after removing the Tovu tip). Send/stop guard 45. | `AssistantDock.tsx` 664 (composition). `AssistantDock.hooks.tsx` 2,133: execution config, BYOK, local CLI, skills, agent plugins and daemon prewarm. Its ~400 generic helpers (agents loader cache `:1289-1400`, message-change publish `:1531-1632`, MCP-UI sandbox URL `:1787`) can follow later. Plugin tray, runtime preferences. | `ChatPane` ports (exist). New: `FailureSurface` and an `OverflowPolicy` prop. |
| **Assistant settings**: `features/ai-assistant` 7,606 (4,007 i18n) | none | **STAY.** It is Tovu product settings: admin/visitor assistant switches, visitor tools, visitor credential form (706-line hook), daemon restart, subagents, permanent deletes. `AssistantToggleRow` (54) could go to `ui` later. | All | None |

Assistant libs outside the dock (`lib/assistant-*`, `execution-settings` 551, `agent-screenshot` 356, `browser-stream` 193, `durable-run-subscription` 89, about 2.2k in total) stay with the dock composition for now. `durable-run-subscription`, `queued-daemon-start` and `stream-activity` (~200) are generic `chat/browser` candidates for a later pass.

## Area 2: site-chat (`apps/site-chat`)

**What it is:** the public visitor chat on Tovu-rendered sites. It builds three bundles: a React IIFE (`main.tsx`), a lazy loader (`loader-entry.ts`) and a no-React vanilla version (`vanilla-entry.ts`). It talks to `POST /api/site-assistant/chat` (`site-assistant-transport.ts:35`): one SSE stream per turn, with `text`/`error`/`end`/`client_directive` frames. Nothing persists on the server. It already uses Jini's `embed` header and dialog, `lazy-loader`, `vanilla` and `frontend-session-bridge`.

| Group (TS lines) | Jini equivalent | Verdict |
|---|---|---|
| `site-assistant-transport.ts` 327 | `chat/transports/fetch-sse` 206 (`createFetchSseTransport`, `mapJsonChatSseFrame`, history caps, injected copy) | **DELETE copy → config (~60).** Jini lacks the 90 s idle timeout (`site-assistant-transport.ts:39`) and the tool-confirmation directive receiver (`:196`). Add both as options. |
| `session-store.ts` 177 | `chat/browser/session-store` 91 (injected keys, limits, Storage) | **DELETE copy.** Pass key `tovu.site-assistant.transcript.v1` and the same caps (50 messages, 200 KB). Check the envelope shape matches. If it doesn't, open tabs lose their transcript; it is per-tab only, so the impact is low. |
| `SiteAssistantWidget` 157 + `Activation.hooks` 67 + `Header` 38 | `chat/react/embed` `EmbedChatWidget` 78 + header and dialog hooks | **DELETE copy → mount config.** |
| Tool confirmation: `tool-confirmation` 31, `SiteToolConfirmation.hooks` 30, `vanilla-tool-confirmation` 83 = 144 | none | **MOVE** to `chat/react/embed` + `chat/vanilla` as a generic "confirm a tool directive" UI. The host supplies the parser and the post-back. |
| Host config: `main.tsx`, entries, `loader-host`, `vanilla-host`, `visitor-page-control` 101 + `visitor-site-path` 14, i18n 46, errors 32, `remixicon-override` 68, `site-chat-comparison` 68 = 523 | n/a | **STAY.** Endpoint, mount id, copy, allowed visitor paths, micromark renderer, diagnostic comparison. |
| CSS: `widget.css` 658, `vanilla-theme` 83, `site-chat-theme` 39 | `chat/vanilla/style.css` | **STAY** (site skin). |
| `public/remixicon.css` 3,270 | `ui/src/react/components/remixicon-font/remixicon.css`, **0-line diff** | **DELETE copy.** Copy it from `@jini-ai/ui` at build time (`remixicon-override.ts:31` explains why it must be served next to the bundle). |

Contract: `{ endpoint, fetch, decode (SSE port), requestBuilder, frameMapper, copy, storage + key + caps, onToolDirective, pagePolicy (allowsVisitorPath), renderMarkdown (vanilla), mountId }`. All of these already exist in `fetch-sse`, `session-store`, `embed` and `vanilla` except the idle timeout and the directive UI.

## Area 3: @tovu/sdk (`packages/sdk`, 308 lines)

**What exists in Jini:**
- `plugin-format.ts:5-7` makes `@jini-ai/plugin-sdk` canonical and keeps `@tovu/sdk` as a legacy alias. It is only a **virtual specifier**: no package by that name is published or installed (`node_modules/@jini-ai/` has no `plugin-sdk`).
- Jini has the host-side `PluginSdk<H>`, `DefinedPlugin` and `PluginSdkBinding` ports (`host/ports.ts:16-42`).
- The worker accepts an injected `registerSdkResolver` (`host/worker/start.ts:31,64`).
- A 214-line **test copy** of the SDK sits at `host/__tests__/support/fixture-sdk.ts`.

**What Tovu does:**
- `features/plugin-runtime/sdk-resolver.ts` (124) registers `node:module` `register()` with a `data:` hook. The hook redirects every name in `PLUGIN_SDK_SPECIFIERS` to `require.resolve('@tovu/sdk')` (`:69`).
- It is called at boot (`index.ts:24`), in `serve.ts:27`, and per Tier-2 worker (`plugin-tier2/worker.ts:47`).
- `host-binding.ts:26-35` pins `runtimeSdkVersion: "0.1.0"`. It takes `definePlugin`, `HOOK_POINTS` and the beforeSave hook from `@tovu/sdk`.
- `readDefinedPlugin` (`plugin-export.ts`) is structural, so module identity does not matter.

| Piece | Lines | Generic? | Home |
|---|---|---|---|
| `definePlugin`, `Plugin`, `PluginDefinition`, `PluginSdk` shape, `HookContext`, `ExtPatch`, `FilterFn`/`ActionFn`/`ContributionFn`, `HookAttachOptions`, contribution type re-exports, tokens `hooks.attach`/`http.route.register`/`tools.register`/`render.contribute` | ~190 (`index.ts`) | Yes | **`@jini-ai/plugins/sdk`** (new subpath). Dedupe with `host/ports.ts` `PluginSdk<H>` and delete `fixture-sdk.ts`. |
| `HookKind`, `HookPointDescriptor`, name-derivation types | ~50 (`hooks.ts`) | Yes | Same subpath, generic over a host catalog. |
| `HOOK_POINTS` entry `content.entry.beforeSave`, `HookSignatures`, `ContentEntryDraft` (title/slug/status/bodyJson), tokens `content.read`/`content.extend` | ~60 | No (host vocabulary) | **Stays in Tovu** as a ~40-line host SDK module: `export * from '@jini-ai/plugins/sdk'` plus the catalog. Its exports must match today's runtime values exactly. |
| `registerPluginSdkResolver` (once-per-process guard, `data:` hook, specifier list) | 124 | Yes | **`@jini-ai/plugins/host/node`** as `registerPluginSdkResolver({ sdkModuleUrl }, { specifiers })`. Tovu passes its host SDK URL. |
| `readDefinedPlugin` | ~10 | Yes | `@jini-ai/plugins/sdk` (default for the binding). |

**Why a subpath and not a new package:** a published `@jini-ai/plugin-sdk` would have to import types from `@jini-ai/plugins`, which breaks the owner's no-cross-import rule. The subpath has no new dependency. Make `@jini-ai/plugins/sdk` the real, typed specifier authors import. Keep `@jini-ai/plugin-sdk` and `@tovu/sdk` in `PLUGIN_SDK_SPECIFIERS` permanently.

**Traps (each needs a proof):**
1. **Saved plugins** import `@tovu/sdk` and declare `sdkRange: "^0.1.0"` (`samples/testimonials-faq/tovu.plugin.json:5`, e2e fixtures). Keep an `SDK_ABI_VERSION = "0.1.0"` constant. Never use `@jini-ai/plugins`' npm version (0.7.1) as the SDK version, or every saved plugin fails the range check.
2. **Runtime exports**: prebuilt `server/index.mjs` files import `definePlugin`, `HOOK_CONTENT_ENTRY_BEFORE_SAVE`, `HOOK_POINTS` and the token constants by name. The module the resolver points at must keep every one of them.
3. **The resolver must keep pointing at the host module**, not at bare `@jini-ai/plugins/sdk`; otherwise the Tovu catalog values disappear. The Tier-2 worker must register it per worker (`start.ts:60` already does).
4. **Packaging**: `Dockerfile:51-57` builds `packages/sdk`. Desktop staging declares `@tovu/sdk` (`stage-payload-run.test.ts:156`). `.dependency-cruiser.mjs:265-274` limits `node:module` to the plugin-runtime folder. All three change, and the packaged desktop must still resolve the host module (memory rule: "fixed" means the packaged app works).
5. **Planted `node_modules/@tovu/sdk`** next to a plugin must still be ignored (`shortCircuit: true`).

## Dedupe opportunities (biggest first)

| Duplicate | Jini side | Tovu side | Action |
|---|---|---|---|
| Remixicon CSS | `ui/.../remixicon.css` 3,270 | `site-chat/public/remixicon.css` 3,270 (identical) | Copy at build |
| Admin shell | `admin/react/shell` ~450 (unused) | `App.tsx:578-889` + parts of `App.hooks.ts` | Tovu adopts Jini shell |
| Site chat widget | `chat/embed-widget` ~1,100 | site-chat ~770 | Tovu uses Jini |
| Security screens | `admin/security` (+ react, adapters; unused by Tovu) | `features/security` 8,093 (2,408 i18n) | Owner to pick one; Tovu's is the live one (site key, recovery codes). Out of this survey's scope. |
| HTTP transport | `admin/core/transport` 359 | `api.ts` ~500 | Extend Jini options, delete Tovu copy |
| Admin theme mechanics | shell `use-admin-theme` + `ui/theme` | `admin-themes/*.ts` 372 | Fold into the Jini port |
| Plugin SDK | `fixture-sdk.ts` 214 + `ports.ts` `PluginSdk` | `packages/sdk` 308 | One `plugins/sdk` |
| Permission gate | `hasPermission` + all-of `permissions` | `panel-access.ts` 94 (any-of) | Add `anyOfPermissions` |

## Rough order, size, cost, proof

Cost basis: Opus Claude Cloud sessions with hard caps. The token figures use the earlier survey's ratio (~400 tokens per touched line, from 22.8M for 58k lines). They are planning numbers, not measurements.

| # | Step | Touched lines | Cost | What proves it |
|---|---|---|---|---|
| 0 | Owner decision: may `*/react` import `@jini-ai/ui`, or must it be injected? Fix `App.hooks.ts:1` (imports `apps/website/.../assistant-tool-approval-policy.js`). | ~50 | none / tiny | The Jini import checker passes on the touched packages. |
| 1 | SDK: `plugins/sdk` + resolver in `host/node`; Tovu host module; alias list; ABI const | ~600 | 1 session, ≤2 h, ~0.3–0.5M tok | Saved `@tovu/sdk` fixture plugins (sdkRange `^0.1.0`) load in-process, in the Tier-2 worker and via `export`. Planted-`node_modules` test still redirects. Packaged desktop boots a plugin. Published typecheck. |
| 2 | site-chat onto embed-widget (+ idle timeout, + directive UI in Jini) | ~1,000 | 1 session, 2–3 h, ~0.4M | `check-bundle-mounts` passes; `measure-bundles` not larger. Chrome on fake-test-site: React, vanilla and lazy loader each send a turn, reload restores the transcript, a tool confirmation works, the idle timeout shows an error. |
| 3 | Jini shell contracts: `anyOfPermissions`, transport options, `onSessionAccepted`, dock pane layout + sidebar hooks, theme registry port | ~1,500 Jini | 1–2 sessions, ~0.6M | Unit tests for any-of and unknown permissions. A notes-style example renders the shell with zero Tovu code. |
| 4 | Tovu adopts Jini `AdminShell` + transport + theme; delete local copies | 2–4k | 2 sessions, ~1–1.6M | Chrome look at every panel in classic and glass, plus the mobile drawer. Permission matrix (any-of). Network log: zero extra requests per action. Logout/login identity switch clears drafts. Restart ride-out still works. |
| 5 | Roles screen to `user-management/react/roles` | ~2k + 1.5k i18n | 1 session, ~1M | Roles CRUD in the real admin. Existing roles tests are ported. |
| 6 | Dock generic pieces to `chat/react`/`chat/core` | ~2.1k + ~0.7k i18n | 1–2 sessions, ~1.1M | Real admin chat on localhost via Chrome with each supported CLI: failure card, overflow, A2UI/MCP-UI cards, folder drop. |
| 7 | Split `api.ts` methods into per-domain route groups (Tovu only) | ~3.9k moved | 1 session (mechanical) | Typecheck + scoped tests on changed files. |

**Not checked:** builds, tests, runtime or visual parity, the envelope shape of the Jini session store against Tovu's, and every function body. The earlier admin survey covers domain screens; they are not repeated here.
