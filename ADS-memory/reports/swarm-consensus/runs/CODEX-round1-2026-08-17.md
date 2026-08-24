# Codex (gpt-5.6-sol, xhigh) — Round 1 answer

Dispatched with real repo read access (`-C /Users/la/Programming/Tovu`), bounded to `src/themes/**` + `src/assistant/site/capability-registry.ts` per the packet. Recorded verbatim below (ACK line + full answer, diagnostics/thinking-aloud lines from the JSONL stream trimmed, final answer intact).

---

ACK_PACKET_RECEIVED tovu-theme-invariant-structure -- I received the packet and will work on it.

Codex(Peer Consensus): My independent Round 1 position is to adopt the candidate's broad direction—one manifest, `assets/`, `css/theme.css`, external build artifacts—but replace `src/` with a fixed `render/` contract and sharply separate published-site AI metadata from coding-agent support.

## Proposed invariant package

```text
theme-id/
├── theme.json                         # required
├── AGENTS.md                          # required; coding-agent instructions
├── LICENSE                            # required
├── NOTICE.md                          # optional provenance/change narrative
│
├── tokens/                            # required
│   ├── dark.json                      # filenames declared by theme.json
│   └── light.json
│
├── assets/                            # required
│   ├── previews/
│   │   ├── card.webp                  # required for marketplace distribution
│   │   └── gallery/                   # optional additional still images
│   ├── images/                        # optional
│   ├── fonts/                         # optional
│   ├── video/                         # optional; playback policy deferred
│   ├── audio/                         # optional; playback policy deferred
│   └── files/                         # optional downloads/documents
│
├── css/
│   ├── theme.css                      # required global stylesheet entry
│   └── vendor/                        # optional third-party CSS
│
├── render/                            # required; renderer-owned source only
│   ├── pages/                         # .html/.liquid/.json/.tsx, by adapter
│   ├── partials/                      # logical partial implementations
│   └── components/                    # normally component-tier only
│
├── scripts/                           # optional; static/templated only
│   ├── main.js                        # first-party scripts live at this level
│   ├── reveal.js
│   └── vendor/
│       └── motion/
│           ├── motion.js
│           └── LICENSE
│
├── locales/                           # optional
│   └── en.json
│
├── ai/                                # required; published-site agent surface
│   ├── capabilities.json              # required, even if empty/default-deny
│   └── evaluation.json                # optional scoring/evaluation metadata
│
├── tests/                             # required; development/conformance only
│   ├── cases.json
│   ├── fixtures/
│   ├── golden/
│   │   ├── dom/
│   │   └── visual/
│   └── ai/
│
├── package.json                       # component tier only
└── <supported lockfile>               # component tier only
```

Optional directories may be absent when unused; required files make the package discoverable without relying on empty directories.

## `theme.json` sketch

This is a valid-JSON static-tier example. Paths are theme-root-relative; the fixed roots themselves are not configurable.

```json
{
  "$schema": "https://tovu.dev/schemas/theme/v1/theme.schema.json",
  "apiVersion": 1,

  "id": "basic",
  "name": "Basic",
  "version": "1.0.0",
  "description": "A multi-page marketing theme.",
  "tier": "static",

  "compatibility": {
    "tovu": ">=1.0.0 <2.0.0"
  },

  "author": {
    "name": "Tovu",
    "url": "https://tovu.dev"
  },

  "license": {
    "expression": "MIT",
    "file": "LICENSE"
  },

  "attributions": [
    {
      "id": "motion",
      "name": "Motion",
      "version": "13.0.0",
      "license": "MIT",
      "source": "https://motion.dev",
      "files": ["scripts/vendor/motion/**"],
      "licenseFile": "scripts/vendor/motion/LICENSE"
    }
  ],

  "marketplace": {
    "categories": ["business", "marketing"],
    "tags": ["dark", "light", "multi-page"],
    "previews": {
      "card": "assets/previews/card.webp",
      "gallery": [
        "assets/previews/gallery/home-dark.webp",
        "assets/previews/gallery/home-light.webp"
      ]
    }
  },

  "renderer": {
    "adapter": "html@1",
    "entries": {
      "home": { "source": "render/pages/index.html" },
      "about": { "source": "render/pages/about.html" },
      "entry": { "source": "render/pages/blog-post.html" }
    }
  },

  "composition": {
    "partials": {
      "nav": {
        "source": "render/partials/nav.html",
        "inputs": { "current": { "type": "string", "required": false } }
      },
      "footer": {
        "source": "render/partials/footer.html",
        "variants": { "minimal": { "source": "render/partials/footer-minimal.html" } }
      }
    }
  },

  "tokens": {
    "default": "dark",
    "sets": { "dark": "tokens/dark.json", "light": "tokens/light.json" }
  },

  "fonts": [
    {
      "family": "Geist",
      "weight": "400 500",
      "source": { "kind": "asset", "path": "assets/fonts/geist-variable.woff2" }
    }
  ],

  "scripts": [
    { "id": "motion", "path": "scripts/vendor/motion/motion.js", "kind": "vendor", "load": "defer", "attribution": "motion", "entries": ["*"] },
    { "id": "main", "path": "scripts/main.js", "kind": "author", "load": "defer", "dependsOn": ["motion"], "entries": ["*"] }
  ],

  "locales": { "default": "en", "files": { "en": "locales/en.json" } },

  "build": { "mode": "none" }
}
```

