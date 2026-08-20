# Call-Site Payload Schemas — `admin.nav`, `render.contribute`, `http.routes`

- **Date:** 2026-08-20
- **Author:** Software Architect agent (dispatched, `general-work` branch)
- **Trigger:** `ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md`,
  Recommended order item 3 — publish payload JSON Schemas for every `GlueCallSite` before its
  adapter is marked wired. Today `GlueManifestAttachment` (`src/features/site-glue/manifest.ts:66-69`)
  is `{ callSite; [payloadKey: string]: unknown }` for all three unwired call sites — no AI or human
  can know what to put inside one.
- **Constraint honored:** PROPOSE ONLY. No file under `src/` or `apps/` was modified. Nothing here is
  wired — `resolveCallSiteDispatch()` (`manifest.ts:263-265`) still returns `UNWIRED_CALL_SITE` for
  all three until a real adapter lands.
- **Scope:** the three call sites named in the dispatch — `admin.nav`, `render.contribute`,
  `http.routes`. Not in scope: merging `plugin-runtime`/`site-glue` (Result 1), the `COMPONENTS` vs.
  widget-IR split (Result 2, already resolved by `2026-08-20-component-catalog-split-proposal.md`),
  or the `kind`/`capabilities` manifest unification (Result 3, in progress elsewhere this session —
  I did not touch `plugin-runtime/manifest.ts` or `site-glue/manifest.ts`).

## Precedent read before designing anything

- `src/features/site-glue/attachment-points/content-lifecycle.ts`, `tool-registration.ts`,
  `events.ts` and their `GlueHostPort` methods (`ports.ts:63-106`): every wired call site is **pure
  delegation** — the attachment-point function adds no logic, it forwards to one `GlueHostPort`
  method. The manifest-level payload for a wired call site is never JSON alone; the *real* thing
  (a filter function, a tool handler, an event handler) is supplied by the loaded plugin module at
  runtime, not by `tovu.plugin.json`/the glue manifest. `GlueToolRegistration` (`ports.ts:52-55`) is
  the cleanest example: `{ toolId: string; handler: (...args) => unknown }` — `toolId` is
  manifest-shaped data, `handler` is a real function the loader resolves from the module, never JSON.
- `src/widgets/types.ts:223-227` (`WidgetRenderIR`) and `registry.ts` (`WidgetTypeRegistration`,
  `WIDGET_TYPE_REGISTRATIONS`, `CORE_RESOLVERS`): the widget-type registry already separates
  **registration** (plain JSON data: `configSchema`, `capability`, `placementContexts`, `clamps`)
  from **behavior** (`resolverId`, resolved only through the closed `CORE_RESOLVERS` map — never a
  module path or `eval`). This is the shape `render.contribute` must match, per the SYNTHESIS.
- `src/forms/manifest.ts:40-52` (`FORMS_ADMIN_NAV_ENTRY`) and
  `/Users/la/Programming/Jini/packages/admin/src/core/manifest/rules.ts:43-55`
  (`AdminNavGroup`/`AdminNavItem`) + `types.ts:80-92` (`AdminNavEntry`): the live nav-entry shape is
  `{ label, icon?, group?, order?, href }`, `href` a route path, base applied by the shell. This is
  the vocabulary `admin.nav`'s Tier-1 form must match — not a new shape.
- `src/features/plugin-runtime/manifest.ts:256-257` (`FIELD_PATH_INVALID`): the live
  `ext.{pluginId}.{field}` namespacing precedent, enforced today for plugin field declarations. I
  generalized this same prefix discipline to `render.contribute`'s `typeKey` and `http.routes`' route
  id, per the dispatch's explicit instruction.
- `src/core/rate-limit/rate-limit.ts` (`RateLimitProfile`, `createRateLimiter`): the one rate-limit
  primitive that exists in this codebase today. Every existing profile is a **host-defined constant**
  (`LOGIN_STRICT`, `SITE_ASSISTANT_PER_IP`, `CONNECTOR_OUTBOUND_PER_IP`, …) — no caller anywhere
  supplies its own profile. `http.routes`' design below follows that precedent rather than inventing
  a manifest-declared rate limit.
