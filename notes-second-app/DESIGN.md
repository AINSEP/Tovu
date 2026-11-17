# Notes: the second app that proves Jini reuse by wiring alone (DESIGN, 2026-11-17)

> **Revision 2 (2026-11-17).** `INDEX.md` §0 and "Revision 2 - judge response" override this file where they differ.
> In short: G2 is owned by lane S sheet S2 (NOTES consumes it); G8 is not a gap (`@jini-ai/mcp` exports `./bin`);
> G15's owner is lane S sheet S3; G16 is decided before G6; new gaps G19 (update tool forwards `body`), G20 (page API
> and read bound, S2's owner), G21 (conflict answer from entry tools), G22 (MCP callback credential, not designed yet);
> Node `fs`/lock/process bindings (only) live in `@jini-ai/node-adapters`, created by xpkg N1 (revision 3: the `node:http`
> adapter is **not** there; it already exists as `@jini-ai/http-kit/node-bridge`, see G1);
> the admin is mounted at `/admin/`; React entries importing `@jini-ai/ui-kit/react` is the approved option C;
> `authorize` mutations use the evaluator's `{ allowed, reason }` shape. The sections below were not rewritten in place.
>
> **Revision 3 (2026-11-16, Opus review; `INDEX.md` section 00 overrides this file).** G1: notes-app adopts the existing
> `@jini-ai/http-kit/node-bridge` (`createNodeDispatcher`); no new adapter; OD-N2 moot. G11/G12/G13: the
> desktop-extraction plan owns `desktop-host` `./bridge` (its D0d), the IPC kit at `./electron/ipc` (its D1a) and every
> change to `createNodeSidecarLauncher` (its D3a/D3c1); notes sheet D0 is withdrawn and D1 consumes them; this plan owns
> `examples/notes-desktop` and the devops packaging recipe (D2). G19 is **on hold** as owner decision OD-N13 (the field
> is `bodyJson`; its absence from the update tool is deliberate, `cms/src/entries/agent-tools.ts:35-41`); the assistant
> round trip changes a note's title. The rows below that disagree are marked "rev 3".

Planning only. No source file was changed, nothing was built, typechecked or run. Every claim below
was read from git objects or the checked-out tree named in §0; what could not be checked is in §9.

## 0. Bases read

| Repo | Ref read | SHA | Note |
|---|---|---|---|
| Jini | `integ/merge-b-2026-11-16` (primary) | `674a19ea` | Newest structural state (package moves, size splits). |
| Jini | `integ/merge-a-2026-11-16`, `refactor/terra` | `96aade8c`, `02edbb68` | Cross-check: for every path cited in this design the three refs are identical, except `packages/chat/package.json` (+9 lines on merge-b). |
| Tovu | `refactor/terra` (worktree) | `80b00f5b` | Only used to locate the Tovu-side owners named in §5. `integ/merge-a/-b` exist in Tovu too and were not read. |

`integ/merge-final-2026-11-16` did not exist at start. merge-a and merge-b are two parallel, still-moving
integration branches (neither contains the other). Executors rebase the sheets on merge-final when it exists.

## 1. Finding that changes the brief

