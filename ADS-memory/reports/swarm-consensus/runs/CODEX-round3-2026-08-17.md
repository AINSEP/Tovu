ACK_PACKET_RECEIVED tovu-theme-invariant-structure-round3 -- I received the packet and will work on it.

Codex(Peer Consultation): Adopt the shipped lifecycle model: compiled themes remain `tier: "static"`, publish normalized output beside an opaque authoring tree, and keep the existing `build` field names with targeted v2 hardening.

## 1. Static-only should remain permanent for this contract

`build.source: "compiled"` should permanently require `tier: "static"`.

The precise reason is not that every framework build necessarily produces static files—Next, Nuxt, SvelteKit, and others can emit server runtimes. Rather, this Tovu lifecycle class accepts only builds reduced to Tovu’s static runtime contract: prerendered HTML, CSS, browser JavaScript, and assets. A framework output requiring SSR, edge functions, or server modules is not a compiled static theme and must be rejected.

If Tovu later supports server-executing theme artifacts, that needs a new runtime/trust contract and ADR. It should not weaken this gate or overload `build.source: "compiled"`.

This distinction preserves:

- `tier` = runtime capabilities and trust posture.
- `build` = provenance and editing lifecycle.
- `framework` = descriptive producer metadata only.

That matches the shipped cross-field validation in [theme.ts](/Users/la/Programming/Tovu/src/features/theme/theme.ts:640).

## 2. Use the same published runtime shape

I agree with the Coordinator, with one qualification: runtime consumers should not care whether a static theme was authored or compiled, but lifecycle consumers necessarily must.

The normalized generated/release region should use the same v2 invariant roots as an authored static theme:

- `render/pages/`
- `render/partials/`
- `css/`
- `scripts/`
- `assets/`
- The same token, metadata, AI, localization, and documentation locations

`sourceDir` is the sole additional structural element. It is not another runtime shape.

The author or publisher CI should perform:

```text
framework build
→ normalize output into the invariant roots
→ compute artifactHashes
→ package and publish
```

Tovu should only validate and consume the result. There should be no retained `dist/` wrapper and no install-time rebuild.

“Consumers never need to know” is too broad:

- The renderer, router, asset server, and partial resolver should not know.
- The installer, integrity validator, editor, reset/restore logic, and coding-agent tools must know, because generated files are immutable while `sourceDir` and `theme.json` remain editable.

This is a target-v2 migration, not current behavior. Today the static loader and conformance rules use `pages/`, root partials, `css/`, and `js/`; the existing normalizer also targets that shape and explicitly has zero production callers ([normalizer](/Users/la/Programming/Tovu/src/features/theme/code-tier-asset-normalizer.ts:91)). Moving to `render/` and `scripts/` therefore requires an atomic update of the loader, normalizer, path rewriter, validator, restore logic, and tests.

## 3. Arbitrary name and interior, constrained package boundary

Do not require the name `src/` or a fixed depth. An author-declared value such as `authoring/`, `frontend/`, or `packages/site/` is legitimate, and its interior may follow the framework’s native conventions.

But `sourceDir` cannot be fully exempt from every rule.

At minimum, v2 should require it to be:

- A canonical, theme-relative POSIX directory path.
- Non-empty and not `.`.
- Free of absolute paths, backslashes, empty components, `.`/`..` components, and trailing separators.
- Disjoint from reserved release roots such as `render/`, `css/`, `scripts/`, `assets/`, `ai/`, `tests/`, `locales/`, and generated-tooling roots such as `preview/`.
- Subject to package-wide containment, size, file-count, and symlink rules.
- Excluded from runtime static serving.

That last point is not true today. The current middleware mounts `express.static(themeDir)`, exposing the entire folder, including `sourceDir` ([theme-static-assets.ts](/Users/la/Programming/Tovu/src/server/middleware/theme-static-assets.ts:14)). The admin write path consequently needs a special extension allowlist, and the code itself records an open conformance fix for `sourceDir: "preview"` overlap ([explore.ts](/Users/la/Programming/Tovu/src/server/routes/admin/themes/explore.ts:570)).

Therefore:

> The layout inside `sourceDir` should be framework-opaque, but the directory declaration and package remain security-constrained.

Schema v2 should also narrow static serving to published release roots, rather than continuing to expose the source tree and compensating only at write time.

## 4. Widen `build.framework`, preferably to an open vocabulary

Yes. The current `"react" | "vue" | "angular"` union is unnecessarily closed for descriptive metadata. The parser presently discards `"svelte"` while retaining the compiled lifecycle ([test](/Users/la/Programming/Tovu/src/features/theme/__tests__/theme-build-manifest.test.ts:177)), which loses useful provenance without improving safety.

Recommended v2 representation:

```json
"framework": "astro"
```

Use a validated lowercase/kebab-case string with documented canonical values such as:

```text
react, vue, angular, svelte, astro, solid, qwik, web-components
```

This is additive to runtime behavior. It affects schema validation, TypeScript parsing, catalog filters, support diagnostics, and UI display—but must never select a renderer, normalizer, trust level, or conformance policy.

A framework label must not be interpreted as a support claim. In particular, the real Astro test currently proves that unmodified default Astro output fails the sentinel and asset-reference gate ([astro test](/Users/la/Programming/Tovu/src/features/theme/__tests__/astro-real-bundler-conformance.test.ts:16)). The normalizer is documented primarily against constrained, flat Angular output. Thus `"framework": "astro"` means “Astro produced this release,” not “arbitrary Astro builds are accepted.”

