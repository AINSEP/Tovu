I’ll keep this strictly read-only and focus on structure: first I’m loading the repository’s governing instructions and the architecture-analysis skill, then I’ll run the two scoped checks and interrogate the dependency graph. I’ll avoid the full test suite and won’t duplicate the sibling bug/gate audit.

---

The repository identifies this as a peer-dispatch context, so its interactive startup/pipeline is intentionally skipped. The architecture skill normally rebuilds a graph and writes analysis artifacts; because your brief is read-only, I’m using only its non-mutating discovery guidance and the repo’s existing graph/check tooling.

---

I’m now establishing the measured baseline and the governing architectural intent. The codebase-memory MCP named by the repo is not exposed in this session, so I’m falling back to the requested dependency-cruiser instrumentation, then validating important edges directly against source.

---

[Phase 1/7] Repository context loaded. Two “Always Consult” paths named by the root instructions (`tovu-architecture.md` and `tovu/PROJECT_MEMORY.md` / `tovu/src/INFO.md`) do not exist in this checkout; I’m continuing from the executable architecture policy and the module-local `INFO.md` files, as this peer brief requires. Next is the measured baseline.

---

The boundary check completed: 72 warnings, 0 errors across 1,485 modules and 7,271 edges. The architecture script itself hit a sandbox-specific `tsx` IPC permission error before analysis began; I’m rerunning the same TypeScript entry point through Node’s loader, which avoids the IPC server without changing what the script computes.

---

The executable graph is more revealing than the warning count: production has 862 files in 49 measured modules, with no runtime SCCs, but 518 deep-import edges exposing 201 private files. `server` alone is 322 files; `app.ts` has 129 direct internal imports and `deps.ts` 86. That—not an import cycle—is the dominant structural defect I’m tracing next.

---

The “core size” metric is not measuring `src/core`; it is detecting graph hubs. Of the 139 files, 43 are under `server`, and 28 are the per-domain tool-registration path plus the assistant registry. Many have identical transitive scores because `RouteDeps` and the 25-domain dependency intersection turn type-only contracts into whole-repo change propagation. I’m quantifying that counterfactual before recommending a redesign.

---

The graph work is complete. The decisive findings are that the runtime module graph is mostly acyclic, while two composition mechanisms—`RouteDeps` and the global tool registry—create most of the structural change-coupling that the current headline metrics obscure. I’m turning that into the target design and migration order now.

---

## 1. DIAGNOSIS

The right diagnosis is not “the codebase is cyclic.” Its runtime module graph is mostly healthy. The real problem is that composition, transport, and domain contracts have collapsed into a few enormous change-coupling hubs.

### What the instrumentation says

The architecture check found:

| Metric | Current |
|---|---:|
| Production files | 862 |
| Measured modules | 49 |
| All-import propagation cost | 12.20% |
| Runtime-only propagation cost | 1.85% |
| Runtime module cycles | 0 |
| Back-edges into `server` | 11, all type-only |
| Private files exposed across modules | 201 |
| Cross-module deep-import edges | 518 |
| Reported “core” | 139 files, 16.13% |

The current numbers exactly match the checked-in [baseline](/Users/la/Programming/Tovu/development/scripts/check-architecture.baseline.json), so “green” means “has not become worse,” not “is well structured.”

The normal architecture command hit a sandbox-specific `tsx` IPC `EPERM`; I executed the same [check-architecture.ts](/Users/la/Programming/Tovu/development/scripts/check-architecture.ts) entry point through Node’s `tsx` loader. `check:boundaries` ran normally: 1,485 modules, 7,271 dependencies, 72 warnings, zero errors. Of those warnings, 58 are test-only. Only 14 occur in production code.

The boundary policy itself is incomplete:

- It guards 30 modules, while the architecture check measures 49.
- Most violations are warnings.
- It defines a public module as a single `index.ts`.
- Its own comments document that routing deployment imports through a parent barrel increased propagation from 11.56% to 15.36%.

