import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import type { JsonObject, JsonValue } from "@jini-ai/cms/core";
import { lintHandlebarsTemplate } from "./handlebars-allowlist";
import { lintLiquidTemplate } from "./liquid-allowlist";

/**
 * @file Declarative theme package format + discovery (SPEC-004, spike slice).
 *
 * Purpose:
 * A theme is a folder of validated *data* — no executable code. This module
 * defines the on-disk shape, discovers theme folders, and resolves a route to a
 * template id. The template-tree renderer (`server/http/site/render.ts`) turns
 * the resolved block tree into HTML.
 *
 * Spike scope (VibeCoder): discovery + a shallow validity check (required files
 * parse). The full SPEC-004 validation pipeline (CSS sanitization allowlist,
 * component-reference checks, size caps, id-collision rules) is deferred to the
 * proper SPEC-004 build. Treat this as exploratory, not test-certified.
 */

/**
 * ADR-020 capability tier. `declarative` = data-only (safe from anyone),
 * `templated` = LiquidJS-rendered (sandboxed logic, no JS), `handlebars` =
 * Handlebars-rendered (sandboxed logic, no JS — a sibling of `templated` with
 * its own allowlist/worker pair, not a replacement for it), `static` = plain
 * HTML/CSS/JS, no template language at all — every byte editable, a whole
 * `pages/*.html` set instead of one `templates/` route map (see `pages` on
 * {@link DiscoveredTheme}), `code` = trusted signed-plugin JS (not built yet).
 * Absent in `theme.json` ⇒ `declarative`.
 */
export type ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";

const THEME_TIERS: readonly ThemeTier[] = ["declarative", "templated", "handlebars", "static", "code"];

