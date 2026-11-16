# Untangle Jini: every cross-package implementation is injected by the host (2026-11-15, planning only)

## Summary
1. **Rule:** a Jini package imports only itself, `@jini-ai/core` and `@jini-ai/protocol`. Shared contracts go in core, and so do pure helpers (D2 rule (a)). Anything with I/O, state, timers, Node, DOM, React components or domain policy reaches another package only through the host's composition root. Today that rule is broken by **572 production import lines in 416 files**, plus 61 lines in 22 files that wait on owner questions, plus 6 lines in agent-plugins payloads. 970 lines already comply.
2. **There are five injection patterns, one per edge kind:**
   - **UI kit:** the per-package `react/kit.tsx`, as in KIT-INJECTION.
   - **Registration:** a package exports plain descriptors (admin modules, `ServerRoute[]`, migrations, contributions) and the host registers them.
   - **Runtime ports:** the package declares the port, and the host binds the implementation.
   - **Chat/UI surfaces:** one `surfaces` port.
   - **CSS:** shared `--jini-*` token names, a token namespace per package, and the host imports each package's CSS.
3. **About half of the edges are not real injections.** They are moves of shared vocabulary into core, followed by an import repoint. The vocabulary is: agent handles (103 lines), storage/event contracts (56), the route vocabulary that already sits next to `core/contracts/server` (41), net/vault/mail/blob (25), text helpers (22), and agents/ai-trace (18). Real injection comes to 296 lines: kits 132, ports 63, registrations 56, providers 35 and surfaces 10. Most of it is in daemon (route lists, agent launch), the platform consumers and the kits.
4. **Gate first:** `check-package-layers.ts` gets rule `L5-injected-edge` (base-only imports, manifests included), a ratchet `scripts/injection-debt.json`, a base-purity rule for core/protocol, and a payload scan for plugin `.mjs`. KIT's `L-ui-injected` becomes a subset of it. Nothing new gets in while the cleanup runs.
5. **Cost:** 10 contract lanes (Opus designs 7, about 0.4M Opus) and 13 file-disjoint Sonnet repoint/inject lanes. Total about **0.7M Opus + 4.3M Sonnet**, KIT-INJECTION's own numbers included. Six owner questions are in §6. Q1, Q2 and Q4 decide the 61 `ask` lines. Q5, Q6 and Q8 decide the tests, the provider contracts and the Node default adapters.

Data: `EDGES.tsv` (one row per owner, target, subpath, kind and fix), `EDGES-sites.tsv` (every import line, with names, fix and lane), `EDGES-manifest.tsv`, `EDGES-payload.tsv` (agent-plugins `.mjs`/`.d.ts` payloads) and `LANES-files.tsv`. Reproduce: `node scripts/edges.mjs <jini> .`, then `python3 scripts/classify_edges.py .`, then `python3 scripts/lanes.py .`. These read Jini `refactor/terra` @ `1b1737eb8` and nothing else. The file set is the same as `scripts/lib/package-sources.ts`: `src/` only, with no `__tests__` and no `*.test.*`. Type-only imports count, as the existing gate already says.

---

## 1. The allowed base (exact rule)

**B1. Allowed imports between Jini packages:** an import is allowed only if its specifier starts with `@jini-ai/core` or `@jini-ai/protocol`, or names the package's own public entry. No other `@jini-ai/*` specifier may appear in production source, in a manifest `dependencies`/`peerDependencies` entry, in a dynamic `import()`, in a `require`, in an `import('…')` type, in a plugin payload `.mjs`/`.d.ts`, or in a CSS `@import`. This holds for value imports and type-only imports alike.

**B2. What core may hold** (D2 rule (a), stated so a script can check it):
- Allowed: types, interfaces, constants, pure functions, classes that only hold data (errors), and factories whose state lives only in the object they return (`createToolRegistry`, `bindings`, `token`).
- Forbidden: `node:*` or bare Node built-ins; reading `process`, `window`, `document`, `navigator` or `globalThis`; module-scope `let`, or a module-scope `new Map`/`Set` that is written later; timers created at module scope; `fetch` calls; runtime dependencies (core has none, and keeps none).
- A timer or `fetch` used inside a factory must arrive as an injected port with a default. `core/fetch/cache.ts` already does this (`schedule`/`cancel`).
- Known debt to put in the baseline: `core/src/approval.ts:312` (a `setTimeout` inside a function; convert it to an injected clock), plus whatever the new purity rule finds.

