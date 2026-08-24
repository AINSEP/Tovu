^D## Position

Tovu should **merge `plugin-runtime` and `site-glue` into a single, unified extension architecture** governed by three trust tiers (Tier-1 Declarative, Tier-2 Sandboxed Worker, Tier-3 In-Process) and a shared capability gate. The published site must remain strictly server-rendered and React-free by standardizing `render.contribute` on **JSON Component Descriptors and sandboxed resolvers** dispatched through the existing `data-embed-config` marker scanner. In the React admin, plugin UI should be decoupled from host React builds via **schema-driven A2UI primitives for Tier-1/2** and **Shadow DOM Web Components or MCP-UI sandboxed iframes for Tier-3**, preventing white-screen cascades. Plugin lifecycle must complete its missing install/update/purge operations by pairing cryptographic Ed25519 signatures with Tovu's existing database snapshot/phase-journal engine and permanent namespace retirement.

---

## Q-A Merge or separate

**Recommendation: Merge into ONE unified extension system.**

### The Join and Principled Gate
Maintaining `plugin-runtime` and `site-glue` as parallel mechanisms is redundant architectural overhead:
- Both enforce capability-gated delegate handles (`gate()` in `plugin-runtime/capability-sdk.ts` vs `buildGlueCapabilityGate()` in `site-glue/capability-gate.ts`), throwing identical classified errors (`CapabilityDeniedError` vs `GlueCapabilityDeniedError`).
- Both target overlapping call sites (`content.entry.beforeSave`, `assistant.tools`, `events.subscribe`).
- Both require manifest validation, versioning, and change-set attribution.

The join is **Trust Tier + Provenance**, governed by a single manifest schema (`tovu.plugin.json`):

1. **Manifest & Discovery**: A single manifest format replaces both. First-party site extensions are simply **Tier-3 plugins with local provenance** (`provenance: { source: "local" }`).
2. **Capability Matrix by Tier**:
   - **Tier-1 (Declarative / Data-only)**: Zero executable code. May request `content.read`, `admin.nav.register`, `fields.declare`, `render.contribute` (declarative templates/embeds), `admin.ui.schema`.
   - **Tier-2 (Worker-Sandboxed Compute)**: Executable code running strictly within `worker-sandbox.ts` threads (wall-clock timeout + V8 heap `resourceLimits`). May request `content.extend`, `hooks.attach` (pure transform hooks), `render.contribute` (sandboxed template/block resolvers), `tools.register` (pure compute agent tools), `events.subscribe`.
   - **Tier-3 (In-Process / Full Trust)**: Executable Node.js ESM imported in-process. May request all capabilities including `http.route.register`, raw DB access via `dataModule` (`data-module.ts`), filesystem/network I/O, and system-level lifecycle hooks.
3. **Integrity & Quarantine Unification**:
   - **Integrity**: Required SHA-256 hashing for all packaged/marketplace plugins before `import()` (`loader.ts:167`). Local site glue in dev mode can bypass file hashing via an explicit `provenance: { source: "local" }` flag.
   - **Quarantine**: Universal 3-strike isolation (`quarantine.ts`) applied across all hook invocations, tool calls, and event subscribers regardless of tier.

---

## Q-B render.contribute return shape

### The Return Shape: Component Descriptor & Sandboxed Stream/String
`render.contribute` must **NOT** return raw unescaped HTML strings, nor introduce `react-dom/server`. It must return a **`ComponentDescriptor` (matching the existing `Component` / `WidgetRenderIR` shape)**:

```ts
export interface ContributedComponent {
  readonly id: string; // e.g. "plugin-vendor/product-card"
  readonly schema: JsonSchema; // Props validation schema
  readonly resolver: (ctx: SiteRenderContext, props: JsonObject) => Promise<string> | string;
}
```

### Justification Across the 5 Theme Tiers
Tovu's published site has five non-React tiers (`declarative`, `templated` LiquidJS, `handlebars`, `static`, and reserved `code`). The architectural rule settled on 2026-08-10 is **"genericity belongs in the scanner, not the renderer; each resolver escapes its own output"**:

1. **Static HTML**: The scanner in `core/embeds/marker.ts` locates `<div data-embed-config='{"type":"plugin","id":"vendor/product-card","props":{...}}'>fallback</div>`. The plugin resolver runs, escapes its content with core HTML-escape utilities, and substitutes the element. Unresolvable markers degrade safely to `WIDGET_PLACEHOLDER_IR` without leaking internals (REQ-28).
2. **Templated (LiquidJS)**: Handled by extending the allowlisted `render_block` Liquid tag (`liquid-worker.ts`) to resolve contributed component IDs against the dynamic registry.
3. **Handlebars**: Handled by the existing `render_block` Handlebars helper.
4. **Declarative (JSON block trees)**: Deserialized directly as `{ "type": "component", "id": "vendor/product-card", "props": { ... } }` into `renderBlock()`.
5. **Code Tier**: Direct functional invocation.

### Tier Isolation for Render Execution
- **Tier-1**: Declares a purely declarative template partial (Liquid/HTML) with bound field tokens.
- **Tier-2**: The resolver executes inside the `worker-sandbox.ts` worker thread alongside the Liquid/Handlebars workers. `ctx` is passed via structured clone (already containing plain `PostRecord` data), and the worker returns `{ ok: true, html: string }`.
- **Tier-3**: Direct in-process resolver registration in `COMPONENTS: Record<string, Component>`.

---

## Q-C Extension-kind taxonomy

### Taxonomy Table

| Gap | Your proposed kind/capability | Min tier | Notes |
|---|---|---|---|
| `render.contribute` (front-end UI) | `render.contribute` | Tier-1 | Tier-1 provides declarative block templates; Tier-2 runs sandboxed resolvers in `worker-sandbox.ts`; Tier-3 runs in-process. Resolves via `data-embed-config` and `render_block`. |
| `admin.nav` (admin navigation) | `admin.nav.register` | Tier-1 | Purely declarative manifest contribution (route, label, icon, badge query, permission guard). |
| `http.routes` (custom API endpoints) | `http.route.register` | Tier-3 | Registers sub-router mounted exclusively under `/api/plugins/:pluginId/`. Requires in-process Express router attachment. |
| Scheduled jobs / cron | `cron.schedule` | Tier-2 | Scheduled worker execution. Managed by an in-process SQLite tick scheduler. |
| Custom field editors (Directus `interface`) | `field.editor.register` | Tier-1 | Tier-1/2 uses declarative A2UI/JSON-Schema form schemas; Tier-3 supplies Shadow DOM Web Components / MCP-UI iframes. |
| Custom field displays (Directus `display`) | `field.display.register` | Tier-1 | Tier-1 uses formatting token strings (e.g. date/currency masks); Tier-2/3 provides rendering functions returning sanitised HTML cells. |
| Admin dashboard panels (Directus `panel`) | `admin.panel.register` | Tier-1 | Tier-1 uses declarative A2UI card/chart specs (Recharts/Shadcn catalog); Tier-3 uses Web Components / MCP-UI iframes. |
| Collection layouts (Directus `layout`) | `admin.layout.register` | Tier-1 | Declarative view descriptors (Kanban, Grid, Calendar, Map) mapping collection field schemas to standard view engines. |
| Plugin i18n / translations | `i18n.contribute` | Tier-1 | Pure JSON translation bags (`locales/{lang}.json`) merged into core i18n dictionary under `plugin.{id}.*` namespace. |
| Automation / flow steps (Directus `operation`) | `flow.operation.register` | Tier-2 | Sandboxed async pipeline operations accepting structured input and returning JSON output. |

### `http.routes` Specification
1. **Path-Collision Policy**: Strict prefix isolation. Every contributed route is forced under `/api/ext/:pluginId/*` or `/api/plugins/:pluginId/*`. Plugins cannot register root routes or intercept core `/api/admin/*` or `/api/site/*`. Collision between plugins is impossible due to mandatory plugin ID namespacing.
2. **Authentication**: Declarative route metadata in manifest/registration:
   - `"public"`: Open access (e.g. webhooks, public endpoints).
   - `"authenticated"`: Requires valid admin/client session; automatically verifies permissions via `deps.authorize`.
   - `"signed-webhook"`: Core validates HMAC-SHA256 signature against a secret stored in Tovu's credential store before dispatching to the handler.