/** `theme.json` — static theme identity. */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  /** ADR-020 capability tier (defaults to `declarative` when omitted). */
  tier: ThemeTier;
  /** Legacy pre-ADR-020 field; retained for back-compat, superseded by `tier`. */
  class?: "declarative";
  engine: number;
  description?: string;
  /**
   * Optional Google Fonts family specs the page shell loads for this theme,
   * e.g. "Fraunces:opsz,wght@9..144,400;9..144,600". Spike-only convenience;
   * SPEC-004 CSS sanitization forbids external font @import in theme CSS, so
   * fonts live in the manifest, not the stylesheet.
   */
  fonts?: string[];
  /**
   * SPEC-043/ADR-047 §2a — the region keys (e.g. `["header","footer"]`) this theme declares for
   * widget placement, the same way it already declares templates/slots. Additive, optional field:
   * absent/undefined means "no declared regions" (unchanged behavior for every existing `theme.json`
   * on disk today — no back-compat migration needed). `resolvePageWidgets`'s `resolvedRegions` input
   * (`src/widgets/resolver-service.ts`) is sourced directly from this field at render time
   * (`server/http/site/render.ts::renderSite`) — this fulfills what ADR-047 §2a's own framing already
   * assumed existed ("themes declare region keys the same way they already declare template
   * slots/regions") rather than a hardcoded core constant.
   */
  regions?: string[];
  /**
   * Opt-out of the ADR-020 §3 Liquid tag/filter allowlist (`liquid-allowlist.ts`) for this theme's
   * `.liquid` templates. Absent/`false` (default) keeps the existing enforced behavior — every
   * theme on disk today is unaffected, no migration needed. A theme author sets this to `true` when
   * they want fuller Liquid (e.g. `include`/`render` or a wider filter set) and accepts the theme is
   * then a first-party/trusted artifact, not something to hand an untrusted third party — the
   * runtime's independent layers (worker isolation, `NO_ACCESS_FS` filesystem lockdown, memory/
   * render/parse limits — `liquid-worker.ts`) still apply regardless of this flag; only the
   * allowlist's own pre-flight lint is skipped.
   *
   * Liquid-only by name and by effect: the `handlebars` tier has NO equivalent opt-out, and that
   * asymmetry is deliberate rather than an omission. Liquid's excluded surface is mostly
   * capability breadth (a wider filter set, `include`/`render`), so "I accept this theme is a
   * first-party artifact" is a coherent trade. The Handlebars allowlist's three headline refusals
   * — raw `{{{output}}}`, partials, and decorators — are not breadth; they are the tier's XSS seam
   * and its two documented routes from template text into the compiler's own object graph (see
   * `handlebars-allowlist.ts`). There is no theme whose convenience justifies re-opening those, so
   * the flag simply does not apply to `.hbs`/`.handlebars` files.
   */
  skipLiquidAllowlist?: boolean;
  /**
   * `static` tier only — the ordered list of `pages/*.html` filenames (e.g. `["blog-post.html",
   * "blog-post-v2.html"]`) an author can pick between when a Post uses this theme, "ordered to nudge
   * the right choice" (first entry is the implicit default in the admin picker). Absent/undefined
   * means this theme ships no post templates — a Post's `templateChoice` then has nothing to resolve
   * against, which the render path treats as "misconfigured", not "fall back to generic rendering"
   * (see `pages.ts`'s post-template branch).
   */
  postTemplate?: string[];
  /**
   * `static` tier only — the color modes this theme ships token sets for, e.g. `["dark", "light"]`.
   * A mode name is just the value written into the page's root `data-theme` attribute, which is the
   * selector `tokensToRootCss` (`static-render.ts`) already emits its `tokens.light.json` override
   * block under (`:root[data-theme="light"]`). Absent/undefined means the theme declares nothing, and
   * {@link renderStaticPage} then emits no `data-theme` at all — the pre-2026-08-10 behavior, where
   * the base `:root` block always won because no attribute existed for an override block to match.
   */
  modes?: string[];
  /**
   * `static` tier only — which of {@link modes} a freshly-served page starts in. Emitted as
   * `data-theme="<defaultMode>"` on the page's `<html>` element, so it selects between the token
   * blocks above. A theme wanting a user-flippable toggle owns that itself: static themes are plain
   * HTML/JS, so their own script sets `document.documentElement.dataset.theme`, and the engine's job
   * ends at establishing the initial value. Declaring a `defaultMode` outside `modes` is a manifest
   * error (the theme loads `invalid` with a message), not a silent fallback.
   */
  defaultMode?: string;
  /**
   * `static` tier only — the `data-tovu-slot="<key>"` markers this theme's pages embed, mapped to the
   * root partial file each one pulls in. Read by `resolveSlots` (`static-render.ts`); before this was
   * wired, that function hardcoded exactly the `nav`/`footer` pair every theme on disk happens to
   * declare, so the field was authored but never parsed. {@link DEFAULT_THEME_SLOTS} reproduces that
   * hardcoded pair for a theme that declares no `slots`, which is why wiring this changed no existing
   * theme's output.
   */
  slots?: Record<string, ThemeSlotDescriptor>;
}

/** One entry of {@link ThemeManifest.slots}. */
export interface ThemeSlotDescriptor {
  /** Root partial filename this slot renders, e.g. `nav.html`. */
  source: string;
  /**
   * Name of the attribute on the *marker* element carrying the current page id (e.g.
   * `data-nav-current`). When present, the anchor inside the partial whose `data-nav-id` equals that
   * value gets `aria-current="page"`. `data-nav-id` is the fixed anchor-side half of the convention;
   * only the marker-side attribute name is configurable, because that is the only half themes vary.
   */
  activeAttr?: string;
  /**
   * Alternate sources selected by a marker's `data-slot-variant="<name>"`, e.g.
   * `{ "minimal": "footer-minimal.html" }`. A variant with no entry here falls back to the
   * `<source-stem>-<variant>.html` filename convention, which is what `resolveSlots` did for every
   * variant before this field was parsed.
   */
  variants?: Record<string, string>;
}

/**
 * The `nav`/`footer` pair `resolveSlots` hardcoded before {@link ThemeManifest.slots} was parsed.
 * Used verbatim when a static theme declares no `slots`, so such a theme renders exactly as it did.
 */
export const DEFAULT_THEME_SLOTS: Readonly<Record<string, ThemeSlotDescriptor>> = {
  nav: { source: "nav.html", activeAttr: "data-nav-current" },
  footer: { source: "footer.html" },
};

/** Design tokens: CSS custom-property name → value (emitted into `:root`). */
export type ThemeTokens = Record<string, string>;

