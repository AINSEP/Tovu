I’ll independently verify the governing repository guidance and the extension contracts in source, while avoiding the two prohibited report paths. I’ll use the existing codebase graph for code discovery where available, then read the relevant manifests, adapters, sandbox, render registry, identity, and lifecycle files directly.

Codex(Peer): The mandatory bootstrap is loaded. The graph connector is not exposed in this invocation, so I’m following the repository’s prescribed fallback: targeted `rg` discovery plus direct source reads, with no writes and no access to the prohibited reports.

Codex(Peer): The governing architecture reinforces three constraints that matter here: every capability must sit behind a stable replaceable boundary, extension interactions need deterministic conflict isolation, and security/update provenance are first-class. One repository-instruction path is stale (`tovu/src/INFO.md` does not exist at this root); I used the current `apps/admin/INFO.md`, `src/features/INFO.md`, and `ADS-memory/knowledge/project_memory.md` equivalents.

Codex(Peer): A significant source correction emerged. `plugin-runtime` now runs `setup()` and the server composition attaches hooks end-to-end, but only for compiled-in sources; site-installed artifacts are still not composed. Conversely, `site-glue` has three adapter modules and integration tests but no loader, control loop, or production `GlueHostPort`, so calling those three rows “wired” overstates the live state. I’ll reflect that distinction in the recommendation.

Codex(Peer):

## Position

Merge `plugin-runtime` and `site-glue` into one extension platform, while retaining multiple execution adapters and workflow profiles inside it. Use a closed, versioned catalog of extension kinds; use capabilities only for authority, not to duplicate what the extension declares. Tier answers how code runs and the maximum risk envelope—not where the extension attaches, who authored it, or which permissions were granted. Front-end contributions should produce a bounded host-owned render IR; admin contributions should be declarative at Tier-1 and isolated in cross-origin iframes when executable. Build the machine-readable contract and secure artifact lifecycle before broadening the surface.

## Q-A Merge or separate

Merge them.

The present separation is historical, not principled: both systems validate manifests, construct capability gates, attach to the same content hook machinery, and need activation, quarantine, introspection, and lifecycle management. The useful distinction is not “plugin versus glue,” but five independent axes:

| Axis | Example values | Meaning |
|---|---|---|
| Distribution | built-in, marketplace, upload, local-agent | How bytes arrived |
| Authorship | publisher, operator, agent | Who produced the change |
| Tier | Tier-1, Tier-2, Tier-3 | How executable code runs |
| Extension kind | `render.component`, `http.route`, etc. | Where it attaches |
| Granted capabilities | `content.read`, `network.fetch`, etc. | What its handler may do |

Distribution and authorship must be installer-recorded metadata, never claims a manifest can make about itself. A local agent-authored extension should go through the same manifest, integrity, activation, and contribution registries, but with a staging/summary/approval workflow optimized for agent changes.

The engine-2 manifest should make the separation explicit:

```json
{
  "engine": 2,
  "id": "review-stars",
  "version": "1.2.0",
  "tier": "tier-1",
  "capabilities": ["content.read"],
  "extensions": [
    {
      "kind": "render.component",
      "apiVersion": 1,
      "id": "stars",
      "implementation": {
        "type": "declarative",
        "source": "assets/render/stars.json"
      }
    }
  ],
  "integrity": {
    "assets/render/stars.json": "sha256-..."
  }
}
```

`extensions[]` says what is being installed. `capabilities[]` says what host authority its implementation needs. Engine 2 should therefore retire registration-as-capability duplication such as `hooks.attach`, `tools.register`, `render.contribute`, and `admin.nav.register`. For migration, engine-1 manifests can be projected as follows:

- `hooks.attach` plus a hook declaration → `hook.filter`
- `tools.register` → `agent.tool`
- `events.subscribe` → `event.subscription`
- `render.contribute` → `render.component`
- `admin.nav.register` → `admin.navigation`
- `http.route.register` → `http.route`

`content.read` and `content.extend` remain genuine authority capabilities.

Tier enforcement should be:

- Tier-1: no executable JS. Declarative render/admin schemas, translations, content schemas, assets, and core-mediated operations only.
- Tier-2: executable handlers behind an async, structured-clone API and capability broker.
- Tier-3: in-process execution. Capability gates remain useful for API consistency and auditing, but the consent screen must say plainly that in-process code can bypass them through Node APIs.

The existing Worker machinery is reusable for deadlines, heap ceilings, termination, and message transport. It is not, by itself, a security sandbox: a normal Node Worker can still access filesystem, environment, and network APIs. A Tier-2 plugin host therefore also needs a restricted module linker, no ambient imports, a stripped environment, and all privileged work brokered through messages. If that cannot be independently demonstrated as a hard boundary, Tier-2 must use an OS-isolated child process; the Worker should be described only as fault containment.

Internally, use these modules:

- Contract Registry: kinds, points, schemas, compatibility, ordering.
- Artifact Lifecycle: stage, verify, install, update, uninstall, purge.
- Activation Planner: dependencies, capability grants, active version.
- Runtime Adapters: declarative, Tier-2, Tier-3.
- Contribution Registries: render, admin, routes, jobs, events, tools.
- Host Adapters: Tovu content, admin, router, scheduler, and render pipeline.

`site-glue` then becomes a local-agent workflow over Artifact Lifecycle, not a second runtime.

Source-state corrections:

- [`plugin-runtime` is now composed end-to-end for compiled-in sources](/Users/la/Programming/Tovu/src/server/plugin-runtime.ts:55): it runs `setup()` and attaches the captured filter. However, its production source type is still `"built-in"` only; discovered site artifacts are not composed into this path.
- [`site-glue`](/Users/la/Programming/Tovu/src/features/site-glue/ports.ts:63) has three adapter modules and tests, but no loader, control loop, activation store, or production `GlueHostPort`. “Three wired” currently means adapter code exists, not that three live production paths exist.
- “No quarantine” is slightly too broad: [`site-glue` has a threshold constant](/Users/la/Programming/Tovu/src/features/site-glue/manifest.ts:117), and tool registration reports per-module quarantine. Durable site-glue quarantine and its proposed control loop are what remain absent.

## Q-B `render.contribute` return shape

Do not make `render.contribute` a registration function. Replace it with the `render.component` kind. At render time, its implementation returns a bounded `RenderResult` containing host-owned `RenderIR`, never an arbitrary HTML string:

```ts
type RenderNode =
  | { kind: "text"; value: ValueExpression }
  | {
      kind: "element";
      tag: SafeHtmlTag;
      attrs?: Record<SafeAttribute, ValueExpression>;
      children?: RenderNode[];
    }
  | { kind: "core-component"; id: string; props: JsonObject }
  | { kind: "fragment"; children: RenderNode[] };

interface RenderResult {
  root: RenderNode;
  cache?: { scope: "none" | "page" | "site"; maxAgeSeconds?: number };
}
```

Each component descriptor also declares:

- A JSON Schema for its props.
- Allowed render contexts.
- Declarative tree or executable handler path.
- Required capabilities.
- CSS references.
- Maximum output complexity inherited from the host contract.

The Tier-1 implementation is the render tree itself. A Tier-2/Tier-3 handler receives a serializable, capability-filtered request and returns the same `RenderIR`. The host validates maximum depth, node count, attribute names, URL protocols, and text size, then escapes every leaf while compiling it to HTML.

Cross-tier invocation becomes:

| Theme tier | Author syntax |
|---|---|
| Declarative | `{"type":"component","id":"plugin/review-stars/stars","props":{...}}` |
| Liquid | `{% render_block component: "plugin/review-stars/stars", rating: 5 %}` |
| Handlebars | `{{render_block component="plugin/review-stars/stars" rating=5}}` |
| Static HTML | `<div data-embed-config='{"type":"plugin","plugin":"review-stars","component":"stars","props":{...}}'></div>` |

The current [`COMPONENTS`](/Users/la/Programming/Tovu/src/server/http/site/render.ts:1226) functions remain trusted internal adapters. They should be moved behind a registry with reserved `tovu/*` IDs; plugins receive `plugin/<pluginId>/<componentId>` IDs.

