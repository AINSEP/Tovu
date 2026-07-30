# Tovu Admin Section — Competitive Structure Analysis & Proposed Outline

Date: 2026-07-02 (rev 2 — added §5 unique capabilities per backend, §6 architect synthesis)
Method: CBM (codebase-memory MCP) indexes + fresh Graphify extractions of the admin
sections of directus, ghost, medusa, open-saas, strapi, payload, wordpress
(per-directory `graphify-out/graph.json` under each admin dir in
`/Users/la/Desktop/Programming/OSS-Repos`).

## 1. Graph evidence summary

| Admin section | Nodes | Edges | Density | Top hubs (degree) |
|---|---|---|---|---|
| medusa `packages/medusa/src/api/admin` | 1,966 | 4,067 | 2.07 | framework pkgs: `http`(303), `utils`(277), `types`(259), `core_flows`(206) |
| ghost `core/server/api/endpoints` | 1,236 | 1,765 | **1.43** | `index.js`(85), `errors`(49), `tpl`(44) |
| ghost `ghost/admin` (Ember UI) | 3,619 | 6,326 | 1.75 | `service`(211), `component`(130) |
| strapi `packages/core/admin` | 2,955 | 8,356 | 2.83 | `index.ts`(179), `react`(174), design-system(143) |
| directus `app` (Vue admin SPA) | 7,988 | 20,049 | 2.51 | `vue`(673), `types`(327) |
| payload `payload/src/admin` | 570 | 1,954 | 3.43 | `types.ts`(575) — single contracts hub |
| wordpress `wp-admin` | 2,140 | 4,736 | 2.21 | `__()`(530), `apply_filters()`(284) |
| open-saas `src/admin` | 52 | 211 | 4.06 | page components |

Reading: for medusa and ghost the top hubs are *framework* imports, meaning admin
resources depend on shared infrastructure, not on each other (low cross-resource
coupling). WordPress's hubs are global functions — logic, presentation, and
persistence interleave in page scripts. Payload concentrates everything in one
types/contracts hub — its admin is a schema, not code.

## 2. Structure per competitor

### Medusa — resource-folder admin API (best backend organization)
`packages/medusa/src/api/admin/<resource>/` — ~45 folders, each self-contained:
- `route.ts` — file-based routing; exports `GET`/`POST`/…; handlers are thin
  (validate → call workflow from `core-flows` → refetch entity → respond).
- `middlewares.ts` — declarative `MiddlewareRoute[]`: matcher + RBAC policies
  (`{resource, operation}`) + `validateAndTransformBody/Query(zod)`.
- `validators.ts` — zod request schemas.
- `query-config.ts` — allowed fields/relations, pagination defaults.
- `helpers.ts`, nested `[id]/`, `batch/` subroutes.

Graph confirms near-zero edges between resource folders; everything flows through
the framework layer. Uniform and machine-predictable.

### Ghost — declarative endpoint controllers (lowest coupling, 1.43)
Each file in `api/endpoints/` exports a controller object:
`{docName, browse|read|add|edit|destroy: {options[], validation, permissions, query(frame)}}`.
A shared api-framework pipeline builds a normalized `frame`, applies validation,
permissions, serializers (`utils/serializers/input|output/`) and headers/cache
invalidation. Endpoints never touch HTTP directly. Uniform CRUD verb semantics
across ~50 resources.

### Strapi — layered admin package with named permissions
`packages/core/admin/` = `server/` + `admin/` (React UI) + `shared/` (contracts).
Server is layered: `routes/` (declarative tables), `controllers/`, `services/`,
`domain/`, `validation/`, `policies/`, `middlewares/`, `content-types/`.
Every route declares policies: `admin::isAuthenticatedAdmin` +
`{name: 'admin::hasPermissions', config: {actions: ['admin::users.create']}}`.
Permission = named action string; UI and server share the same action registry.