/** A template is a JSON block tree (doc nodes + slot + component nodes). */
export type TemplateNode = JsonValue;

/** A fully-loaded, discovered theme. */
export interface DiscoveredTheme {
  manifest: ThemeManifest;
  /**
   * Absolute path of the folder this theme was loaded from. Recorded at load time because it is the
   * one fact about a theme that discovery knows and no consumer can re-derive: a theme id alone does
   * not say whether the folder sits at the top level of `themes/` or under one of
   * {@link ENGINE_SUBFOLDERS}. The `themes` agent-tool domain (`agent-tools.ts`) resolves every
   * read/write against THIS value rather than re-deriving a path from the id, so an id can never be
   * used to steer a file operation at a folder discovery did not itself produce.
   */
  dir: string;
  tokens: ThemeTokens;
  /**
   * Light-mode token overrides (static tier only), from an optional `tokens.light.json` sibling to
   * `tokens.json`. Empty object when the theme ships no light variant — a static theme is not
   * required to support both modes, and an empty `:root[data-theme="light"] {}` override block is
   * harmless (it overrides nothing, so the page just stays on its dark values).
   */
  tokensLight: ThemeTokens;
  /** Template id (`home`, `post`, …) → block tree (declarative tier). */
  templates: Record<string, TemplateNode>;
  /** Template id → raw LiquidJS source (templated tier, ADR-020). */
  liquidTemplates: Record<string, string>;
  /** Template id → raw Handlebars source (handlebars tier, ADR-020). */
  handlebarsTemplates: Record<string, string>;
  /**
   * Page id → raw HTML document source (static tier only). Keyed by filename
   * minus `.html`, from `pages/*.html` — unlike `templates`/`liquidTemplates`/
   * `handlebarsTemplates`, these are already-complete `<!doctype html>` documents,
   * not route-driven block trees/fragments, because a static theme has no
   * templating language for a renderer to fill in.
   */
  pages: Record<string, string>;
  /**
   * Partial id → raw HTML source (static tier only): `nav`, `footer`, and any
   * `footer-*` variant (e.g. `footer-minimal`) found at the theme root. A static
   * page embeds these via `data-tovu-slot="nav"` / `data-tovu-slot="footer"`
   * markers rather than a template-include directive — resolving them is the
   * renderer's job, not something baked into the page HTML at author time.
   */
  partials: Record<string, string>;
  /** Raw theme stylesheet (unsanitized in the spike). */
  css: string;
  source: "built-in" | "site";
  status: "valid" | "invalid";
  /** Human-readable validation errors; empty when valid. */
  errors: string[];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): JsonValue {
  return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
}

/** Coerce `theme.json.tier` to a known tier, defaulting to `declarative`. */
function parseTier(value: JsonValue | undefined): ThemeTier {
  return typeof value === "string" && (THEME_TIERS as readonly string[]).includes(value)
    ? (value as ThemeTier)
    : "declarative";
}

/**
 * Parse `theme.json.slots` into {@link ThemeSlotDescriptor}s, skipping any entry that isn't an object
 * with a string `source`. Returns `undefined` for an absent/unusable field so the caller falls back to
 * {@link DEFAULT_THEME_SLOTS} rather than resolving zero slots — a theme whose `slots` block is
 * malformed still renders its nav and footer under the legacy convention instead of losing both.
 */
function parseSlots(value: JsonValue | undefined): Record<string, ThemeSlotDescriptor> | undefined {
  if (!isObject(value)) return undefined;
  const slots: Record<string, ThemeSlotDescriptor> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isObject(raw) || typeof raw.source !== "string") continue;
    const variants = isObject(raw.variants)
      ? Object.fromEntries(
          Object.entries(raw.variants).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])
        )
      : undefined;
    slots[key] = {
      source: raw.source,
      ...(typeof raw.activeAttr === "string" ? { activeAttr: raw.activeAttr } : {}),
      ...(variants && Object.keys(variants).length > 0 ? { variants } : {}),
    };
  }
  return Object.keys(slots).length > 0 ? slots : undefined;
}