The static scanner stays generic. It recognizes `data-embed-config`, then routes only `type:"plugin"` to a plugin-specific resolver. That resolver:

1. Resolves the enabled plugin and exact component ID.
2. Validates props against that component’s schema.
3. Invokes the declarative or executable contributor.
4. Validates the returned IR.
5. Degrades failure to a public-safe placeholder.

This respects “genericity belongs in the scanner, not the renderer.” There is no universal renderer that guesses how menu, content, media, and plugin payloads should be interpreted. The only generic final step is compiling a closed safe syntax that has already been validated by the plugin resolver.

Reject the alternatives:

- HTML string: too easy to turn every plugin into an XSS and escaping-policy boundary.
- Existing `Component = (ctx, props) => string`: functions and the live `SiteRenderContext` cannot cross Tier-2 isolation.
- Existing JSON template node: it is an internal type that conflates theme structure and content-document vocabulary.
- React SSR: creates an unnecessary sixth theme tier and couples public rendering to React.
- Web components: useful later for progressive client behavior, but require browser JS, do not solve static/SEO rendering, and introduce a separate CSP/security contract.

## Q-C Extension-kind taxonomy

Use Directus-style closed kinds plus WordPress-style extensibility only through enumerable, versioned attachment points. Plugins may not invent new core hook names. New kinds and points are additive contract releases.

The initial complete kind catalog should be:

- Data: `content.schema`, `content.field`, `settings.schema`, `data.module`
- Behavioral: `hook.filter`, `event.subscription`, `agent.tool`, `automation.operation`, `job.schedule`
- Public rendering: `render.component`, `asset.bundle`
- Admin: `admin.navigation`, `admin.page`, `admin.field-editor`, `admin.field-display`, `admin.dashboard-panel`, `admin.collection-layout`
- Transport: `http.route`
- Localization: `i18n.catalog`

`hook.filter` is for synchronous/awaited transformations with a return value. `event.subscription` is for asynchronous “this happened” delivery. Do not add a generic WordPress-style action that can mean either.

| Gap | Your proposed kind/capability | Min tier | Notes |
|---|---|---:|---|
| `render.contribute` (front-end UI) | `render.component` | Tier-1 | Declarative descriptor or Tier-2+ handler; invocation returns validated `RenderIR`. |
| `admin.nav` (admin navigation) | `admin.navigation` | Tier-1 | Data-only nav descriptor targeting a namespaced `admin.page`; label is an i18n key and icon is a host token, not raw SVG. |
| `http.routes` (custom API endpoints) | `http.route` | Tier-2 | Executable handler; always namespaced, host-authenticated/rate-limited, body and response bounded. |
| Scheduled jobs / cron | `job.schedule` | Tier-1 | Tier-1 can schedule a core-mediated operation/webhook; a custom handler requires Tier-2. |
| Custom field editors (Directus `interface`) | `admin.field-editor` | Tier-1 | `AdminViewSpec` editor using host controls; arbitrary interactive code requires an iframe at Tier-2+. |
| Custom field displays (Directus `display`) | `admin.field-display` | Tier-1 | Declarative format/view tree; no arbitrary HTML. |
| Admin dashboard panels (Directus `panel`) | `admin.dashboard-panel` | Tier-1 | Declarative card/grid view with bounded data sources; executable panels use an iframe. |
| Collection layouts (Directus `layout`) | `admin.collection-layout` | Tier-1 | Declarative columns, grouping, filters, and view composition; custom application logic requires Tier-2. |
| Plugin i18n / translations | `i18n.catalog` | Tier-1 | Namespaced ICU-style messages, locale fallback, placeholder validation against the default locale. |
| Automation / flow steps (Directus `operation`) | `automation.operation` | Tier-1 | Tier-1 composes core operations declaratively; custom execution requires Tier-2. |

### `http.route`

Paths are always:

```text
/api/plugins/<pluginId>/<routeId>
```

