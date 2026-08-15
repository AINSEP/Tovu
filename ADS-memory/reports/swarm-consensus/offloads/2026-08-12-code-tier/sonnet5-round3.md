ACK_PACKET_RECEIVED CTX-CODE-TIER-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

My R2 verdicts stand and I'm not reopening them — Round 2 converged 5/5, and this round's job is to build it, not re-litigate it:

- **Author or publisher CI builds; Tovu never runs the build.** The `worker_threads`-isn't-code-isolation argument that killed Option A kills Tovu-run builds too (`liquid-sandbox.ts:18-20`).
- **Two lifecycle axes on one theme, not two quality tiers:** *single-source* (declarative/templated/handlebars/static — edited file is served file) vs. *compiled* (source tree and generated tree can diverge). A compiled theme's SOURCE keeps full per-file reset and AI-authorability; only its GENERATED tree loses per-file granularity.
- **Web Components: islands only**, never whole-page — declarative shadow DOM fights `static-render.ts`'s document-level token injection.
- **React first**, Vue second, Angular last — sequencing, not exclusion.

What's new this round is the code, and one thing R2 never got concrete enough to test: the SEO constraint. R2's "dynamic content arrives through markers, not per-request execution" argument was about *content*. It says nothing about *islands*, and the owner is right that it needed to. I did the research below before writing any code, because the conformance rule I'm shipping (Leading Option, item 2) is directly downstream of the answer.

**The finding that shapes the code:** Googlebot fully executes JavaScript via an evergreen headless Chromium (Web Rendering Service), but on a **two-phase, delayed** schedule — initial HTML is indexed first, rendered content lands later, sometimes much later. Bingbot has only **partial** JS rendering. Every major AI crawler that actually feeds today's answer engines — GPTBot, ClaudeBot, PerplexityBot — **does not execute JavaScript at all** and sees only the initial server-rendered HTML. (Sources below.) That means: an island whose content is *empty in the server-rendered HTML and filled in by hydration* is invisible to the majority of traffic that matters for indexing, and even for Googlebot it's a multi-week regression, not a same-day one. The correct constraint isn't "no client JS" — it's **islands may only ADD interactivity on top of real, already-present server-rendered content; they may never be the mechanism that first-paints content.** That's Astro's own model (confirmed below: islands ship static HTML by default, `client:*` only strips-in JS, content exists in the HTML before hydration ever runs) — not a Tovu invention, an existing, provenanced best practice I'm adopting rather than designing from scratch.