- `ADS-memory/reports/architecture/ADR-057-site-glue-tier.md:116`: "`render.contribute`'s adapter
  should reuse `resolver-service.ts:62,92`'s existing 'never throws, isolated placeholder' pattern
  verbatim." I designed to this instruction, not around it.
- `ADS-memory/reports/architecture/2026-08-20-component-catalog-split-proposal.md`: ratified that the
  plugin render seam attaches to the widget-type-registry path, never `COMPONENTS`, and that
  `resolveWidgetType`'s try/catch + timeout wrapper (`src/widgets/resolvers/index.ts:134-179`) is the
  existing isolation boundary a plugin resolver must sit behind.

---

## 1. `admin.nav`

### TS type

```ts
/** Tier-1-expressible: a deep link into a route the ADMIN APP ALREADY KNOWS HOW TO RENDER, or an
 *  external URL. No plugin code runs to produce this target. */
type GlueAdminNavCoreTarget = { readonly kind: "core-route"; readonly path: string };
type GlueAdminNavExternalTarget = { readonly kind: "external"; readonly url: string };

/** Tier-2/Tier-3 only: the nav item opens a plugin-served page, rendered in a HOST-OWNED iframe
 *  (SYNTHESIS: "executable plugin UI in an iframe, not a React error boundary") — never mounted as
 *  React, never given the admin shell's own origin/session directly. `routeId` MUST match a
 *  `routeId` the SAME manifest also declares under an `http.routes` attachment (Section 3) — the nav
 *  entry cannot point at a route this manifest never registered. This is a cross-attachment
 *  consistency rule, checked at LOAD time by the loader (mirrors how `id`/`folderName` consistency
 *  is a `discovery.ts`-time check, never inside the pure `validateGlueManifest()` — see Open
 *  Questions). */
type GlueAdminNavPluginTarget = { readonly kind: "plugin-route"; readonly routeId: string };

export interface GlueAdminNavAttachment {
  readonly callSite: "admin.nav";
  /** 1-80 chars. Sidebar row label. */
  readonly label: string;
  /** Inline SVG inner markup, 18x18 viewBox, stroke=currentColor — same convention as
   *  `AdminNavEntry.icon` (`Jini/packages/admin/src/core/manifest/types.ts:82-85`). Size-capped
   *  (see Validation) so an icon string cannot smuggle a large payload into the sidebar bundle. */
  readonly icon?: string;
  /** Sidebar section heading. Omitted = ungrouped top row, same as `AdminNavEntry.group`. */
  readonly group?: string;
  /** Ascending sort within a group; ties break by manifest attachment order (stable). */
  readonly order?: number;
  readonly target: GlueAdminNavCoreTarget | GlueAdminNavExternalTarget | GlueAdminNavPluginTarget;
}
```

### JSON Schema

```json
{
  "$id": "https://tovu.dev/schemas/glue/admin-nav-attachment.json",
  "type": "object",
  "required": ["callSite", "label", "target"],
  "additionalProperties": false,
  "properties": {
    "callSite": { "const": "admin.nav" },
    "label": { "type": "string", "minLength": 1, "maxLength": 80 },
    "icon": { "type": "string", "maxLength": 2000 },
    "group": { "type": "string", "minLength": 1, "maxLength": 40 },
    "order": { "type": "integer", "minimum": 0, "maximum": 1000 },
    "target": {
      "oneOf": [
        {
          "type": "object",
          "required": ["kind", "path"],
          "additionalProperties": false,
          "properties": {
            "kind": { "const": "core-route" },
            "path": { "type": "string", "pattern": "^/[a-zA-Z0-9/_-]*$", "maxLength": 200 }
          }
        },
        {
          "type": "object",
          "required": ["kind", "url"],
          "additionalProperties": false,
          "properties": {
            "kind": { "const": "external" },
            "url": { "type": "string", "pattern": "^https://", "maxLength": 500 }
          }
        },
        {
          "type": "object",
          "required": ["kind", "routeId"],
          "additionalProperties": false,
          "properties": {
            "kind": { "const": "plugin-route" },
            "routeId": { "type": "string", "pattern": "^[a-z0-9-]{1,50}$" }
          }
        }
      ]
    }
  }
}
```

