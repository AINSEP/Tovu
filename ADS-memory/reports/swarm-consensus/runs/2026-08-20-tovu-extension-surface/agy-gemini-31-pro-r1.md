^D## Position
Tovu's core advantage is its unified, agent-drivable architecture. Maintaining two parallel extension mechanisms (`plugin-runtime` and `site-glue`) is an architectural fork that artificially separates "trusted origin" from "safe execution," doubling the maintenance burden. They must be merged into a single system governed by a unified manifest and capability gate. The React Admin UI must remain strictly decoupled from third-party JavaScript by leaning heavily on the existing A2UI protocol for declarative interfaces, using iframes only when an escape hatch is truly necessary.

## Q-A Merge or separate
**Merge them.** The principled boundary in a CMS is not *who* authored the code (the marketplace vs. an AI agent), but *what capabilities the code is allowed to exercise*. `site-glue` is effectively just a Tier-3 (or Tier-2) plugin that happens to be installed from the database rather than a downloaded archive. 

The join is straightforward: there is ONE extension manifest and ONE capability gate (`capability-gate.ts`). Trust Tier (1, 2, or 3) dictates *how* the plugin is executed (Declarative, Sandboxed Worker, or In-Process), while Capabilities dictate *what* it is allowed to do. Agent-authored snippets bypass the signature/integrity checks because they are first-party and database-backed, but they must still declare capabilities and be dispatched through the exact same adapter tables as a marketplace plugin. 

## Q-B render.contribute return shape
`render.contribute` must return a **raw HTML string**. 

This perfectly honors the "genericity belongs in the scanner, not the renderer" rule. The scanner is responsible for parsing `data-embed-config` and routing the payload to the correct plugin ID and component name. The core renderer should not have to negotiate React SSR, web components, or Liquid syntax for third-party code. By requiring the plugin's capability delegate to accept `(ctx, props)` and return an `HTML string`, the plugin is forced to escape its own output and the host renderer remains completely generic—it blindly injects the returned string. This makes the UI compatible across all five of Tovu's theme tiers, as even declarative JSON block trees can treat the plugin node as an opaque HTML string resolver.

## Q-C Extension-kind taxonomy

| Gap | Your proposed kind/capability | Min tier | Notes |
|---|---|---|---|
| `render.contribute` (front-end UI) | `render.contribute` | Tier-2 | Returns an HTML string. Requires JS execution to format props into HTML. |
| `admin.nav` (admin navigation) | `admin.nav.register` | Tier-1 | Declarative routing array in manifest; requires zero execution. |
| `http.routes` (custom API endpoints) | `http.route.register` | Tier-2 | Strictly namespaced to `/api/ext/<plugin-id>/` to prevent path hijacking. Rate limiting is enforced globally by the host router before the plugin handler is reached. Auth is passed via a read-only `ctx.user` object, never raw Request/Response streams. |
| Scheduled jobs / cron | `cron.schedule` | Tier-2 | Because Tovu is a single Docker container, scheduling uses an in-process `setInterval` loop in the host. To safely support future horizontal scaling, execution requires acquiring a Postgres Advisory Lock on the task ID first. |
| Custom field editors (Directus `interface`) | `admin.ui.field_editor` | Tier-1 | Implemented declaratively using A2UI schema (Tier-1) or via isolated iframe URL (Tier-2). |
| Custom field displays (Directus `display`) | `admin.ui.field_display` | Tier-1 | Implemented declaratively using A2UI schema (Tier-1) or via isolated iframe URL (Tier-2). |
| Admin dashboard panels (Directus `panel`) | `admin.ui.panel` | Tier-1 | Implemented declaratively using A2UI schema (Tier-1) or via isolated iframe URL (Tier-2). |
| Collection layouts (Directus `layout`) | `admin.ui.layout` | Tier-1 | Implemented declaratively using A2UI schema (Tier-1) or via isolated iframe URL (Tier-2). |
| Plugin i18n / translations | `i18n.provide` | Tier-1 | Pure JSON key-value bundles merged into the host dictionary at startup. |
| Automation / flow steps (Directus `operation`) | `automation.step.register` | Tier-2 | Execution required; registers a callback handler on the global event bus. |