I enforce this with a **build/install-time conformance rule** (Leading Option item 2, `checkBuiltThemeConformance`'s `island-content` check), not a lint an author can ignore and not a runtime check that would touch `static-render.ts`: any element carrying the new `data-tovu-island` marker must have non-empty text content in the raw HTML *as shipped*, before any script runs. A build that hydrates content into an empty mount point fails the install gate outright — the theme is never accepted into the catalog.

## Sources

- **Google's rendering pipeline (2-phase, evergreen Chromium):** [Google explains how crawling works in 2026 — Search Engine Land](https://searchengineland.com/google-explains-how-crawling-works-in-2026-473110); [How Googlebot Crawls, Renders, and Indexes JavaScript — EdgeComet](https://edgecomet.com/blog/how-googlebot-crawls-renders-and-indexes-javascript-a-developers-guide/). Confirmed: WRS runs an evergreen headless Chromium; indexing is two-phase (raw HTML first, rendered content queued separately, with real delay).
- **Non-Google crawlers don't execute JS:** [JavaScript Rendering and AI Crawlers: Can LLMs Read Your SPA? (2026) — getpassionfruit](https://www.getpassionfruit.com/blog/javascript-rendering-and-ai-crawlers-can-llms-read-your-spa); [Do AI Crawlers Render JavaScript? GPTBot, ClaudeBot, and Perplexity in 2026 — SearchOptimo](https://searchoptimo.com/blog/do-ai-crawlers-render-javascript). Confirmed: "Googlebot is the only major crawler with full JavaScript rendering support"; GPTBot/ClaudeBot/PerplexityBot see initial HTML only.
- **Bing partial rendering:** [Bing's Web Crawler Goes Evergreen, Improves JavaScript Crawling — Search Engine Journal](https://www.searchenginejournal.com/bings-web-crawler-goes-evergreen-improves-javascript-crawling/329667/); getpassionfruit (above). Confirmed: Bingbot renders JS but with limited/partial support, and ~92% of ChatGPT-agent queries route through Bing's index specifically, which amplifies the cost of an empty-until-hydrated island.
- **Astro islands ship real content, not empty mount points:** [Islands architecture — Astro Docs](https://docs.astro.build/en/concepts/islands/) (fetched directly). Confirmed verbatim: "Astro will automatically render every UI component to just HTML & CSS, stripping out all client-side JavaScript automatically"; island content exists in the server-rendered HTML, `client:*` directives only add interactivity on top of it. This is the precedent my `island-content` conformance rule formalizes as an enforced contract rather than a framework convention Tovu just hopes authors follow.
- **Next.js static export contract:** [Static Exports — Next.js docs](https://nextjs.org/docs/app/guides/static-exports) (fetched directly, `next` v16.3.0 docs, updated 2026-08-09). Confirmed: `output: 'export'` emits one HTML file per route into `out/` (e.g. `/out/blog/post-1.html`); Server Components render to static HTML at `next build` time; unsupported list includes ISR, Server Actions, Rewrites/Redirects/Headers, Proxy, cookies, dynamic params without `generateStaticParams()`. **What this means for "without ejecting":** since a route's JSX is author-written and rendered to literal HTML at build time, an author CAN emit our exact `<link rel="stylesheet" href="../css/styles.css" />` sentinel and `../css/`/`../js/` relative asset paths as literal markup in a supported static-export build — no fork/eject required, just author discipline (which is exactly what the conformance gate verifies rather than trusts).
- **Nuxt prerendering contract:** [`nuxt generate` — Nuxt Commands](https://nuxt.com/docs/4.x/api/commands/generate); [Prerendering — Nuxt](https://nuxt.com/docs/4.x/getting-started/prerendering) (search-result summary, not directly fetched — flagged as such). Reported: Nitro-based crawl-and-prerender to `.output/public`, same "author-controlled markup, no eject" shape as Next.
- **Angular prerendering contract:** [Build-time prerendering — Angular](https://v18.angular.dev/guide/prerendering/); [Server-side and hybrid-rendering — Angular](https://angular.dev/guide/ssr) (search-result summary, not directly fetched — flagged as such). Reported: `ng add @angular/ssr` plus `outputMode: 'static'` in `angular.json` prerenders every route to static HTML at build time. **Unverified but load-bearing for my sequencing recommendation:** Angular CLI's default build auto-injects and typically **hashes** the bundled `<link>`/`<script>` tags into `index.html` rather than an author hand-writing a literal relative href — I could not independently confirm from the fetched sources whether `outputHashing: none` is sufficient to guarantee our exact literal `../css/styles.css` sentinel survives, or whether Angular's build always rewrites asset paths to `/assets/...`-style absolute URLs incompatible with Tovu's `../css/`/`../js/`-relative convention regardless of hashing config. **This is a real gap, not a settled fact** — see What Would Change My Mind.
- **SQLite JSONB — reporting a contradiction I found, out of scope for my code but required to report loudly:** [`sqlite.org/json1.html`](https://sqlite.org/json1.html) (fetched directly) confirms the packet's quote verbatim: *"JSONB is a binary representation of JSON used by SQLite and is intended for internal use by SQLite only. Applications should not use JSONB outside of SQLite nor try to reverse-engineer the JSONB format."* But [`sqlite.org/jsonb.html`](https://sqlite.org/jsonb.html) (fetched directly, a **different**, separate SQLite doc page) states: *"JSONB is intended to be portable and backwards compatible for all future versions of SQLite... you should not have to export and reimport your SQLite database files when you upgrade to a newer SQLite version."* These two official SQLite pages read in tension: one discourages any application dependency on the byte format at all, the other commits to that same format's forward-compatibility. Neither claim in the packet's "Verified corrections" section is falsified by this — "don't use it outside SQL functions" and "the format itself won't break on upgrade" can both be true — but the packet's `npm update swaps the engine under stored rows` framing is stronger than either page states in isolation, and I flag this because the round's own rule is to report a contradiction the moment I find one, not to adjudicate whether it changes anyone's recommendation. This is a different debate track's topic (not code-tier); I'm not building against it.

## Solution Slate

**Ranking criteria, stated before ranking:** (a) does the design carry everything the packet's four deliverables require — `author`, a built-vs-authored discriminator, integrity hashes, source reference — in one place a loader can validate atomically, rather than splitting provenance across files that can drift out of sync; (b) does it preserve the existing ADR-020 `tier` vocabulary's meaning, since `manifest.tier` already gates real request-time branches (`loadStaticTierAssets`, the per-tier required-template checks in `loadTheme`, `theme_list`'s tier enum in `agent-tools.ts`); (c) blast radius on request-time code — Round 2 was unanimous that nothing should touch `static-render.ts` this pass; (d) implementation cost.

1. **A structured `build` object on `ThemeManifest`, orthogonal to `tier`** (source, framework, sourceDir, builderVersion, lockfileHash, artifactHashes — all in `theme.json`, parsed by `theme.ts`). **Leading.** Wins (a) outright — one field, one loader, one place to validate hash-vs-provenance consistency. Wins (b) — `tier` keeps meaning exactly what it means today; `code` stays reserved for its documented, different meaning (trusted signed-plugin JS, still not built). Wins (c) — nothing in `static-render.ts` or any `manifest.tier === "static"` branch changes; every new branch is on `manifest.build`, a field that is `undefined` for all 7 live themes today (zero-migration). **Genuine sacrifice:** the biggest manifest/parsing diff of the three options — a new type, a new parse function, and new validation branches in `loadTheme`, versus a one-line boolean.

2. **Overload `tier` itself** — either add a sixth `ThemeTier` value, or repurpose the already-reserved-but-undefined `"code"` value to mean "compiled-to-static." Reject. Fails (b) directly: `code`'s doc comment already defines it as "trusted signed-plugin JS (not built yet)" — a different, still-unbuilt runtime capability the Owner's settled decisions don't touch (Agent Plugins stays out of the first-party runtime, unrelated to this). Redefining it here would silently retarget a name every future reader of `theme.ts:31` has to re-learn. Fails (c) hardest of the three: `tier` is read at request time by `loadStaticTierAssets`, by the per-tier required-template branch in `loadTheme` (`theme.ts:603-613`), and by `isEligibleForTemplateBranch`/`renderViaTemplate` in `pages.ts` — every one of those would need a new branch for a compile-provenance fact none of them actually need to know, since a compiled theme's *runtime* behavior is byte-identical to an authored `static` theme's. **Sacrifice:** trades a clean orthogonal fact for permanently blurring a vocabulary every hot-path reader already depends on.
3. **A bare `prebuilt: true` boolean**, no structured metadata (the shape Gemini-3.6-flash-high's R2 proposed). Reject as leading, viable as a v0. Fails (a): the packet explicitly requires integrity hashes and a source reference as part of *this* deliverable — a boolean has nowhere to carry them, so every consumer (editor UI read-only gating, the reset logic, the conformance CLI) needs a *second*, separately-versioned file to carry what a single structured field already carries for free — the exact "duplicated logic regresses" trap `theme.ts`'s own `templates` field doc already names for a different field. **Sacrifice:** cheapest to ship, but only defers the real schema question to a second artifact that then has to be kept in sync with the first, by hand, forever.

**Recommendation: Option 1.** **Cheapest falsifying test:** wire one reference React theme through a real `astro build` (or `vite-ssg`) targeting Tovu's literal contract, then run `checkBuiltThemeConformance` (Leading Option, below) against the real output, not a hand-written HTML fixture. If a real bundler's default output fails the stylesheet-sentinel or asset-prefix rule even after reasonable author-side config, the conformance gate — not the manifest shape — needs rework before anyone ships a reference theme. That's one build and one CLI run; it doesn't require touching `static-render.ts`, a server, or another participant's code to falsify.

## Leading Option — Code

### 1. Theme manifest: `author`, the built-vs-authored discriminator, integrity hashes, source reference

`theme.json` shape for a compiled theme (every field new; a theme that declares none of them, all 7 live themes today, is byte-identical to before):

```json
{
  "id": "aurora-react",
  "name": "Aurora",
  "version": "1.0.0",
  "tier": "static",
  "author": "Aurora Themes Co.",
  "build": {
    "source": "compiled",
    "framework": "react",
    "sourceDir": "src",
    "builderVersion": "astro@4.15.2",
    "lockfileHash": "sha256-9f2c...",
    "artifactHashes": {
      "pages/index.html": "sha256-1a2b...",
      "pages/pricing.html": "sha256-3c4d...",
      "css/styles.css": "sha256-5e6f...",
      "js/main.js": "sha256-7g8h..."
    }
  },
  "pages": ["index", "pricing"],
  "modes": ["dark"],
  "defaultMode": "dark"
}
```

`theme.ts` changes — new type, parser, manifest fields, and validation, none of it touching the request path:

```ts
// theme.ts — additions

/**
 * ADR-020 §5 (code-tier authoring, 2026-08-12) — provenance for a theme whose `pages/`, `css/`, `js/`
 * were produced by a framework build rather than authored directly. Absent ⇒ this theme is `authored`
 * (every theme on disk today), unchanged from before this field existed: full per-file edit/reset/
 * AI-authorability.
 *
 * Deliberately NOT a {@link ThemeTier} value — see this field's own parse-site comment in {@link
 * loadTheme} for why conflating "what must the server render this as" with "how did the static output
 * come to exist" was rejected (Solution Slate, option 2).
 */
export interface ThemeBuildInfo {
  source: "authored" | "compiled";
  /** `compiled` only. Purely descriptive — nothing in Tovu's server branches on this value. */
  framework?: "react" | "vue" | "angular";
  /**
   * `compiled` only — the authored source tree's root, relative to the theme folder (e.g. `"src"`).
   * Everything under this path resets per-file, exactly like an authored theme's files do today;
   * everything OUTSIDE it is this build's generated output and resets only as a whole tree — see
   * {@link resolveResetUnit} (`theme-reset.ts`). Required when `source: "compiled"`.
   */
  sourceDir?: string;
  /** `compiled` only — the tool and version that produced the artifact (e.g. `"astro@4.15.2"`),
   * recorded for support/reproducibility. Never parsed or version-checked by Tovu. */
  builderVersion?: string;
  /** `compiled` only — sha256 of the lockfile the build ran against. Provenance only; Tovu never
   * reads the lockfile's contents. */
  lockfileHash?: string;
  /**
   * `compiled` only — sha256 (hex) of every generated file's bytes, keyed by path relative to the
   * theme folder, covering every file OUTSIDE {@link sourceDir}. Verified against the real files on
   * disk by {@link checkBuiltThemeConformance} (`build-conformance.ts`) before a package is accepted
   * into the catalog — this is what backs "read-only, versioned, provenance-shown," not a UI label.
   */
  artifactHashes?: Record<string, string>;
}

function parseThemeBuildInfo(value: JsonValue | undefined): ThemeBuildInfo | undefined {
  if (!isObject(value)) return undefined;
  const source = value.source === "compiled" ? "compiled" : "authored";
  const framework =
    value.framework === "react" || value.framework === "vue" || value.framework === "angular"
      ? value.framework
      : undefined;
  const sourceDir = typeof value.sourceDir === "string" ? value.sourceDir.replace(/\/+$/, "") : undefined;
  const builderVersion = typeof value.builderVersion === "string" ? value.builderVersion : undefined;
  const lockfileHash = typeof value.lockfileHash === "string" ? value.lockfileHash : undefined;
  const artifactHashes = isObject(value.artifactHashes)
    ? Object.fromEntries(
        Object.entries(value.artifactHashes)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      )
    : undefined;
  return {
    source,
    ...(framework ? { framework } : {}),
    ...(sourceDir ? { sourceDir } : {}),
    ...(builderVersion ? { builderVersion } : {}),
    ...(lockfileHash ? { lockfileHash } : {}),
    ...(artifactHashes ? { artifactHashes } : {}),
  };
}
```

`ThemeManifest` interface additions and the `loadTheme` call-site changes (shown as the surrounding context that changes, matching the real function shape at `theme.ts:486-528`):

```ts
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  tier: ThemeTier;
  /** New, 2026-08-12 — free-text credit, e.g. "Aurora Themes Co." Absent today for every theme;
   * `theme.ts` never parsed this field before this change, and no live theme declares one. */
  author?: string;
  /** New, 2026-08-12 — see {@link ThemeBuildInfo}'s own doc. */
  build?: ThemeBuildInfo;
  // ...existing fields unchanged (class, engine, description, fonts, regions, skipLiquidAllowlist,
  // templates, modes, defaultMode, slots)...
}
```

```ts
// Inside loadTheme's existing manifest try block (theme.ts:494-528), two lines added to the object
// literal and one new validation block added after it — everything else in that function is
// unchanged:
manifest = {
  id: String(raw.id ?? id),
  name: String(raw.name ?? id),
  version: String(raw.version ?? "0.0.0"),
  tier: parseTier(raw.tier),
  author: typeof raw.author === "string" ? raw.author : undefined,
  build: parseThemeBuildInfo(raw.build),
  engine: typeof raw.engine === "number" ? raw.engine : 1,
  // ...unchanged fields...
};
if (manifest.id !== id) errors.push(`theme.json id '${manifest.id}' must equal folder name '${id}'`);
// New: a compiled theme with no sourceDir/artifactHashes is a theme claiming provenance it hasn't
// actually recorded — fail it the same way an unlisted defaultMode already fails (see the very next
// existing check in this function), not a silent "trust it" default.
if (manifest.build?.source === "compiled") {
  if (!manifest.build.sourceDir) {
    errors.push("theme.json build.sourceDir is required when build.source is 'compiled'");
  }
  if (!manifest.build.artifactHashes || Object.keys(manifest.build.artifactHashes).length === 0) {
    errors.push("theme.json build.artifactHashes is required when build.source is 'compiled'");
  }
}
```

### 2. The conformance check

New file, `src/features/theme/build-conformance.ts` — an **install/build-accept gate**, never called from the request path. It never touches `static-render.ts`; it independently re-derives the same three anchors that file depends on and fails the *install*, not the render, when they're absent. This is what item 4.1's "artifact integrity hashes" and the packet's SEO constraint both cash out to in code:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DiscoveredTheme } from "./theme";

/** The exact literal anchor `renderStaticPage` (`static-render.ts:402-406`) string-matches to inject
 * design tokens. A build that reorders attributes, changes quoting, or hashes the stylesheet filename
 * makes token injection silently no-op — the page renders with no error and no design tokens. */
const STYLESHEET_SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

/**
 * Islands must carry real, non-empty server-rendered content — see the SEO research in this
 * response's Sources section: non-Google crawlers never execute JS at all, Bingbot's support is
 * partial, and even Googlebot's rendered-content indexing is a delayed second pass. `data-tovu-island`
 * is a NEW, Tovu-namespaced attribute, deliberately distinct from the `data-embed-config` marker
 * vocabulary (`core/embeds/marker.ts`): an embed marker is resolved by the SERVER at request time
 * (`{"type":"content"}`/`"menu"`/`"partial"`), an island is resolved by the BUILD at compile time and
 * the server never touches it — reusing the embed vocabulary here would misstate which layer owns it.
 */
const ISLAND_PATTERN = /<([a-z][a-z0-9-]*)\b[^>]*\bdata-tovu-island\b[^>]*>([\s\S]*?)<\/\1>/gi;

export type ConformanceRule = "stylesheet-sentinel" | "asset-prefix" | "artifact-hash" | "island-content";

export interface ConformanceIssue {
  readonly page: string;
  readonly rule: ConformanceRule;
  readonly message: string;
}

export interface ConformanceResult {
  readonly ok: boolean;
  readonly issues: readonly ConformanceIssue[];
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function checkStylesheetSentinel(pageId: string, html: string): ConformanceIssue[] {
  const count = countOccurrences(html, STYLESHEET_SENTINEL);
  if (count === 1) return [];
  return [
    {
      page: pageId,
      rule: "stylesheet-sentinel",
      message:
        count === 0
          ? `missing the exact stylesheet tag ${JSON.stringify(STYLESHEET_SENTINEL)} — token injection (static-render.ts:402-406) will silently no-op and this page will ship with no design tokens`
          : `found the stylesheet tag ${count} times — token injection replaces only the FIRST match, later duplicates get no tokens`,
    },
  ];
}

function checkAssetPrefixes(pageId: string, html: string): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  // Any stylesheet/script reference that ISN'T the required relative form is exactly the failure mode
  // static-render.ts:31-35 can't catch: it only rewrites what matches, and silently passes everything
  // else through unrewritten (a 404 on the live site, not an error at build/install time).
  const styleHrefs = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href="([^"]*)"/gi)].map((m) => m[1]);
  for (const href of styleHrefs) {
    if (!href.startsWith("../css/")) {
      issues.push({
        page: pageId,
        rule: "asset-prefix",
        message: `stylesheet href "${href}" does not use the required 'href="../css/…"' form; the live asset rewrite (static-render.ts:31-35) will not touch it and it will 404`,
      });
    }
  }
  const scriptSrcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]*)"/gi)].map((m) => m[1]);
  for (const src of scriptSrcs) {
    if (!src.startsWith("../js/")) {
      issues.push({
        page: pageId,
        rule: "asset-prefix",
        message: `script src "${src}" does not use the required 'src="../js/…"' form; it will 404 on the live site`,
      });
    }
  }
  return issues;
}

function checkIslandContent(pageId: string, html: string): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  for (const match of html.matchAll(ISLAND_PATTERN)) {
    const inner = match[2].replace(/<[^>]*>/g, "").trim();
    if (inner.length === 0) {
      issues.push({
        page: pageId,
        rule: "island-content",
        message:
          "an interactive island has no server-rendered text content — non-Google crawlers do not execute JavaScript at all and Bingbot's support is partial, so a hydrate-to-fill island is invisible to most indexing traffic; islands must render real content server-side and hydrate for interactivity only",
      });
    }
  }
  return issues;
}

function checkArtifactHashes(theme: DiscoveredTheme): ConformanceIssue[] {
  const hashes = theme.manifest.build?.artifactHashes ?? {};
  const issues: ConformanceIssue[] = [];
  for (const [relativePath, expected] of Object.entries(hashes)) {
    const absolute = join(theme.dir, relativePath);
    let actual: string;
    try {
      actual = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    } catch {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `build.artifactHashes references '${relativePath}', which does not exist on disk`,
      });
      continue;
    }
    if (actual !== expected.replace(/^sha256-/, "")) {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `'${relativePath}' does not match its recorded hash — modified after the build recorded build.artifactHashes`,
      });
    }
  }
  return issues;
}