**B3. What protocol may hold:** wire-format schemas and types, plus their pure constructors and guards (JSON-RPC, run events, MCP-UI messages). Its only runtime dependency is `zod`. Protocol imports nothing from Jini.

**B4. What goes into the base, and what stays in its domain:**
- **Goes to core** when a contract is *generic vocabulary*: two or more packages must agree on it *nominally*, and it carries no domain policy. Examples: the storage kernel, the event/outbox command vocabulary, the route vocabulary (`Result`, `ServerRoute`), agent handles, ai-trace events, the agent definition shape, the admin-module descriptor, the plugin SDK, the chart spec, text helpers, net classification.
- **Stays in the domain** when a contract or helper is *domain policy* (the forms field-type registry, the embed-attribute allow-list, model-selection rules, payment errors). The domain owns it, and other packages get it injected.
- **Has exactly one consumer:** the consumer declares the contract locally (`src/ports.ts` or `src/react/kit.tsx`). Implementers write structurally compatible types and never import it. The host proves the match with `satisfies`. Precedent: `agent-plugins/meilisearch` already keeps a "byte-identical copy (a plugin cannot import it)" with a test.

**B5. Why `platform`, `agentic`, `http-kit`, `db` and `ui-kit` are not base.** Each one is an implementation:
- `platform` holds Node I/O.
- `agentic` holds the DOM page driver, the a2ui interpreter and `node:fs` skills install.
- `http-kit` mounts Express.
- `db` opens SQLite.
- `ui-kit` is the native component kit.

The pure parts of `agentic` (handles), `http-kit` (route vocabulary), `db` (kernel types and row helpers) and `platform` (net classification, vault/mail/blob contracts) are exactly what B4 moves down. They are moved, not exempted.

**B6. Hosts and tests are not packages under this rule.** Tovu's composition roots import anything. Owner questions Q1 (`server`, `cli`) and Q5 (tests) decide whether Jini itself has any host-like package.

---

## 2. Injection pattern per edge kind

| Edge kind | Lines (files) | Pattern | Where the contract lives |
|---|---|---|---|
| Shared vocabulary (handles, storage/events, route vocabulary, net/vault/mail/blob, text, agents/ai-trace) | 276 (229) | **Move down, then repoint.** T-MOVE into core. The old entry re-exports from core (the same way `ui/panel-kit` already re-exports `buildAgentListHandles`), so no published importer breaks, and a script repoints every Jini importer. | `core/agent-handles`, `core/contracts/{storage,events,agents,ai-trace,blob,runtime}`, `core/net`, `core/text`, extensions of the existing `core/contracts/{server,vault,mail}` |
| UI primitives and fetch-query (admin, chat, user-management, commerce) | 132 (113) | **UI kit** (KIT-INJECTION §1, unchanged) | `<pkg>/src/react/kit.tsx` |
| Registration (admin modules, routes, migrations, search contributions) | 56 (37) | **Descriptors out, host registers** (§2.2) | Descriptor types in core; the registry lives in the receiving package |
| Runtime implementations (fs, locks, process, PTY, command, guarded HTTP, OAuth, SQLite openers, agent launch, cms catalogs) | 63 (52) | **Consumer-owned port + host binding** (§2.3) | Port type in the consumer, or `core/contracts/runtime` when 2+ consumers share it |
| Chat/ui surfaces (a2ui interpreter, DOM page driver, page capabilities, MCP-UI) | 10 (10) | **One `surfaces` port** (§2.4) | `chat/src/react/kit.tsx` → `surfaces`; ui gets the same shape |
| Providers (provider-plugins 35 lines, agent-plugins payloads 6) | 41 | **Structural implementation + host `satisfies` + conformance** (§2.5) | Generic contracts in core; domain contracts restated in the provider |
| CSS and theming | 0 source edges; coupling goes through `var(--…)` and class names | **Token contract** (§2.6) | `core/contracts/theme-tokens` (names only) |

