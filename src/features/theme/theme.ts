import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import type { JsonObject, JsonValue } from "../../core/ports";
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
 * `templated` = LiquidJS-rendered (sandboxed logic, no JS), `code` = trusted
 * signed-plugin JS (not built yet). Absent in `theme.json` ⇒ `declarative`.
 */
export type ThemeTier = "declarative" | "templated" | "code";

const THEME_TIERS: readonly ThemeTier[] = ["declarative", "templated", "code"];

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
   */
  skipLiquidAllowlist?: boolean;
}

/** Design tokens: CSS custom-property name → value (emitted into `:root`). */
export type ThemeTokens = Record<string, string>;

/** A template is a JSON block tree (doc nodes + slot + component nodes). */
export type TemplateNode = JsonValue;

/** A fully-loaded, discovered theme. */
export interface DiscoveredTheme {
  manifest: ThemeManifest;
  tokens: ThemeTokens;
  /** Template id (`home`, `post`, …) → block tree (declarative tier). */
  templates: Record<string, TemplateNode>;
  /** Template id → raw LiquidJS source (templated tier, ADR-020). */
  liquidTemplates: Record<string, string>;
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
    };
    if (manifest.id !== id) errors.push(`theme.json id '${manifest.id}' must equal folder name '${id}'`);
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

  const templates: Record<string, TemplateNode> = {};
  const liquidTemplates: Record<string, string> = {};
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
      }
    }
  }
  // REQ-01: a theme's required template minimum is home + entry (the base). C3:
  // post/page are optional specializations that fall through to entry (REQ-03).
  // The required set is tier-aware: templated themes ship `.liquid`, others JSON.
  const ext = manifest.tier === "templated" ? "liquid" : "json";
  const requiredTemplates = manifest.tier === "templated" ? liquidTemplates : templates;
  if (!requiredTemplates.home) errors.push(`templates/home.${ext} is required`);
  if (!requiredTemplates.entry) errors.push(`templates/entry.${ext} is required`);

  let css = "";
  const cssPath = join(themeDir, "styles.css");
  if (existsSync(cssPath)) css = readFileSync(cssPath, "utf8");

  return {
    manifest,
    tokens,
    templates,
    liquidTemplates,
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
 * (`liquidjs/`, `handlebars/`) from being scanned as (invalid) top-level theme
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
 * Named engine-specific subfolders under a themes root: declarative (JSON block-tree) themes stay
 * at the top level as Tovu's native format; each other engine gets its own subfolder so `themes/`
 * doesn't mix formats in one flat listing. `handlebars/` has no themes yet (no Handlebars tier
 * exists — see `ThemeTier`) but is listed now so the convention is established before that tier
 * lands; scanning a missing subfolder is a no-op (`discoverThemes`'s own missing-dir ⇒ empty-list
 * behavior), so this is forward-compatible with zero migration when it does.
 */
const ENGINE_SUBFOLDERS = ["liquidjs", "handlebars"] as const;

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