/**
 * The install/build-accept gate a compiled theme's artifact must pass BEFORE it is copied into
 * `THEME_CATALOG_DIR` or a live tier folder. Never called from the request path — `static-render.ts`
 * is unmodified by this change, per Round 2's unanimous verdict not to touch the file serving 100% of
 * live traffic for a tier with zero shipped themes.
 */
export function checkBuiltThemeConformance(
  required: { theme: DiscoveredTheme },
  _optional: Record<string, never> = {}
): ConformanceResult {
  const { theme } = required;
  const issues: ConformanceIssue[] = [];

  for (const [pageId, html] of Object.entries(theme.pages)) {
    issues.push(...checkStylesheetSentinel(pageId, html));
    issues.push(...checkAssetPrefixes(pageId, html));
    issues.push(...checkIslandContent(pageId, html));
  }
  if (theme.manifest.build?.source === "compiled") {
    issues.push(...checkArtifactHashes(theme));
  }

  return { ok: issues.length === 0, issues };
}
```

### 3. `parseTier` failing closed

```ts
// theme.ts — replaces the existing parseTier (theme.ts:249-252)

/**
 * Thrown by {@link parseTier} for a PRESENT-but-unrecognized tier value — distinct from "absent",
 * which still defaults to `declarative` (this field's own doc: "Absent in theme.json ⇒ declarative",
 * unchanged). Must be thrown from INSIDE loadTheme's existing manifest try/catch (the same one
 * `theme.json is not an object` already throws into) — see this class's use site below for why moving
 * it outside would trade "the one bad theme is invalid" for "the whole catalog fails to load," which
 * is exactly the SPEC-004 REQ-10 contract loadTheme's own docstring exists to prevent
 * (`discoverThemes`'s `.map()` has no per-entry try/catch of its own).
 */
