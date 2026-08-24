ACK_PACKET_RECEIVED tovu-theme-invariant-structure-round2 -- I received the packet and will work on it.

Codex(Peer Consensus): My Round 2 recommendation remains `render/`, `data-tovu-agent`, `composition.partials`, and a root-level `AGENTS.md`. The new evidence changes the migration strategy and tier model substantially, even where the four headline decisions remain unchanged.

## A–D decisions

### A. Render-layer folder: `render/`

Current position: use `render/`, containing invariant `pages/` and optional `partials/` and `components/`.

Changed from Round 1: no. Fable’s mechanical boundary strengthened it:

> If the browser loads it verbatim, it belongs in `scripts/`; if a renderer or build adapter interprets it, it belongs in `render/`.

Strongest counterargument: `src/` is familiar across component ecosystems and accurately describes HTML, templates, JSON trees, and components as source. `src/pages/` also aligns with Astro.

Why `render/` still wins: because CSS, browser scripts, assets, tests, and metadata remain siblings. A narrowly scoped `src/` invites `src/utils/`, `src/styles/`, and build configuration that may not belong to the renderer contract. `render/` has an enforceable ownership rule: every file within it must be consumed by `renderer.adapter`.

What would move me: evidence from representative React/Vue/Svelte/Astro theme implementations showing that a nonstandard `render/` root creates substantial adapter complexity or persistent author mistakes that validation cannot cheaply correct.

### B. Published-site handle: `data-tovu-agent`

Current position: keep `data-tovu-agent` distinct from the admin/page-editing `data-agent-element`.

Changed from Round 1: no. The Coordinator’s explicit trusted-admin versus visitor-facing, multi-tenant distinction strengthened the position.

Strongest counterargument: the attribute is only a handle, not authorization. Reusing `data-agent-element` allows one grammar, resolver, documentation vocabulary, and test suite. The actual security boundary should remain the capability registry.

That counterargument is correct about enforcement: the attribute name must never grant authority. Nevertheless, a separate namespace is useful defense-in-depth against semantic and implementation conflation. Published handles remain inert unless all three checks succeed:

```ts
function resolvePublishedOperation(element, operation, caller) {
  const handle = element.getAttribute("data-tovu-agent");
  if (!handle) return DENY;

  const declaration = themeAi.handles[handle];
  const capability = siteCapabilities.lookup(declaration?.capability);

  if (!declaration || !capability) return DENY;
  if (!capability.authorize(caller, operation)) return DENY;

  return capability.invoke(operation);
}
```

What would move me: a formal threat model and boundary tests proving that every resolver is surface-scoped, theme-authored DOM can never enter an admin-operability path, and the shared name demonstrably reduces more risk than it introduces.

### C. Manifest key: `composition.partials`

Current position: rename schema-v2 `slots` to `composition.partials`.

Changed from Round 1: the name is unchanged, but my compatibility position changed. Because `slots` is live and render-affecting, it cannot simply disappear. It needs a versioned, lossless migration.

The new evidence strengthens the semantic case:

- The embed request itself says `type: "partial"`.
- `partial` is one of six embed types, not the name of the entire embed mechanism.
- `regions` already names actual widget-placement insertion points.
- “Slot” has a conflicting meaning in Vue, Svelte, and Web Components.

Strongest counterargument: `slots` already works, has defaults, and describes locations where host-provided output is inserted. Renaming a live field adds migration cost and risks breaking known behavior for theoretical framework clarity.

What would move me: author testing showing that `partials` is more misleading across adapters than `slots`, or a decision that the component tier will never expose native framework slot concepts. Without that evidence, preserving the old spelling indefinitely externalizes confusion onto every future component-theme author.

### D. Dev-agent guidance: root `AGENTS.md`

Current position: keep development guidance in root-level `AGENTS.md`; reserve `ai/` for published-site runtime metadata.

Changed from Round 1: no.

Strongest counterargument: Gemini 3.1 Pro’s co-location argument is coherent—placing `ai/instructions.md` with all other machine-readable context creates one discovery location and a simpler conceptual package.

Why I still disagree: the audiences, trust boundaries, and distribution lifecycles differ. Runtime `ai/` may ship with an installed theme; coding-agent instructions and reconciliation notes are source-maintenance material. Existing coding agents also discover root `AGENTS.md` without Tovu-specific configuration.

What would move me: reliable cross-tool discovery of `ai/instructions.md` plus a packaging model in which development and runtime material are intentionally distributed together.