Fixed conventions such as `css/theme.css`, `ai/capabilities.json`, `tests/cases.json`, and `AGENTS.md` should not be repeated in the manifest. Making them configurable would defeat the invariant layout and create drift.

The tier constraints should be:

| Tier | `renderer.adapter` | Render entries | Standalone `scripts/` | `build.mode` |
|---|---|---|---|---|
| static | `html@1` | `.html` | Allowed | `none` |
| templated | `liquid@1`, `handlebars@1` | Matching template format | Allowed | `none` |
| declarative | `tovu-blocks@1` | `.json` only | Forbidden | `none` |
| component | `react@1`, `angular@1`, etc. | Adapter-supported component files | Forbidden | `platform` |

HTMX and Alpine remain vendored or first-party browser scripts in static/templated themes. They do not imply `build.mode: "platform"`.

A component-tier entry can add an export without changing the enclosing shape:

```json
{
  "renderer": { "adapter": "react@1", "entries": { "home": { "source": "render/pages/Home.tsx", "export": "Home" } } },
  "scripts": [],
  "build": { "mode": "platform" }
}
```

No arbitrary `build.command` or author-selected output path should be accepted.

## 1. Render source folder

Use `render/`.

`templates/` incorrectly describes complete static pages, declarative block trees, and component modules. `src/` is too broad when CSS, assets, scripts, tests, and AI metadata deliberately live elsewhere; authors will reasonably assume all of those are "source."

`render/` has one precise rule: everything interpreted by `renderer.adapter` lives here. The adapter determines whether a source is HTML, Liquid, JSON, TSX, or another supported format. I would make this path fixed rather than preserving the candidate's configurable `renderer.sourceRoot`.

## 2. CSS invariant

Use `css/theme.css` as the one required global entrypoint.

The host loads only that file automatically. Authors may split CSS into additional files under `css/`, but `theme.css` must import them. This gives the simplicity of a single file and the scalability of a folder without loader-side discovery rules.

Component-local CSS may remain beside components under `render/`, because it participates in compilation. `css/theme.css` still owns global tokens, resets, typography, and shared theme-level styles.

## 3. Scripts versus render source

Keep a distinct optional `scripts/` folder for build-free browser JavaScript.

- Static and templated themes may use it.
- Declarative themes must reject it.
- Component themes must place interactivity in `render/` and compile it through the selected adapter. A component theme should not use `scripts/` as an escape hatch around the controlled build graph.
- HTMX/Alpine belong here for static/templated themes.

The manifest should declare load order, entry applicability, and dependencies. The host—not arbitrary HTML discovery—should determine which scripts execute.

## 4. Build output

Canonical `dist/`, `build/`, `.next/`, or equivalent output must never live in the author package.

Component builds should write to a platform-managed, content-addressed workspace outside the theme source directory. Source archives and compiled artifacts should be separate marketplace objects. That prevents stale source/output pairs and allows untrusted output to remain quarantined until validation.

Local tooling may cache externally, but `theme.json` must not expose an output-path or arbitrary shell-command field. `package.json` scripts should not become the marketplace execution contract; an allowlisted Tovu adapter should own the build invocation.

## 5. Published-site `ai/` surface

Keep the name `ai/`, but define it strictly as published-site agent metadata—not coding-agent guidance.

A minimal `ai/capabilities.json`:

```json
{
  "$schema": "https://tovu.dev/schemas/theme/v1/ai-capabilities.schema.json",
  "apiVersion": 1,
  "defaultPolicy": "deny",
  "handles": {
    "entry.card": { "description": "A published content card", "roles": ["link"], "operations": ["inspect", "activate"] }
  },
  "capabilities": {
    "entry.inspect": { "exposure": "declarative", "handles": ["entry.card"] },
    "entry.open": { "exposure": "imperative", "siteCapability": "navigate_to_entry", "handles": ["entry.card"] }
  }
}
```

Rendered markup would publish an exact handle:

```html
<a data-tovu-agent="entry.card" href="/example">Example</a>
```

The tiers express it differently but produce the same output contract:

- Static/Liquid: author the attribute directly or through a Tovu helper.
- Declarative: use a schema-owned `agentHandle` property; raw HTML remains forbidden.
- Component: use a Tovu helper/component that emits the validated attribute.

This should borrow the admin precedent's handle grammar, exact matching, and explicit publication model, but **not reuse `data-agent-element`**. A separate `data-tovu-agent` namespace prevents admin-operability and published-site privileges from being conflated.

Most importantly, a theme declaration never registers or authorizes executable tools. Imperative exposure is the intersection of: (1) the theme's declaration, (2) a real capability in the site capability registry, (3) that registry's caller authorization. A future WebMCP/A2A adapter remains a translator over the registry's `invoke()` path. An unlisted handle or capability is inert.