A plugin cannot claim `/api/admin`, `/api`, a site slug, or another plugin’s namespace. Within its namespace, duplicate method-plus-route IDs make the artifact invalid; there is no priority winner. Start without wildcards. Add bounded tail captures only if a real integration proves exact routes insufficient.

Every route declares one core-enforced authentication mode:

- `admin`: default; host session authentication plus a named operator permission.
- `webhook`: anonymous transport, but host-enforced signature/replay policy from a closed verifier catalog.
- `oauth-callback`: host-minted state nonce tied to workspace, plugin, install, and expiry.
- `public`: explicit high-visibility consent; no ambient cookies or session authority.

The plugin never receives an admin session token. Webhook routes must be mounted early enough to preserve raw request bytes before the global JSON parser, because signature verification often depends on them.

Rate limits apply before plugin execution. A reasonable initial anonymous profile is 60 requests/minute per `(workspace, plugin, route, IP)`, burst 10, concurrency 4, 1 MiB request body, 5-second handler timeout, and bounded response size. Admin routes key additionally by principal. Manifests select named host profiles or request stricter limits; they cannot raise ceilings. Rejection returns `429` with `Retry-After`.

### Scheduled jobs

A `setInterval()` loop alone is not a scheduler. Store schedules and executions durably:

```text
extension_schedules:
  workspace_id, plugin_id, schedule_id, cron, timezone,
  next_run_at, misfire_policy, concurrency_policy, enabled

extension_job_runs:
  occurrence_id, lease_until, attempt, state, started_at, finished_at
```

One boot module polls due rows, claims each occurrence transactionally with a lease, and dispatches it through the same tier runtime and capability broker as other handlers. Semantics should be at-least-once, with a stable occurrence/idempotency key. Default misfire behavior is `coalesce-one`: after downtime, run once rather than replaying hundreds of missed intervals. Minimum frequency should initially be one minute; UTC is the default, with explicit IANA timezone support.

On `SIGTERM`, stop claiming, wait for a bounded grace period, and let unfinished leases expire. Disabling or uninstalling a plugin makes its schedules unclaimable without deleting their audit history. This works in one Docker container and already has the lease shape needed if multiple replicas appear later.

## Q-D Machine-readable contract

Publish one live Extension Contract Registry, and generate every human and machine surface from it.

Its emitted document should contain:

```ts
interface ExtensionContractDocument {
  contractVersion: string;
  sdkVersion: string;
  engineVersions: number[];
  tiers: TierDefinition[];
  capabilities: CapabilityDefinition[];
  kinds: ExtensionKindDefinition[];
  points: ExtensionPointDefinition[];
  adminMounts: AdminMountDefinition[];
  renderContexts: RenderContextDefinition[];
}
```

Every kind or point definition must include:

- Stable ID and `apiVersion`.
- Declaration JSON Schema.
- Handler input and result schemas.
- Minimum tier and allowed implementation modes.
- Required and optional capabilities.
- Ordering and collision rules.
- Failure behavior and timeout.
- Idempotency/retry expectations.
- Consent-screen description.
- Deprecation/replacement metadata.
- Live status: `wired`, `recognized-unavailable`, or `disabled-by-policy`.

That last field matters: the present `site-glue` schema accepts three call sites that have no production host wiring. An AI must be able to distinguish “valid vocabulary” from “usable on this Tovu instance.”

Expose it through:

- `tovu introspect extensions --format json`
- `tovu introspect extensions --format json-schema`
- `tovu introspect extensions --format mcp`
- `tovu plugin validate <path> --json`
- MCP resources such as `tovu://extensions/contract/v1`
- MCP tools such as `extensions_validate_manifest`, `extensions_get_example`, and `extensions_explain_consent`

The current [`tovu introspect --format mcp`](/Users/la/Programming/Tovu/src/cli/commands/introspect.ts:23) describes the CLI command tree, not the extension surface; extend it rather than assuming this problem is already solved.

The author kit should also ship:

- Generated TypeScript definitions.
- A manifest builder for inference.
- One minimal and one full example per kind/tier.
- Golden artifacts used by the runtime’s own conformance tests.
- A local validator that never imports plugin code.
- A compatibility report against a target Tovu version.