That makes “no deep imports” partly a barrel-enforcement policy rather than a reliable encapsulation policy. See [the guarded-module configuration](/Users/la/Programming/Tovu/.dependency-cruiser.cjs:142).

### The actual structure

The largest production areas are:

- `server`: 322 files
- `assistant`: 53
- `themes`: 42
- `db`: 37
- `deployments`: 28
- `widgets`: 26
- `core`: 24
- `features/theme`: 23

Meanwhile `src/features/INFO.md` describes only workspace, post, and presentation, but the repository now has roughly 21 `features/*` directories plus equivalent domains such as comments, forms, newsletter, media, and webhooks at the top level.

Therefore `src/features/*` is cosmetic. It does not denote a layer, a bounded context, or a consistent ownership rule.

### Mistake 1: `RouteDeps` is an application-wide service locator

[RouteDeps](/Users/la/Programming/Tovu/src/server/routes/types.ts:1091) is an intersection of more than 20 dependency slices plus a large inline tail. The file is about 1,250 lines and imports 51 domain and port files.

It combines unrelated concerns:

- repositories and business services;
- runtime configuration;
- HTTP behavior;
- export engines;
- application factories;
- concrete adapter concerns.

It even contains recursive composition such as `ExportEngine<RouteDeps>` and `createSiteApp(routeDeps: RouteDeps)`.

The consequences are measurable:

- `server/routes/types.ts` has about 100 production importers.
- `server/deps.ts` has 86 direct imports.
- `server/app.ts` has 129.
- `server → db` is only 24 graph edges, but 23 database targets are reached from just `app.ts` and `deps.ts`.
- Seven `create*Module` functions still accept the complete `RouteDeps`.
- Five production feature files import the server-owned type directly, including [deployment tools](/Users/la/Programming/Tovu/src/features/deployments/publish-agent-tools.ts:100), [static publishing](/Users/la/Programming/Tovu/src/features/deployments/static-publish/adapter.ts:15), and [source-control commits](/Users/la/Programming/Tovu/src/features/source-control/commit-site.ts:8).

Those imports are type-only, so runtime-cycle metrics declare victory. Structurally, however, a domain still depends on its delivery host. That is dependency inversion in the wrong direction.

### Mistake 2: routes contain application workflows

The site-page route is not an HTTP adapter. [pages.ts](/Users/la/Programming/Tovu/src/server/routes/site/pages.ts:689) is roughly 887 lines and coordinates:

- content retrieval;
- themes;
- widgets;
- navigation;
- redirects;
- routing;
- SEO;
- media;
- rendering.

The HTTP layer therefore knows the internal sequence of the storefront application. Theme, content, or rendering changes force route changes.

This is a more important extraction target than `createApp`: move the workflow into a `RenderSitePage` application service and let Express translate HTTP input/output.

### Mistake 3: the tool registry solved runtime cycles by creating semantic coupling

The registry is a real attempt to solve a real problem, but the seam is in the wrong place.

[ToolContributor](/Users/la/Programming/Tovu/src/assistant/tool-contribution-registry.ts:50) accepts a global `AssistantToolRegistryDeps`. That type is itself an intersection of approximately 24 domain dependency interfaces in [tool-registrations.ts](/Users/la/Programming/Tovu/src/assistant/tool-registrations.ts:203). A mutable module-level contributor list stores registrations.

Then [tool-catalog-manifest.ts](/Users/la/Programming/Tovu/src/server/tool-catalog-manifest.ts:128) imports and installs contributions from approximately 25 domains.

The runtime module graph is acyclic, but the all-import graph contains a 29-file SCC around:

- assistant registry and tool registration;
- the server catalog manifest;
- domain-specific contribution files.

The server manifest is the legitimate seam: a deployable must decide which tools exist. The global registry is accidental coupling. Domains should build complete tool contributions from narrow dependencies; the composition root should collect them; assistant code should validate and expose the aggregate.

### Mistake 4: the current cycle metric misses meaningful cycles