### Payload — schema-derived admin (almost no per-entity admin code)
`payload/src/admin/` is a contracts layer (570 nodes, one `types.ts` hub):
field/element/view component *descriptions* that the config-driven panel
(`packages/ui`, `packages/next`) renders. Admin REST/GraphQL is generated from
collection configs. Adding an entity = writing a config, not writing admin code.

### Directus — one API, admin as a permission scope + module registry SPA
`api/src/controllers/*` + `services/*` pairs; a `permissions/` engine scopes every
request. There is no separate "admin API" — the admin Vue SPA (`app/modules/`)
is a module registry (settings, content, users, insights…) over the same API.

### WordPress — page-per-screen, hook-driven (structural anti-pattern, great extension model)
96 top-level page scripts + 106 include libraries; hubs are global functions
(`apply_filters` 284 edges). No layering. Its enduring idea is the *registry*:
plugins add admin pages/menus via hooks — which Tovu's `admin-shell` already
adopts deliberately ("WordPress-shaped admin shell") without the code style.

### open-saas — starter-level (52 nodes)
Pages + layout + elements wired via wasp config. Not an architecture reference;
only a reminder that dashboards should stay thin pages over feature queries.

## 3. Verdict — which are best, and why

1. **Medusa** — best physical layout for an admin HTTP surface: colocated
   resource folders (route/validators/query-config/policies), thin handlers
   delegating to workflows, declarative RBAC per matcher. Graph-verified low
   cross-resource coupling.
2. **Ghost** — best cross-cutting abstraction: a single pipeline (frame →
   validate → permissions → query → serialize) keeps endpoints declarative and
   produced the lowest coupling density of all seven.
3. **Strapi** — best permission model and package boundary: named permission
   actions declared on routes and shared with the UI via a `shared/` contracts
   folder.
4. **Payload** — best leverage: entity CRUD admin derived from schema config.
   Matches Tovu's declarative-themes/plugins direction (ADR-010, ADR-004).

WordPress and Directus contribute one idea each — the pluggable section registry
(already in `admin-shell/`) and admin-as-permission-scope over a single API —
rather than a code structure to copy.

## 4. Proposed Tovu admin section structure

Fits existing layout (`core/ features/ headless/ admin-shell/ server/`), keeps
routes transport-thin (routes/INFO.md), respects the admin-shell boundary rule
(server never imports admin-shell), and workspaceId scoping (ADR-007).

```
src/
  core/
    permissions/                  # Strapi-style named actions + evaluator port
      actions.ts                  #   'admin.posts.update', 'admin.settings.read', …
      evaluate.ts                 #   (identity, action, scope) -> allow/deny
      INFO.md  __tests__/  __specs__/

  headless/
    admin/                        # admin DTO contracts shared server <-> shells
      posts.ts  presentation.ts  users.ts  settings.ts  system.ts
      index.ts  INFO.md

  server/
    middleware/
      admin-auth.ts               # session/token -> identity on request-context
      admin-permissions.ts        # enforce declared actions (one place, Ghost-style)
    routes/
      admin/
        index.ts                  # mounts resources; applies admin pipeline
        registry.ts               # resource descriptors (see below)
        <resource>/               # one folder per resource — Medusa pattern
          route.(get|update|…).ts #   thin handlers -> features/<domain>
          validators.ts           #   zod request schemas
          query-config.ts         #   allowed fields/includes/pagination defaults
          policies.ts             #   required permission actions per verb
          INFO.md  __tests__/  __specs__/

  admin-shell/
    navigation.ts                 # existing menu blueprint
    sections.ts                   # section registry (WordPress-shaped, plugin-extensible)
    resources.ts                  # derives nav entries from route registry descriptors
```

### The resource descriptor (Payload-style leverage, kept small)

`server/routes/admin/registry.ts` holds one descriptor per resource:

```ts
{
  name: 'posts',
  feature: 'post',                    // features/<domain> that owns logic
  actions: {                          // maps verbs -> permission actions
    list: 'admin.posts.read', get: 'admin.posts.read',
    update: 'admin.posts.update',
  },
  dto: headlessAdmin.posts,           // response contracts
  nav: { section: 'content', label: 'Posts' },
}
```