Runtime wiring must register through the same registry descriptor it publishes. CI should reject a new extension point unless it supplies schemas, documentation, failure/ordering semantics, an adapter, and contract tests. No scattered `do_action("string")` equivalent should be allowed.

Names can remain provisional until contract v1. After publication, evolve behavior with `apiVersion`; do not silently repurpose a point. For example, `content.entry.beforeSave` version 1 can coexist with version 2 during a deprecation window.

## Q-F Plugin UI in the React admin

The mount points should be enumerable data:

| Mount point | Kind | Multiplicity/collision |
|---|---|---|
| `admin.sidebar` | `admin.navigation` | Many; deterministic group/order/plugin-ID ordering |
| `admin.page` | `admin.page` | Namespaced `/admin/plugins/<pluginId>/<pageId>` |
| `admin.entry.field-editor` | `admin.field-editor` | Exactly one explicitly selected editor per field |
| `admin.entry.field-display` | `admin.field-display` | Exactly one explicitly selected display per field |
| `admin.dashboard.grid` | `admin.dashboard-panel` | Many, individually fail-isolated |
| `admin.collection.view` | `admin.collection-layout` | One selected layout per collection; no priority guessing |

The current framework-neutral [`AdminPanel`](/Users/la/Programming/Tovu/../Jini/packages/admin/src/core/manifest/types.ts:111) is a useful foundation for routing, navigation, requirements, and permissions. Its `render` field must not become the public plugin contract, because Tovu currently fills it with React thunks. Plugin descriptors should instead select one of two implementation forms.

### Tier-1: declarative native UI

Yes, Tier-1 must be able to contribute admin UI. Otherwise every field editor and dashboard card would require executable code, defeating the marketplace’s safest tier.

Define `AdminViewSpec v1`, with a closed component vocabulary such as:

```text
Stack, Row, Grid, Card, Tabs, Text, Heading, Badge, Metric,
Table, Form, TextField, NumberField, Select, Checkbox, DateField,
MediaPicker, TaxonomyPicker, Button, Notice, EmptyState
```

It supports:

- JSON bindings to named data-source results.
- Bounded equality/visibility expressions.
- Host-managed form state and validation.
- I18n keys.
- Actions referencing declared host commands or automation operations.
- Closed data sources such as static data, plugin settings, bounded content queries, and declared operations.

It does not support inline JavaScript, raw HTML, arbitrary CSS, arbitrary fetches, or dynamic component imports. The host renders each contribution inside its own React error boundary and validates the entire spec before mounting.

The A2UI component interpreter could implement part of this renderer, but A2UI itself should not be the durable plugin ABI. The existing A2UI flow is designed for transient agent-generated surfaces and its general render tool is currently development-gated. Freeze `AdminViewSpec v1` as Tovu’s contract and adapt it to A2UI primitives internally if useful.

### Tier-2/Tier-3: executable UI

Any executable plugin UI—including Tier-3 server plugins—runs in a sandboxed, credential-isolated iframe, consistent with accepted ADR-025. Server trust and browser-session trust are different axes.

The host `<PluginFrame>` should provide:

- Cross-origin, cookie-less delivery.
- `sandbox="allow-scripts"` without same-origin, forms, popups, or top-navigation.
- Deny-by-default CSP.
- A bound `MessageChannel`, per-frame nonce, and `event.source` verification.
- Capability-filtered async RPC; never an admin token or live DOM handle.
- Handshake timeout, heartbeat, crash placeholder, and per-frame diagnostics.
- An outer React error boundary so even the host wrapper cannot white-screen the shell.

Reuse the MCP-UI iframe/message-host mechanics where appropriate, but not its “arbitrary raw HTML returned by a tool” contract.

Executable UI ships compiled browser output, never source that Tovu builds during installation. A plugin may bundle its own React, Preact, Vue, or vanilla runtime inside its frame; it does not import Tovu’s React. It declares:

```json
{
  "uiProtocolRange": "^1.0.0",
  "browserTarget": "es2022",
  "entry": "admin/index.html"
}
```