export class UnknownThemeTierError extends Error {
  constructor(rawValue: unknown) {
    super(
      `theme.json tier ${JSON.stringify(rawValue)} is not a recognized tier (${THEME_TIERS.join(", ")})`
    );
    this.name = "UnknownThemeTierError";
  }
}

function parseTier(value: JsonValue | undefined): ThemeTier {
  if (value === undefined) return "declarative";
  if (typeof value === "string" && (THEME_TIERS as readonly string[]).includes(value)) {
    return value as ThemeTier;
  }
  throw new UnknownThemeTierError(value);
}
```

No other line in `loadTheme` needs to change for this: `parseTier(raw.tier)` is already called at `theme.ts:502`, already inside the try block that ends in `catch (err) { errors.push(...) }` (`theme.ts:526-528`). The throw is caught exactly where `theme.json is not an object` is caught today; `manifest` falls back to the `empty` sentinel (`tier: "declarative"`, itself never asserted `valid`), `errors` gets a message naming the *real* problem, and `status` becomes `"invalid"` — one bad theme, invalid, with a clear reason; every other theme in `discoverThemes`'s scan is untouched.

### 4. Per-file reset for a built release

New file, `src/features/theme/theme-reset.ts`:

```ts
import { cpSync, copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { THEME_CATALOG_DIR, type ThemeManifest, type ThemeTier } from "./theme";
import { resolveThemeFilePath, ThemePathError } from "./theme-files";

export type ThemeFileResetUnit =
  | { readonly kind: "file"; readonly relativePath: string }
  | { readonly kind: "whole-tree" };

/**
 * Whether `relativePath` resets per-file (like every theme resets today) or only as a whole-tree
 * operation — the split Round 2 converged on: a compiled theme's SOURCE (its `build.sourceDir`) has
 * no cross-file desync risk an editable TSX/SFC file doesn't already have on its own, so it keeps
 * today's per-file contract unchanged. Its GENERATED output can desync internally (one `pages/*.html`
 * restored in isolation from the `components.js` bundle the same build emitted), so it resets only as
 * one atomic unit. An authored (non-compiled) theme — every theme on disk today — has no generated
 * tree at all and always resets per-file, unchanged.
 */
export function resolveResetUnit(
  required: { manifest: Pick<ThemeManifest, "build">; relativePath: string },
  _optional: Record<string, never> = {}
): ThemeFileResetUnit {
  const { manifest, relativePath } = required;
  if (manifest.build?.source !== "compiled" || !manifest.build.sourceDir) {
    return { kind: "file", relativePath };
  }
  const sourceDir = manifest.build.sourceDir;
  const normalized = relativePath.split(/[\\/]/).join("/");
  const insideSource = normalized === sourceDir || normalized.startsWith(`${sourceDir}/`);
  // theme.json itself is always per-file: it's the one file every compiled theme needs to keep
  // editing (author, lineage) without touching generated output at all.
  return insideSource || normalized === "theme.json" ? { kind: "file", relativePath } : { kind: "whole-tree" };
}

/** `themeDir`'s paired catalog original — the SAME `<tier>/<id>` pairing `downloadMarketplaceTheme`
 * (`marketplace.ts:257-274`) already writes at install time. Computed, not stored: it's a pure
 * function of `themesRoot`/`tier`/`id`, and storing it would be a second copy to keep in sync. */
function catalogDirFor(required: { themesRoot: string; tier: ThemeTier; id: string }): string {
  return join(required.themesRoot, THEME_CATALOG_DIR, required.tier, required.id);
}

/**
 * Restore ONE file to its pristine catalog contents. Valid only for a `{ kind: "file" }` unit — see
 * {@link resolveResetUnit}. Calling this on a path that function classifies `whole-tree` would restore
 * one generated file out of sync with the rest of the same build's output.
 */
export function resetThemeFile(
  required: { themeDir: string; themesRoot: string; tier: ThemeTier; id: string; relativePath: string },
  _optional: Record<string, never> = {}
): string {
  const { themeDir, themesRoot, tier, id, relativePath } = required;
  const catalogDir = catalogDirFor({ themesRoot, tier, id });
  const catalogRoot = join(themesRoot, THEME_CATALOG_DIR);
  const source = resolveThemeFilePath({ themeDir: catalogDir, themesRoot: catalogRoot, relativePath });
  const dest = resolveThemeFilePath({ themeDir, themesRoot, relativePath });
  if (!existsSync(source)) {
    throw new ThemePathError(`catalog has no pristine copy of '${relativePath}' to restore from`);
  }
  copyFileSync(source, dest);
  return dest;
}

/**
 * Restore an ENTIRE generated tree from its catalog original, atomically as one unit — the only reset
 * {@link resolveResetUnit} permits outside a compiled theme's `build.sourceDir`. Deletes and recopies
 * rather than diffing: a build's generated output has no meaningful "which files changed" question at
 * the reset boundary, since the whole tree is one build's single, indivisible output.
 */
export function resetGeneratedTree(
  required: { themeDir: string; themesRoot: string; tier: ThemeTier; id: string; manifest: Pick<ThemeManifest, "build"> },
  _optional: Record<string, never> = {}
): void {
  const { themeDir, themesRoot, tier, id, manifest } = required;
  if (manifest.build?.source !== "compiled" || !manifest.build.sourceDir) {
    throw new ThemePathError("resetGeneratedTree is only valid for a compiled theme with build.sourceDir set");
  }
  const sourceDir = manifest.build.sourceDir;
  const catalogDir = catalogDirFor({ themesRoot, tier, id });
  if (!existsSync(catalogDir)) throw new ThemePathError(`no catalog original found for '${id}'`);

  const isGenerated = (absolutePath: string): boolean => {
    const rel = relative(themeDir, absolutePath).split(sep).join("/");
    return rel !== sourceDir && !rel.startsWith(`${sourceDir}/`) && rel !== "theme.json";
  };

  for (const entry of readdirSync(themeDir)) {
    const full = join(themeDir, entry);
    if (isGenerated(full)) rmSync(full, { recursive: true, force: true });
  }
  cpSync(catalogDir, themeDir, {
    recursive: true,
    filter: (candidate) => {
      const rel = relative(catalogDir, candidate).split(sep).join("/");
      if (rel === "") return true; // the root itself
      const asThemeRelative = join(themeDir, rel);
      return isGenerated(asThemeRelative);
    },
  });
}
```

### Tests (`src/features/theme/theme-tier-r3.test.ts`, `node --import tsx --test`)

```ts
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverThemes, loadTheme, UnknownThemeTierError } from "./theme";
import { checkBuiltThemeConformance } from "./build-conformance";
import { resolveResetUnit } from "./theme-reset";