/** Everything only a static theme ships. Returned by {@link loadStaticTierAssets}. */
interface StaticTierAssets {
  tokensLight: ThemeTokens;
  pages: Record<string, string>;
  partials: Record<string, string>;
  /** Validation failures, for the caller to merge into the theme's own `errors`. */
  errors: string[];
}

/** No static assets, for every tier that ships none. */
const NO_STATIC_TIER_ASSETS: StaticTierAssets = {
  tokensLight: {},
  pages: {},
  partials: {},
  errors: [],
};

/**
 * Read `tokens.light.json`, a static theme's optional light-mode override set.
 *
 * Optional unlike `tokens.json`: absent is not an error, it just means the theme ships no light
 * variant, which leaves the map empty so no `:root` override block is emitted at all.
 */
function readLightTokens(
  required: { themeDir: string; errors: string[] },
  _optional: Record<string, never> = {}
): ThemeTokens {
  const { themeDir, errors } = required;
  const path = join(themeDir, "tokens.light.json");
  if (!existsSync(path)) return {};
  try {
    const raw = readJson(path);
    if (!isObject(raw)) throw new Error("tokens.light.json is not an object");
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    errors.push(`tokens.light.json: ${(err as Error).message}`);
    return {};
  }
}

/**
 * Read the static tier's assets as one unit, or nothing at all for any other tier.
 *
 * A static theme is a different kind of artifact from every other tier — already-complete HTML
 * documents plus their partials and an optional light-token variant, rather than a route map of
 * templates a rendering engine fills in — so none of this shares a branch with the other tiers.
 * Kept out of {@link loadTheme}, tier check included, because inlining it there made one function
 * responsible for four unrelated on-disk layouts and left the caller re-testing the tier three
 * separate times.
 *
 * Errors are returned rather than thrown, matching {@link loadTheme}'s contract that one bad theme
 * degrades to `status: "invalid"` instead of breaking discovery for every other theme.
 *
 * @complexity O(f) in the theme folder's entries, each read at most once.
 * @overallScore 100
 */
function loadStaticTierAssets(
  required: { themeDir: string; tier: ThemeTier },
  _optional: Record<string, never> = {}
): StaticTierAssets {
  const { themeDir, tier } = required;
  if (tier !== "static") return NO_STATIC_TIER_ASSETS;

  const errors: string[] = [];
  const tokensLight = readLightTokens({ themeDir, errors });

  // REQ-01's spirit, not its exact home+entry pair: a static theme's minimum is one page to
  // actually show, not a route id a templating engine would fill in.
  const pages: Record<string, string> = {};
  const pagesDir = join(themeDir, "pages");
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir)) {
      if (file.endsWith(".html")) {
        pages[file.slice(0, -".html".length)] = readFileSync(join(pagesDir, file), "utf8");
      }
    }
  }
  if (!pages.index) errors.push("pages/index.html is required");

  // `nav` and `footer` (plus `footer-*` variants) live at the theme root, not under pages/, because
  // a static page embeds them via a `data-tovu-slot` marker the renderer resolves rather than a
  // template-include directive baked in at author time.
  const partials: Record<string, string> = {};
  for (const file of readdirSync(themeDir)) {
    if (file.endsWith(".html") && (file === "nav.html" || file.startsWith("footer"))) {
      partials[file.slice(0, -".html".length)] = readFileSync(join(themeDir, file), "utf8");
    }
  }

  return { tokensLight, pages, partials, errors };
}

/**
 * Load one theme folder. Returns a DiscoveredTheme with `status: "invalid"` and
 * a populated `errors` list instead of throwing, so one bad theme never breaks
 * discovery (SPEC-004 REQ-10 spirit).
 */