### 2.1 Move down, then repoint (vocabulary)
```ts
// packages/core/src/contracts/storage.ts  (from db/src/kernel + db/src/core; types and pure helpers only)
export interface StorageKernel { /* unchanged shape */ }
export type StorageDialect = 'sqlite' | 'postgres';
export type DbRow = Readonly<Record<string, unknown>>;
export function toBool(v: unknown): boolean { /* moved verbatim */ }
// packages/db/src/kernel/index.ts: keep the public name, drop the duplicate
export type { StorageKernel, StorageDialect, StorageTransport } from '@jini-ai/core/contracts/storage';
export { toBool, listColumns, isUniqueViolation } from '@jini-ai/core/contracts/storage';
```
Repoint (script): `@jini-ai/db/kernel` → `@jini-ai/core/contracts/storage` in chat/cms/commerce/daemon/plugins/registry/integrations. Then drop `db` from their manifests. "Why" comments move with the code (owner rule).

### 2.2 Registration: descriptors out, host registers
The receiving package owns the registry (`createAdmin`, the http-kit mounter, `runMigrations`, the agent-plugins contribution registry). The *descriptor type* is generic vocabulary, so it lives in core. The producer exports data. The host connects the two.
```ts
// user-management/src/admin/users.module.ts: import line only
-import { adminPort, defineAdminModule } from '@jini-ai/admin/core/module';
+import { adminPort, defineAdminModule } from '@jini-ai/core/contracts/admin-module';
// daemon/src/http/media.ts: no app, no Express
-export function registerMediaRoutes(app: Express, deps: MediaDeps, adapter?: AdapterContext) { mountJsonRoute({ app, spec: mediaGenerateRoute, deps, adapter }); }
+export function mediaRoutes(required: { deps: MediaDeps }, optional: { adapter?: RouteAdapterContext } = {}): ServerRoute[] {
+  return [jsonRoute({ spec: mediaGenerateRoute, deps: required.deps }, optional)];
+}
// Tovu composition (server side): one place
for (const route of [...mediaRoutes({ deps }), ...agentRoutes({ deps })]) server.route(route);
// commerce: exports `commerceMigrations: readonly MigrationStep[]`; the host calls db's `runMigrations({ kernel, steps })`.
// search: exports its contribution descriptor (plain data); the host calls agent-plugins' `contributeProviders`.
```
`jsonRoute`, `Result`/`ok`/`err`, `validationError`, `statusForError` and the SSE event type are pure web-standard helpers (`Request` → `Response`), so they belong in `core/contracts/server` next to the `ServerRoute`/`Server` contract that is already there. This is the same target as PLAN's server port (T-SERVER form B, O1–O7). **C4 reuses that design and does not make a second one.** http-kit keeps the Express adapter (`server.route` on an Express app) and the guards that read Node `req`.