function makeStaticTheme(dir: string, overrides: Record<string, unknown> = {}): void {
  mkdirSync(join(dir, "pages"), { recursive: true });
  mkdirSync(join(dir, "css"), { recursive: true });
  writeFileSync(
    join(dir, "theme.json"),
    JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "static", ...overrides })
  );
  writeFileSync(join(dir, "tokens.json"), "{}");
}

test("parseTier fails ONE theme closed without breaking discovery of its siblings", () => {
  const root = mkdtempSync(join(tmpdir(), "tovu-theme-"));
  try {
    const bad = join(root, "bad");
    mkdirSync(bad, { recursive: true });
    makeStaticTheme(bad, { id: "bad", tier: "code-unreleased" }); // not a recognized ThemeTier

    const good = join(root, "good");
    mkdirSync(good, { recursive: true });
    makeStaticTheme(good, { id: "good" });
    writeFileSync(join(good, "pages", "index.html"), '<div data-embed-config=\'{"type":"content"}\'></div>');

    const themes = discoverThemes({ dir: root, source: "site" });
    assert.equal(themes.length, 2);

    const badTheme = themes.find((t) => t.manifest.id === "bad")!;
    assert.equal(badTheme.status, "invalid");
    assert.ok(badTheme.errors.some((e) => e.includes("code-unreleased")));

    const goodTheme = themes.find((t) => t.manifest.id === "good")!;
    assert.equal(goodTheme.status, "valid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseTier still defaults ABSENT tier to declarative, unchanged", () => {
  const root = mkdtempSync(join(tmpdir(), "tovu-theme-"));
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "theme.json"), JSON.stringify({ id: "x", name: "X", version: "1.0.0" }));
    writeFileSync(join(root, "tokens.json"), "{}");
    const theme = loadTheme({ themeDir: root, id: "x", source: "site" });
    assert.equal(theme.manifest.tier, "declarative");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkBuiltThemeConformance fails a build that dropped the stylesheet sentinel", () => {
  const theme = {
    dir: "/nonexistent",
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "static" as const, engine: 1 },
    pages: { index: '<html><link rel="stylesheet" href="../assets/main-abc123.css" /></html>' },
  } as Parameters<typeof checkBuiltThemeConformance>[0]["theme"];
  const result = checkBuiltThemeConformance({ theme });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.rule === "stylesheet-sentinel"));
});