Generic list/get handlers can be derived from descriptors for plain entities;
hand-written `route.ts` files override when behavior is custom. `admin-shell`
consumes the same descriptors to render navigation — one definition, three
consumers (routes, permissions, nav) without server depending on admin-shell
(descriptors live server-side; admin-shell reads the exported metadata shape via
`headless/admin`).

### Initial admin sections (nav-level)

| Section | Resources | Backing feature |
|---|---|---|
| Dashboard | overview cards | aggregate queries |
| Content | posts (exists), pages, media | `features/post`, future |
| Presentation | themes (exists: get, patch-active-theme) | `features/presentation` |
| Plugins | installed, marketplace | future (ADR-003/004 constraints) |
| Users & Roles | users, roles, permissions | future feature |
| Settings | workspace settings | `features/workspace` |
| System | health (exists at ops/), outbox/jobs, activity log | `core/events` outbox |

### Rules carried over from the winners

- **Handlers stay thin** (Medusa/Ghost): parse → feature call → DTO. No domain
  logic in `server/routes/admin`.
- **Permissions are data, enforcement is one middleware** (Strapi/Ghost):
  `policies.ts` declares action names; `admin-permissions.ts` enforces them.
  Never check permissions inline in handlers.
- **Validation and field allow-lists are colocated per resource**
  (Medusa `validators.ts` + `query-config.ts`): prevents over-fetch/mass-assign.
- **Contracts are shared, runtimes are not** (Strapi `shared/`, Tovu `headless/`):
  admin DTOs live in `headless/admin`, imported by both server and shells.
- **Extensibility is a registry, not hooks-in-page-code** (WordPress lesson):
  plugins add admin sections by contributing descriptors, never by patching
  route files.

## 5. What each backend admin does uniquely or differently

### WordPress
- **Capability system**: fine-grained caps mapped to roles via `map_meta_cap`; every
  admin screen and action gated by `current_user_can()`.
- **Everything is a hook registry**: plugins add menus, pages, notices, metaboxes,
  list-table columns without touching core files; per-user screen options.
- **Generic action dispatchers**: `admin-ajax.php` / `admin-post.php` — one endpoint,
  action-name routing (the ancestor of the descriptor registry idea).
- Differently: server-rendered page-per-screen, no API layer between UI and logic;
  multisite gets a whole parallel `network/` admin tree.

### Ghost
- **Declarative endpoint controllers on a shared frame pipeline**: per-verb
  `options` allow-lists, validation, permissions, `query(frame)` — endpoints never
  see HTTP. Lowest coupling of all seven (density 1.43).
- **Declarative cache invalidation**: each endpoint states `headers.cacheInvalidate`;
  the pipeline purges on writes.
- **Input/output serializer stages** separated from handlers.
- **admin-x micro-frontends**: new React apps (settings, etc. in `apps/admin-x-*`)
  mounted inside the legacy Ember admin — incremental re-platforming pattern.
- Differently: permissions resolved from `docName` + method, not per-route lists.

### Medusa
- **File-based route convention** (`route.ts` exports GET/POST…) with colocated
  `middlewares.ts`, `validators.ts`, `query-config.ts` per resource.
- **Writes are workflows** (`core-flows`) with compensation steps — admin mutations
  are transactional sagas, then `refetchEntity` returns read-shape responses.
- **Declarative RBAC policies** `{resource, operation}` on route matchers; feature
  flags checked at route level; `batch/` subroute convention.
- **Named injection zones** (`admin-shared/extensions`): plugins declare widgets for
  e.g. `product.details.side`; `admin-vite-plugin` discovers them at build time via
  virtual modules.
- Differently: admin API fully separated from store API at the top of the tree
  (`api/admin` vs `api/store`), sharing validators/utils underneath.

### Strapi
- **Namespaced permission actions** (`admin::users.create`) registered centrally,
  declared per route, shared with the UI; **conditions** = dynamic policies
  evaluated against entity data; field-level restrictions on permissions.