## Ranked render-folder solution slate

Ranking criteria, in order:

1. Semantic accuracy across all current and future tiers.
2. Enforceable ownership boundary.
3. Resistance to misplaced files.
4. Ecosystem familiarity.
5. Migration and documentation cost.

| Rank | Option | Advantages | Costs |
|---|---|---|---|
| 1 | `render/` | Precisely names adapter-owned input; accurate for HTML, Liquid, Handlebars, JSON trees, signed render code, and components; prevents generic source sprawl. | New convention; component authors may initially expect `src/`. |
| 2 | `src/` | Most familiar; accurately describes authored inputs; excellent component-framework ergonomics. | Too broad when CSS, scripts, assets, and configuration are siblings; encourages files the renderer does not own. |
| 3 | `templates/` | Lowest migration and documentation churn; familiar to current Liquid/Handlebars authors. | Semantically weak for complete static documents, declarative ASTs, and framework components. |

Recommendation: `render/`. Its boundary remains meaningful even as adapters change: “everything interpreted by the selected renderer lives here.”

## Revised invariant package

```text
<theme-id>/
├── theme.json
├── tokens.json
├── tokens.<mode>.json
├── AGENTS.md                         # recommended; development only
├── LICENSE
├── NOTICE.md                         # optional legal/provenance narrative
├── assets/
│   ├── previews/
│   │   ├── card.webp
│   │   └── gallery/
│   ├── images/
│   ├── fonts/
│   ├── video/
│   ├── audio/
│   └── files/
├── css/
│   ├── theme.css                    # sole automatic CSS entry
│   └── vendor/
├── render/
│   ├── pages/
│   ├── partials/
│   └── components/                  # normally component tier
├── scripts/                         # forbidden only in declarative
│   ├── main.js
│   └── vendor/<library>/
│       ├── library.js
│       └── LICENSE
├── ai/                              # published-site metadata only
│   ├── capabilities.json
│   └── evaluation.json
├── locales/
├── tests/
│   ├── cases.json
│   ├── fixtures/
│   └── golden/
└── package.json                     # component tier only
```

`dist/`, `build/`, `.next/`, generated previews, and other build output are always forbidden inside this package.

The script boundary is Fable’s checkable rule: browser-loaded verbatim files belong in `scripts/`; files transformed by an adapter belong in `render/`.

## Corrected tier model

My Round 1 suggestion that `code` could be normalized into the component tier was wrong. The correct model is:

```ts
type ThemeTierV2 =
  | "declarative"
  | "templated"
  | "handlebars"
  | "static"
  | "code"       // reserved trusted signed-plugin JS
  | "component"; // genuinely new React/Vue/Svelte/Astro concept
```

`handlebars` remains a real, implemented tier even though no content uses it. `code` remains reserved and must not be documented as React/Vue-style component support. Unsupported tiers should fail explicitly rather than fall back to another renderer.

A later ADR may normalize Liquid and Handlebars behind adapters, but that is a separate migration—not something this schema redesign should silently perform.

## Manifest sketch

```jsonc
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",
  "apiVersion": 2,

  "id": "basic",
  "name": "Basic",
  "version": "1.0.0",
  "tier": "static",
  "renderer": {
    "adapter": "html@1"
  },

  "description": "A multi-page marketing theme.",

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
      "files": ["scripts/vendor/motion/**"],
      "licenseFile": "scripts/vendor/motion/LICENSE"
    }
  ],
  "marketplace": {
    "category": "marketing",
    "tags": ["multi-page", "dark", "light"]
  },

  "modes": ["dark", "light"],
  "defaultMode": "dark",

  "regions": ["header", "footer"],

  "composition": {
    "partials": {
      "nav": {
        "source": "render/partials/nav.html",
        "activeAttr": "data-nav-current"
      },
      "footer": {
        "source": "render/partials/footer.html",
        "variants": {
          "minimal": "render/partials/footer-minimal.html"
        }
      }
    }
  },

  "scripts": [
    {
      "id": "motion",
      "path": "scripts/vendor/motion/motion.js",
      "kind": "vendor",
      "attribution": "motion"
    },
    {
      "id": "main",
      "path": "scripts/main.js",
      "kind": "author",
      "dependsOn": ["motion"]
    }
  ]
}
```

Important changes from my Round 1 manifest:

- `modes`, `defaultMode`, and `regions` are preserved because they are real runtime contracts.
- `pages` and my proposed `renderer.entries` are absent. Fable’s no-duplicated-filesystem-truth argument moved me here: page discovery should read `render/pages/`, not maintain a second list that can drift.
- Root `tokens.json` and `tokens.<mode>.json` preserve the functioning mode convention without unnecessary movement into a new folder.
- `apiVersion` distinguishes the live legacy schema from the new structure.

## Lossless `slots` migration

An absent `apiVersion` is treated as legacy v1. Migration must preserve every live descriptor, including defaults, variants, and `activeAttr`:

```ts
function migrateV1ToV2(v1: ThemeManifestV1): ThemeManifestV2 {
  const legacySlots = v1.slots ?? DEFAULT_THEME_SLOTS;

  return {
    ...copyLiveFields(v1, [
      "id", "name", "version", "tier", "description",
      "modes", "defaultMode", "regions"
    ]),
    apiVersion: 2,
    renderer: adapterForExistingTier(v1.tier),
    composition: {
      partials: relocatePartialSources(legacySlots, "render/partials")
    }
    // Deliberately omit legacy `pages`; verify against render/pages instead.
  };
}
```

For v2, implicit `nav`/`footer` defaults should preferably be materialized by migration rather than remain hidden behavior.

## One embed envelope, six resolver types

The current authoritative HTML carrier is one attribute containing the complete JSON request:

```html
<div
  data-embed-config='{"type":"partial","id":"nav","current":"signin"}'>
</div>
```

The invariant is the logical request, not HTML:

```ts
type EmbedType =
  | "partial"
  | "menu"
  | "widget"
  | "form"
  | "media"
  | "post";

interface EmbedRequest {
  type: EmbedType;
  id: string;
  params: Record<string, unknown>;
}
```

Static HTML parses `data-embed-config`; declarative themes use a typed node; template engines lower a helper to the same request; component themes use a host component such as:

```tsx
<TovuEmbed type="partial" id="nav" current="signin" />
```

Only `type: "partial"` consults `composition.partials`. The other five types retain their own host resolvers. Widget-placement `regions` remain a separate mechanism:

```json
{ "type": "region", "key": "footer" }
```

That distinction must be explicit in both schema and documentation.

## Dev-time agent and test contract

Root `AGENTS.md` should say, at minimum:

```md
- Files under scripts/vendor/** and css/vendor/** are immutable.
- Use theme_write_file for edits during a running development session.
  It revalidates and hot-reloads this theme after each write.
- Direct filesystem edits still require a server restart.
- Run: tovu theme validate .
- Run: tovu theme test .
- Visual cases must wait for the settle contract before capture.
```

`tests/cases.json` should retain the explicit settling mechanism:

```json
{
  "apiVersion": 1,
  "cases": [{
    "id": "home-dark-desktop",
    "page": "index",
    "fixture": "fixtures/site.json",
    "mode": "dark",
    "settle": {
      "event": "tovu:ready",
      "timeoutMs": 3000
    },
    "goldenVisual": "golden/home-dark.webp"
  }]
}
```

## Missing pieces now required

1. Add the genuinely new sixth `component` tier without redefining `code`.
2. Preserve the implemented `handlebars` path.
3. Preserve live `modes`, `defaultMode`, `slots` semantics, and `regions`.
4. Remove dead `pages` metadata instead of replacing it with another entry list.
5. Add `$schema`, `apiVersion`, and host compatibility.
6. Fail closed on unknown or unimplemented tier values.
7. Validate the single-attribute embed grammar against all six resolver types.
8. Document `theme_write_file` hot reload so agents do not restart unnecessarily.
9. Preserve `regions: string[]` exactly until real adoption supplies evidence for a richer model.
10. Conformance-test documentation examples against the actual parser.

The last item matters because the existing guide’s overall discipline—verified citations, live/dead field tables, gotchas, and a minimal example—is excellent, yet its marker description still drifted from the parser. The right documentation design remains two artifacts from one source of truth:

- A normative schema, validator, and executable valid/invalid fixtures.
- A human guide following the existing guide’s proven structure, with generated field tables and examples exercised by conformance tests.

Final recommendation: adopt `render/`, `data-tovu-agent`, `composition.partials`, and root `AGENTS.md`; introduce schema v2 with an explicit migrator; preserve all live runtime fields including `regions`; and treat component frameworks as a new sixth tier rather than repurposing `code`.