A notes app **already exists**: `examples/notes-app` (977 lines incl. tests; server-rendered HTML on a plain
`node:http` adapter; notes via `@jini-ai/cms/entries`, a contact form via `@jini-ai/cms/forms`, SQLite via
`@jini-ai/db`). It already carries 6 `// GAP:` markers. It has **no admin UI, no search, no assistant and no
desktop shell**, and no example anywhere imports `@jini-ai/admin`'s React shell (`rg "@jini-ai/admin" examples`
hits only `neutral-host`'s contract test). So this design **extends** that app instead of starting a new one.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Lives in Jini `examples/`**: `notes-app` (server, exists), `notes-web` (new, Vite + React), `notes-desktop` (new, Electron). No Tovu code is read or copied by any sheet. | Gaps are closed in the same repo and commit range as the proof; `pnpm -r typecheck` makes the app a second-consumer gate for the xpkg lanes; `examples/*` is already a workspace glob. A separate repo is deferred (OD-N1): the interim "outside the monorepo" proof is a packed-tarball boot like `minimal-host`'s `health-boot`. |
| D2 | **Two phases.** Phase A builds the app with what Jini exports today; every line the app must write that Jini should own goes into `src/gaps/*.ts` with a `// GAP: G<n>` header and a line budget enforced by a test. Phase B closes each gap in its Jini owner and **deletes** the matching glue file (deletion ledger in each sheet). | The gap list is the deliverable. A ratcheting budget makes "Tovu-shaped coupling that remains" a number, and stops glue from growing silently. |
| D3 | **Feature set v1:** notes list/create/edit/publish/unpublish (no delete: the entry services have none, see G2), text search, an assistant docked in the admin shell that lists/creates/updates/publishes notes through tools, optional desktop shell. One local owner, no login (OD-N4). | Smallest set that exercises storage, admin shell + entity CRUD, chat + tools and the desktop host. |
| D4 | **The assistant uses the existing tool path**, not a new one: host passes `buildEntriesRegistrations(deps)` (`@jini-ai/cms/entries`) as `toolRegistrations` to `createLocalNodeDaemon` (`@jini-ai/server`); an agent CLI reaches them through the `jini-mcp` bin (`@jini-ai/mcp`) and `POST /api/delegated-tool-calls`; every call goes through the daemon's `ToolExecutor` (authorization, confirmation, audit). | Verified in `packages/server/src/create-local-node-daemon.ts:120-225`, `packages/cms/src/entries/tool-registrations.ts:147`, `examples/reference-web/src/daemon.ts:94-135,397-408`. |
| D5 | **Human and assistant write through the same service** (`createEntry`/`updateEntry`/`publishEntry` with `expectedVersion`). The admin entity adapter declares `version` as an integer field and sends it back; a stale submission is a 409, never a silent overwrite. | Lesson 16. `AdminEntityPort.update` carries no `expectedVersion` by design (`core/ports/entities.ts`), so the adapter must. |
| D6 | **Desktop second**, as a sidecar: Electron main (via `@jini-ai/desktop-host/electron`) spawns `node src/main.ts --port 0` and loads its URL. No server code runs in the Electron main process. | `better-sqlite3` then runs under plain Node (no Electron ABI rebuild); matches the desktop survey. |