## Q-D Machine-readable contract
The fatal flaw of WordPress is that extensions are implicit strings scattered in source code. To make the contract machine-readable for AI agents, Tovu must maintain a **centralized, static JSON Registry** of all valid capabilities, hook points, and mount points (similar to `VALID_HOOKS` but formalized globally). 

This registry must be exposed via `tovu introspect --format mcp`. An LLM can then query this MCP tool to read the exact JSON Schema for `tovu.plugin.json` and receive an enumerated list of every valid hook and mount point available on that specific Tovu instance. If a capability or hook is not in this registry, it physically cannot be invoked by the capability gate.

## Q-F Plugin UI in the React admin
Admin UI extensions must remain completely decoupled from Tovu's React build. 
- **Mount points:** Enumerable as data through the machine-readable JSON schema (e.g., `locations: ["entry-editor-sidebar", "dashboard"]`).
- **Isolation & Tier-1 Declarative UI:** The A2UI/gen-ui protocol is exactly the right substrate, not a red herring. Since it was already designed to safely render AI-generated UI, it allows Tier-1 plugins to contribute rich, native-feeling Admin panels, layouts, and field editors by simply shipping A2UI JSON schemas. The host React app renders this data natively. This guarantees zero version coupling and perfect error-boundary isolation because no third-party JS ever touches the React tree.
- **Fallback:** If a Tier-2/Tier-3 plugin needs highly custom interactivity that A2UI cannot support, it must mount an `iframe`. React components and Web Components are strictly forbidden as they leak CSS and couple the build.

## Q-G Plugin lifecycle
- **Install:** Artifact uploaded or fetched. Because Tier-3 is listable, the installation blocks on a strict Consent Screen that explicitly details the requested capabilities and execution Tier.
- **Update:** Automatically applied only if the capabilities and Tier remain the same or decrease. If an update requests new capabilities or a higher Trust Tier, it requires manual re-consent. Database schema upgrades are additive only.
- **Uninstall:** Tovu must complete the "never delete" policy. Uninstalling removes the plugin files from disk and de-registers its capabilities. However, all plugin-owned database tables and `ext.*` fields are **kept but rendered completely inert** (hidden from the UI and excluded from queries). The plugin ID is tomestoned and permanently burned to prevent malicious reuse. To clean up data, users must visit a separate "Data Archival" admin settings page where they can explicitly export or permanently drop inert data with a high-friction confirmation.

## Q-E Sequencing
1. **Merge `plugin-runtime` and `site-glue`:** Unified capability gate and manifest schema. This stops the architectural drift immediately.
2. **`admin.nav` and A2UI-based Admin UIs:** Unlocks rich, Tier-1 declarative customizations for agents and plugins without requiring sandboxes.
3. **`http.route.register` and Webhooks:** Vital for integrations, OAuth, and API extensions.
4. **`render.contribute`:** Allows plugins to extend the public-facing site logic.
5. **Deferred:** Cron jobs and Automation flow steps. These require complex state management and should wait until the core capability gate is hardened.

## Strongest objection to my own position
Merging `site-glue` into the rigid `plugin-runtime` ruleset could severely throttle the AI agent's ability to seamlessly "vibecode" features. `site-glue` was likely built without manifests and hashes precisely because requiring an AI to generate and sign structured JSON manifests every time it wants to tweak a tiny site behavior creates friction and brittleness. Furthermore, constraining custom Admin UIs to the A2UI JSON protocol might prove too limiting for complex third-party marketplace plugins, forcing developers to use clunky iframes for basic interactive fields.

## What I would need to verify before committing
1. **A2UI Completeness:** Does the current A2UI implementation support the two-way data binding and form state necessary to power complex, interactive Custom Field Editors, or is it currently limited to read-only chat displays?
2. **Worker Cold Starts:** For `http.route.register`, how heavy is the startup latency for a Tier-2 V8 worker? If a plugin serves high-traffic API requests via workers, we need to ensure the latency budget remains acceptable.
3. **Database Drift:** Have `site_glue_activations` and `plugin_activations` already diverged so heavily in production that merging them requires a complex, multi-stage database migration?