### Tier gating

| Tier | `target.kind` allowed | Why |
|---|---|---|
| **Tier-1 (declarative, zero code)** | `core-route`, `external` only | Neither requires the plugin to serve anything. `core-route` deep-links an existing admin panel exactly as `FORMS_ADMIN_NAV_ENTRY` already does; `external` is a plain link. **This is the Tier-1 no-code version the dispatch asked for** — label/icon/group/order plus a link, nothing executable. |
| **Tier-2 (sandboxed, worker)** | + `plugin-route` | The linked page is served by this same manifest's own `http.routes` attachment, whose handler runs inside the worker boundary. |
| **Tier-3 (in-process)** | + `plugin-route` | Same as Tier-2, minus the worker isolation — the honest, already-disclosed weaker security posture ADR-057's own Security axis (score 3) already carries. |

### Validation rules

- `label` required, 1-80 chars — matches sidebar row width constraints already implicit in
  `nav.ts`'s hand-authored labels ("Overview", "Content", …).
- `icon` optional, capped at 2000 chars — generous for inline SVG inner markup, small enough that a
  malicious manifest cannot inflate the sidebar bundle per entry.
- `target.kind: "core-route"`'s `path` is **not** validated against the real admin route table by
  `validateGlueManifest()` (that table lives in `apps/admin`, a different package this
  product-neutral module has zero dependency on, per `manifest.ts`'s own header). It is schema-valid
  as any `/`-rooted path; a path that resolves to nothing is a **dispatch-time** rejection by the
  `registerAdminNav` adapter (mirrors `UNWIRED_CALL_SITE`'s own "schema-valid, adapter-time-rejected"
  precedent).
- `target.kind: "external"`'s `url` MUST be `https://` — no `javascript:`, `data:`, or bare `http://`.
  This is the same allowlist discipline `safeImageSrc`/`safeHref` already apply elsewhere in this
  codebase (see recent commit `9e7786b9`, "safeImageSrc allowlist drift").
- `target.kind: "plugin-route"` is a schema-level `MANIFEST_MALFORMED`-class rejection (not merely
  `UNWIRED_CALL_SITE`) for a Tier-1 manifest — enforced by the (future) `registerAdminNav` adapter
  reading `tier` off the same manifest, not by `validateGlueManifest()` itself (which is
  tier-agnostic today, per its own "well-formed object" scope note at `manifest.ts:64`).
- `target.kind: "plugin-route"`'s `routeId` MUST match a `routeId` from this manifest's own
  `http.routes` attachments (Section 3) — cross-attachment, load-time check (see Open Questions).

### Example attachment (Tier-1, an AI could write this unassisted)

```json
{
  "callSite": "admin.nav",
  "label": "Word Count Settings",
  "group": "Content",
  "order": 40,
  "target": { "kind": "core-route", "path": "/settings/word-count" }
}
```

---

## 2. `render.contribute`

### TS type

The output shape is **frozen already** — never raw HTML, never a generic `{tag,attrs,children}`
tree. Per Result 2 (unanimous) and the catalog-split proposal, the resolved value is exactly
`WidgetRenderIR` (`src/widgets/types.ts:223-227`). What's new here is the **manifest-declared
registration** a plugin supplies, matching `WidgetTypeRegistration`'s existing registration/behavior
split (`registry.ts:8-12`) rather than inventing a second shape.

```ts
/** Mirrors `WidgetTypeRegistration` (`widgets/types.ts:83-96`) field-for-field, with two differences
 *  forced by the plugin boundary: `typeKey` is namespaced (a plugin cannot claim a bare core key),
 *  and there is no `resolverId` string pointing into `CORE_RESOLVERS` — a plugin's resolver is ITS
 *  OWN code, invoked through the `render.contribute` capability delegate
 *  (`capability-gate.ts:59`/`GLUE_CAPABILITIES`), never core's closed resolver map. */
export interface GlueRenderContributeAttachment {
  readonly callSite: "render.contribute";
  /** MUST equal `ext.${moduleId}.${localKey}` — same namespacing discipline as
   *  `PluginManifestFieldDecl.path` (`plugin-runtime/manifest.ts:256-257`), generalized from field
   *  paths to widget type keys so a plugin can never collide with or shadow a core `WidgetTypeKey`
   *  member. NEVER unioned into the frozen `WidgetTypeKey` type itself (see Open Questions). */
  readonly typeKey: string;
  readonly capability: "static" | "query" | "form" | "entry-reference";
  /** JSON-Schema-shaped description of this type's `config`, validated on every widget-instance
   *  write — identical contract to `WidgetTypeRegistration.configSchema`. */
  readonly configSchema: Record<string, unknown>;
  readonly placementContexts: readonly ("region" | "inline")[];
  /** Host-ENFORCED ceilings, same "clamps enforced by core at the orchestration layer, never by the
   *  resolver's own discipline" rule as `WidgetTypeRegistration.clamps` (`widgets/types.ts:89`). A
   *  plugin requesting a higher `timeoutMs` than the host ceiling is clamped down, never granted. */
  readonly clamps: { readonly maxItems?: number; readonly timeoutMs: number };
  /** The rendered IR's `componentId` this type's resolver is COMMITTED to producing. MUST be a
   *  member of the closed, host-published `PLUGIN_SAFE_COMPONENT_IDS` set (see Open Questions —
   *  this set does not exist in source yet). An id outside that set is schema-valid here but
   *  degrades to the existing render placeholder at dispatch time, per Result 2's "unknown ids
   *  degrade to the existing placeholder" rule — never a throw, never a manifest rejection. */
  readonly componentId: string;
}
```

### JSON Schema

```json
{
  "$id": "https://tovu.dev/schemas/glue/render-contribute-attachment.json",
  "type": "object",
  "required": ["callSite", "typeKey", "capability", "configSchema", "placementContexts", "clamps", "componentId"],
  "additionalProperties": false,
  "properties": {
    "callSite": { "const": "render.contribute" },
    "typeKey": { "type": "string", "pattern": "^ext\\.[a-z0-9-]+\\.[a-z0-9-]+$", "maxLength": 100 },
    "capability": { "enum": ["static", "query", "form", "entry-reference"] },
    "configSchema": { "type": "object" },
    "placementContexts": {
      "type": "array",
      "items": { "enum": ["region", "inline"] },
      "minItems": 1,
      "uniqueItems": true
    },
    "clamps": {
      "type": "object",
      "required": ["timeoutMs"],
      "additionalProperties": false,
      "properties": {
        "maxItems": { "type": "integer", "minimum": 1, "maximum": 100 },
        "timeoutMs": { "type": "integer", "minimum": 0, "maximum": 2000 }
      }
    },
    "componentId": { "type": "string", "minLength": 1, "maxLength": 80 }
  }
}
```

### Tier gating

| Tier | `capability` allowed | What runs | Tier-1 no-code version |
|---|---|---|---|
| **Tier-1** | `static` only | Nothing — no resolver exists for `static`-capability types (`widgets/types.ts:94`, "`undefined` for `static`-capability types"). Core's own renderer for `componentId` renders the plugin-declared, schema-validated `config` directly as `props`, exactly like `TEXT_REGISTRATION`/`SOCIAL_LINKS_REGISTRATION` (`registry.ts:29-65`) do today for core's own static types. | **This whole shape at `capability: "static"`** — data in, no plugin code ever executes. This is the honest Tier-1 answer: a plugin can contribute a new, schema-validated widget *instance shape*, but only render it through a component id core already ships a renderer for. |
| **Tier-2 (sandboxed)** | + `query`, `form`, `entry-reference` | The plugin's own `resolveMany`-shaped function, invoked inside a worker boundary, wrapped by the SAME `withResolverTimeout` + try/catch pattern `resolveWidgetType` already uses (`widgets/resolvers/index.ts:134-179`, per ADR-057:116's explicit instruction to reuse this verbatim) | n/a |
| **Tier-3 (in-process)** | + `query`, `form`, `entry-reference` | Same resolver contract, no worker boundary — same disclosed-weaker posture as `admin.nav`'s Tier-3 row | n/a |