Rejected: a brand-new app (duplicates `notes-app`); a hand-written notes table and SQL in the app (that is
exactly the copying the owner forbids, and hides G2); using `@jini-ai/chat/transports/http` for chat (its
ports are shaped around Tovu's assistant: `byokTurnUrl`, `byokRunIdPrefix`, `agUi`, see G7); running the server
inside Electron (native ABI, and it hides G11–G13).

## 3. Target shape

```
examples/notes-app/            (Node, no bundler; runs .ts by type stripping; node --test)
  src/main.ts                  composition root: db -> ports -> notes server -> daemon -> listen
  src/node-server.ts           Server adapter over node:http            [GAP G1 -> deleted; http-kit/node-bridge]
  src/db.ts, notes-repo.ts     table bootstrap + SQL entry repo         [GAP G2 -> cms/entries/sql]
  src/ports.ts                 clock/ids/authorize/no-op outbox         [GAP G17 no-op ports]
  src/notes-entity.ts          AdminEntityPort<NoteDescriptor> over cms entries services (app mapping, stays)
  src/gaps/entity-routes.ts    REST routes for one AdminEntityPort      [GAP G6]
  src/gaps/note-search.ts      bounded text filter over listEntries     [GAP G3]
  src/gaps/origin-guard.ts     Host/Origin check middleware (only if core's guard does not fit; N0 decides)
  src/gaps/daemon-proxy.ts     same-origin pass-through to the daemon   [GAP G9]
  src/gaps/mcp-bin.ts          resolve the jini-mcp bin path            [GAP G8]
  src/assistant.ts             createLocalNodeDaemon wiring: tools, principal, run input
  src/app.ts, pages.ts         existing HTML pages + contact form (kept; split to <=50-line functions)
examples/notes-web/            (Vite + React 19; vitest + jsdom)  FSD: app / pages / features / entities / shared
  src/app/                     main.tsx, providers (AdminKitProvider, FetchQuery), shell labels
  src/pages/notes/             AdminShell with the entity panel + search panel
  src/features/assistant/      ChatPane in AdminShell's assistant slot
  src/entities/note/           note descriptor (shared shape with the server via a JSON endpoint, not an import)
  src/shared/kit/admin-kit.ts  the host's AdminKit binding              [GAP G4: unused slots are stubs]
  src/shared/gaps/entity-http-adapter.ts   AdminEntityPort over fetch   [GAP G6]
examples/notes-desktop/        (Electron; tsc build to dist/; vitest)
  src/main.ts, preload.cts     desktop-host wiring; sidecar = notes-app
```

### Wiring diagram

```
 browser / Electron renderer (notes-web)                      Node process (notes-app)
 ┌──────────────────────────────────────────┐   same origin   ┌──────────────────────────────────────────────┐
 │ AdminKitProvider(kit = host binding)     │                 │ Server (core contract) on node:http  [G1]    │
 │  AdminShell  (@jini-ai/admin/react/shell)│  /api/entities  │  ├ origin guard middleware                   │
 │   ├ panel: createEntityPanel(registry)   │ ───────────────▶│  ├ entity routes [G6] ─▶ NoteEntityPort      │
 │   │    registry = createAdminEntityReg.  │                 │  │      └▶ cms/entries create/update/publish │
 │   │    port = http adapter [G6]          │  /api/notes?q=  │  ├ note search [G3]                          │
 │   ├ panel: Search (app page)             │ ───────────────▶│  ├ static files of notes-web/dist            │
 │   └ slot assistant: ChatPane             │  /api/runs*     │  └ daemon proxy [G9] ──┐                     │
 │        transport = daemon runs [G7]      │ ───────────────▶│                        ▼ loopback, bearer    │
 └──────────────────────────────────────────┘      SSE        │ createLocalNodeDaemon (@jini-ai/server)      │
                                                              │  toolRegistrations = buildEntriesRegistrations│
 agent CLI (spawned by daemon's AgentExecutor)                │  resolveDelegatedPrincipal = local owner     │
   └ jini-mcp bin [G8] ── POST /api/delegated-tool-calls ───▶ │  ToolExecutor ─▶ same cms/entries services   │
                                                              │ SQLite: one file; kernel from @jini-ai/db    │
 Electron main (notes-desktop, phase D)                       │  entries table [G2], forms tables            │
   desktop-host/electron + sidecar launcher [G13] ──spawn───▶ └──────────────────────────────────────────────┘
   preload: typed, sender-checked bridge [G11, G12]
```

Ports and who binds them (hexagonal view of `notes-app`):

| Kind | Port (owner) | Bound in `main.ts` to |
|---|---|---|
| Inbound adapter | `Server` (`@jini-ai/core/contracts/server`) | `createNodeServer()` (G1) |
| Inbound adapter | `ToolRegistration[]` (`@jini-ai/core`) | `buildEntriesRegistrations` (cms) via the daemon |
| Outbound | `EntryRepoPort & EntryListPort` (cms) | `createSqlEntryRepo({kernel})` (G2) |
| Outbound | `AuthorizeFn` (`@jini-ai/core/contracts/events`) | local-owner policy in `ports.ts` (app policy, stays) |
| Outbound | `Clock`, `IdGenerator` (core primitives) | `@jini-ai/platform/system` |
| Outbound | `SqliteSyncOpener` (db/server) | `better-sqlite3`, injected by the host |
| Outbound | `OutboxPort` / `FormOutboxPort` / dispatcher (cms) | discard/no-op (G17) |
| UI ports | `AdminShellSessionPort`, `AdminShellNavigationPort`, `EntityRegistryPort`, `EntityTranslate`, `AdminKit`, `ChatTransport` | notes-web `app/` (session = fixed local owner; navigation = `@jini-ai/admin/browser/shell-navigation`) |

Core tests run without infrastructure: `InMemoryEntryRepo` (cms), `createInMemoryServer`
(`@jini-ai/core/contracts/server/testing`), `fakeAdminKit` (`@jini-ai/admin/react/testing-kit`), a scripted
`onRunStarted` handler instead of a vendor CLI (the `minimal-host` pattern).

## 4. What is reused as-is (verified exports)

| Need | Jini export (file read) | State |
|---|---|---|
| HTTP contract, middleware, json routes, SSE helpers, in-memory server, conformance | `@jini-ai/core/contracts/server`, `/testing`, `/conformance` | exists |
| SQLite connection + kernel | `@jini-ai/db/sqlite`, `/kernel/sqlite` (host injects `better-sqlite3`) | exists, used by notes-app |
| Note lifecycle | `@jini-ai/cms/entries`: `createEntry`, `updateEntry`, `publishEntry`, `unpublishEntry`, `listEntries`, `InMemoryEntryRepo` | exists; **no SQL repo** (G2) |
| Assistant tools for notes | `@jini-ai/cms/entries`: `buildEntriesRegistrations`, `entriesAgentToolCatalog` (5 tools: list/create/update/publish/unpublish) | exists; no search tool, no delete |
| Admin shell | `@jini-ai/admin/react/shell`: `AdminShell`, session/navigation/theme ports, `assistant` slot | exists, **zero consumers** until this app |
| Entity CRUD screens | `@jini-ai/admin/react/entities`: `createEntityPanel`, `EntityList/Detail/Edit`; `@jini-ai/admin/core`: `createAdminEntityRegistry` | exists; text field is a single-line `<input>` (G5); list has no search (G3); no adapters (G6) |
| UI kit injection | `@jini-ai/admin/react/kit`: `AdminKit`, `AdminKitProvider`; `/react/testing-kit`: `fakeAdminKit` | exists; monolithic (G4) |
| Daemon + tools + agent runs | `@jini-ai/server`: `createLocalNodeDaemon({ toolRegistrations, resolveDelegatedPrincipal, onRunStarted \| resolveRunInput, security })` | exists; Express inside (G9) |
| Agent spawn | `@jini-ai/daemon`: `createAgentExecutor`; `@jini-ai/agent-runtime`: `createNativeAgentRuntime` | exists (pattern in `minimal-host/src/index.ts`) |
| Chat UI | `@jini-ai/chat/react`: `ChatPane`, `ChatTransport` port (`chat/core/transport.ts:97`) | exists; no daemon transport (G7) |
| Desktop window/shell/protocol/updates | `@jini-ai/desktop-host/electron`, `/electron/navigation-policy`, `/electron/usability`, `/shutdown` | exists; no `./ipc`, no `./bridge` (G11, G12) |
| Electron packaging helpers | `@jini-ai/devops/packaging/electron` | exists; no recipe (G14) |

## 5. Gap list (the main result)

Each gap is a missing contract, port or subpath. "Tovu side" names where the same thing lives in Tovu today,
which is the coupling. Sheets are in `sheets/`. "No sheet" means an existing lane owns it or a design is needed first.

| ID | Gap (evidence) | Tovu side today | Jini owner + proposed surface | Sheet |
|---|---|---|---|---|
| **G1** | No packaged `Server` adapter for `node:http`. `examples/notes-app/src/node-server.ts` (182 lines) and `examples/cookie-consent-standalone/server.mjs` each hand-roll one; core ships only `createInMemoryServer`. | Tovu mounts on Express via http-kit. | rev 3: none new. Adopt the existing `@jini-ai/http-kit/node-bridge` (`createNodeDispatcher`) and delete the example adapter; OD-N2 moot. | `G1-node-server.md` |
| **G2** | `@jini-ai/cms/entries` exports services and ports but **no SQL repo and no table bootstrap** (`entries/index.ts:99` says "deliberately"), while `forms`, `comments`, `redirects`, `widgets` all ship `./sql`. notes-app registers itself as a fake Tier-2 plugin through `declareDataModule` and stores `EntryRecord` as one JSON column; revisions are dropped (`notes-repo.ts`). There is no delete in the entry services at all. | `apps/website/src/features/entries/repo.ts` (+ Tovu migrations). | `@jini-ai/cms` new `./entries/sql`: `createEntriesTables`, `entryRepoFor`, with a **domain-local kernel port** (no `cms -> db` import; same fix as notes-app-review finding 1). Needs OD-N3. | `G2-entries-sql.md` |
| **G3** | No text search anywhere a small app can wire: `EntryListPort.listByWorkspace` takes `type/status/orderDirection/limit` only (no text, no cursor); `AdminEntityListQuery.filter` has `eq/neq/lt/lte/gt/gte` only; `EntityList` has no search box. `@jini-ai/search` is **site search**: `SearchDocumentKey.siteId`, `SearchDocument.url` ("site-relative public URL"), its real provider (`BUILTIN_SEARCH_PROVIDER_ID`) is implemented in Tovu, and the in-memory provider is exported only from `./testkit`. | `apps/website/src/features/site-search/*`, `…/composition/modules/site-search.ts`. | (a) `@jini-ai/cms`: `listByWorkspace` optional `{ text, cursor }` (in G2). (b) `@jini-ai/admin`: `AdminEntityListQuery.search?: string` + a search box in `EntityList` (in G5). (c) `@jini-ai/search`: generalise `siteId`/`url` to a host scope and ship a production in-process provider: **design needed, no sheet** (lesson 20; OD-N5). | (a) G2, (b) G5, (c) none |
| **G4** | `AdminKit` is all-or-nothing: 19 components (incl. `HtmlEditor`, `Lightbox`, `TabBar`), 6 hooks, 5 query hooks, `mediaProviders`, `theme` are all required to render one entity list; no packaged default binding exists, so each host re-types Tovu's `jini-kits.ts`. `react/shell/use-admin-theme.ts:2` still imports `@jini-ai/ui/theme` directly although the kit has a `theme` slot. | `apps/admin/src/integrations/jini-kits.ts` (32 lines over 8 `@jini-ai/ui*` subpaths). | `@jini-ai/admin`: split into a required core kit and optional feature kits (missing optional slot = typed error at first render, naming the slot). Default binding home is OD-N8. Must follow xpkg R1c/R2a/R2b (same file). | `G4-admin-kit-slices.md` |
| **G5** | Entity fields cannot be customised: `EntityField.tsx:66-77` renders `text` as `<input>`; a note body needs a multi-line editor, and `version` must be read-only. No `renderField` port, no read-only flag. | Tovu does not use the entity screens for its content; it has bespoke editors. | `@jini-ai/admin/react/entities`: `renderField?` port on `EntityScreenDependencies`/`createEntityPanel` options; plus G3(b). | `G5-field-renderer-search.md` |
| **G6** | Entities are the only admin domain with **no adapters**: `media`, `security`, `forms`, `comments`, `redirects`, `seo`, `widgets`, `playground`, `source-control`, `agent-plugins` each export `adapters/http`, `adapters/memory`, `conformance`; entities export none, and nothing registers entity routes on a `Server`. | Tovu's per-domain route groups in `apps/admin/src/lib/api.ts`. | `@jini-ai/admin` new `./entities/adapters/http`, `./entities/adapters/memory`, `./entities/conformance`, `./entities/server` (`registerEntityRoutes({ app: Server, registry, authorize })`). | `G6-entity-adapters.md` |
| **G7** | No packaged `ChatTransport` for the daemon's own run API. `examples/reference-web/src/daemon-transport.ts` (283) + `run-event-frames.ts` (26) are example code; `@jini-ai/chat/transports/http` = `createAssistantTransportClient`, whose required ports include `byokTurnUrl`, `byokRunIdPrefix`, `agUi`, `projectPrompt`, `acceptRun` and whose docs cite Tovu's `AssistantDock`. | `apps/admin/src/lib/assistant-transport.ts`. | `@jini-ai/chat` new `./transports/daemon-runs` (`createDaemonRunsTransport({ baseUrl, fetch, resolveRunInput })`, rev 3: `resolveRunInput` required), moved from reference-web. Coordinate with C-CHAT-DEPS. | `G7-chat-daemon-transport.md` |
| **G8** | The `jini-mcp` bridge resolver lives in an example and hard-codes the monorepo path `packages/mcp/dist/bin/serve.js` (`reference-web/src/mcp-bridge.ts`). An installed consumer has no supported way to get the bin path. | Tovu resolves its own bundled path. | rev 2: not a gap, `@jini-ai/mcp` already exports `./bin`. | `G8-mcp-bin.md` (withdrawn) |
| **G9** | The only assembled daemon is Express-bound: `create-local-node-daemon.ts:38,374` (`express()`), `LocalNodeHttpExtension = (app: Express, …)`, 24 files under `daemon/src/http` still typed `Express`. A host on the `Server` contract cannot mount daemon routes; it needs a second listener, an `express` install and a proxy. Breaks "no specific server framework in Jini". | Tovu owns an Express app, so it never sees this. | Existing lanes: daemon **R7** (routes to the `Server` contract), **R13** (preset). After they land: `createLocalNodeDaemon` (or a sibling) accepts `{ app: Server }`. | none (existing lanes); follow-up N6 in INDEX §6 |
| **G10** | Package closure: `@jini-ai/admin` declares peers on `agentic`, `ui`, `ui-kit`, `agent-plugins`, `cms`; `@jini-ai/chat` has hard dependencies on `agentic`, `db`, `diagnostics` and peers on `agent-runtime`, `ui`; `@jini-ai/server` peers `express`. A notes app installs CMS, agent plugins and Express to show a list. | n/a (this is the coupling itself). | Existing lanes: G-STALE-DEPS, R1–R4, C-CHAT-DEPS, R7/R13. notes-app is the measuring stick: N5 records the install closure; each lane should shrink it. | none (existing lanes) |
| **G11** | No typed, sender-checked IPC kit. `reference-desktop` hand-writes `ipcMain.handle` + `contextBridge.exposeInMainWorld` with string channels (`preload.cts`). | `apps/desktop/src/contracts/*`, `preload`. | rev 3: desktop-extraction plan D1a, `./electron/ipc` + `./electron/ipc/preload` (notes `./ipc` withdrawn). | desktop D1a (notes D1 consumes) |
| **G12** | No renderer-safe entry: the root `.` re-exports `sidecar.ts` (`node:child_process`), `logging.ts` (`node:fs`), `windows-registry.ts` next to `bridge.ts`. | Tovu shims. | rev 3: desktop-extraction plan D0d, `./bridge`. | desktop D0d (notes D1 consumes) |
| **G13** | `createNodeSidecarLauncher` sends child stdout/stderr to a log file (`sidecar.ts:166`), so a host cannot read a ready line with the port. | `apps/desktop/src/tovu-server.ts` ready-line parser. | rev 3: desktop-extraction plan D3a/D3c1 (ready line, `launchChild`); notes D1 uses today's launcher with an HTTP readiness probe. | desktop D3a/D3c1 |
| **G14** | No packaging recipe/template for a second Electron app (staged server + native sqlite). | `apps/desktop/electron-builder.yml`, stage scripts. | `@jini-ai/devops/packaging/electron`: README recipe + builder template with host inputs. | `D2-desktop-packaging.md` |
| **G15** | Real sign-in cannot be wired durably: `@jini-ai/user-management/server` exports only memory repos. | Tovu's identity SQL repos. | `@jini-ai/user-management` `./server/sql` (design needed). Out of v1 (OD-N4). | none |
| **G16** | `AdminEntityPort` has no concurrency token and uses positional arguments (`get(id)`, `update(id, patch)`), unlike the owner's `(required, optional)` rule. v1 mitigates with a declared `version` field (D5). | n/a | `@jini-ai/admin`: owner decision whether the port gains `expectedVersion` (OD-N10). | none |
| **G17** | No public no-op `FormOutboxPort` / `OutboxDispatcherPort` (existing markers in `notes-app/src/ports.ts`). | Tovu's outbox. | `@jini-ai/cms` (or core events): export `discardOutbox`, `noopDispatcher`. Small; folded into G2's run. | G2 |
| **G18** | The bindings from Electron objects to desktop-host's ports live in an example: `examples/reference-desktop/src/electron-surfaces.ts` (102 lines: `bindElectronApp`, `bindBrowserWindow`, `bindElectronDialog`, `bindElectronProtocol`, `bindElectronShell`, `toBrowserWindowOptions`). Every Electron host must copy them. | Tovu's desktop shims (818 lines per the desktop survey). | `@jini-ai/desktop-host/electron`: export the binders with structural types (no `electron` import). | D1 step 1 |

Count: 18 gaps. 13 are closed by sheets here (G1, G2, G4, G5, G6, G7, G8, G11, G12, G13, G14, G17, G18) and
G3 in part; G9 and G10 belong to existing xpkg lanes; G3(c), G15 and G16 need an owner decision or a design.
Revision 3: G1 closes by adopting the existing `http-kit/node-bridge`; G2 by consuming lane S2; G8 is not a gap;
G11, G12, G13 are closed by the desktop-extraction plan (D1a, D0d, D3a/D3c1), which notes D1 consumes; G19 waits on
OD-N13; G20 to G22 are listed in `INDEX.md` section 0.

Carried forward from `notes-app-review.md` and re-checked on merge-b: finding 6 (`Set-Cookie` flattening in the
reference adapter) and finding 8 (no Host/Origin guard on mutations) are fixed by N0 before any assistant or
admin API is added; finding 4 (route precedence) is restated as an acceptance check in G1.

## 6. Risks the tests must be able to fail on

| Risk | Where | Test that fails on it |
|---|---|---|
| Lost update: the human saves a stale form after the assistant edited the note | N1 | two writers, second sends old `version` -> 409 + row unchanged (mutation: drop the `expectedVersion` argument) |
| Cross-site write to a localhost app (CSRF, DNS rebinding) | N0 | POST with foreign `Origin` -> 403; request with foreign `Host` -> 403; same-origin -> 200 (mutation: remove the middleware) |
| Assistant acts as someone else / tool call without authority | N3 | delegated call resolves to a non-owner principal -> tool denied with the specific code; unknown `toolId` -> rejected (mutation: `authorize: () => 'allow'`) |
| Proxy forwards to an arbitrary host or leaks the daemon token to the browser | N3 | response headers never contain the bearer; path outside the allow-list -> 404; upstream URL is built from a constant (mutation: forward `request.url`) |
| Streaming: client disconnect leaves the upstream run stream open | N3 | abort the client request mid-stream -> upstream `fetch` signal aborted, listener count back to 0 |
| Glue grows silently | N1 onward | `gap-budget.test.ts`: each `src/gaps/*.ts` <= its recorded line budget and has a `// GAP: G<n>` header |
| A Jini package change breaks the first consumer (Tovu) | every G sheet | the sheet's Tovu typecheck step linked to the Jini SHA, plus the package's own conformance suite with a broken-adapter self-test (AP12) |
| Renderer reaches Node through the bridge | D0, D1 | handler invoked from an untrusted sender frame -> refused; bridge object is frozen; bundle of `./bridge` contains no `node:` specifier |

## 7. Owner constraints as acceptance criteria (apply to every sheet)

1. The app imports only `@jini-ai/*`, third-party runtime deps and its own files. No `Tovu`/`@tovu/*` string, no file copied from Tovu. Check: `rg -n "tovu" examples/notes-*` is empty (case-insensitive).
2. A Jini package touched by a G/D sheet imports only itself, `@jini-ai/core`, `@jini-ai/protocol` (React entries may import `@jini-ai/ui-kit/react`). Check: `pnpm check:cross-package` adds no edge.
3. No server framework in Jini packages: new package code uses the `Server` contract; `node:http` appears only in `@jini-ai/http-kit/node-bridge` (existing) and the example's `main.ts` listen/close (rev 3).
4. No vendor code in core; UI is injected (`AdminKit`), classes are `jini-`-prefixed and unstyled by the package; every custom hook reaches a package through a kit/port.
5. Functions <= 50 lines, cyclomatic complexity <= 10, files <= 500 lines, exported functions take `(required, optional = {})`. This applies to the example too: `registerNotesApp` in `examples/notes-app/src/app.ts` is ~105 lines today and is split in N0.
6. Tests use fakes of interfaces (in-memory repo, in-memory server, fake kit, scripted run handler); no `vi.mock` of a Jini module.
7. Each step in a sheet compiles and passes alone and is committed alone.

## 8. Estimate

| Part | New/moved lines (estimate) | Sonnet runs | Sonnet tokens (estimate) |
|---|---|---|---|
| Phase A web: N0–N5 | ~1,500 example lines (server ~550, web ~750, e2e ~200) | 6 | ~590k |
| Phase B gaps: G1, G2, G5, G6, G7, G8, G4 | ~1,400–1,900 Jini lines; ~-600 example glue lines | 7 | ~670k |
| Phase D desktop: D0, D1, D2 | ~350 Jini + ~450 example + ~150 recipe | 3 | ~340k |
| **Total** | | **16** | **~1.6M**, plus one Opus review per wave (~40k x 4) |

These are planning numbers on the scale the xpkg lane index uses (35k–150k per run); nothing was measured.
The two input surveys said 200–500 shared + 400–800 example lines for the admin proof and 600–1,100 for the
desktop proof; this design is higher because it adds the assistant and counts tests.

## 9. Not verified

- Nothing was built, typechecked or run in either repo. "Green alone" boundaries are designed, not proven.
- Whether `guardSameOrigin` (`core/contracts/server/origin.ts:29`) fits a web-standard `Request` (its parameter is `RequestWithOriginHeaders`); N0 reads it and decides.
- Which `AdminKit` slots `AdminShell` and the entity screens really call (only `useAgentHandle`, `WidgetSelect`, the query hooks, `DataTable`-internal use and the theme kit were seen); N2 derives the list with a command.
- The exact request/response and event frames of `/api/runs`, `/events`, `/cancel` beyond what `minimal-host/src/index.ts` exercises; G7 moves existing code instead of re-deriving them.
- Whether `createLocalNodeDaemon`'s default security mode accepts a same-machine proxy without a token, and the header name it expects in `sidecar-strict`; N3 reads `localSecurity` and the http-kit `api-security-middleware.ts`.
- Whether an ACP or CLI agent is available in the executor's environment; all tests use a scripted handler, and the real-agent check in N5 is marked optional.
- `SidecarLaunchOptions` fields beyond `command/args/cwd/env/logPath`; whether `scripts/check-size.mjs` and `check-complexity.mjs` include `examples/`.
- Files the xpkg lanes R1c/R2a/R2b/C-CHAT-DEPS edit inside `packages/admin/src/react` and `packages/chat/src` (their `sites/*.tsv` were not read); each G sheet re-checks at dispatch.
- Tovu call sites that would be affected by G4/G5/G6 were not enumerated; each sheet starts with that search.
- Function length and complexity inside existing example files other than `app.ts`.