export function loadTheme(
  required: { themeDir: string; id: string; source: "built-in" | "site" },
  _optional: Record<string, never> = {}
): DiscoveredTheme {
  const { themeDir, id, source } = required;
  const errors: string[] = [];
  const empty: ThemeManifest = { id, name: id, version: "0.0.0", tier: "declarative", engine: 1 };

  let manifest = empty;
  try {
    const raw = readJson(join(themeDir, "theme.json"));
    if (!isObject(raw)) throw new Error("theme.json is not an object");
    manifest = {
      id: String(raw.id ?? id),
      name: String(raw.name ?? id),
      version: String(raw.version ?? "0.0.0"),
      tier: parseTier(raw.tier),
      engine: typeof raw.engine === "number" ? raw.engine : 1,
      description: typeof raw.description === "string" ? raw.description : undefined,
      fonts: Array.isArray(raw.fonts) ? raw.fonts.map(String) : undefined,
      regions: Array.isArray(raw.regions) ? raw.regions.map(String) : undefined,
      skipLiquidAllowlist: raw.skipLiquidAllowlist === true,
      postTemplate: Array.isArray(raw.postTemplate) ? raw.postTemplate.map(String) : undefined,
      modes: Array.isArray(raw.modes) ? raw.modes.map(String) : undefined,
      defaultMode: typeof raw.defaultMode === "string" ? raw.defaultMode : undefined,
      slots: parseSlots(raw.slots),
    };
    if (manifest.id !== id) errors.push(`theme.json id '${manifest.id}' must equal folder name '${id}'`);
    // A `defaultMode` the theme ships no tokens for would silently render the base `:root` block
    // while the manifest claims otherwise — the exact "declared but unreachable" failure wiring
    // these fields was meant to end, so it fails the theme loudly instead of falling back.
    if (manifest.defaultMode !== undefined && !(manifest.modes ?? []).includes(manifest.defaultMode)) {
      errors.push(
        `theme.json defaultMode '${manifest.defaultMode}' is not listed in modes [${(manifest.modes ?? []).join(", ")}]`
      );
    }
  } catch (err) {
    errors.push(`theme.json: ${(err as Error).message}`);
  }

  let tokens: ThemeTokens = {};
  try {
    const raw = readJson(join(themeDir, "tokens.json"));
    if (!isObject(raw)) throw new Error("tokens.json is not an object");
    tokens = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    errors.push(`tokens.json: ${(err as Error).message}`);
  }

  // The static tier's whole on-disk layout — light tokens, pages/, root partials — loaded in one
  // call rather than as branches threaded through the tier-agnostic loading below. Empty for every
  // other tier, so nothing here needs to re-test which tier this is.
  const { tokensLight, pages, partials, errors: staticErrors } = loadStaticTierAssets({
    themeDir,
    tier: manifest.tier,
  });
  errors.push(...staticErrors);

  const templates: Record<string, TemplateNode> = {};
  const liquidTemplates: Record<string, string> = {};
  const handlebarsTemplates: Record<string, string> = {};
  const templatesDir = join(themeDir, "templates");
  if (existsSync(templatesDir)) {
    for (const file of readdirSync(templatesDir)) {
      if (file.endsWith(".json")) {
        const templateId = file.slice(0, -".json".length);
        try {
          templates[templateId] = readJson(join(templatesDir, file));
        } catch (err) {
          errors.push(`templates/${file}: ${(err as Error).message}`);
        }
      } else if (file.endsWith(".liquid")) {
        // Templated tier (ADR-020): raw LiquidJS source, rendered by the engine
        // in render.ts. C6/REQ-06 lint-before-publish: reject any tag/filter
        // outside the ADR-020 §3 allowlist before the theme can load as valid —
        // unless the theme opted out via `skipLiquidAllowlist` (see ThemeManifest
        // doc comment: the runtime's other Tier-2 guardrails — worker isolation,
        // filesystem lockdown, memory/render/parse limits — still apply either way).
        const templateId = file.slice(0, -".liquid".length);
        const source = readFileSync(join(templatesDir, file), "utf8");
        const violations = manifest.skipLiquidAllowlist ? [] : lintLiquidTemplate(source);
        if (violations.length > 0) {
          errors.push(`templates/${file}: ${violations.join("; ")}`);
        } else {
          liquidTemplates[templateId] = source;
        }
      } else if (file.endsWith(".hbs") || file.endsWith(".handlebars")) {
        // Handlebars tier (ADR-020): raw Handlebars source, rendered by the
        // isolated worker in `server/http/site/handlebars-worker.ts`. Exactly the
        // same lint-before-publish contract the `.liquid` branch above applies,
        // against the Handlebars-specific allowlist — a disallowed helper, a
        // partial, a decorator, or a `{{{raw}}}` output outside the one sanctioned
        // path fails the theme rather than reaching the compiler. Both extensions
        // are accepted (Handlebars' ecosystem uses them interchangeably) and map to
        // the same template-id namespace, so `home.hbs` and `home.handlebars` are
        // the same template id — the last one `readdirSync` yields wins, which is
        // why a theme should ship one or the other, not both.
        const ext = file.endsWith(".hbs") ? ".hbs" : ".handlebars";
        const templateId = file.slice(0, -ext.length);
        const source = readFileSync(join(templatesDir, file), "utf8");
        const violations = lintHandlebarsTemplate(source);
        if (violations.length > 0) {
          errors.push(`templates/${file}: ${violations.join("; ")}`);
        } else {
          handlebarsTemplates[templateId] = source;
        }
      }
    }
  }
  // A static theme has no `templates/` route map at all, so its required-file check is
  // `loadStaticTierAssets`'s job, not this one's.
  if (manifest.tier !== "static") {
    // REQ-01: a theme's required template minimum is home + entry (the base). C3:
    // post/page are optional specializations that fall through to entry (REQ-03).
    // The required set is tier-aware: templated themes ship `.liquid`, handlebars
    // themes ship `.hbs`, others JSON.
    const ext = manifest.tier === "templated" ? "liquid" : manifest.tier === "handlebars" ? "hbs" : "json";
    const requiredTemplates =
      manifest.tier === "templated" ? liquidTemplates : manifest.tier === "handlebars" ? handlebarsTemplates : templates;
    if (!requiredTemplates.home) errors.push(`templates/home.${ext} is required`);
    if (!requiredTemplates.entry) errors.push(`templates/entry.${ext} is required`);
  }

  let css = "";
  // Static themes keep CSS under css/styles.css (alongside sibling js/ and pages/
  // folders) rather than a lone file at the theme root — the root-level convention
  // fits every other tier's flat, single-stylesheet shape; static ships a whole
  // small multi-file project instead.
  const cssPath = join(themeDir, manifest.tier === "static" ? "css/styles.css" : "styles.css");
  if (existsSync(cssPath)) css = readFileSync(cssPath, "utf8");

  return {
    manifest,
    dir: themeDir,
    tokens,
    tokensLight,
    templates,
    liquidTemplates,
    handlebarsTemplates,
    pages,
    partials,
    css,
    source,
    status: errors.length === 0 ? "valid" : "invalid",
    errors,
  };
}