### 2.3 Runtime ports (consumer-owned, host-bound)
```ts
// packages/core/src/contracts/runtime.ts: shared because 5+ consumers use the same shapes
export interface FileLockPort { withFileLock<T>(required: { path: string; run: () => Promise<T> }, optional?: { timeoutMs?: number }): Promise<T> }
export interface AtomicFileWriterPort { writeJson(required: { path: string; value: unknown }): Promise<void>; writeText(required: { path: string; text: string }): Promise<void> }
export interface ProcessControlPort { list(): Promise<ProcessSnapshot[]>; stop(required: { pids: number[] }): Promise<StopProcessesResult>; treePids(required: { pid: number }): Promise<number[]> }
export interface CommandInvocationPort { create(required: { command: string; args: readonly string[] }): CommandInvocation }
// packages/agent-plugins/src/lifecycle/persistent-state.ts
-import { withFileLock } from '@jini-ai/platform/fs/file-lock';
+export interface PersistentStateDeps { readonly fileLock: FileLockPort; readonly writer: AtomicFileWriterPort }
// Tovu composition: the only place platform meets agent-plugins
const runtime = { fileLock: platformFileLock, writer: platformAtomicWriter } satisfies PersistentStateDeps;
```
- If only one package needs a port (daemon's agent launch, admin's forms catalog, chat's agent-policy helpers, integrations' vendor base-URL catalog), it stays in that package's `ports.ts`. The `platform` implementation `satisfies` the core port types (platform → core is allowed).
- **The domain's default Node adapters** (`agent-plugins/lifecycle/node.ts`, `integrations/media-providers/dispatch/node.ts`, `devops/deploy/node.ts`, `plugins/host/node/*`, `sidecar/supervision/supervisor-node.ts`, `daemon/terminal.adapter.ts`, `agentic/skills/install/node-filesystem.ts`) are wiring by definition: each one binds platform to the domain's port. They leave the domain package; owner question Q1/Q8 decides where they go.
- The heaviest single port is **daemon ↔ agent-runtime** (13 value sites: launch planning, ACP/PI sessions, stream handlers, provider tool turns, xAI OAuth). daemon declares an `AgentRuntimePort` (one object, `required`/`optional` args), and Tovu binds `@jini-ai/agent-runtime`'s functions to it. Opus designs this one first (C6) because it decides whether agent definitions are vocabulary (core) or runtime (port).

### 2.4 Surfaces port (chat, and ui's a2ui use)
Use KIT-INJECTION §2.4 "surfaces" as written: one port object `{ mcpUi, interactiveUi, a2ui: { createInterpreter, catalog }, page: { driver, capabilities, execute } }`. The host fills it from `@jini-ai/agentic` (`/a2ui`, `/dom`) and `@jini-ai/ui` (`/mcp-ui`, `/interactive-ui`). `ui`'s one `agentic/a2ui` import gets the same port through a `UiSurfacesProvider`. The MCP-UI/JSON-RPC constants that `ui` takes from `agentic` are wire vocabulary, so they move to `protocol` (an `mcp-ui` subpath).

### 2.5 Providers (provider-plugins, agent-plugins payloads)
- **Generic contracts the provider implements** (plugin SDK `PluginSdk`/`PluginProviderStartupError`, chart spec, ai-trace sink) go into core. The provider imports them from core.
- **Domain ports** (`commerce/payments/kernel` `PaymentProvider`, `analytics/product`, `cookie-consent` adapter, `diagnostics/observability`, `cms/forms` `FormCollectionProvider`, `devops/deploy` targets, `search` provider) are restated by the provider in its own `contract.ts`.
- **Domain helper values** (`paymentError`, `moneyProblem`, `purgeStorage`, `redactOperationAttributes`, `applyChartTheme`) come in through the context the domain already hands the provider (`ProviderContext`, `ChartMountOptions`, the factory `required` input). Providers never import them. The host or domain conformance kit runs against every provider.
- `diagnostics`' `createOtelObservabilityPort` is vendor (OTel) code in a core domain. C8 decides whether it belongs in the OTel provider instead (owner rule: vendor code in its plugin).

### 2.6 CSS and theming
- No production CSS imports cross packages today. The coupling is implicit:
  - Every package reads `var(--jini-text|bg|border|radius|accent|danger|ease|font…)` defined by `ui`/admin themes.
  - chat reads unprefixed `--text-sm`, `--radius-lg`.
  - About 50 TSX files in chat, admin and user-management use `jini-*`/`ui-*` class names.
- Rule:
  1. **Shared token names** live in `core/contracts/theme-tokens.ts`, as an exported `JINI_THEME_TOKENS` list plus a doc comment with each token's meaning. That is a list of names only, with no CSS values.
  2. A package's CSS may read only those tokens or its own `--jini-<pkg>-*` namespace, always with a fallback.
  3. A package's TSX uses only class names in its own namespace. Shared looks come from kit slots, not borrowed classes.
  4. The host imports each package's published CSS (`@jini-ai/chat/react/styles/*.css`, `@jini-ai/admin/themes/default/*.css`) and its own theme sets the token values.