This removes coupling to the admin’s current React version. Tovu supports protocol versions, not third-party React component ABIs. Upgrade preflight loads each installed frame against the target protocol before advancing the active Tovu release.

## Q-G Plugin lifecycle

Use a common lifecycle:

```text
staged → verified → installed-disabled → active
                            ↘ invalid
active ⇄ disabled
active → quarantined
disabled → uninstalled
uninstalled → purged-data
```

### Install

Ship these sources:

1. Marketplace/registry client.
2. Admin artifact upload.
3. Local filesystem path through the CLI for development.

Do not ship arbitrary URL fetch in v1. It introduces SSRF, redirect, digest, and provenance complications while adding little beyond upload and registry installation.

All sources enter the same staging pipeline:

1. Enforce archive/file-count/extracted-size/path/symlink limits.
2. Compute and verify archive digest.
3. Parse the manifest and collect all static errors.
4. Verify every file’s integrity entry.
5. Verify SDK, engine, kind, and tier compatibility.
6. Verify cryptographic provenance.
7. Produce the consent and migration plan.
8. Store content-addressed bytes.
9. Create an installed-but-disabled record.
10. Activate through a separate audited transition.

The current publisher/signature string comparison cannot protect a public marketplace. Before marketplace launch, registry metadata must cryptographically bind:

```text
pluginId
publisherAccountId
publisherDisplayName
version
archiveSha256
manifestSha256
issuedAt
```

Use a maintained signing/update-metadata library rather than hand-rolled cryptography. The client verifies a pinned, rotatable marketplace root. Manifest `publisher` text is never used as identity evidence.

Tier-3 remains marketplace-listable as required. Its consent screen must show:

- Verified publisher identity and artifact digest.
- Full in-process/machine-access warning.
- Requested kinds and capabilities.
- Routes, schedules, network domains, admin mounts, and DDL plan.
- Whether the update introduces new authority.
- The fact that SDK capability gates do not contain arbitrary in-process Node code.

Local unsigned Tier-3 installs remain possible, labeled “unverified local artifact,” with explicit reauthentication and consent.

Agent-authored local extensions get the same hashing. The agent writes into an undiscoverable staging directory; approval pins the resulting digest and moves the artifact into the normal installed store.

### Update

Pin each workspace to an exact version and digest. Do not auto-update initially. Multiple verified versions may coexist, with one atomic active pointer and one recorded last-known-good pointer.

An update is staged like a new install, then compared against the active version. Re-consent is mandatory for:

- Added capabilities or extension kinds.
- Tier escalation.
- New public routes, schedules, secrets, or network destinations.
- New DDL.
- Breaking admin/render protocol requirements.

Compatibility rules:

- Engine or kind `apiVersion` incompatibility blocks activation.
- Patch/minor/major labels do not override the actual contract check.
- `ext` field additions are allowed.
- Field deletion, rename, or type change under the same path is rejected. Use a new path, deprecate the old one, and perform a core-mediated copy if needed.
- Tables remain additive. New tables, nullable columns, and indexes are allowed where the existing reconciler can prove safety.
- Drops, destructive type changes, and constraint-tightening are rejected in v1.
- A complex schema revision uses a new versioned table and a core-mediated data-copy plan; the old table remains until explicit purge.

Apply DDL before advancing the active pointer, under the existing snapshot/journal discipline. A failed activation leaves new additive schema inert and restores the previous active version. V1 should reject migrations that make rollback to the previous plugin version impossible.

### Uninstall and purge

“Uninstall” remains non-destructive:

It removes:

- Active registrations, routes, schedules, subscriptions, frames, and grants.
- Installed executable/static artifact references.
- Temporary caches and staged versions.
- OAuth state and live credentials; external tokens should be revoked where possible.
- Content-addressed bytes only when no installed-version record still references that digest.

It retains:

- `ext.<pluginId>` content data, inert.
- Plugin-owned tables and settings.
- Activation/migration/audit history.
- Data-schema metadata needed for export.
- The permanent plugin identity tombstone.

A reinstall from the same verified publisher lineage may reactivate retained data. A different publisher must use a different plugin ID; ordinary install consent must not silently transfer the namespace.