test("checkBuiltThemeConformance fails an island with no server-rendered content", () => {
  const theme = {
    dir: "/nonexistent",
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "static" as const, engine: 1 },
    pages: {
      index:
        '<html><link rel="stylesheet" href="../css/styles.css" />' +
        '<cart-widget data-tovu-island="cart"></cart-widget></html>',
    },
  } as Parameters<typeof checkBuiltThemeConformance>[0]["theme"];
  const result = checkBuiltThemeConformance({ theme });
  assert.ok(result.issues.some((i) => i.rule === "island-content"));
});

test("resolveResetUnit: source files reset per-file, generated files reset whole-tree", () => {
  const manifest = { build: { source: "compiled" as const, sourceDir: "src" } };
  assert.deepEqual(resolveResetUnit({ manifest, relativePath: "src/Header.tsx" }), {
    kind: "file",
    relativePath: "src/Header.tsx",
  });
  assert.deepEqual(resolveResetUnit({ manifest, relativePath: "pages/index.html" }), { kind: "whole-tree" });
  assert.deepEqual(resolveResetUnit({ manifest, relativePath: "theme.json" }), {
    kind: "file",
    relativePath: "theme.json",
  });
});

test("resolveResetUnit: an authored (non-compiled) theme always resets per-file", () => {
  assert.deepEqual(resolveResetUnit({ manifest: {}, relativePath: "pages/index.html" }), {
    kind: "file",
    relativePath: "pages/index.html",
  });
});
```

## Critique Of Another Participant's Round 2 Code

Rereading the appendix before writing this: **Debate 1's Round 2 was converge-only for every participant, including Primary — none of the five R2 responses above contain a single line of compilable code.** That's different from the packet's own worked example (the `EgressPolicy`/`allowedHosts` compile error), which the "Verified corrections" section shows came from a different debate track this session ran, not from this one's appendix. I'm not going to manufacture a code snippet someone didn't write and then critique the snippet I invented — that would misattribute. What I *can* do, and what the round asks for in spirit, is take a specific, named, R2 design claim and show that implementing it literally against the real contracts breaks — which is exactly what I found while designing item 4 above.

**Gemini-3.6-flash-high, R2, "Remaining Disagreements #2, AI-Authorability":** *"For built themes, `theme_write_file` operates strictly on source files (`src/*`). Writing a source file updates disk state and returns a structured status..."*

`src/*` is a literal, hardcoded path prefix. Nothing in `theme.json`'s real schema (before or after this response) guarantees a compiled theme's source lives under a folder literally named `src` — Next.js's own convention is `app/`, an Astro theme's authored components might sit under `components/`, a Vue project might use `source/`. Implemented as stated, this gate has two failure directions, both real: (1) a compiled theme whose author names their source folder anything other than `src` gets **every** source file locked read-only forever — `theme_write_file` would reject legitimate source edits it's supposed to allow, silently regressing AI-authorability for exactly the population this design exists to serve; (2) if the check is a loose prefix match rather than an exact segment match (the same class of bug `theme-files.ts:32-36`'s own doc warns about for path containment — "a sibling directory whose name extends the base's"), a generated folder that happens to be named `src-legacy/` or similar would slip through as "source" and become writable, which is the opposite of the built-tree's read-only contract this same paragraph is trying to establish.

My `build.sourceDir` field (Leading Option, item 1) exists specifically to close this gap: `resolveResetUnit` reads the author-declared source root from the manifest rather than assuming a filename convention, so the split works for a `src/` theme, a `components/` theme, or anything else an author names — and it composes with an exact-segment check (`normalized === sourceDir || normalized.startsWith(sourceDir + "/")`), not a bare string prefix, avoiding failure direction (2) as well.

The same root cause — no explicit `sourceDir` in anyone's R2 proposal — shows up a second time in **Gemini-3.1-pro-high's R2, "Remaining Disagreements #3":** *"Reset must become an atomic, whole-theme artifact restoration."* Read literally, "whole-theme" (not "whole generated-tree") means even a compiled theme's SOURCE files — which, per that same participant's own point 2 two lines earlier, are supposed to remain marketplace-provenance/editable — would lose per-file reset too, for no reason: an author's `Header.tsx` and `Footer.tsx` have no cross-file desync risk with each other the way a compiled `pages/index.html` and its `components.js` bundle do. Without a declared `sourceDir` to draw the line, "atomic whole-theme" is the only boundary available, and it over-restricts the one part of a compiled theme (its source) that R2 unanimously agreed should keep today's capabilities.

## What Would Change My Mind

- **Angular's asset-hashing default, verified against its real build output** (flagged as unconfirmed in Sources): if `ng build` with `outputMode: 'static'` cannot be configured to emit the literal, unhashed `../css/styles.css` relative form — because its CLI always rewrites to `/assets/`-absolute, hashed paths regardless of `outputHashing` settings — that's a harder engineering gap than "heavier compiler," and I'd move Angular from "ships last" to "needs either a documented author-side `index.html` post-process step or provisional exclusion until one exists," not just slower sequencing.
- **Empirical conformance failures against real bundler output** (the falsifying test in the Solution Slate): if a real `astro build`/`vite-ssg` run against a reference theme fails `checkBuiltThemeConformance` even after reasonable author configuration, the fix belongs in the conformance tooling or author guidance, not in `static-render.ts` — Round 2's "don't touch the hot path" verdict holds regardless of what this test finds, but which framework ships first could change.
- **A demonstrated real desync inside a compiled theme's SOURCE tree** — e.g., two `.tsx` files that must be edited together to stay valid (a shared prop-types file, a generated-from-source index) — would mean `resolveResetUnit`'s "source always resets per-file" is too permissive, and some sources need whole-tree treatment too, not just generated output. I have no evidence this exists today; if it does, the reset-unit boundary needs a third state, not just source-vs-generated.
- **A build sandbox that ships as its own audited deliverable** (carried from R2, unchanged) would still flip the build-lifecycle verdict, though it doesn't change any code in this response — everything here is designed to be equally correct whether Tovu or the author runs the build, since `checkBuiltThemeConformance` validates the *artifact*, not who produced it.

<<SWARM_END>>
