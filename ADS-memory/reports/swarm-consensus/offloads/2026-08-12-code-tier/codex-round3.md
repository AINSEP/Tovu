I’ll read the packet and every Round 2 appendix entry first, then inspect the referenced implementations and verify the decisive technical claims against primary web sources. I’ll keep the final response to the packet’s exact ACK/headings/end-marker contract.
The packet is fully read. The key implementation fork is narrower than Round 2 framed it: built packages need immutable artifact verification and a reset boundary, while source provenance should not be mistaken for live editable source. I’m now tracing the actual parser, loader, renderer, and reset call sites so the code matches their current return types and failure behavior.
The source confirms the load boundary: `loadTheme()` already accumulates per-theme errors instead of throwing (`theme.ts:481-528`), so conformance and hash failures belong in that error list, not in the hot renderer. It also confirms there is no reset implementation yet—only catalog-copy intent—so the leading code must add a typed reset policy rather than merely tweak an existing function.
Research exposed a load-bearing issue Round 2 missed: Tovu mutates the exported HTML after SSG but before browser hydration. Angular’s current hydration contract explicitly requires the server- and client-side DOM structures to match and says the SSR HTML must not be altered; therefore whole-app Angular hydration around Tovu markers is incompatible by construction. I’m checking the equivalent React/Nuxt contracts before ranking the adapters.
ACK_PACKET_RECEIVED CTX-CODE-TIER-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

The settled compile-to-`static` direction remains correct, but Round 2 missed a critical boundary: Tovu modifies generated HTML after SSG and before browser hydration (`files/src/features/theme/static-render.ts:31-46`, `389-412`). Whole-application hydration cannot safely own DOM containing Tovu markers:

- React requires hydrated markup to match its server-rendered result.
- Vue may discard mismatched nodes while recovering.
- Angular explicitly says prerendered HTML must not be altered before hydration.

Therefore the enforceable constraint is:

> All indexable content and Tovu markers must exist in the initial HTML and remain outside framework hydration roots. Islands may only progressively enhance already-rendered HTML.

Built packages declare `static-html` plus `enhance-only`; islands use a framework-neutral `<tovu-island data-mode="enhance">` boundary. Load-time conformance rejects client-only islands, empty islands, and Tovu markers inside islands. Publisher CI additionally runs a browser test after simulated Tovu substitutions because no static analysis can prove arbitrary JavaScript preserves DOM.

Framework findings:

| Framework | Static contract | Tovu fit |
|---|---|---|
| Astro | Static by default, normally writes `dist/`; non-`client:only` islands are server-rendered before hydration. | Best reference implementation. Its build hook can canonicalize output, and markers can remain in the non-hydrated Astro shell. |
| Next | `output: "export"` writes HTML/CSS/JS to `out/`; Client Components are prerendered. | Accepted only after proving Tovu-owned DOM lies outside React hydration roots and survives client navigation. |
| Nuxt | `nuxt generate` emits plain HTML under `.output/public`; `ssr:false` instead emits an empty app shell. | Accepted conditionally. `<ClientOnly>` is forbidden for indexable content, and hydration mismatch testing is mandatory. |
| Angular | `outputMode: "static"` emits prerendered route HTML without a server. | Full-root hydration around Tovu-mutated markup is non-conforming. Only isolated roots disjoint from Tovu markers qualify. |

A separate contradiction from the research: Primary Opus’s claim that `:root` custom properties do not cross a shadow boundary is false. Custom properties inherit, and top-level shadow-tree elements inherit from their host. Shadow DOM still complicates selectors and marker visibility, but token inheritance is not the reason.

## Sources