`ai/evaluation.json` should stay thin:

```json
{ "apiVersion": 1, "metrics": [{ "id": "entry-open-discoverability", "weight": 1, "cases": ["tests/ai/entry-open.json"] }] }
```

It declares scoring hooks; it does not execute code.

## 6. Slots and partials

Generalize the working marker mechanism as a logical embed request, not as an HTML-only syntax.

Rename the manifest's `slots` field to `composition.partials`. "Slot" usually means an insertion point, while the existing field actually registers theme-supplied partial implementations.

All tiers lower their author syntax to the same internal request: `{ "type": "partial", "id": "footer", "variant": "minimal", "current": "signup" }`.

Tier-specific authoring forms: static HTML uses the existing `data-embed-config`; templated uses a Tovu tag/helper or the same marker in emitted HTML; declarative uses an embed node in the block tree; component uses `<TovuPartial id="footer" variant="minimal" />`.

The manifest maps the logical ID and variant to an adapter-owned source. Component sources may add `"export": "Footer"`.

`honorsCurrentPage` should become an explicit input contract, as shown by `inputs.current`, rather than a special Boolean. Unknown partial IDs, variants, or undeclared inputs should fail conformance validation instead of silently becoming accidental runtime markup.

## 7. License, attribution, and category

Yes—these belong in structured fields: `author` (structured identity, not licensing prose), `license` (SPDX expression or LicenseRef + file), `attributions` (upstream designs, vendored libraries, affected paths, licenses, notice files), `marketplace.categories` (controlled discovery vocabulary), `marketplace.tags` (free-form secondary discovery terms), `NOTICE.md` (optional human narrative for conversion history and material changes). This deliberately replaces the current overloaded `author` string and machine-invisible licensing notes.

## 8. First-party versus vendored scripts

Distinguish them structurally and in the manifest: first-party (`scripts/*.js`), third-party (`scripts/vendor/<package>/...`), vendor license colocated with the vendored package, manifest entry with `kind: "vendor"` plus an `attribution` ID. One undifferentiated script folder makes license audits, vulnerability review, and upgrades unnecessarily difficult. Vendoring remains correct for Tovu's offline/self-hosted trust model; the distinction does not imply CDN loading. The same convention can apply to third-party CSS under `css/vendor/`.

## 9. Dev-time agent support

Keep it outside `ai/` — different consumers and trust models. `AGENTS.md` belongs at the theme root so coding tools naturally discover its theme-scoped instructions: renderer adapter and source format, generated/"do not edit directly" files, token mapping and mode rules, conversion/reconciliation notes, vendored dependency provenance, standard validation/render commands, animation or screenshot-settling requirements.

`tests/` should minimally contain a declarative `cases.json`, fixtures, and optional DOM/visual goldens, e.g.:

```json
{
  "apiVersion": 1,
  "cases": [{
    "id": "home-dark-desktop", "entry": "home", "tokenSet": "dark", "fixture": "fixtures/site.json",
    "viewport": { "width": 1440, "height": 900 },
    "settle": { "event": "tovu:ready", "timeoutMs": 3000 },
    "assert": { "noMissingEmbeds": true, "goldenDom": "golden/dom/home-dark.html", "goldenVisual": "golden/visual/home-dark.webp" }
  }]
}
```

The explicit settling contract addresses the real current failure mode where screenshots capture reveal animations halfway through. Build-free tiers should not need custom per-theme test executables; the platform runner consumes this file.

## 10. Documentation audiences

Produce two coordinated artifacts: (1) a human authoring guide — tutorials, rationale, worked themes per tier, accessibility guidance, troubleshooting, marketplace publishing; (2) a normative package specification — exact tree, field tables, defaults, schemas, cross-file invariants, adapter matrix, valid/invalid fixtures, machine-checkable conformance cases. The specification and JSON Schemas are authoritative; the guide links to them and may generate reference tables from the schemas, avoiding duplicated normative rules while keeping the human guide readable. Theme-local `AGENTS.md` supplements the global specification with facts unique to that particular theme.

## 11. Missing strong fields and taxonomy

Two required additions: `apiVersion` and `compatibility.tovu`. `theme.version` identifies a theme release; it cannot tell a loader which package contract the release uses or whether the theme supports the installed Tovu version. `apiVersion` is legitimate forward compatibility, not a patch for today's tier disagreement. `$schema` helps editors, while `apiVersion` drives runtime validation.

The live theme README also documents Handlebars as a separate loader tier and a declared-but-unimplemented `code` value. I would normalize that taxonomy now: Handlebars becomes `tier: "templated"` plus `renderer.adapter: "handlebars@1"`; the ambiguous `code` value becomes `tier: "component"` plus a concrete adapter such as `react@1`.

Finally, schema validation should reject path traversal, absolute paths, symlinks escaping the package, unknown manifest fields, undeclared renderer entries, mismatched file extensions, forbidden tier content, and committed build-output directories. That validation is what turns the proposed tree from documentation into an enforceable package contract.
