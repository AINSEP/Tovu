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

/** `theme.json` — static theme identity. */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  class: "declarative";
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
  /** Template id (`home`, `post`, …) → block tree. */
  templates: Record<string, TemplateNode>;
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

/**
 * Load one theme folder. Returns a DiscoveredTheme with `status: "invalid"` and
 * a populated `errors` list instead of throwing, so one bad theme never breaks
 * discovery (SPEC-004 REQ-10 spirit).
 */
export function loadTheme(themeDir: string, id: string, source: "built-in" | "site"): DiscoveredTheme {
  const errors: string[] = [];
  const empty: ThemeManifest = { id, name: id, version: "0.0.0", class: "declarative", engine: 1 };

  let manifest = empty;
  try {
    const raw = readJson(join(themeDir, "theme.json"));
    if (!isObject(raw)) throw new Error("theme.json is not an object");
    manifest = {
      id: String(raw.id ?? id),
      name: String(raw.name ?? id),
      version: String(raw.version ?? "0.0.0"),
      class: "declarative",
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
  const templatesDir = join(themeDir, "templates");
  if (existsSync(templatesDir)) {
    for (const file of readdirSync(templatesDir)) {
      if (!file.endsWith(".json")) continue;
      const templateId = file.slice(0, -".json".length);
      try {
        templates[templateId] = readJson(join(templatesDir, file));
      } catch (err) {
        errors.push(`templates/${file}: ${(err as Error).message}`);
      }
    }
  }
  // REQ-01: a theme's required template minimum is home + entry (the base). C3:
  // post/page are optional specializations that fall through to entry (REQ-03).
  if (!templates.home) errors.push("templates/home.json is required");
  if (!templates.entry) errors.push("templates/entry.json is required");

  let css = "";
  const cssPath = join(themeDir, "styles.css");
  if (existsSync(cssPath)) css = readFileSync(cssPath, "utf8");

  return {
    manifest,
    tokens,
    templates,
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
