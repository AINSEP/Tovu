import { type TemplateNode, type ThemeManifest, type ThemeTier } from "./render-contract.js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { lintHandlebarsTemplate } from "./handlebars-allowlist.js";
import { lintLiquidTemplate } from "./liquid-allowlist.js";
import { readJson } from "./theme-manifest-fields.js";


/** Which of the three template source families a `templates/` (or v2 `render/pages/`) directory
 * entry belongs to, by extension — `"unknown"` for anything {@link loadTemplateSources} ignores
 * (same as the original silent no-op for a non-matching file). */
function classifyTemplateFile({ file }: { file: string }, _optional = {}): "json" | "liquid" | "handlebars" | "unknown" {
  if (file.endsWith(".json")) return "json";
  if (file.endsWith(".liquid")) return "liquid";
  if (file.endsWith(".hbs") || file.endsWith(".handlebars")) return "handlebars";
  return "unknown";
}

/** Declarative tier: one block-tree template per `.json` file. */
function loadJsonTemplateFile({ templatesDir, templatesDirName, file, target }: { templatesDir: string; templatesDirName: string; file: string; target: { templates: Record<string, TemplateNode>; errors: string[] } }, _optional = {}): void {
  const templateId = file.slice(0, -".json".length);
  try {
    target.templates[templateId] = readJson({ path: join(templatesDir, file) });
  } catch (err) {
    target.errors.push(`${templatesDirName}/${file}: ${(err as Error).message}`);
  }
}

/**
 * Templated tier (ADR-020): raw LiquidJS source, rendered by the engine in render.ts. C6/REQ-06
 * lint-before-publish: reject any tag/filter outside the ADR-020 §3 allowlist before the theme
 * can load as valid. Worker isolation, filesystem lockdown and memory/render/parse limits
 * remain independent safeguards; none substitutes for this unconditional lint.
 */
function loadLiquidTemplateFile({ templatesDir, templatesDirName, file, target }: { templatesDir: string; templatesDirName: string; file: string; target: { liquidTemplates: Record<string, string>; errors: string[] } }, _optional = {}): void {
  const templateId = file.slice(0, -".liquid".length);
  const source = readFileSync(join(templatesDir, file), "utf8");
  const violations = lintLiquidTemplate({ source });
  if (violations.length > 0) {
    target.errors.push(`${templatesDirName}/${file}: ${violations.join("; ")}`);
  } else {
    target.liquidTemplates[templateId] = source;
  }
}

/**
 * Handlebars tier (ADR-020): raw Handlebars source, rendered by the isolated worker in
 * `apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts`. Exactly the same lint-before-publish contract
 * {@link loadLiquidTemplateFile} applies, against the Handlebars-specific allowlist — a
 * disallowed helper, a partial, a decorator, or a `{{{raw}}}` output outside the one sanctioned
 * path fails the theme rather than reaching the compiler. Both extensions are accepted
 * (Handlebars' ecosystem uses them interchangeably) and map to the same template-id namespace, so
 * `home.hbs` and `home.handlebars` are the same template id — the last one `readdirSync` yields
 * wins, which is why a theme should ship one or the other, not both.
 */
function loadHandlebarsTemplateFile({ templatesDir, templatesDirName, file, target }: { templatesDir: string; templatesDirName: string; file: string; target: { handlebarsTemplates: Record<string, string>; errors: string[] } }, _optional = {}): void {
  const ext = file.endsWith(".hbs") ? ".hbs" : ".handlebars";
  const templateId = file.slice(0, -ext.length);
  const source = readFileSync(join(templatesDir, file), "utf8");
  const violations = lintHandlebarsTemplate({ source });
  if (violations.length > 0) {
    target.errors.push(`${templatesDirName}/${file}: ${violations.join("; ")}`);
  } else {
    target.handlebarsTemplates[templateId] = source;
  }
}