### Validation rules

- `typeKey` MUST match `^ext\.[a-z0-9-]+\.[a-z0-9-]+$` where the first segment after `ext.` equals
  this manifest's own `id` — generalizes `FIELD_PATH_INVALID`'s existing `ext.${id}.` prefix check
  (`plugin-runtime/manifest.ts:256-257`) from field paths to type keys.
- `componentId` is schema-valid as any non-empty string ≤80 chars — the closed-set check against
  `PLUGIN_SAFE_COMPONENT_IDS` is a **dispatch-time**, not schema-time, rejection (same
  "schema-valid, adapter-time-rejected" shape `admin.nav`'s `core-route` path uses), because that set
  is core-owned and this manifest has no way to see it change without a redeploy.
- `clamps.timeoutMs` capped at 2000ms in the schema itself — a **requested ceiling**, not a grant;
  the real enforced value is `min(declared, hostConfiguredMax)`, mirroring
  `RECENT_ENTRIES_REGISTRATION`'s own "clamped at the registration level AND re-enforced at the
  orchestration layer" note (`registry.ts:67-72`).
- `capability: "static"` with a `clamps.timeoutMs` other than `0` is a validation error — matches
  every existing core `static` registration's own `timeoutMs: 0` convention (no resolver runs, so a
  nonzero timeout is nonsensical, not merely unusual).