3. **Rate Limiting**: Core middleware automatically wraps every plugin route with an in-memory/SQLite token bucket limiter (default 120 req/min per IP, configurable in manifest, hard-capped at 600 req/min).

### Cron in Tovu's Single Docker Container Model
Without an external daemon (like systemd or Kubernetes cron), Tovu uses an **internal SQLite-backed persistent scheduler**:
- **Table `_plugin_cron_jobs`**: Stores `(plugin_id, job_id, cron_expr, next_run_at, locked_until, last_status)`.
- **Leaderless Tick Loop**: A 10-second timer runs inside the core Node process. On each tick, it runs an atomic transaction:
  ```sql
  UPDATE _plugin_cron_jobs
  SET locked_until = :lockExpiry, next_run_at = :nextRun
  WHERE next_run_at <= :now AND (locked_until IS NULL OR locked_until < :now)
  RETURNING *;
  ```
- **Execution**: The job is dispatched to a worker thread (Tier-2) or in-process queue (Tier-3).
- **Restart Catch-up Policy**: If the container was down and multiple ticks were missed, jobs with `catchUp: false` (default) run exactly once and schedule the next future slot.

---

## Q-D Machine-readable contract

WordPress failed because hooks were imperative magic strings scattered across arbitrary PHP files. Tovu must make its extension contract **100% statically and dynamically discoverable by AI agents**.

### The Introspection Architecture
Extend `tovu introspect` (`src/cli/introspect.ts`) with a first-class `--surface extension` target:

1. **Manifest JSON Schema**:
   `tovu introspect --surface schema` outputs the complete JSON Schema for `tovu.plugin.json`, defining all capabilities, valid hook points, allowed field types, and tier constraints.
2. **Live Extension Catalog**:
   `tovu introspect --surface extension --format json` emits a comprehensive catalog:
   - **Hook Registry**: Full list of available lifecycle hooks (e.g. `content.entry.beforeSave`), signatures, parameter types, mutation capabilities, and execution mode (fail-closed vs fail-isolated).
   - **Theme & Embed Slots**: Enumerable slot names in active themes and standard component IDs.
   - **Admin UI Mount Points**: Valid slot targets for nav, field editors, dashboard panels, and collection layouts.
   - **Agent Tool Interfaces**: Definitions of domain tool catalogs the plugin can consume or extend.
3. **MCP Tool Integration**:
   Expose `tovu_describe_extension_surface` via MCP (`tovu introspect --format mcp`), allowing an LLM generating a plugin to query:
   - Exact prop signatures for any hook or embed resolver.
   - Live SDK API definitions for a specific target Tier (`tier-1`, `tier-2`, `tier-3`).

---

## Q-F Plugin UI in the React admin

### Mount Points (Enumerable as Data)
Admin mount points are declared as a strict enum:
- `admin.nav`: Sidebar navigation links and section groups.
- `admin.field.editor.{fieldType}`: Custom input control for content entry forms.
- `admin.field.display.{fieldType}`: Custom cell formatter in collection data tables.
- `admin.dashboard.panel`: Analytical and status cards on the dashboard grid.
- `admin.collection.layout`: Full-view collection visualizations (e.g. Kanban board, Gantt, Map).
- `admin.page.{route}`: Standalone full-page admin module.

### Isolation Strategy (Anti-White-Screen)
1. **React Error Boundaries**: Every mount point is wrapped in a host `<PluginSlotBoundary pluginId={id} slot={slot}>`. If a plugin UI crashes or throws during render, the boundary catches it, displays a localized inline warning with a "Disable Plugin" action, and keeps the rest of the React admin fully functional.
2. **Sandboxing by Tier**:
   - **Tier-1/2**: Pure declarative JSON. Zero untrusted client JavaScript runs in the admin DOM.
   - **Tier-3**: Rendered inside **Shadow DOM Custom Elements** (Web Components) or **MCP-UI sandboxed iframes** (`<iframe sandbox="allow-scripts allow-forms" srcdoc="...">`).