/**
 * Scan the theme's route-map directory (v1: theme-root `templates/`; v2: `render/pages/` —
 * theme-authoring-guide-v2.md §3, same folder name static pages use, only the naming convention
 * changes) and dispatch each file to its extension's loader. A missing directory is not an error
 * here — the required-template check ({@link validateRequiredTemplates}) is what turns "no home/
 * entry template" into one, the same REQ-10 fault-isolation split {@link loadStaticTierAssets}
 * already draws between "nothing found" and "what's required".
 */
export function loadTemplateSources({ themeDir, manifest }: { themeDir: string; manifest: ThemeManifest }, _optional = {}): {
  templatesDirName: string;
  templates: Record<string, TemplateNode>;
  liquidTemplates: Record<string, string>;
  handlebarsTemplates: Record<string, string>;
  errors: string[];
} {
  // v1: non-static tiers keep their route map at theme-root `templates/`. v2 unifies every tier's
  // route map under `render/pages/` — only the naming convention changes, the per-extension
  // dispatch below (json/liquid/hbs) stays identical either way.
  const templatesDirName = manifest.apiVersion === 2 ? "render/pages" : "templates";
  const templatesDir = join(themeDir, templatesDirName);
  const templates: Record<string, TemplateNode> = {};
  const liquidTemplates: Record<string, string> = {};
  const handlebarsTemplates: Record<string, string> = {};
  const errors: string[] = [];

  if (!existsSync(templatesDir)) {
    return { templatesDirName, templates, liquidTemplates, handlebarsTemplates, errors };
  }

  for (const file of readdirSync(templatesDir)) {
    const kind = classifyTemplateFile({ file });
    if (kind === "json") {
      loadJsonTemplateFile({ templatesDir, templatesDirName, file, target: { templates, errors } });
    } else if (kind === "liquid") {
      loadLiquidTemplateFile({ templatesDir, templatesDirName, file, target: {
        liquidTemplates,
        errors,
      } });
    } else if (kind === "handlebars") {
      loadHandlebarsTemplateFile({ templatesDir, templatesDirName, file, target: { handlebarsTemplates, errors } });
    } else {
      // Other file kinds do not declare a supported template.
    }
  }

  return { templatesDirName, templates, liquidTemplates, handlebarsTemplates, errors };
}

/** Which template-id map is authoritative for a tier's required home/entry check, and the file
 * extension its error messages should name — templated themes ship `.liquid`, handlebars themes
 * ship `.hbs`, every other (non-static) tier ships plain `.json`. */
function requiredTemplatesForTier({ tier, templates, liquidTemplates, handlebarsTemplates }: { tier: ThemeTier; templates: Readonly<Record<string, TemplateNode>>; liquidTemplates: Readonly<Record<string, string>>; handlebarsTemplates: Readonly<Record<string, string>> }, _optional = {}): { ext: string; required: Readonly<Record<string, unknown>> } {
  if (tier === "templated") return { ext: "liquid", required: liquidTemplates };
  if (tier === "handlebars") return { ext: "hbs", required: handlebarsTemplates };
  return { ext: "json", required: templates };
}

/**
 * REQ-01: a theme's required template minimum is home + entry (the base). C3: post/page are
 * optional specializations that fall through to entry (REQ-03). A static theme has no separate
 * route-map folder at all — its required-file check is {@link loadStaticTierAssets}'s job, not
 * this one's.
 */
export function validateRequiredTemplates({ manifest, templatesDirName, templates, liquidTemplates, handlebarsTemplates }: { manifest: ThemeManifest; templatesDirName: string; templates: Readonly<Record<string, TemplateNode>>; liquidTemplates: Readonly<Record<string, string>>; handlebarsTemplates: Readonly<Record<string, string>> }, _optional = {}): string[] {
  if (manifest.tier === "static") return [];
  const { ext, required } = requiredTemplatesForTier({ tier: manifest.tier, templates, liquidTemplates, handlebarsTemplates });
  const errors: string[] = [];
  if (!required.home) errors.push(`${templatesDirName}/home.${ext} is required`);
  if (!required.entry) errors.push(`${templatesDirName}/entry.${ext} is required`);
  return errors;
}