## 5. Ranked solution slate

1. **Option C — preserve the shipped shape, widen and harden it. Recommended.**

   Keep `source`, `framework`, `sourceDir`, `builderVersion`, `lockfileHash`, and `artifactHashes`. Add strict v2 conditional validation:

   - Absent `build` means authored; that is the canonical authored representation.
   - A present `build.source` must be recognized—no silent typo-to-authored downgrade.
   - `compiled` requires `tier: "static"`, valid `sourceDir`, and non-empty `artifactHashes`.
   - Compiled-only fields are forbidden or ignored under `source: "authored"`.
   - `framework` is an open, validated identifier.
   - Hash paths and SHA-256 digest formats are validated.
   - Every release-region file is inventoried; no undeclared files or symlinks.
   - Unknown properties are rejected.

   This preserves shipped APIs and editing behavior while fixing actual schema weaknesses.

2. **Option A — carry ADR-020’s object forward verbatim.**

   Lowest migration risk and already backed by tests. However, it preserves the closed framework union, accepts inadequately constrained `sourceDir` values, and currently lets unrecognized `source` values silently become authored. Reasonable only as a compatibility bridge.

3. **Option B — rename/reorganize the object.**

   A structure such as `provenance.toolchain`, `source.root`, and `artifacts.hashes` may read more elegantly and could add algorithm agility. It creates coordinated churn across the loader, marketplace, editor, agent tools, restore behavior, tests, and documentation without changing the underlying architecture. There is no demonstrated payoff sufficient to justify that migration.

One trust-language correction: `artifactHashes` provide completeness and integrity relative to a trusted manifest; they do not establish publisher identity or prove that browser JavaScript is benign. Signatures/lineage and behavioral security controls remain separate concerns.

## Authored example

`build` is intentionally absent:

```json
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",
  "apiVersion": 2,
  "id": "atelier-authored",
  "name": "Atelier — Authored",
  "version": "2.0.0",
  "tier": "static",
  "compatibility": { "tovu": ">=1.0.0" },
  "license": { "spdx": "MIT", "file": "LICENSE" },
  "authors": [{ "name": "Aurora Studio" }],
  "attributions": [],
  "category": "portfolio",
  "tags": ["studio", "minimal"],
  "renderer": {
    "adapter": "html@2",
    "pages": {
      "home": { "source": "render/pages/index.html" }
    }
  },
  "partials": {
    "nav": { "source": "render/partials/nav.html" }
  },
  "regions": ["header", "footer"],
  "modes": ["light", "dark"],
  "defaultMode": "light"
}
```

## Compiled example of the same theme kind

The runtime remains `html@2` and `tier: "static"`; Astro is only build provenance:

```json
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",
  "apiVersion": 2,
  "id": "atelier-compiled",
  "name": "Atelier — Compiled",
  "version": "2.0.0",
  "tier": "static",
  "compatibility": { "tovu": ">=1.0.0" },
  "license": { "spdx": "MIT", "file": "LICENSE" },
  "authors": [{ "name": "Aurora Studio" }],
  "attributions": [],
  "category": "portfolio",
  "tags": ["studio", "minimal"],
  "renderer": {
    "adapter": "html@2",
    "pages": {
      "home": { "source": "render/pages/index.html" }
    }
  },
  "partials": {
    "nav": { "source": "render/partials/nav.html" }
  },
  "regions": ["header", "footer"],
  "modes": ["light", "dark"],
  "defaultMode": "light",
  "build": {
    "source": "compiled",
    "framework": "astro",
    "sourceDir": "authoring",
    "builderVersion": "astro@5.13.2",
    "lockfileHash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "artifactHashes": {
      "AGENTS.md": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      "LICENSE": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      "tokens.json": "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      "tokens.dark.json": "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      "render/pages/index.html": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      "render/partials/nav.html": "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      "css/theme.css": "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      "scripts/main.js": "sha256:8888888888888888888888888888888888888888888888888888888888888888",
      "assets/previews/card.webp": "sha256:9999999999999999999999999999999999999999999999999999999999999999"
    }
  }
}
```

The digests are illustrative, but the map is deliberately exhaustive for the release files shown below.

## Corrected folder fragments

```text
atelier-authored/
├── theme.json
├── AGENTS.md
├── LICENSE
├── tokens.json
├── tokens.dark.json
├── render/
│   ├── pages/index.html
│   └── partials/nav.html
├── css/theme.css
├── scripts/main.js
└── assets/previews/card.webp
```

All files are authored and per-file editable.

```text
atelier-compiled/
├── theme.json                  # editable; excluded from artifactHashes
├── authoring/                  # build.sourceDir; editable and not hashed
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── astro.config.mjs
│   └── frontend/               # arbitrary framework-native interior
│       ├── pages/index.astro
│       └── components/Nav.astro
├── AGENTS.md                   # release region: hashed, per-file read-only
├── LICENSE                     # release region: hashed, per-file read-only
├── tokens.json                 # release region: hashed, per-file read-only
├── tokens.dark.json
├── render/                     # normalized static runtime output
│   ├── pages/index.html
│   └── partials/nav.html
├── css/theme.css
├── scripts/main.js
└── assets/previews/card.webp
```

Everything outside `authoring/`, except `theme.json`, is the integrity-verified release region. Root `AGENTS.md` remains in its settled location; the compiled lifecycle merely makes the published copy immutable, with changes made under `sourceDir` and republished as a complete release.

This correction does not change the settled `render/`, `partials`, `data-tovu-agent`, or root-`AGENTS.md` naming decisions.