The architecture script collapses every file to its containing module and drops intra-module edges. Consequently it reports zero runtime module cycles while the file graph still has these runtime SCCs:

- `server/app.ts → server/deps.ts → server/app.ts`, with deployment overview participating;
- `features/theme/theme.ts ↔ theme-files.ts`;
- `media/index.ts ↔ media/bootstrap.ts`;
- an admin cycle through `panels.tsx`, placeholders, and navigation.

The all-import graph is worse: 38 measured modules fall into one type-level SCC. That does not imply runtime failure, but it accurately reflects change coupling.

### Mistake 5: `core` is a miscellaneous drawer

Some `core` facilities are genuinely cross-cutting: clock, IDs, authorization primitives, event/outbox behavior, and concurrency primitives.

Others have domain owners:

- embeds and marker handling → site delivery;
- entry references → content;
- publish-history limits → deployments;
- gated mutations → operations/recovery;
- tool-surface exchanges → automation;
- runtime mode → application host;
- rate limiting → HTTP/security platform.

The problem is not merely that `core` has 24 files. It has 123 incoming deep-import edges because unrelated code uses it as neutral territory.

I would eliminate the name and directory, not merely reduce its file count.

### Mistake 6: persistence is better than the directory layout suggests

Drizzle is not actually spread indiscriminately through business code.

About 63 production files import Drizzle or SQLite APIs:

- 28 are under `db`;
- several are plugin persistence internals;
- most remaining files are recognizably `repo.sqlite.ts` or SQLite adapters;
- the principal non-adapter leak is `server/deps.ts`.

So the current port/adapter direction is broadly right. The problem is ownership: feature schemas and repositories are collected into a global `db` namespace, especially the 2,589-line `db/schema.ts`.

Do not introduce a generic ORM abstraction. Move concrete adapters and schema fragments to their owning contexts while retaining one connection, migration journal, and transaction boundary.

### Mistake 7: admin and server share too little at the wire boundary

The admin SPA has no meaningful production import dependency on root `src`, despite having an alias for it.

Instead, [apps/admin/src/lib/api.ts](/Users/la/Programming/Tovu/apps/admin/src/lib/api.ts) is roughly 2,939 lines with 131 exports and about 251 incoming imports. It manually mirrors server DTOs. The existing [headless contracts](/Users/la/Programming/Tovu/src/headless/contracts.ts) cover only a small portion of the surface.

Admin and server should continue sharing no repositories, services, Express code, or React code. They should share much more of the HTTP contract.

### Mistake 8: the Jini dependency is neither internal nor external

The root declares 13 `file:../Jini/packages/*` dependencies. Production code substantially consumes most of them, especially `@jini/cms`.

This creates the worst combination:

- Tovu cannot build hermetically from its own checkout;
- a fresh sibling Jini checkout may lack ignored build output;
- changes are not atomic as in a monorepo;
- dependencies are not versioned as across a repository boundary.

Jini is not the root cause of Tovu’s internal architecture problems, but the filesystem linkage is the wrong delivery mechanism.

### What actually reduces “core size”

The earlier `createApp` result stands. Extracting it first would provide only a small metric improvement—roughly the previously measured 0.7 percentage points. I do not overturn that conclusion.

Counterfactual graph analysis points elsewhere. Removing the hub edges incident to `RouteDeps` and replacing the global tool-registry coupling gives this optimistic upper bound:

| Change | Fixed-threshold hub/core files | p95 fan-out / fan-in |
|---|---:|---:|
| Current | 139 | 342 / 344 |
| Narrow `RouteDeps` consumers | 114 | 271 / 139 |
| Replace tool registry | 126 | 265 / 323 |
| Both | 100 | 81 / 79 |

These are not forecasts—replacement interfaces will add some edges back—but they identify the correct leverage points.

The current median-based “core” metric is misleading: after removing `RouteDeps` edges, its reported core count can rise from 139 to 181 because the graph-wide median fan-out falls. It is denominator-stable but not distribution-stable. Do not optimize that headline number.