- **EE folder mirror** (`ee/server/src` with audit-logs) — commercial features as an
  overlay tree, not scattered flags.
- **content-manager as a separate package** from core admin (generic entity CRUD UI
  vs. admin platform), plus review-workflows / content-releases as packages.
- **Derives MCP tools from content types** (`content-manager/server/src/mcp/
  derive-content-type-mcp-tools.ts`) — the admin surface auto-exposed to AI agents.
- Differently: full MVC layering inside one package with a `shared/` contracts dir.

### Payload
- **Admin is config, not code**: every collection/field carries an `admin` sub-config
  (components, conditions) and **access-control functions per operation and per
  field**; REST/GraphQL/panel all generated from the same config.
- **Custom components by path string** resolved through a server-side import map —
  config stays serializable.
- **Versions/drafts, locked-documents, per-user preferences** as first-class
  system collections.
- **Local API**: CRUD callable in-process without HTTP — one execution path shared
  by REST, GraphQL, and the admin panel.
- Differently: the admin panel is a Next.js app you mount inside your own app.

### Directus
- **Admin as a database client**: collections/fields/relations are *runtime data*
  editable in the admin (data-model editor) — no build step to add an entity.
- **Policy-based permissions engine**: JSON filter rules + field allow-lists +
  presets per role/policy, evaluated inside every query (`api/src/permissions`).
- **One API, no separate admin API** — the admin SPA is just a privileged client;
  app is a module registry (content, files, insights, settings…) with extension
  types (interfaces, displays, layouts, panels, modules).
- **Flows**: event-driven automation authored in the admin.

### open-saas
- Baseline pattern only: pages gated by an `isAdmin` flag, wasp operations with
  auth context. Useful as the floor: auth check + typed queries + thin pages.

## 6. Architect synthesis — the best-of-all-admins structure for Tovu

Design stance: Tovu's admin should be a **two-plane surface over one pipeline**.

- **Control plane** (users, roles, settings, plugins, system): hand-written,
  Medusa-style resource folders. These endpoints are few, security-critical, and
  benefit from explicit code.
- **Content plane** (posts, pages, media, future entities): descriptor-derived,
  Payload/Directus-style. Entity CRUD, list projections, nav, and — Strapi's
  insight — **MCP tools** are all generated from one resource descriptor. For an
  AI-native CMS this is the highest-leverage decision in this document: the same
  descriptor that mounts `/admin/posts` also derives the agent-facing tool
  `admin.posts.update`.

### Request lifecycle (one pipeline, Ghost-style)

```
request
 → request-context (exists)            # workspaceId structural (ADR-007)
 → admin-auth                          # identity onto context
 → policy check                        # Strapi: named action + optional condition fn
 → validate                            # zod validators.ts (Medusa)
 → query-config projection             # field/include allow-list (Medusa)
 → feature call                        # features/<domain>; writes emit outbox events
                                       # (Tovu outbox ≈ Medusa workflow compensation lane)
 → DTO serialize                       # headless/admin contracts (Strapi shared/)
 → cache-invalidation hint             # declarative per endpoint (Ghost)
```

Handlers only ever implement the "feature call" line. Everything else is declared
in the resource folder and executed by the pipeline.

### Registries, not hooks (WordPress lesson, Medusa mechanics)

1. **Resource registry** (`server/routes/admin/registry.ts`) — descriptors:
   name, owning feature, verb→action map, DTO, query-config, nav hint.
2. **Section/nav registry** (`admin-shell/sections.ts`, exists) — consumes
   descriptor metadata via `headless/admin`; plugins contribute sections here.
3. **UI injection zones** (Medusa): a finite, named list of widget mount points
   (`posts.editor.side`, `dashboard.cards`, …) published by `admin-shell`;
   plugin manifests (ADR-004) declare which zones they fill. No arbitrary hooks.
4. **MCP tool registry**: derived from resource descriptors + permission actions;
   an agent session holds an identity and passes the same policy check as a human.