- Gate: a CSS lint in `L5`'s sibling, `L7-css-tokens`, with its own debt list.

---

## 3. One composition root per runtime (the host side)

**Tovu today and after.** Tovu already has the roots, so the cleanup only adds files next to them:
- **Server:** `apps/website/src/server/runtime/composition/`. Each cleanup lane adds one new file `jini-<topic>.ts` (`jini-storage.ts`, `jini-routes.ts`, `jini-runtime-ports.ts`, `jini-agents.ts`, `jini-providers.ts`). Each file imports implementation packages and exports a `satisfies`-checked binding. The coordinator, not a lane, adds the one line per lane in the existing `deps.ts`/`app.ts` that uses it, so lanes stay file-disjoint.
- **Admin browser:** `apps/admin/src/integrations/jini-kits.ts` (KIT) plus `apps/admin/src/integrations/jini-admin/` (modules already registered there: `modules.hooks.ts`, `*-ports.ts`). user-management's modules keep registering there; only their import line changes.
- **Site chat embed:** its embed root mounts `<ChatKitProvider kit={siteChatKit}>` with `surfaces` (KIT §1.4).

```ts
// apps/website/src/server/runtime/composition/jini-runtime-ports.ts
import { withFileLock, writeJsonFileAtomicAsync, writeFileAtomicAsync } from '@jini-ai/platform/fs';
import type { FileLockPort, AtomicFileWriterPort } from '@jini-ai/core/contracts/runtime';
/** Tovu picks Node implementations; packages only state the ports. A shape change fails typecheck here. */
export const runtimePorts = {
  fileLock: { withFileLock: (r, o) => withFileLock(r, o) },
  writer: { writeJson: (r) => writeJsonFileAtomicAsync(r), writeText: (r) => writeFileAtomicAsync(r) },
} satisfies { fileLock: FileLockPort; writer: AtomicFileWriterPort };
```

**A second host (Open Marketing or anyone else): checklist**
1. Pick one composition-root folder per runtime (server, admin browser, embed). Nothing outside those folders imports two Jini domain packages.
2. For each Jini package you install, read its `ports.ts` / `react/kit.tsx` / registry entry. A generated `HOST-PORTS.md` (a C0 deliverable: the script lists every exported `*Port`, `*Kit`, `*Deps` and registry function) shows each one with the package and line.
3. Bind each port to an implementation, either a Jini implementation package or your own. Put `satisfies <Port>` on every binding line.
4. Mount each package's `<Pkg>KitProvider` once at the browser root with your UI library's components. Tovu passes ui-kit facades; another host can pass shadcn or MUI wrappers.
5. Register descriptors: routes (`server.route` for each `ServerRoute`), admin modules (`createAdmin({ modules })`), migrations (`runMigrations({ kernel, steps })`), contributions.
6. Import each package's CSS and set the `JINI_THEME_TOKENS` values in your theme.
7. Run the contract conformance kits (`@jini-ai/core/contracts/*/conformance`, `<pkg>/conformance`) against any implementation you wrote yourself.
8. Optional: start from the host preset (Q1) instead of steps 3–5 for the standard Node server.

---

## 4. Tests supply fakes

- **Package unit tests** use package-local fakes of the package's own ports and kit (`src/__tests__/fakes/*.ts`, `renderWith<Pkg>Kit`, KIT §1.5). They are never published. A unit test imports only its own package, core and protocol, under the same rule as production.
- **Port fakes are DI, not mocks.** A fake is a plain object that implements the port with an in-memory map, for example `fakeFileLock()` or `fakeStorageKernel()` over a `Map`. Tests pass it through the same `required`/`optional` args as production.
- **Shared fakes:** core ships `core/contracts/<topic>/testing` fakes for its own contracts, such as an in-memory `StorageKernel` and a recording `Server`. These are pure, so they are allowed in core. Packages reuse them.
- **Conformance:**
  - A contract with several implementations (`StorageKernel`, the `Server` adapters, search providers, payment providers, deploy targets) ships a conformance suite next to the contract. It is a function that takes `{ describe, it, expect }` and a factory, so the contract needs no vitest dependency.
  - Implementers run the suite in their own tests. For core contracts that import is allowed by B1.
  - A domain-owned conformance suite (e.g. `commerce/conformance`) imported by a provider's test is a test-only cross-package edge. Q5 decides that.