## 2. TARGET

I recommend a modular monolith with explicit bounded contexts, one deployable server, and two genuinely shared packages.

```text
apps/
  server/              Express adapter and composition root
  cli/                 CLI composition root
  admin/               React application
  site-chat/           Separate browser client, if retained

packages/
  contracts/           Wire schemas, DTOs, route identifiers, client slices
  plugin-sdk/          Externally consumed plugin ABI

modules/
  workspace/
  identity/
  content/
  site-delivery/
  engagement/
  media/
  commerce/
  extensions/
  integrations/
  automation/
  operations/

platform/
  messaging/
  persistence/
  security/
  runtime/
```

The contexts should remain folders, not npm packages. There is one deployable and no need to independently publish or version them.

### Context ownership

| Context | Owns |
|---|---|
| `workspace` | Workspace and site settings |
| `identity` | Authentication, authorization, RBAC |
| `content` | Content types, entries, posts/pages, taxonomy, revisions |
| `site-delivery` | Themes, presentation, widgets, navigation, routing, SEO, redirects, render/export read models |
| `engagement` | Members, comments, forms, newsletter, analytics, mail |
| `media` | Assets, transformations, upload policies |
| `commerce` | Products and commerce integrations |
| `extensions` | Plugin runtime, plugin data, lifecycle |
| `integrations` | Webhooks, connectors, credentials |
| `automation` | Assistant, agent tools, tool audit and surfaces |
| `operations` | Deployments, recovery, database administration, source control, static publishing |
| `platform` | Technical primitives only; no product concepts |

Themes remain copied rather than inherited. Theme schema v2 continues branching on `manifest.apiVersion === 2` and keeps files under `render/`. `theme-archive` remains untouched as fixture data.

### Internal shape of a context

```text
content/
  domain/
  application/
  ports/
  adapters/
    http-express/
    sqlite/
    memory/
    agent/
  public/
    commands.ts
    queries.ts
    events.ts
  module.ts
```

Allowed direction:

```text
domain
  ↑
application → ports
  ↑           ↑
adapters ─────┘

apps/server/bootstrap → every module.ts and concrete adapter
context A → context B/public/{commands,queries,events}
```

Prohibited:

- a context importing `server`;
- a context importing another context’s adapter;
- a context receiving the global application dependency bag;
- `contracts` importing Express, Drizzle, React, or a domain implementation;
- a domain registering itself into global mutable state at import time.

Use explicit `public/commands`, `public/queries`, and `public/events` subpaths. Do not force everything through one high-fan-out `index.ts`.

### Composition

Each module factory should accept only its actual technical dependencies and return a module handle:

```ts
createContentModule({
  clock,
  ids,
  transaction,
  contentRepository,
  authorization,
})
```

A handle can expose:

- command/query services;
- event subscriptions;
- an Express router built by its adapter;
- already-materialized tool contributions;
- lifecycle hooks.

The host assembles these handles. Express should never pass a global `RouteDeps` object down into them.

### Content model

I recommend converging posts, editable pages, and generic entries on one `ContentEntry` aggregate with an explicit body discriminator. Current code already records that `PostRecord` predates the generic entry model, and the site route works around that incompatibility by passing body JSON separately.

Do not put theme-owned static files into `ContentEntry`. Theme assets and theme static pages belong to site delivery and retain copy semantics.

Because there are no users, this is the right time to make the content model coherent. It is also the most consequential one-way decision in the proposal.

### Persistence

Keep ports at use-case or aggregate boundaries. Permit Drizzle directly inside concrete adapters.

Each context owns:

- its repository interfaces;
- its SQLite/Postgres implementations;
- its schema fragment;
- its row/domain mapping.

`platform/persistence` owns:

- connections;
- transaction coordination;
- migration sequencing and journal;
- dialect selection;
- shared low-level helpers.

There is still one physical database and one migration history.

### Admin/server sharing

