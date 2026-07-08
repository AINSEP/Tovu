import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import type { JsonObject, JsonValue } from "../../core/ports";

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
export function loadTheme(themeDir: string, id: string, source: "built-in" | "site"): DiscoveredTheme {
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
        // in render.ts. Template-content validation/lint is C6/REQ-06 (deferred).
        const templateId = file.slice(0, -".liquid".length);
        liquidTemplates[templateId] = readFileSync(join(templatesDir, file), "utf8");
      }
    }
  }
  // REQ-01: a theme's required template minimum is home + entry (the base). C3:
  // post/page are optional specializations that fall through to entry (REQ-03).
  // The required set is tier-aware: templated themes ship `.liquid`, others JSON.
  const ext = manifest.tier === "templated" ? "liquid" : "json";
  const required = manifest.tier === "templated" ? liquidTemplates : templates;
  if (!required.home) errors.push(`templates/home.${ext} is required`);
  if (!required.entry) errors.push(`templates/entry.${ext} is required`);

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
 */
export function discoverThemes(dir: string, source: "built-in" | "site"): DiscoveredTheme[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory();
    })
    .map((name) => loadTheme(join(dir, name), name, source))
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/** Ids of discovered themes that passed validation. */
export function validThemeIds(themes: DiscoveredTheme[]): string[] {
  return themes.filter((t) => t.status === "valid").map((t) => t.manifest.id);
}

/** Find a theme by id (any status). */
export function findTheme(themes: DiscoveredTheme[], id: string): DiscoveredTheme | undefined {
  return themes.find((t) => t.manifest.id === id);
}

/**
 * Resolve a page route to a template id, with the SPEC-004 REQ-03 fallthrough
 * chain trimmed to the spike's two routes:
 *   home → `home`
 *   post → `post` else `entry` (built-ins ship `entry`; `post` is an optional
 *          override a theme may add to specialize posts — AC-07)
 */
export function resolveTemplateId(
  route: "home" | "post",
  templates: Record<string, TemplateNode>
): string | null {
  if (route === "home") return templates.home ? "home" : null;
  if (templates.post) return "post";
  if (templates.entry) return "entry";
  return null;
}

/**
 * Templated-tier (LiquidJS) analogue of `resolveTemplateId`: same REQ-03
 * fallthrough (`home` → `home`; `post` → `post` else `entry`) over the raw
 * `.liquid` source map.
 */
export function resolveLiquidTemplateId(
  route: "home" | "post",
  liquidTemplates: Record<string, string>
): string | null {
  if (route === "home") return liquidTemplates.home ? "home" : null;
  if (liquidTemplates.post) return "post";
  if (liquidTemplates.entry) return "entry";
  return null;
}