- **Cross-package integration tests** (today about 360 test files import another non-base package) are ratcheted. They either become unit tests with fakes, or move to a private, unpublished `packages/integration-tests` workspace, which acts as a test host (Q5).

---

## 5. The gate (`scripts/check-package-layers.ts`)

**New rules (C0 lane):**
- **`L5-injected-edge`:** for every production import site and every manifest `dependencies`/`peerDependencies` key from owner to `@jini-ai/<target>` (target ≠ owner): pass if the target is `core` or `protocol`, or the exact `{owner, target, specGlob}` appears in `scripts/injection-exceptions.json`. Otherwise it fails, unless the site is in the debt list.
  - Each exception entry carries `ownerQuestion` (Q1–Q8) and `approved: "YYYY-MM-DD"`. The file starts empty and gets entries only from owner answers.
  - The file set is the same as today, plus agent-plugins and provider-plugins payloads: `packageSourceFiles(..., { includeJavaScript: true })` over each plugin folder, `.d.ts` included.
- **Ratchet `scripts/injection-debt.json`:**
  - Entries are `{ rule, file, spec, kind, count, lane }`, keyed by `file + spec + kind`. They are deliberately not keyed by line number, because lines shift during unrelated edits.
  - The gate fails on a key that is not in the file or on a higher count. A lower count prints "stale debt, remove N entries" (the `hardwiring-debt.json` way). CI never regenerates the file. The `lane` field ties every entry to the lane that removes it.
  - The baseline is exactly `EDGES-sites.tsv` rows with `allowed != yes`: 633 lines (572 `no` plus 61 `ask`), and the 6 payload lines.
- **`L6-base-purity`:** applies B2 and B3 to `packages/core/src` and `packages/protocol/src` (AST: imports, member reads of `process`/`window`/`document`/`navigator`/`globalThis`, top-level `let`/`new Map|Set` with later writes, top-level timer calls). It also checks the manifests: core has zero dependencies, and protocol has only `zod`. It has its own debt entries.
- **`L7-css-tokens`:** for each package's CSS, every `var(--x)` must be in `JINI_THEME_TOKENS` or `--jini-<pkg>-*`. No cross-package `@import`. It has its own debt list.
- **Test advisory:** the same scan over `__tests__` and `*.test.*`. It writes a count to `scripts/injection-test-debt.json` and does not fail until Q5 is answered.