- `configSchema` is stored as opaque `object` here (not itself schema-validated beyond
  "is an object") — same posture `WidgetTypeRegistration.configSchema` already has; it is validated
  as a JSON-Schema-shaped value by the write path when a widget *instance* is created, not by
  `validateGlueManifest()`.

### Example attachment (Tier-1, `capability: "static"`)

```json
{
  "callSite": "render.contribute",
  "typeKey": "ext.word-count.badge",
  "capability": "static",
  "configSchema": {
    "type": "object",
    "properties": { "label": { "type": "string" } },
    "required": ["label"],
    "additionalProperties": false
  },
  "placementContexts": ["region", "inline"],
  "clamps": { "timeoutMs": 0 },
  "componentId": "text"
}
```

(This example deliberately reuses core's own `"text"` renderer — the only `componentId` this report
can cite with certainty as already-safe for arbitrary plugin `props`, since it is `TEXT_REGISTRATION`'s
own core id. See Open Questions for why a real `PLUGIN_SAFE_COMPONENT_IDS` set still needs to be
designed before this call site actually ships.)

---

## 3. `http.routes`

### TS type

```ts
/** Manifest-level route METADATA only — matches the existing `GlueToolRegistration` split
 *  (`ports.ts:52-55`): `toolId` is data, `handler` is a real function the loader resolves from the
 *  loaded module, never JSON. Same split here: this attachment is what `tovu.plugin.json`/the glue
 *  manifest can say; the actual Express-shaped handler is resolved by `moduleId` + `routeId` from
 *  the plugin's own loaded code at dispatch time, by whichever future `registerHttpRoute` adapter
 *  wires it. There is deliberately no `handler` field here — a JSON manifest cannot carry a
 *  function, and inventing a string-eval'd handler reference would be exactly the "arbitrary
 *  WordPress-style hook string" pattern the SYNTHESIS's Recommended Order item 7 already rejects. */
export interface GlueHttpRouteAttachment {
  readonly callSite: "http.routes";
  /** MUST match `^[a-z0-9-]{1,50}$`, unique within this manifest. The stable key the loader uses to
   *  look up this route's real handler function from the loaded module, and the key `admin.nav`'s
   *  `plugin-route` target cross-references (Section 1). */
  readonly routeId: string;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** A path SEGMENT, never a full path — the host always prepends `/api/plugins/<moduleId>/`
   *  (mirrors the `ext.{pluginId}.{field}` namespacing already enforced for plugin field paths,
   *  generalized to the URL space). `:param` segments allowed; `..` and a leading `/` are rejected. */
  readonly path: string;
  /** Default-deny: REQUIRED, no implicit fallback. `"public"` is its own explicit choice, not the
   *  absence of one — see Validation. */
  readonly auth: "admin-session" | "member-session" | "public";
  /** Optional, REQUESTED ceiling only — same "requested, host clamps down" relationship
   *  `render.contribute`'s `clamps` has to its host-enforced max. Absent = host default. */
  readonly maxBodyBytes?: number;
}
```