Create `packages/contracts` as a separately compiled leaf package containing:

- runtime validation schemas;
- request and response DTOs;
- stable error envelopes;
- route identifiers;
- small generated or schema-derived client slices.

Replace `apps/admin/src/lib/api.ts` one domain at a time. Do not create a single replacement mega-client.

### Jini

Keep Jini as a separate repository for now, but consume released, tagged, or packed versions through the lockfile. Provide an optional local workspace override for coordinated development.

Do not merge the repositories solely because there are 13 filesystem dependencies. A repository merge is a much larger organizational one-way door than this evidence justifies.

## 3. WHAT IT BUYS

| Boundary | Concrete benefit | Honest cost |
|---|---|---|
| Bounded contexts | Makes ownership and allowed cross-domain calls explicit; changes stop propagating through arbitrary `features`, `core`, and `server` files | Moving files alone is useless; commands, queries, and events must be designed |
| Narrow module factories | Removes `RouteDeps`, makes module tests construct only relevant dependencies, and prevents domains from depending on Express | More constructor parameters and composition code |
| HTTP-neutral application services | Themes/content/rendering can change without rewriting Express routes; CLI/export can reuse workflows | Requires explicit input/result types and HTTP error mapping |
| Context-owned persistence adapters | Keeps Drizzle changes local and makes SQLite/Postgres parity testable | Schema aggregation and cross-context transactions need discipline |
| Contracts package | Stops admin DTO drift and dismantles the 2,939-line API file | Adds schema build/code-generation work and requires compatibility policy |
| Materialized tool contributions | Removes global mutable registration, the mega dependency intersection, and the 29-file SCC | The composition manifest still lists every enabled domain—which is legitimate application policy |
| Tiny technical platform | Removes product concepts from `core` and gives cross-cutting primitives stable ownership | Requires resisting future “shared” dumping |
| Versioned Jini boundary | Hermetic installs, reproducible CI, explicit compatibility | Jini releases and Tovu upgrades must be coordinated |
| Folder contexts rather than packages | Gains architectural ownership without adding dozens of builds and package manifests | Enforcement depends on dependency rules rather than package export maps |

## 4. SEQUENCE

The first implementation with the highest payoff per unit of risk is narrowing `RouteDeps`. Physical restructuring comes near the end.

| Step | Independently landable work | Estimate | Reversibility and likely breakage |
|---|---|---:|---|
| 0. Fix measurement | Add file-level runtime SCCs, all-import SCC diagnostics, fixed-threshold/p95 hub measures, admin coverage, and a production-only boundary view | 1–2 days | Fully reversible. Keep the old metric temporarily for continuity |
| 1. Retire `RouteDeps` at consumers | Move dependency slice interfaces to owning modules; convert the seven remaining module constructors and route registrars to narrow inputs; keep a compatibility assembler in bootstrap | 5–8 days | Incremental. Tests constructing partial `RouteDeps` will break; provide module-specific fixtures |
| 2. Replace tool registration | Add an aggregate assembler accepting built contributions; convert one domain at a time; delete the mutable registry and `AssistantToolRegistryDeps` last | 5–7 days | Incremental through a bridge. Registry reset/order tests and collision behavior need updating |
| 3. Converge content models | Introduce `ContentEntry` alongside legacy post/page records; migrate readers and writers; migrate fixtures; then cut APIs and legacy storage | 10–15 days | Main one-way door. Final storage/API cutover is the only step likely to require a coordinated large change |
| 4. Extract site delivery | Implement `RenderSitePage`; move theme/content/widget/navigation/SEO orchestration out of `pages.ts`; reduce Express to parse/call/respond | 7–10 days | Incremental by execution branch. Route-level tests and deep imports will move |
| 5. Introduce shared contracts | Seed from existing headless contracts; create domain-sized server response mappers and admin clients; remove matching sections from `api.ts` after each conversion | 10–15 days | Mostly reversible. Final content DTOs should follow Step 3 rather than freezing the old model |
| 6. Normalize persistence ownership | Move repositories and schema fragments context by context; preserve one migration journal and transaction coordinator | 7–12 days | Incremental, but migration ordering and cross-context transactions are high risk |
| 7. Make Jini hermetic | Replace sibling `file:` dependencies with locked versions/tags; retain an explicit local-development override | 2–4 days if packages are release-ready; 1–2 weeks otherwise | Reversible. Missing exports or divergence from sibling HEAD may surface |
| 8. Perform physical regrouping | Move code into `modules`, `platform`, and application hosts; retain temporary import aliases/shims | 5–8 days | Mechanically reversible but high-churn; do it only after dependency direction is correct |
| 9. Enforce and remove shims | Promote target boundary violations to errors; forbid new `RouteDeps`, global tool registration, server imports from contexts, and runtime file SCCs | 2–4 days | Policy becomes intentional; delete compatibility layers here |