### Version Coupling & Build Management
- **Rule: Plugins MUST NEVER import host React or compile against Tovu's internal Vite/React bundle.**
- React major/minor upgrades in Tovu must not break plugins.
- **Contract**:
  - For Tier-1/2: Pure data schemas.
  - For Tier-3 Custom UI: Plugins compile to standard **Custom Elements (Web Components)** using standard DOM API / `@tovu/admin-ui-sdk` (custom events and property bindings) OR **MCP-UI HTML bundles**. The host passes state via HTML attributes/properties and listens to custom events (`tovu:field:change`, `tovu:action`).

### Declarative Tier-1 Admin UI
**YES, Tier-1 plugins can contribute rich admin UI declaratively.**
Format: JSON Schema + Form UI Schema (mirroring standard JSON Forms / A2UI):
```json
{
  "adminSurfaces": {
    "nav": [{ "label": "Stripe Sync", "icon": "credit-card", "page": "stripe-settings" }],
    "fieldEditors": [{
      "type": "geo-point",
      "schema": { "type": "object", "properties": { "lat": { "type": "number" }, "lng": { "type": "number" } } },
      "ui": { "widget": "GeoInput", "mapProvider": "osm" }
    }],
    "panels": [{
      "title": "Recent Transactions",
      "type": "table",
      "dataSource": "ext.stripe.transactions",
      "columns": ["id", "amount", "status"]
    }]
  }
}
```

### Evaluation of MCP-UI and A2UI (`src/assistant/`)
**A2UI and MCP-UI are the EXACT right substrates, not a red herring.**
- **A2UI (`src/assistant/render-ui-tool.ts`)**: Already implements a catalog-driven, JSON-based UI tree (`Column`, `Row`, `Card`, `shadcn.button`, `recharts.*`). Reusing this engine allows Tier-1 and Tier-2 plugins to build dashboard panels and form interfaces using Tovu's native React design system without writing React code.
- **MCP-UI (`src/assistant/mcp-ui.ts`)**: Already standardizes sandboxed iframe communication over `postMessage` with `ui://` URIs and action dispatches (`tool`, `link`, `intent`). This is the turnkey container for complex Tier-3 custom interactive applications.

---

## Q-G Plugin lifecycle

### 1. Install & Verification Flow
- **Sources**: Local path (dev), Zip upload (admin), or Marketplace package registry (`tovu plugin install <name>@<version>`).
- **Pipeline**:
  1. **Integrity & Cryptographic Signature**:
     - Check SHA-256 file hashes against manifest `integrity` dictionary (`loader.ts:167`).
     - Verify Ed25519 cryptographic signature against publisher public key (resolving Constraint 2). Reject unsigned or mismatched packages.
  2. **Static Validation**: Run `validateManifest()` to ensure schema correctness, valid SDK range, and field definitions.
  3. **Consent Screen (Critical for Tier-3 Marketplace)**: If the plugin requests Tier-3 or sensitive capabilities (`http.route.register`, DDL tables, in-process hooks), render an audited permission prompt detailing requested capabilities.
  4. **Namespace Minting**: Check `checkNamespaceAdoption()` in `plugin-identity.ts`. First mint permanently locks `pluginId` to publisher provenance.
  5. **DDL Reconciliation**: Execute `dataModule` DDL (`data-module.ts`) inside a transaction with pre-DDL database snapshot and durable phase journal.
  6. **Activation**: Write `_plugin_activation` record and attach runtime hooks.

### 2. Update Flow
- **Version Pinning**: Workspace locks plugin version in database/config.
- **Schema & DDL Migration**:
  - Diffs declared tables and columns against live SQLite schema (`data-module.ts` column-level reconciliation).
  - Additive nullable/defaulted columns execute via `ALTER TABLE ADD COLUMN`.
  - Incompatible column/type changes fail closed with typed error (`COLUMN_TYPE_MISMATCH`), triggering automatic rollback from the pre-update snapshot.