### JSON Schema

```json
{
  "$id": "https://tovu.dev/schemas/glue/http-route-attachment.json",
  "type": "object",
  "required": ["callSite", "routeId", "method", "path", "auth"],
  "additionalProperties": false,
  "properties": {
    "callSite": { "const": "http.routes" },
    "routeId": { "type": "string", "pattern": "^[a-z0-9-]{1,50}$" },
    "method": { "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"] },
    "path": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9/_:-]{1,200}$",
      "not": { "pattern": "\\.\\." }
    },
    "auth": { "enum": ["admin-session", "member-session", "public"] },
    "maxBodyBytes": { "type": "integer", "minimum": 1, "maximum": 10485760 }
  }
}
```

### Tier gating

| Tier | Allowed | Why |
|---|---|---|
| **Tier-1** | **Not available at all — no `http.routes` attachment is schema-valid at `tier: "tier-1"`.** | An HTTP handler is, by definition, executable code that runs on every matching request. There is no data-only rendering of "handle this request" the way `admin.nav`'s `core-route`/`external` or `render.contribute`'s `static` capability manage it. This is the honest answer to "what can Tier-1 express here": **nothing** — flagged explicitly rather than forcing a fake Tier-1 shape. |
| **Tier-2 (sandboxed)** | Yes | Handler runs inside the worker boundary; `render.contribute`'s SYNTHESIS Unresolved item ("whether Tier-2's `worker_threads` boundary can actually deny filesystem/env/network access") applies with equal or greater force here, since an HTTP handler is a live network-facing entry point, not just a render-time function call. |
| **Tier-3 (in-process)** | Yes | Same disclosed-weaker posture as elsewhere. |

### Validation rules

- `routeId` unique within the manifest (cross-attachment check, same layer as the `attachments`
  array's own iteration in `validateGlueManifest()` — an easy additive check, not a new validation
  pass).