**Retired as the debt reaches zero** (each removal sits in the lane that empties it):
- `hasReactPeer` and `isReactIntegration` (R3, R4 and the KIT lanes)
- `isAdminIntegration` (R3)
- `leafEdges` (R10 and R11; `memory → integrations` is already stale, with no source import left, so delete it in C0)
- `sameLayerEdges` `cli→sidecar` (Q1), `cms-forms→cms` (R9) and `admin→ui` (R1)
- `isPayloadPeerDeclaration` (R12)
- `checkBrowserPlatform` (R4, R5: platform's net checks move to `core/net`)

At zero debt, the layer table shrinks to base versus the rest. The `L1-layer-edge` numeric check stays only inside the base (`protocol` must not import `core`, or it may if C0 decides otherwise; today neither imports the other).

**Unused manifest edges, deleted in C0 with no code change:** `agent-plugins → commerce` (only a payload `.d.ts` uses it: R12) and `integrations → oauth`.

**Gate test:** fixture packages in `scripts/__tests__/check-package-layers.*`. Each test runs one fixture:
- a base import passes;
- a type import from a domain fails;
- a manifest peer fails;
- a debt hit passes, a higher count fails, and a lower count warns;
- an exception passes;
- a payload `.mjs` import fails;
- a core `node:fs` import fails.

---

## 6. Owner questions: edges that might stay (none is exempted silently)

| # | Edge | Lines | Recommendation |
|---|---|---|---|
| **Q1** | `server` → daemon/db/http-kit/agent-runtime/registry/sidecar/chat/platform (36 lines); `cli` → platform, sidecar (2) | 38 | **Keep both as host presets.** Give them a new manifest kind `jini.kind: "host-preset"`. A preset may import anything, and nothing in Jini may import it (gate). It holds wiring only: no logic and no new exports beyond `create*`. Logic in them today moves down. Reason: a second host would otherwise copy about 3k lines of the standard Node wiring. The alternative is to dissolve both into Tovu (consistent with the 11-07 "no package above domains" rule, but every host then repeats it). |
| **Q2** | `sqlite` → chat/daemon/db/registry (12), `infra` → db (4): deprecated compatibility forwarders | 16 | **Freeze as exceptions until the next breaking release, then delete.** They re-export only and add nothing. Deleting them now breaks published consumers. |
| **Q4** | `ui` → `ui-kit` (7: `useOverlayContainer`, `useSecretReveal`, `SecretInput`, `secretControlAttrs`) | 7 | **Allow as the one "UI implementation family" edge.** ui and ui-kit are both implementations that the host injects into other packages, and a host that swaps UI swaps both. The gate allows only `ui → ui-kit`; nothing else may import either. The alternative is a `UiKitProvider` for ui itself, which adds about 30k Sonnet and no real decoupling. |
| **Q5** | Test files: about 360 import another non-base package | — | **Unit tests:** base plus own package only, with fakes. **Allowed test-only edges:** another package's `/testing` and `/conformance` entries. **Cross-package integration tests** move to a private `packages/integration-tests` workspace. The ratchet runs advisory until you say yes. |
| **Q6** | Providers restating domain port types (payments, consent, analytics, observability, forms, deploy targets, search) | 41 | **Restate structurally, with host `satisfies` plus conformance.** Precedent: meilisearch. The alternative is to allow `import type` from a domain's types-only `./contracts` entry. That is less duplicated text, but it is an edge into a domain and keeps the optional-peer pins. Putting domain contracts like payments into core is rejected, because of the "no commerce in core" rule. |
| **Q8** | Domain packages' default Node adapters (`*/node.ts`, `*-node.ts`, `terminal.adapter.ts`, `skills/install/node`): about 12 files that bind platform to the domain's own port | (inside R8, R11) | **Move them to the host preset (Q1 = yes).** If Q1 = no, they move to Tovu's composition root. They must not stay in the domain package. |

Also needed, but already decided by the dispatch: D2 = rule (a) (B2). `cms-forms → cms` (6 type lines) needs no exception, because its types (`DomainEvent`, `EventBusPort`, `OutboxPort`, `CommandActor`, `AuthorizeFn`, `ChangeSetRepoPort`) are generic command/event vocabulary and move to `core/contracts/events` (C3).

## §7 Owner answers (2026-11-15 ~5:10 PM PT) — these override §6 recommendations
- **Q1 YES:** `server` and `cli` are `host-preset` packages (wiring only; may import anything; nothing imports them). Owner overrides the 11-07 "no package above domains" rule for these two only.
- **Q2 YES:** `sqlite` / `infra` forwarders frozen as exceptions until the next major, then deleted.
- **Q4 NO EXCEPTION:** `ui → ui-kit` is injected like everything else (owner: "inject it like everything else"). No UI-family edge allowed.
- **Q5 YES:** unit tests = base + fakes; test-only imports of `/testing` and `/conformance` allowed; integration tests → private `packages/integration-tests`.
- **Q6 YES:** providers restate domain port types structurally; host `satisfies` + conformance; no payment-type contracts in core.
- **Q8:** domain Node default adapters (`*/node.ts`) move to the host preset (follows Q1 = yes), not into Tovu.
- Owner principle: "how does this make this as modular as possible, untangled as possible, and we can swap everything out? Dependency injection for all of these."