/**
 * Discover every theme folder under `dir`. Missing dir ⇒ empty list (a site
 * served without a themes/ dir is legal, SPEC-004 REQ-05).
 *
 * `exclude` skips named subdirectories that aren't themes themselves — used by
 * {@link discoverAllBuiltInThemes} to keep the engine-specific subfolders
 * (`templated/`, `handlebars/`) from being scanned as (invalid) top-level theme
 * candidates when it also scans them directly as their own theme roots.
 */
export function discoverThemes(
  required: { dir: string; source: "built-in" | "site"; exclude?: readonly string[] },
  _optional: Record<string, never> = {}
): DiscoveredTheme[] {
  const { dir, source, exclude } = required;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      if (exclude?.includes(name)) return false;
      const full = join(dir, name);
      return statSync(full).isDirectory();
    })
    .map((name) => loadTheme({ themeDir: join(dir, name), id: name, source }))
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/**
 * Named engine-specific subfolders under a themes root, one per {@link ThemeTier} except `code`
 * (not built yet) — every tier's themes live under its own subfolder so `themes/` doesn't mix
 * formats in one flat listing (2026-08-10: `declarative` moved off the bare top level, and the
 * LiquidJS-tier folder renamed from `liquidjs/` to `templated/` to match its `ThemeTier` value —
 * `templated` names the tier, not the engine, so more templating engines can land under this same
 * folder later without another rename). Scanning a missing subfolder is a no-op (`discoverThemes`'s
 * own missing-dir ⇒ empty-list behavior), so adding an engine here ahead of its first theme costs
 * nothing.
 *
 * Exported because it is also the containment boundary the `themes` agent-tool domain enforces
 * (`agent-tools.ts`/`tool-registrations.ts`): a theme folder that is not a direct child of the
 * themes root or of one of THESE subfolders is not a recognized theme root, and no agent-driven file
 * write may resolve into it.
 */