Data recovery must not depend on reinstalling executable plugin code. Core supplies:

```text
tovu plugin data export <pluginId>
```

The export contains schema metadata, `ext` values as NDJSON, plugin tables as CSV/SQL-neutral rows, and non-secret settings. Secrets are not exported.

Cleanup is a separate operator-only, explicitly destructive action:

```text
tovu plugin data purge <pluginId>
```

It requires the plugin to be disabled/uninstalled, creates a restore point first, displays affected content/table counts, and then removes `ext` namespaces, plugin settings, and `p_<pluginId>__*` tables through core-owned code. It never deletes the audit history or identity tombstone. Thus “never drop on disable” remains intact; only explicit purge can drop plugin-owned tables.

## Q-E Sequencing

1. Contract and existing-path closure

   Build the Extension Contract Registry, engine-2 manifest, compatibility projector, generated SDK/schema/MCP surfaces, and contract tests. Wire actual site-installed artifacts into production activation. Treat the current `site-glue` adapters as implementation candidates, not as a live extension system.

2. Secure lifecycle and provenance

   Ship upload plus registry install, cryptographic marketplace attestation, content-addressed storage, consent, exact version pins, staged update/rollback, non-destructive uninstall, export, and explicit purge. Do not launch the public marketplace before this slice; Tier-3 marketplace support is included, not prohibited.

3. Tier-1 public rendering

   Ship `render.component`, the extensible component registry, the `type:"plugin"` embed resolver, and adapters for declarative, Liquid, Handlebars, and static themes. Include CSS sanitization, output budgets, static-export tests, and placeholders.

4. Tier-1 admin UI plus i18n

   Ship `AdminViewSpec v1`, all six mount points, `admin.navigation`, `admin.page`, editors, displays, panels, layouts, and `i18n.catalog`. This closes five major gaps without third-party executable browser code.

5. Tier-2 execution and operational extensions

   Generalize the Worker mechanics into a plugin runner, prove or replace its security boundary, then ship `http.route`, durable `job.schedule`, custom `automation.operation`, executable hooks/events/tools, and isolated admin frames.

6. Later additions

   Add richer render IR primitives, narrowly-scoped client islands, custom collection interaction, and further core extension points only from concrete plugin demand.

Deliberately defer:

- React SSR as a theme tier.
- Raw HTML returns.
- Same-origin React plugin imports.
- Tovu compiling plugin source during install.
- Arbitrary top-level route claims.
- Arbitrary WordPress-style hook strings.
- Automatic updates.
- Destructive schema migrations.
- Web components as the universal rendering abstraction.
- External/multi-node scheduling infrastructure beyond the durable lease contract.

## Strongest objection to my own position

A closed unified contract can make Tovu itself the bottleneck. WordPress’s loose hooks let developers invent integrations the core team never anticipated; this design forces novel behavior either into a predeclared kind/IR or into the heavier Tier-2/Tier-3 escape hatch. If early plugin trials repeatedly cannot express useful work declaratively, `site-glue` may deserve to remain a deliberately experimental incubator rather than having every local idea blocked on public-contract maturity.

## What I would need to verify before committing

- Whether Tier-2 can actually deny filesystem, environment, and network access in Tovu’s target Node/container environment; the current Worker proves resource containment, not that security property.
- The concrete cookie-less iframe origin available in Docker, Electron, and reverse-proxied deployments.
- Static publishing/export invokes plugin render contributions before artifacts become unavailable.
- Raw-body routing order for plugin webhooks relative to the global JSON parser.
- A real catalog study showing `RenderIR` and `AdminViewSpec` cover common plugin designs without frequent executable escapes.
- Root-key rotation, registry compromise recovery, publisher-account recovery, and rollback-attack policy for marketplace metadata.
- Storage/refcount behavior across versions and workspaces before artifact garbage collection.
- Performance budgets for per-render workers, HTTP handlers, admin frames, and scheduled jobs.
- Migration behavior for existing engine-1 manifests and retained `ext`/table data.

I did not open either prohibited analysis path.