### Permission model (Strapi core, Payload field-level, Directus scoping)

- Actions: namespaced strings `admin.<resource>.<operation>` in `core/permissions/`.
- Conditions: optional `(identity, entity, ctx) => boolean` attached to grants
  (Strapi conditions; covers "own posts only").
- Field-level: enforced by query-config allow-lists on read and validator
  stripping on write (Payload per-field access, cheaply).
- Workspace scoping is structural, not a permission (ADR-007) — the permission
  layer never sees cross-workspace data at all.

### Build order

1. `core/permissions` (actions + evaluate port) + `admin-auth` /
   `admin-permissions` middleware — everything depends on this.
2. Pipeline extraction in `server/routes/admin/` (wrap the two existing posts
   routes + presentation routes as the first migrated resources).
3. Resource registry + derive generic list/get handlers; posts becomes the
   reference descriptor.
4. `headless/admin` DTO contracts + admin-shell nav derivation.
5. MCP tool derivation from descriptors (AI-differentiator; after 3).
6. Injection zones (only when plugin runtime lands — ADR-003/004).

Anti-goals, decided by the evidence: no wp-admin-style page scripts with inline
logic; no per-handler permission checks; no second "content API vs admin API"
implementation of the same read logic (Directus/Payload both prove one engine can
serve both surfaces — Tovu's `features/` layer is that engine).

## 7. Rev 3 — The agent plane: AG-UI, MCP, A2A, WebMCP, and undoable AI plans

New requirement (2026-07-02): chat-driven admin (AG-UI / CopilotKit), where an AI
executes user-directed tasks that are auditable and undoable, sees WebMCP tags on
pages, talks to other MCPs / A2A / MCP-UI, and controls the Tiptap editor via its
MCP. This section defines how that modifies §6.

### 7.1 The load-bearing move: everything is a Command producing Change-Set items

ADR-008 already reserved the substrate. The agent requirement promotes its
"later" workflow to v1:

- **One mutation write path** (`core/commands/`): human saves and AI tool calls
  both become a `Command` `{actor, onBehalfOf, workspaceId, idempotencyKey,
  intentRef, input}` that runs the §6 pipeline (auth → policy → validate →
  feature call) and records `change_set_items` with before/after revision ids
  or inverse payloads.
- **Human direct save** = auto-applied single-item change set (ADR-008 §4).
- **AI mutations** = grouped under a change set whose status follows the risk
  tier: `auto-apply` (safe), `propose → human approves` (destructive/bulk),
  `forbidden` (entity has no inverse — per ADR-008, not agent-mutable).
- **Undo** = revert executor walking items in reverse applying inverses. Works
  days later, works for human *and* AI actions, one implementation.
- **Audit** = projection off the event spine (envelope already carries
  `actorId` + `changeSetId`); `intentRef` links a mutation to the chat
  message/plan step that caused it — audit answers *why*, not just *what*.
- **Plan** (`features/agent-plan/`) = first-class resource: ordered steps, each
  step either a read (no change set) or a mutation (references a change set).
  Statuses: `draft → approved → executing → done | aborted`. The chat UI renders
  the plan; the user can approve, edit, abort, or later revert per step or
  whole plan. ADR-001's plan/execute commerce semantics reuse this object.

### 7.2 Protocol adapters around one gateway (ADR-006 seam — many real adapters)

`server/agent/` is the seam. Protocols are thin translations; none holds logic.

```
              AG-UI (CopilotKit)   MCP server   A2A (agent card/tasks)
                       \               |               /
                        server/agent/protocols/* (adapters)
                                   |
                    server/agent/gateway.ts  ← session, identity, streaming
                                   |
                    server/agent/tool-registry.ts
                    { name, zod schema, location: server|client,
                      permission action, riskTier }
                                   |
              core/commands  →  features/*  →  outbox/events
```

- **Tool registry** entries are derived from §6 resource descriptors (CRUD
  tools) plus hand-registered tools (plan ops, change-set propose/apply/revert,
  search, navigation). The same registry projects to *every* protocol — adding
  a protocol never means re-describing capabilities.
- **AG-UI adapter**: SSE/stream endpoint the CopilotKit (or any AG-UI client)
  shell connects to; handles agent-state sync, streaming responses, and
  **frontend tool calls** (see 7.3). Lives in tovu server, not the Next app, so
  Next and Vue shells share it.
- **MCP adapter**: exposes the registry as an MCP server (Strapi's
  derive-tools-from-content-types, generalized). Also *consumes* external MCPs:
  outbound MCP client connections are registered per workspace with allow-listed
  tools.
- **A2A adapter**: publishes the agent card; maps A2A tasks onto plans. An
  external agent's task becomes a `Plan` with the same approval tiers — A2A
  gets no privileged path.
- **MCP-UI**: a *contract* in `headless/agent/` — tool results may carry UI
  resource payloads the chat renders. Treat rendered content as untrusted.
- **WebMCP**: not a server adapter — `admin-shell/web-mcp.ts` declares page
  capability tags per section; shells render them so browser-side agents
  discover page context. Declarations derive from the same descriptors.

### 7.3 Client-side tools: Tiptap MCP and the two undo layers

The editor is a *client-located tool surface*. Registry entries with
`location: "client"` are advertised to the model but executed in the browser via
AG-UI frontend tool calls (CopilotKit supports this natively); the Tiptap MCP
bridge in the admin app maps them onto editor transactions.

Two undo layers, deliberately:
1. **In-session**: Tiptap history — instant ctrl-z for both human and AI edits
   while the doc is open.
2. **Durable**: on save/autosave the delta becomes a revision + change-set item
   — undo that works after the session, from the audit UI, per ADR-008.

Concurrency: agent-edits-while-human-edits needs **document locking first**
(Payload's locked-documents pattern; agent acquires/queues like any actor),
Yjs-style collab later if real-time co-editing becomes a product goal.

### 7.4 Beyond themes and plugins — the wiring checklist

Things the agent plane forces you to be aware of (each is a §6 resource,
a core primitive, or a policy):

1. **Agent identity & delegation** — agent principal acts `onBehalfOf` a user;
   capability-scoped session tokens; permissions evaluated against the
   *intersection* of agent scope and user grants.
2. **Risk tiers / approval policy** — per action: auto | propose | forbidden.
   Data, not code; editable in admin settings.
3. **Idempotency keys** — required on every mutating tool call (agents retry).
4. **Rate limits & budgets** — per session and per workspace (token spend,
   mutation count).
5. **Revisions & drafts** — the undo substrate; retention policy per ADR-008.
6. **Document locking / presence** — see 7.3.
7. **Media/uploads** — chunked upload pipeline on `StoragePort`; agents need a
   sanctioned upload tool, never raw paths.
8. **Search** — `SearchPort` (FTS5 first, ADR-006); agents are useless without
   find tools.
9. **Activity feed / notifications** — surface agent actions in the shell as
   they happen (event-spine projection).
10. **Background jobs** — long plans outlive requests; plan executor runs on
    the outbox/job lane with resumable status.
11. **Settings registry** — typed per-workspace settings as a descriptor-driven
    resource (agents read/write settings through the same gate).
12. **Webhooks (outbound)** — change-set applied/reverted are natural events.
13. **Users/roles/invites** — control-plane resources; agent may *propose*
    role changes, never auto-apply.
14. **Observability** — persist agent session transcripts linked to plans and
    change sets (`intentRef`); this is the audit trail's "why" half.
15. **Security posture** — WebMCP tags, MCP-UI payloads, and external MCP
    results are *untrusted input* (prompt-injection surface): per-session tool
    allow-lists, no secrets in tool results, human approval on tier boundaries,
    CSRF/session hardening on the AG-UI endpoint.
16. **Import/export & migrations** — bulk ops must produce change sets too, or
    they become the unauditable back door.

### 7.5 The new admin — directory structure (rev 3)

```
tovu/src/
  core/
    ports.ts                        # existing — envelope already carries actorId/changeSetId
    events/                         # existing — outbox worker, memory bus
    permissions/                    # §6 — actions, evaluate, conditions
    commands/                       # NEW — the one mutation write path (ADR-008)
      command.ts                    #   Command envelope (actor, onBehalfOf, idempotencyKey, intentRef)
      change-set.ts                 #   change_sets / change_set_items operations
      revert.ts                     #   inverse executor (reverse walk)
      audit.ts                      #   audit projection off the event spine
      INFO.md  __tests__/  __specs__/

  features/
    post/  presentation/  workspace/    # existing
    revision/                       # revision store (undo substrate)
    agent-plan/                     # plan aggregate: steps, approvals, execution status
      plan.ts  repo.memory.ts  INFO.md  __tests__/  __specs__/

  headless/
    admin/                          # §6 — admin DTO contracts
    agent/                          # NEW — shared agent contracts
      tools.ts                      #   tool schemas (zod → JSON Schema projections)
      plan.ts                       #   plan/step DTOs + statuses
      stream.ts                     #   chat/agent event contracts (AG-UI-shaped)
      mcp-ui.ts                     #   embedded UI resource contract (untrusted)

  server/
    middleware/
      admin-auth.ts  admin-permissions.ts
      agent-session.ts              # NEW — agent identity, delegation, budgets
    routes/
      admin/
        index.ts  registry.ts       # §6 — pipeline + resource descriptors
        posts/  presentation/  …    # §6 — Medusa-style resource folders
        change-sets/                # NEW — list / preview / apply / revert (approval UI backend)
        plans/                      # NEW — plan review/approve/abort endpoints
        settings/  users/  media/   # control-plane resources as they land
      content/  ops/                # existing
    agent/                          # NEW — the protocol seam
      gateway.ts                    #   sessions, identity binding, streaming
      tool-registry.ts              #   name, schema, location(server|client), action, riskTier
      derive-tools.ts               #   descriptors → CRUD tools; + plan/change-set/search tools
      protocols/
        ag-ui.ts                    #   CopilotKit / AG-UI runtime adapter (SSE)
        mcp.ts                      #   MCP server (expose) + client manager (consume, allow-listed)
        a2a.ts                      #   agent card + tasks → plans
      INFO.md  __tests__/  __specs__/

  admin-shell/
    navigation.ts  sections.ts      # existing + §6
    zones.ts                        # named UI injection zones (Medusa pattern)
    web-mcp.ts                      # NEW — page capability tags per section (WebMCP metadata)
    editor.ts                       # NEW — editor tool surface metadata per content type

apps/admin (Next shell — scaffolded packages/, per PROJECT_MEMORY):
    chat/                           # CopilotKit mount, AG-UI client wiring
    editor/                         # Tiptap + tiptap-mcp bridge (client tool executor)
    review/                         # change-set diff/preview + plan approval UI
    web-mcp/                        # renders admin-shell web-mcp tags into the page
```

Boundary rules preserved: `admin-shell` still framework-free metadata; `server`
never imports `admin-shell`; protocol adapters import gateway + headless
contracts only; `core/commands` depends on ports, not providers.

### 7.6 Revised build order

1. `core/commands` + change-set tables (ADR-008 v1 schema) — wrap existing
   posts/presentation mutations so *every* write already produces change sets.
2. `core/permissions` + admin pipeline (§6 order holds).
3. Revert executor + revisions for posts → first end-to-end undo.
4. Resource registry + derive-tools → tool registry.
5. `server/agent/gateway` + AG-UI adapter + CopilotKit chat in Next shell
   (read tools + safe mutations first).
6. `features/agent-plan` + approval endpoints + review UI → propose tier live.
7. Tiptap client tools over AG-UI frontend calls; document locking.
8. MCP server adapter (expose), then MCP client (consume), then A2A; WebMCP
   tags last — they only need metadata by then.