export const ENGINE_SUBFOLDERS = ["declarative", "templated", "handlebars", "static"] as const;

/**
 * Discover every built-in theme across the top-level (declarative) folder plus every engine
 * subfolder in {@link ENGINE_SUBFOLDERS}. The one call site every composition root should use
 * instead of a raw {@link discoverThemes} call, so the liquidjs/handlebars split is a detail this
 * function owns rather than something every caller re-derives.
 */
export function discoverAllBuiltInThemes(
  required: { dir: string; source: "built-in" | "site" },
  _optional: Record<string, never> = {}
): DiscoveredTheme[] {
  const { dir, source } = required;
  const topLevel = discoverThemes({ dir, source, exclude: ENGINE_SUBFOLDERS });
  const engineThemes = ENGINE_SUBFOLDERS.flatMap((sub) => discoverThemes({ dir: join(dir, sub), source }));
  return [...topLevel, ...engineThemes].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/** Ids of discovered themes that passed validation. */
export function validThemeIds(themes: DiscoveredTheme[]): string[] {
  return themes.filter((t) => t.status === "valid").map((t) => t.manifest.id);
}

/** Find a theme by id (any status). */
export function findTheme(
  required: { themes: DiscoveredTheme[]; id: string },
  _optional: Record<string, never> = {}
): DiscoveredTheme | undefined {
  const { themes, id } = required;
  return themes.find((t) => t.manifest.id === id);
}

/**
 * Resolve a page route to a template id, with the SPEC-004 REQ-03 fallthrough
 * chain trimmed to the spike's routes:
 *   home → `home`
 *   post → `post` else `entry` (built-ins ship `entry`; `post` is an optional
 *          override a theme may add to specialize posts — AC-07)
 *   products/product → own-named template only, no fallthrough — a theme
 *          that doesn't declare one simply has no product pages (renderSite's
 *          fallbackBody degrades gracefully, same REQ-10 spirit as any other
 *          undeclared template).
 */
export function resolveTemplateId(
  required: { route: "home" | "post" | "products" | "product"; templates: Record<string, TemplateNode> },
  _optional: Record<string, never> = {}
): string | null {
  const { route, templates } = required;
  if (route === "home") return templates.home ? "home" : null;
  if (route === "products") return templates.products ? "products" : null;
  if (route === "product") return templates.product ? "product" : null;
  if (templates.post) return "post";
  if (templates.entry) return "entry";
  return null;
}

/**
 * Templated-tier (LiquidJS) analogue of `resolveTemplateId`: same REQ-03
 * fallthrough (`home` → `home`; `post` → `post` else `entry`; `products`/
 * `product` → own-named template only) over the raw `.liquid` source map.
 */
export function resolveLiquidTemplateId(
  required: { route: "home" | "post" | "products" | "product"; liquidTemplates: Record<string, string> },
  _optional: Record<string, never> = {}
): string | null {
  const { route, liquidTemplates } = required;
  if (route === "home") return liquidTemplates.home ? "home" : null;
  if (route === "products") return liquidTemplates.products ? "products" : null;
  if (route === "product") return liquidTemplates.product ? "product" : null;
  if (liquidTemplates.post) return "post";
  if (liquidTemplates.entry) return "entry";
  return null;
}

/**
 * Handlebars-tier analogue of `resolveTemplateId`: same REQ-03 fallthrough
 * (`home` → `home`; `post` → `post` else `entry`; `products`/`product` → own-named
 * template only) over the raw `.hbs` source map.
 */
export function resolveHandlebarsTemplateId(
  required: { route: "home" | "post" | "products" | "product"; handlebarsTemplates: Record<string, string> },
  _optional: Record<string, never> = {}
): string | null {
  const { route, handlebarsTemplates } = required;
  if (route === "home") return handlebarsTemplates.home ? "home" : null;
  if (route === "products") return handlebarsTemplates.products ? "products" : null;
  if (route === "product") return handlebarsTemplates.product ? "product" : null;
  if (handlebarsTemplates.post) return "post";
  if (handlebarsTemplates.entry) return "entry";
  return null;
}