- [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) confirms Google executes JavaScript using headless evergreen Chromium, but only after a rendering queue; it still recommends pre-rendering because not every bot executes JavaScript.
- [Google dynamic-rendering guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering) recommends static rendering, SSR, or hydration over bot-specific dynamic rendering and warns that other search engines may ignore JavaScript-generated content.
- [Bing crawler reference](https://www.bing.com/webmasters/help/help/which-crawlers-does-bing-use-8c184ec0) confirms Bingbot uses an evergreen Edge rendering engine. This does not make client-only content a safe cross-crawler contract.
- [Astro deployment documentation](https://docs.astro.build/en/guides/deploy/) confirms static output defaults to `dist/`; [Astro framework components](https://v4.docs.astro.build/en/guides/framework-components/) confirms every client directive except `client:only` first generates static HTML; [Astro’s build hook](https://v5.docs.astro.build/en/reference/integrations-reference/) exposes the completed output directory for an adapter.
- [Next static exports](https://nextjs.org/docs/app/guides/static-exports) confirms `output: "export"` generates route HTML and assets in `out/`, while client-side data fetching remains SPA-like. [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot) contradicts Round 2’s implicit assumption that Tovu can freely mutate a hydrated tree: React expects identical markup and does not guarantee mismatch repair.
- [Nuxt deployment](https://nuxt.com/docs/3.x/getting-started/deployment) and [`nuxt generate`](https://nuxt.com/docs/3.x/api/commands/generate) confirm prerendered plain-HTML output. The same deployment guide explicitly says `ssr:false` produces an empty `#__nuxt` shell and loses SEO benefits. [Nuxt hydration guidance](https://nuxt.com/docs/4.x/guide/best-practices/hydration) says mismatches can break interactivity, trigger rerendering, and create SEO differences.
- [Angular prerendering](https://angular.dev/guide/prerendering) confirms `RenderMode.Prerender`/`outputMode: "static"` produce route HTML without a server. [Angular hydration](https://angular.dev/guide/hydration) explicitly requires matching DOM and says prerendered HTML must not be altered—directly exposing the Tovu post-SSG mutation conflict.
- [CSS Scoping §3.3.2](https://www.w3.org/TR/css-scoping-1/#inheritance) and [CSS Custom Properties](https://www.w3.org/TR/css-variables-1/#defining-variables) contradict the Round 2 shadow-token claim: shadow-tree roots inherit from their host and custom properties are inherited.

## Solution Slate

Ranking criteria, in order: preserve server-owned content and SEO; fail closed against renderer incompatibility; avoid Tovu-side code execution; preserve integrity/reset semantics; remain framework-neutral; minimize hot-path changes.

1. **Canonical post-export adapter plus load-time verifier; Astro reference first.**

   Publisher CI converts framework output into the exact current `static` layout, adds hashes, and runs conformance. Tovu verifies but never normalizes or builds. Astro is first because its static shell and isolated hydration model naturally support disjoint Tovu markers and islands.

   Trade-offs: all four frameworks can use their documented output directories without “ejecting,” but Next/Nuxt/Angular require stricter adapter fixtures. Exact output becomes coupled to a versioned Tovu artifact contract.

   Genuine sacrifice: generated output is immutable and cannot be reset one file at a time; framework-source edits require an external rebuild. Some native framework navigation/hydration features may be disallowed.

2. **Require frameworks to emit the byte-exact contract natively.**

   This removes the canonicalization adapter and makes packages easier to inspect.

   Trade-offs: framework serializers and bundlers do not document the precise whitespace, quote, attribute-order, asset-name, or sentinel guarantees required by `static-render.ts:31-46,402-406`.

   Genuine sacrifice: authors must disable minification, hashing, normal asset conventions, or upgrades merely to preserve incidental byte spelling. This is too brittle for a public contract.

3. **Replace request-time string rewrites with an HTML parser.**

   This accepts broader framework output and removes the literal sentinel dependency.

   Trade-offs: it changes the renderer serving existing static themes, adds parsing cost, and still does not solve hydration ownership, artifact integrity, or client-only SEO.

   Genuine sacrifice: regression and latency risk move onto every static-theme request.

Recommendation: option 1.

The cheapest falsification test is one Astro page containing the stylesheet sentinel, a Tovu content marker, and one interactive `<tovu-island>`. Run `astro build`, canonicalize it, invoke `renderStaticPage`, then verify with JavaScript disabled and enabled that content exists initially, the marker substitution survives, the button hydrates, and no hydration warning occurs. Failure without framework patches falsifies Astro as the reference adapter. Equivalent fixtures are qualification gates for Next, Nuxt, and Angular.

## Leading Option — Code

The existing parser silently coerces unknown tiers at `files/src/features/theme/theme.ts:248-252`; the loader already accumulates errors at `486-528`, making it the correct fail-closed integration point.

**`files/src/features/theme/theme.ts` — manifest types and parsing**

```ts
export interface ThemeAuthor {
  name: string;
  url?: string;
}

export type Sha256Integrity = `sha256:${string}`;

export interface ThemeSourceReference {
  /** Human-accessible source repository. */
  repository: string;
  /** Immutable commit/tag identifying the source used for this release. */
  revision: string;
  /** Optional project path inside the repository. */
  path?: string;
  /** Optional inert source tree shipped in the package, e.g. "source". */
  bundledRoot?: string;
}

export interface BuiltThemeArtifact {
  contract: 1;
  rendering: {
    content: "static-html";
    islands: "enhance-only";
  };
  integrity: {
    algorithm: "sha256";
    /**
     * Every package file except theme.json and bundledRoot.
     * theme.json is excluded because it contains this map.
     */
    files: Record<string, Sha256Integrity>;
  };
}

export type ThemeLifecycle =
  | { class: "authored" }
  | {
      class: "built";
      source: ThemeSourceReference;
      artifact: BuiltThemeArtifact;
    };

// Add to ThemeManifest:
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  tier: ThemeTier;
  class?: "declarative";
  engine: number;
  author?: ThemeAuthor;
  lifecycle: ThemeLifecycle;

  description?: string;
  fonts?: string[];
  regions?: string[];
  skipLiquidAllowlist?: boolean;
  templates?: string[];
  modes?: string[];
  defaultMode?: string;
  slots?: Record<string, ThemeSlotDescriptor>;
}

const SHA256_INTEGRITY = /^sha256:[a-f0-9]{64}$/;

function requiredString(
  object: Readonly<Record<string, JsonValue>>,
  key: string,
  label: string
): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function manifestRelativePath(value: JsonValue, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a normalized relative POSIX path`);
  }
  return value;
}

function parseAuthor(value: JsonValue | undefined): ThemeAuthor | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error("theme.json author must be an object");

  const name = requiredString(value, "name", "theme.json author");
  const url =
    value.url === undefined
      ? undefined
      : requiredString(value, "url", "theme.json author");

  return { name, ...(url ? { url } : {}) };
}

function parseLifecycle(value: JsonValue | undefined): ThemeLifecycle {
  if (value === undefined) return { class: "authored" };
  if (!isObject(value)) throw new Error("theme.json lifecycle must be an object");

  if (value.class === "authored") return { class: "authored" };
  if (value.class !== "built") {
    throw new Error("theme.json lifecycle.class must be 'authored' or 'built'");
  }

  if (!isObject(value.source)) {
    throw new Error("theme.json lifecycle.source must be an object");
  }
  const source: ThemeSourceReference = {
    repository: requiredString(value.source, "repository", "theme.json lifecycle.source"),
    revision: requiredString(value.source, "revision", "theme.json lifecycle.source"),
    ...(value.source.path === undefined
      ? {}
      : { path: manifestRelativePath(value.source.path, "theme.json lifecycle.source.path") }),
    ...(value.source.bundledRoot === undefined
      ? {}
      : {
          bundledRoot: manifestRelativePath(
            value.source.bundledRoot,
            "theme.json lifecycle.source.bundledRoot"
          ),
        }),
  };

  if (!isObject(value.artifact) || value.artifact.contract !== 1) {
    throw new Error("theme.json lifecycle.artifact.contract must equal 1");
  }
  if (
    !isObject(value.artifact.rendering) ||
    value.artifact.rendering.content !== "static-html" ||
    value.artifact.rendering.islands !== "enhance-only"
  ) {
    throw new Error(
      "theme.json lifecycle.artifact.rendering must declare static-html/enhance-only"
    );
  }
  if (
    !isObject(value.artifact.integrity) ||
    value.artifact.integrity.algorithm !== "sha256" ||
    !isObject(value.artifact.integrity.files)
  ) {
    throw new Error(
      "theme.json lifecycle.artifact.integrity must contain sha256 files"
    );
  }

  const files: Record<string, Sha256Integrity> = {};
  for (const [rawPath, digest] of Object.entries(value.artifact.integrity.files)) {
    const path = manifestRelativePath(rawPath, `artifact integrity path '${rawPath}'`);
    if (path === "theme.json") {
      throw new Error("artifact integrity must not include circular theme.json");
    }
    if (typeof digest !== "string" || !SHA256_INTEGRITY.test(digest)) {
      throw new Error(`artifact integrity for '${path}' is not sha256:<64 lowercase hex>`);
    }
    if (
      source.bundledRoot &&
      (path === source.bundledRoot || path.startsWith(`${source.bundledRoot}/`))
    ) {
      throw new Error(`artifact integrity path '${path}' overlaps bundled source`);
    }
    files[path] = digest as Sha256Integrity;
  }
  if (Object.keys(files).length === 0) {
    throw new Error("built artifact integrity must contain at least one file");
  }

  return {
    class: "built",
    source,
    artifact: {
      contract: 1,
      rendering: { content: "static-html", islands: "enhance-only" },
      integrity: { algorithm: "sha256", files },
    },
  };
}

/** Missing still defaults; malformed or unknown values fail closed. */
function parseTier(value: JsonValue | undefined): ThemeTier {
  if (value === undefined) return "declarative";
  if (
    typeof value === "string" &&
    (THEME_TIERS as readonly string[]).includes(value)
  ) {
    return value as ThemeTier;
  }
  throw new Error(
    `unsupported theme.json tier ${JSON.stringify(value)}; expected ${THEME_TIERS.join(", ")}`
  );
}
```

The changed manifest construction in `loadTheme()` is:

```ts
const empty: ThemeManifest = {
  id,
  name: id,
  version: "0.0.0",
  tier: "declarative",
  engine: 1,
  lifecycle: { class: "authored" },
};

manifest = {
  id: String(raw.id ?? id),
  name: String(raw.name ?? id),
  version: String(raw.version ?? "0.0.0"),
  tier: parseTier(raw.tier),
  engine: typeof raw.engine === "number" ? raw.engine : 1,
  author: parseAuthor(raw.author),
  lifecycle: parseLifecycle(raw.lifecycle),
  description: typeof raw.description === "string" ? raw.description : undefined,
  fonts: Array.isArray(raw.fonts) ? raw.fonts.map(String) : undefined,
  regions: Array.isArray(raw.regions) ? raw.regions.map(String) : undefined,
  skipLiquidAllowlist: raw.skipLiquidAllowlist === true,
  templates: Array.isArray(raw.templates) ? raw.templates.map(String) : undefined,
  modes: Array.isArray(raw.modes) ? raw.modes.map(String) : undefined,
  defaultMode: typeof raw.defaultMode === "string" ? raw.defaultMode : undefined,
  slots: parseSlots(raw.slots),
};

if (manifest.lifecycle.class === "built") {
  if (manifest.tier !== "static") {
    errors.push("built themes must target tier 'static'");
  }
  if (!manifest.author) {
    errors.push("built themes must declare theme.json author");
  }
}
```

Representative `theme.json` shape:

```json
{
  "id": "studio-astro",
  "name": "Studio",
  "version": "1.4.0",
  "tier": "static",
  "engine": 1,
  "author": {
    "name": "Example Studio",
    "url": "https://example.com"
  },
  "lifecycle": {
    "class": "built",
    "source": {
      "repository": "https://github.com/example/studio-theme",
      "revision": "8dbd1b92a19ab44542bcb270a2f49d64139f7d89",
      "path": "packages/theme",
      "bundledRoot": "source"
    },
    "artifact": {
      "contract": 1,
      "rendering": {
        "content": "static-html",
        "islands": "enhance-only"
      },
      "integrity": {
        "algorithm": "sha256",
        "files": {
          "tokens.json": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          "css/styles.css": "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          "js/cart.js": "sha256:123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
          "pages/index.html": "sha256:23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01"
        }
      }
    }
  },
  "templates": ["page-shell.html"]
}
```

**`files/src/features/theme/built-artifact.ts` — integrity, rewrite, and island conformance**

```ts
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import type { ThemeManifest } from "./theme";

const STYLESHEET_SENTINEL =
  '<link rel="stylesheet" href="../css/styles.css" />';

interface Inventory {
  files: string[];
  errors: string[];
}

function sha256(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function inventoryPackage(themeDir: string, sourceRoot?: string): Inventory {
  const files: string[] = [];
  const errors: string[] = [];

  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (relativePath === "theme.json") continue;
      if (
        sourceRoot &&
        (relativePath === sourceRoot || relativePath.startsWith(`${sourceRoot}/`))
      ) {
        continue;
      }

      const absolutePath = join(directory, name);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        errors.push(`artifact '${relativePath}' must not be a symbolic link`);
      } else if (stat.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (stat.isFile()) {
        files.push(relativePath);
      } else {
        errors.push(`artifact '${relativePath}' must be a regular file`);
      }
    }
  };

  walk(themeDir, "");
  return { files: files.sort(), errors };
}

function occurrenceCount(haystack: string, needle: string): number {
  let count = 0;
  let position = 0;
  while ((position = haystack.indexOf(needle, position)) !== -1) {
    count += 1;
    position += needle.length;
  }
  return count;
}

function validateAssetTags(page: string, html: string): string[] {
  const errors: string[] = [];
  const tags = html.match(/<(?:link|script)\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const attributes =
      tag.matchAll(/\b(href|src)\s*=\s*(["'])([^"']*)\2/gi);

    for (const match of attributes) {
      const attribute = match[1].toLowerCase();
      const value = match[3];
      const local = /^(?:\.\.\/|\.\/|\/)?(css|js)\//.exec(value);
      if (!local) continue;

      const directory = local[1];
      const expectedAttribute = directory === "css" ? "href" : "src";
      if (
        attribute !== expectedAttribute ||
        !value.startsWith(`../${directory}/`) ||
        match[0] !== `${expectedAttribute}="${value}"`
      ) {
        errors.push(
          `${page}: local ${directory} assets must use ` +
            `${expectedAttribute}="../${directory}/..." with double quotes`
        );
      }
    }
  }

  return errors;
}

function validateIslands(page: string, html: string): string[] {
  const errors: string[] = [];

  if (html.includes("data-tovu-client-only")) {
    errors.push(`${page}: client-only content is forbidden`);
  }

  const openingCount =
    html.match(/<tovu-island(?:\s|>)/gi)?.length ?? 0;
  const pairs = Array.from(
    html.matchAll(
      /<tovu-island\b([^>]*)>([\s\S]*?)<\/tovu-island\s*>/gi
    )
  );

  if (pairs.length !== openingCount) {
    errors.push(`${page}: every tovu-island must have a non-nested closing tag`);
    return errors;
  }

  for (const pair of pairs) {
    const attributes = pair[1];
    const body = pair[2];

    if (!/\bdata-mode="enhance"(?:\s|$)/.test(attributes)) {
      errors.push(`${page}: tovu-island must declare data-mode="enhance"`);
    }
    if (/<tovu-island(?:\s|>)/i.test(body)) {
      errors.push(`${page}: nested hydration islands are forbidden`);
    }
    if (/\b(?:data-embed-type|data-tovu-slot)\s*=/.test(body)) {
      errors.push(`${page}: Tovu-owned markers must remain outside hydration islands`);
    }

    const visibleText = body
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&(?:nbsp|#160);/gi, "")
      .trim();
    const accessibleContent =
      /\b(?:alt|aria-label)=(["'])[^"']+\1/i.test(body);

    if (visibleText === "" && !accessibleContent) {
      errors.push(
        `${page}: an enhancement island must contain server-rendered content`
      );
    }
  }

  return errors;
}

export function validateBuiltArtifact(
  required: {
    themeDir: string;
    manifest: ThemeManifest;
    pages: Readonly<Record<string, string>>;
  },
  _optional: Record<string, never> = {}
): string[] {
  const { themeDir, manifest, pages } = required;
  if (manifest.lifecycle.class !== "built") return [];

  try {
    const expected = manifest.lifecycle.artifact.integrity.files;
    const inventory = inventoryPackage(
      themeDir,
      manifest.lifecycle.source.bundledRoot
    );
    const errors = [...inventory.errors];
    const actualSet = new Set(inventory.files);

    for (const path of inventory.files) {
      const expectedDigest = expected[path];
      if (!expectedDigest) {
        errors.push(`artifact file '${path}' has no integrity entry`);
        continue;
      }
      const actualDigest = sha256(join(themeDir, path));
      if (actualDigest !== expectedDigest) {
        errors.push(`artifact file '${path}' failed sha256 integrity`);
      }
    }

    for (const path of Object.keys(expected)) {
      if (!actualSet.has(path)) {
        errors.push(`integrity entry '${path}' has no artifact file`);
      }
    }

    for (const [pageId, html] of Object.entries(pages)) {
      const page = `pages/${pageId}.html`;
      const sentinelCount = occurrenceCount(html, STYLESHEET_SENTINEL);
      if (sentinelCount !== 1) {
        errors.push(
          `${page}: expected exactly one literal stylesheet sentinel; found ${sentinelCount}`
        );
      }
      errors.push(...validateAssetTags(page, html));
      errors.push(...validateIslands(page, html));
    }

    return errors;
  } catch (error) {
    return [`built artifact: ${(error as Error).message}`];
  }
}
```

The loader call site, immediately after `loadStaticTierAssets` at current `theme.ts:542-548`, becomes:

```ts
errors.push(...staticErrors);
errors.push(
  ...validateBuiltArtifact({
    themeDir,
    manifest,
    pages,
  })
);
```

**`files/src/features/theme/theme-files.ts` — reset semantics**

```ts
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  THEME_CATALOG_DIR,
  type ThemeManifest,
} from "./theme";

export type ResetThemeFileResult =
  | {
      scope: "file";
      path: string;
      liveChanged: boolean;
      rebuildRequired: boolean;
    }
  | {
      scope: "release";
      path: string;
      code: "BUILT_ARTIFACT_ATOMIC";
      message: string;
    };

function normalizedRelativePath(path: string): string {
  return path.split(/[\\/]/).join("/");
}

function isUnderRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function resetThemeFile(
  required: {
    themeDir: string;
    themesRoot: string;
    manifest: ThemeManifest;
    relativePath: string;
  },
  _optional: Record<string, never> = {}
): ResetThemeFileResult {
  const { themeDir, themesRoot, manifest, relativePath } = required;
  const target = resolveThemeFilePath({
    themeDir,
    themesRoot,
    relativePath,
  });
  const normalized = normalizedRelativePath(relativePath);

  if (manifest.lifecycle.class === "built") {
    const sourceRoot = manifest.lifecycle.source.bundledRoot;
    if (!sourceRoot || !isUnderRoot(normalized, sourceRoot)) {
      return {
        scope: "release",
        path: normalized,
        code: "BUILT_ARTIFACT_ATOMIC",
        message:
          "Generated output and package metadata are restored only as a complete validated release.",
      };
    }
  }

  const catalogDir = join(
    themesRoot,
    THEME_CATALOG_DIR,
    manifest.tier,
    manifest.id
  );
  const realCatalogDir = realpathSync(catalogDir);
  const sourceCandidate = resolve(realCatalogDir, normalized);
  const sourceStat = lstatSync(sourceCandidate, { throwIfNoEntry: false });

  if (!sourceStat || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new ThemePathError(
      `catalog original '${normalized}' is not a regular file`
    );
  }

  const source = realpathSync(sourceCandidate);
  if (!isWithin(realCatalogDir, source)) {
    throw new ThemePathError(
      `catalog original '${normalized}' escapes through a symbolic link`
    );
  }

  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.reset-${randomUUID()}`;
  try {
    copyFileSync(source, temporary, fsConstants.COPYFILE_EXCL);
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }

  const builtSource = manifest.lifecycle.class === "built";
  return {
    scope: "file",
    path: normalized,
    liveChanged: !builtSource,
    rebuildRequired: builtSource,
  };
}
```

Thus:

- Authored theme file → restored individually and immediately affects live output.
- Built `source/**` file → restored individually, but reports `liveChanged: false` and `rebuildRequired: true`.
- Built `pages/**`, `css/**`, `js/**`, tokens, partials, or `theme.json` → no mutation; returns `BUILT_ARTIFACT_ATOMIC`.

**Tests**

```ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resetThemeFile } from "../theme-files";
import {
  loadTheme,
  THEME_CATALOG_DIR,
  type ThemeManifest,
} from "../theme";

function digest(path: string): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(readFileSync(path))
    .digest("hex")}`;
}

function writeBuiltTheme(root: string, pageHtml: string): void {
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "css"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), pageHtml);
  writeFileSync(join(root, "css/styles.css"), "body { margin: 0 }\n");
  writeFileSync(join(root, "tokens.json"), "{}\n");

  const files = ["pages/index.html", "css/styles.css", "tokens.json"];
  writeFileSync(
    join(root, "theme.json"),
    JSON.stringify({
      id: "compiled",
      name: "Compiled",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      author: { name: "Test Author" },
      lifecycle: {
        class: "built",
        source: {
          repository: "https://example.test/theme",
          revision: "deadbeef"
        },
        artifact: {
          contract: 1,
          rendering: {
            content: "static-html",
            islands: "enhance-only"
          },
          integrity: {
            algorithm: "sha256",
            files: Object.fromEntries(
              files.map((file) => [file, digest(join(root, file))])
            )
          }
        }
      }
    })
  );
}

test("unknown tiers fail closed", (t) => {
  const root = mkdtempSync(join(tmpdir(), "tovu-tier-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(
    join(root, "theme.json"),
    JSON.stringify({
      id: "broken",
      name: "Broken",
      version: "1.0.0",
      tier: "statci",
      engine: 1
    })
  );
  writeFileSync(join(root, "tokens.json"), "{}");

  const loaded = loadTheme({
    themeDir: root,
    id: "broken",
    source: "site"
  });

  assert.equal(loaded.status, "invalid");
  assert.match(
    loaded.errors.join("\n"),
    /unsupported theme\.json tier "statci"/
  );
});

test("built output fails when token injection would silently no-op", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "tovu-built-"));
  const root = join(parent, "compiled");
  mkdirSync(root);
  t.after(() => rmSync(parent, { recursive: true, force: true }));

  writeBuiltTheme(
    root,
    `<!doctype html>
<html><head>
<link rel="stylesheet" href='../css/styles.css'>
</head><body><main>Static content</main></body></html>`
  );

  const loaded = loadTheme({
    themeDir: root,
    id: "compiled",
    source: "site"
  });

  assert.equal(loaded.status, "invalid");
  assert.match(
    loaded.errors.join("\n"),
    /expected exactly one literal stylesheet sentinel; found 0/
  );
});

test("Tovu markers cannot be owned by a hydration island", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "tovu-island-"));
  const root = join(parent, "compiled");
  mkdirSync(root);
  t.after(() => rmSync(parent, { recursive: true, force: true }));

  writeBuiltTheme(
    root,
    `<!doctype html>
<html><head>
<link rel="stylesheet" href="../css/styles.css" />
</head><body>
<tovu-island data-mode="enhance">
  <div data-embed-type="content"></div>
</tovu-island>
</body></html>`
  );

  const loaded = loadTheme({
    themeDir: root,
    id: "compiled",
    source: "site"
  });

  assert.equal(loaded.status, "invalid");
  assert.match(
    loaded.errors.join("\n"),
    /Tovu-owned markers must remain outside hydration islands/
  );
});