- `path` is a **segment**, not a full path — `MANIFEST_MALFORMED` if it starts with `/`,
  contains `..`, or contains `/api/` (a plugin cannot escape its own `/api/plugins/<moduleId>/`
  prefix by embedding a path that looks like it's reaching for a different one).
- `auth` is **required with no default** — omitting it is `MANIFEST_MALFORMED`, not an implicit
  `"public"`. This is what "default-deny" cashes out to at the schema level: the schema itself
  refuses to validate a route with no stated auth, rather than defaulting one in.
- **Per-plugin, not per-route, rate limiting** (explicit brief constraint): the manifest carries NO
  rate-limit field at all — same reasoning `render.contribute`'s `clamps` and every existing
  `RateLimitProfile` in `core/rate-limit/rate-limit.ts` already establish (every profile there is a
  **host-defined constant**, never caller-supplied). The real adapter binds ONE `RateLimiter`
  instance per `moduleId` (not per `routeId`), keyed by `moduleId` alone, shared across every route
  that manifest declares — so a plugin cannot dodge a budget by spreading load across many cheap
  routes, which is exactly the attack the brief names. A new host-owned constant (analogous to
  `CONNECTOR_OUTBOUND_PER_IP`) is the natural home for the default profile; this report does not
  invent its numbers, since no comparable "arbitrary third-party code, arbitrary request volume"
  precedent exists yet in `rate-limit.ts` to extrapolate a number from responsibly.
- `method`/`path` pairs across all of one manifest's `http.routes` attachments must not collide
  (same `routeId` uniqueness check, extended) — a manifest declaring `GET /widget` twice is
  `MANIFEST_MALFORMED`.
- Collision with an EXISTING core route or another plugin's already-registered route under the same
  `moduleId` prefix cannot happen by construction (routes are namespaced under
  `/api/plugins/<moduleId>/`, and `moduleId` uniqueness is already enforced by the loader's existing
  `SHADOWS_BUILT_IN`/folder-match discipline) — no additional schema rule needed here.

### Example attachment

```json
{
  "callSite": "http.routes",
  "routeId": "recount",
  "method": "POST",
  "path": "entries/:entryId/recount",
  "auth": "admin-session",
  "maxBodyBytes": 1024
}
```

Resulting live path: `POST /api/plugins/word-count/entries/:entryId/recount`.

---

## Open questions I could not resolve from source

1. **`PLUGIN_SAFE_COMPONENT_IDS` does not exist.** `render.contribute`'s `componentId` field needs a
   closed, host-published set of `WIDGET_IR_RENDERERS` keys that are safe to hand arbitrary
   plugin-declared `props` to. I could not find one in source — every existing `WIDGET_IR_RENDERERS`
   entry (`text`, `social-links`, `recent-entries`, `entry-summary`, `menu`, `contact-form`,
   `media-image`, `post-content`) was written assuming CORE-controlled `props`, and I did not audit
   each renderer body for injection safety against attacker-shaped `props` (e.g., does `media-image`
   trust a `src` field a plugin could set to something `safeImageSrc`'s allowlist should catch?).
   This needs its own pass before `render.contribute` actually ships, not just before this schema is
   approved.
2. **Cross-attachment validation is a new capability for `validateGlueManifest()`.** Today that
   function is pure and reasons only about one attachment at a time (`manifest.ts:229-242`'s loop
   body never compares attachments to each other). `admin.nav`'s `plugin-route` → `http.routes`
   `routeId` cross-reference, and `http.routes`' own intra-manifest `routeId` uniqueness, both need a
   second pass over the whole `attachments` array. That's a small, additive change in kind (same
   collect-all discipline, just a second loop) — but it's a real contract change to a function
   currently documented as reasoning about "the well-formed object level" only, and should be
   confirmed with whoever owns that module before assumed.
3. **`http.routes`' per-module `RateLimitProfile` numbers are undecided** (see Validation above) —
   deliberately left as "a host constant must exist" rather than a guessed number, the same posture
   `AUTO_QUARANTINE_THRESHOLD_PLACEHOLDER` (`manifest.ts:143-146`) already takes for its own
   unset-by-owner value.
4. **Whether an `admin-session` route handler receives the calling admin's `authorize()`-checked
   permissions, or only a bare "is-admin" boolean**, is unspecified here. `IdentityDeps.authorize`
   (`routes/types.ts:149-154`) is the real mechanism every core admin route uses; whether a Tier-2/3
   plugin handler gets a scoped view of it (and through which capability) is a `GlueHostPort`
   extension this report does not attempt, since the dispatch scoped this to payload shapes, not to
   the port's method list.

## Strongest objection to this design

**The manifest/runtime split I used for `http.routes` and `render.contribute` (JSON declares
metadata; a real function is resolved separately by `moduleId`+id from the loaded module) means the
JSON Schemas in this report describe only HALF of what an AI needs to author a working attachment.**
An AI reading only `render-contribute-attachment.json` could produce a perfectly schema-valid
`capability: "query"` attachment and have no idea it also needs to export a `resolveMany`-shaped
function the loader will look for by `typeKey`, or that `http.routes`' `routeId` needs a matching
exported handler by the same key. This mirrors `GlueToolRegistration`'s existing split exactly (so it
is not a new problem I invented), but it means "publish a JSON Schema per call site" — this report's
whole mandate — is necessary but **not sufficient** for AI legibility on the two call sites that need
real code (`render.contribute` beyond `static`, and all of `http.routes`). The full contract needs a
second, paired artifact: the expected **module export shape** per call site (e.g., "a `render.contribute`
attachment with `capability: "query"` requires the plugin module to export a function named
`resolve_ext_<localKey>` matching `WidgetResolver`'s `resolveMany` signature"). That is real design
work this report did not do, and probably belongs in the same slice as whoever builds the loader-side
`attachLoadedPlugin` extension ADR-057 §2.1 already names as the next real gap.