Expected effort for one experienced engineer: roughly 8–12 weeks. Omitting content-model convergence reduces that to approximately 5–7 weeks, but would preserve one of the most important original design inconsistencies.

Everything except the legacy content cutover can be landed incrementally. The content cutover can still be developed incrementally behind dual-read/write adapters, but deleting the old representation should be one coordinated change.

## 5. RISKS

- The edge-removal calculations are optimistic upper bounds. Narrow replacement interfaces will restore some edges, although not the present global fan-out.
- `ContentEntry` convergence is a real semantic change. Revisions, soft deletion, rich-text versus HTML bodies, plugin extension data, and public APIs need explicit decisions before the final migration.
- Routes and tool handlers currently share authorization, gating, and surface-exchange behavior. Moving orchestration must preserve the same service instances and policies.
- Tool aggregation must retain deterministic ordering, duplicate-ID validation, surface filtering, and audit behavior. Removing the registry should not remove those guarantees.
- Splitting `db/schema.ts` must not split transaction ownership or create competing migration histories.
- Published Jini packages may lag the sibling checkout. Hermeticity requires release discipline, not merely changing package-specifier syntax.
- Static analysis can miss dynamic imports and `createRequire`. Runtime composition smoke tests remain necessary.
- `packages/contracts` can become a new dumping ground. It must remain JSON/wire-focused and dependency-free from server, domain, Drizzle, React, and Jini runtime implementations.
- Directory moves will produce large review diffs. Preserve compatibility aliases until semantic migrations are complete.
- Themes are especially regression-prone. Copy semantics, schema-v2 `render/` paths, and the archived fixture themes should be explicit acceptance tests throughout.

## 6. DO NOT BOTHER

- Do not lead with extracting `createApp`. The earlier approximately 0.7-point result is credible. Its real file cycle can disappear later when composition moves into `apps/server/bootstrap`.
- Do not funnel every import through `index.ts`. The repository already contains evidence that this increases propagation. Use deliberate public subpaths.
- Do not turn every bounded context into an npm package. With one deployable, that adds build and versioning cost without buying operational independence.
- Do not split this into microservices. The product benefits from one transaction boundary and one container; `spawn` already rules out the supposed serverless payoff.
- Do not build a generic repository abstraction over Drizzle. Ports should express business operations, not reproduce an ORM.
- Do not make admin import server or domain internals. Share wire contracts only.
- Do not merge Tovu and Jini merely to fix `file:` dependencies. Version the repository boundary first.
- Do not replace the tool registry with reflection, filesystem scanning, or a DI container. Plain factories plus an explicit manifest are easier to reason about.
- Do not physically rename and move hundreds of files before fixing dependency direction. That produces churn without architecture.
- Do not optimize the current median-based core count. It can report regression after genuine decoupling.
- Do not revive theme inheritance, flatten the schema-v2 `render/` branch, or clean up `theme-archive`.
- Do not create a new generic `shared`, `common`, or renamed `core` directory. Every product concept needs an owning context; only stable technical primitives belong in `platform`.

No files were changed, and the full test suite was not run.