- **Ext Field Evolution**: New `ext` fields are registered in validation schemas; deprecated `ext` fields are ignored on write but preserved in existing records.

### 3. Uninstall & Purge Policy
To complete Tovu's deliberate data retention invariants (`post.ts:64` INV-03, `plugin-identity.ts` permanent retirement, `data-module.ts` no drop on disable):

- **Soft Uninstall (Default)**:
  - Deactivates plugin, detaches all hooks, routes, tools, and UI slots.
  - Removes plugin files from active runtime.
  - Marks plugin as `uninstalled` in `_plugin_activation`.
  - **Retains inert `ext.{pluginId}` JSON bags and `p_{pluginId}__*` database tables**.
- **Explicit Operator Purge (Two-Phase Data Cleanup)**:
  1. **Export Seam**: Provide `tovu plugin export-data <pluginId>` to dump all plugin tables and `ext` records to a portable JSON/SQL backup.
  2. **Purge Confirmation**: Requires explicit high-privilege operator confirmation (`--purge-data --confirm`).
  3. **DDL Execution**: Executes `DROP TABLE p_{pluginId}__*` within a snapshot-backed transaction.
  4. **Namespace Permanence**: The row in `_plugin_identity` is **NEVER deleted**, ensuring the retired `pluginId` cannot be spoofed or claimed by a future third party.

---

## Q-E Sequencing

### Phase 1: Core Foundation & Unification (Immediate)
- Merge `plugin-runtime` and `site-glue` into a single manifest schema and capability gate.
- Implement cryptographic Ed25519 signature verification in `plugin-identity.ts`.
- Wire existing placeholder adapters: `render.contribute`, `admin.nav`, `http.routes`.
- Implement missing Admin API routes: `install`, `update`, `uninstall` (`src/server/routes/admin/plugins/`).

### Phase 2: Render & Admin UI Surface (Next)
- Connect `render.contribute` to `core/embeds/marker.ts` and `liquid-worker.ts` via Component Descriptors.
- Build React Admin UI slot system with `PluginSlotBoundary` error boundaries.
- Implement Tier-1 declarative Admin Nav and Schema-driven Custom Field Editors using the A2UI catalog.

### Phase 3: Background Jobs, HTTP Routing & Introspection (Follow-up)
- Implement SQLite-backed persistent cron scheduler for `cron.schedule`.
- Build HTTP route namespace gateway with auth middleware and rate limiting.
- Extend CLI `tovu introspect --surface extension` and publish MCP extension discovery tools.

### Phase 4: Advanced Extensibility & Marketplace (Deferred)
- Custom Collection Layouts (Kanban/Map views) and Dashboard Panels.
- Automation/Flow steps (`flow.operation.register`).
- Full public marketplace client with automated verification scanning.

---

## Strongest objection to my own position

**Objection: Worker serialization overhead and declarative UI expressiveness limits.**
- Running Tier-2 render resolvers and hooks inside `node:worker_threads` requires `structuredClone` data transfer on every render call. For high-traffic site requests with multiple contributed embeds, thread messaging overhead could add latency compared to direct in-process execution.
- Furthermore, forcing Tier-1/2 admin plugins into declarative A2UI/JSON-schema forms restricts plugin developers from building complex bespoke UI interactions (e.g. interactive canvas editors or rich drag-and-drop tools) unless they elevate to Tier-3 with Web Components or iframe sandboxes.

---

## What I would need to verify before committing

1. **Worker Thread Performance**: Benchmark render throughput and p99 latency of `worker-sandbox.ts` under concurrent load to determine if a pre-warmed worker pool or V8 isolate reuse is needed instead of spawn-per-render.
2. **A2UI Coverage for Field Editors**: Verify that Tovu's current A2UI catalog (`src/assistant/render-ui-tool.ts`) contains sufficient component primitives (e.g., date pickers, rich selects, markdown previews) to satisfy 90%+ of typical CMS custom field editor requirements without custom JS.
3. **Memory Footprint of SQLite Cron Tick**: Measure CPU and lock contention of the 10-second SQLite cron tick loop when running alongside concurrent visitor site rendering.