test("built source resets per file while output requires release restore", (t) => {
  const root = mkdtempSync(join(tmpdir(), "tovu-reset-"));
  const themesRoot = join(root, "themes");
  const live = join(themesRoot, "static", "compiled");
  const catalog = join(
    themesRoot,
    THEME_CATALOG_DIR,
    "static",
    "compiled"
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(live, "source"), { recursive: true });
  mkdirSync(join(live, "pages"), { recursive: true });
  mkdirSync(join(catalog, "source"), { recursive: true });
  mkdirSync(join(catalog, "pages"), { recursive: true });

  writeFileSync(join(live, "source/page.tsx"), "modified");
  writeFileSync(join(catalog, "source/page.tsx"), "original");
  writeFileSync(join(live, "pages/index.html"), "live artifact");
  writeFileSync(join(catalog, "pages/index.html"), "catalog artifact");

  const manifest: ThemeManifest = {
    id: "compiled",
    name: "Compiled",
    version: "1.0.0",
    tier: "static",
    engine: 1,
    author: { name: "Test Author" },
    lifecycle: {
      class: "built",
      source: {
        repository: "https://example.test/theme",
        revision: "deadbeef",
        bundledRoot: "source"
      },
      artifact: {
        contract: 1,
        rendering: {
          content: "static-html",
          islands: "enhance-only"
        },
        integrity: {
          algorithm: "sha256",
          files: {
            "pages/index.html":
              "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
          }
        }
      }
    }
  };

  const sourceResult = resetThemeFile({
    themeDir: live,
    themesRoot,
    manifest,
    relativePath: "source/page.tsx"
  });
  assert.deepEqual(sourceResult, {
    scope: "file",
    path: "source/page.tsx",
    liveChanged: false,
    rebuildRequired: true
  });
  assert.equal(readFileSync(join(live, "source/page.tsx"), "utf8"), "original");

  const outputResult = resetThemeFile({
    themeDir: live,
    themesRoot,
    manifest,
    relativePath: "pages/index.html"
  });
  assert.equal(outputResult.scope, "release");
  assert.equal(
    readFileSync(join(live, "pages/index.html"), "utf8"),
    "live artifact"
  );
});
```

## Critique Of Another Participant's Round 2 Code

Gemini 3.6 Flash’s suggested discriminator, `"prebuilt": true`, does not implement the claimed lifecycle. `ThemeManifest` has no such property (`files/src/features/theme/theme.ts:39-143`), and `loadTheme()` reconstructs the manifest from an explicit field list that would discard it (`theme.ts:498-516`). A typed object literal would fail excess-property checking; raw JSON would silently lose the field. A boolean also cannot carry source revision, integrity, rendering policy, or reset scope.

Sonnet5’s claim that source per-file reset “needs no new mechanism” is contradicted by the implementation. `marketplace.ts:257-274` only creates catalog/live copies during installation. `theme-files.ts:313-413` implements write, copy, and rename, but no reset operation. Treating installation copying as an existing reset call would leave no code that resolves the catalog original, applies the built/source distinction, or prevents one generated file from being restored independently.

## What Would Change My Mind

I would move the parser-based renderer above option 1 if corpus goldens and production-shaped benchmarks showed equivalent output and negligible latency across all current static themes.

I would qualify Next, Nuxt, or Angular alongside Astro if a version-pinned fixture demonstrated that Tovu substitutions remain outside framework-managed hydration roots, survive client navigation, and produce no hydration warnings or DOM loss.

Finally, artifact hashes provide integrity against drift, not publisher authenticity. If marketplace threat modeling requires identity/authenticity, the manifest itself must also be covered by a trusted signature; hashes alone would not change that requirement.

<<SWARM_END>>