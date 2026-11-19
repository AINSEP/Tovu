import { DEFAULT_THEME_SLOTS, type ThemeSlotDescriptor } from "../../contracts/core/theme-slots.js";
import { type ThemeManifest, type ThemeTier } from "./render-contract.js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { markersOfType } from "@jini-ai/cms/widgets/markers";
import { resolveThemeLayout } from "./theme-layout.js";
import { type ThemeTokens, type DiscoveredTheme } from "./theme.js";
import { readJson, isObject } from "./theme-manifest-fields.js";


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
    const raw = readJson({ path });
    if (!isObject(raw)) throw new Error("tokens.light.json is not an object");
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  } catch (err) {
    errors.push(`tokens.light.json: ${(err as Error).message}`);
    return {};
  }
}

/**
 * Read the root partial files a static theme's declared {@link ThemeManifest.slots} name.
 *
 * Before this, the partial scan was a hardcoded filename allowlist — `nav.html` or anything starting
 * with `footer` — which meant a theme could DECLARE a slot (`"sidebar": { "source": "sidebar.html" }`)
 * and have its file read by nothing, so the marker resolved empty with no error anywhere. Slots are
 * now the single source of truth for which root `.html` files are partials, which is what makes
 * adding a region to a copied theme a manifest edit rather than a code change here.
 *
 * A slot matches its own `source` plus the `<stem>-<variant>.html` convention `resolveSlots` already
 * falls back to for a variant with no explicit `variants` entry — so `footer.html` still pulls in
 * `footer-minimal.html`, and a new `sidebar` slot gets `sidebar-*.html` on the same terms rather than
 * a second, differently-shaped rule.
 */
/**
 * @param required.partialsDir - v1: the theme's own root (`themeDir`) — partials sit alongside
 * `pages/`/`css/`/`js/`. v2: `render/partials/` — see `theme-authoring-guide-v2.md` §3. Passed in
 * rather than derived here so this function stays agnostic to which schema version picked it.
 */
function loadSlotPartials(
  required: { partialsDir: string; slots: Record<string, ThemeSlotDescriptor> },
  _optional: Record<string, never> = {}
): Record<string, string> {
  const { partialsDir, slots } = required;
  if (!existsSync(partialsDir)) return {};
  const descriptors = Object.values(slots);
  const stems = descriptors.map((slot) => slot.source.replace(/\.html$/, ""));
  const explicitVariants = new Set(descriptors.flatMap((slot) => Object.values(slot.variants ?? {})));

  const partials: Record<string, string> = {};
  for (const file of readdirSync(partialsDir)) {
    if (!file.endsWith(".html")) continue;
    const named = explicitVariants.has(file);
    const conventional = stems.some((stem) => file === `${stem}.html` || file.startsWith(`${stem}-`));
    if (named || conventional) partials[file.slice(0, -".html".length)] = readFileSync(join(partialsDir, file), "utf8");
  }
  return partials;
}

/** Every `templates` entry must resolve against `pages/<id>.html` and carry this marker type. */
const TEMPLATE_SLOT_MARKER_TYPE = "content";

/**
 * Validates the theme's `templates` array against its already-loaded `pages` (2026-08-11, owner
 * decision — see `ADS-memory/reports/continuity/2026-08-11-pages-template-decisions.md`, extended to
 * the unified single array by `ADS-memory/reports/design/2026-08-11-unified-content-marker-and-
 * templates.md`): a listed entry that resolves to no file, or to a file with zero `"content"`
 * markers, renders a structurally fine page with its actual content silently missing — "the worst
 * failure class this codebase keeps hitting", in the owner's own words, and the same class of bug
 * REQ-10's `pages/index.html is required` check exists to catch at load time rather than on a
 * visitor's page view.
 *
 * One field, one marker type, one call site — collapsed from the pre-unification version that took a
 * `fieldName`/`slotMarkerType` pair and was called twice (once for `postTemplate`/`"post"`, once for
 * `pageTemplate`/`"content"`). With only one array and one marker type left to check, parameterizing
 * either would just be indirection with a single value ever passed through it.
 *
 * Not itself tier-gated — `pages` is empty for every non-static theme (`loadStaticTierAssets`'s own
 * early return), so a non-static theme is already incapable of tripping this on a `templates` field it
 * isn't documented to declare; gating here too would just be a second copy of that same guarantee.
 *
 * @complexity O(t) over `templates`' length; each entry's marker scan is O(n) in that one page's HTML
 *   length (`markersOfType`), the same cost `resolveTemplate` already pays per request.
 */
export function validateTemplateDeclarations(
  required: {
    templates: readonly string[] | undefined;
    pages: Readonly<Record<string, string>>;
    pagesDirName?: string;
  },
  _optional: Record<string, never> = {}
): string[] {
  const { templates, pages, pagesDirName = "pages" } = required;
  if (!templates) return [];

  const errors: string[] = [];
  for (const entry of templates) {
    const pageId = entry.replace(/\.html$/, "");
    const html = pages[pageId];
    if (html === undefined) {
      errors.push(`theme.json templates entry '${entry}' has no matching ${pagesDirName}/${pageId}.html file`);
      continue;
    }
    if (markersOfType({ html: html, type: TEMPLATE_SLOT_MARKER_TYPE }).length === 0) {
      errors.push(
        `${pagesDirName}/${pageId}.html is declared in theme.json templates but has no {"type":"${TEMPLATE_SLOT_MARKER_TYPE}"} marker`
      );
    }
  }
  return errors;
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
export function loadStaticTierAssets(
  required: {
    themeDir: string;
    tier: ThemeTier;
    slots?: Record<string, ThemeSlotDescriptor>;
    apiVersion?: 2;
  },
  _optional: Record<string, never> = {}
): StaticTierAssets {
  const { themeDir, tier, slots, apiVersion } = required;
  if (tier !== "static") return NO_STATIC_TIER_ASSETS;

  const errors: string[] = [];
  const tokensLight = readLightTokens({ themeDir, errors });

  // REQ-01's spirit, not its exact home+entry pair: a static theme's minimum is one page to
  // actually show, not a route id a templating engine would fill in. `resolveThemeLayout` is the one
  // apiVersion-aware source of truth for this folder name — v2 nests it one level deeper
  // (`render/pages/`, theme-authoring-guide-v2.md §3) — v1 keeps `pages/` at the theme root.
  const layout = resolveThemeLayout({}, { apiVersion });
  const pagesDirName = layout.pagesDir;
  const pages: Record<string, string> = {};
  const pagesDir = join(themeDir, pagesDirName);
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir)) {
      if (file.endsWith(".html")) {
        pages[file.slice(0, -".html".length)] = readFileSync(join(pagesDir, file), "utf8");
      }
    }
  }
  if (!pages.index) errors.push(`${pagesDirName}/index.html is required`);

  // Partials (`nav`, `footer`, and anything else the manifest declares) live at the theme root in v1,
  // not under pages/, because a static page embeds them via a `{"type":"partial"}` marker the
  // renderer resolves rather than a template-include directive baked in at author time. v2 moves this
  // to `render/partials/`, alongside `render/pages/` — `layout.partialsDir` is `""` for v1 (the theme
  // root itself, see `ThemeLayout.partialsDir`'s own doc), which `join(themeDir, "")` resolves back to
  // `themeDir` unchanged. A theme with no `slots` block gets DEFAULT_THEME_SLOTS, which is the
  // nav/footer pair this scan used to hardcode.
  const partialsDir = join(themeDir, layout.partialsDir);
  const partials = loadSlotPartials({ partialsDir, slots: slots ?? DEFAULT_THEME_SLOTS });

  return { tokensLight, pages, partials, errors };
}

/**
 * Add missing declared template sources in memory; local files and metadata always win.
 * This keeps every newly offered choice resolvable without rewriting the owner's theme or original.
 * @returns Effective manifest/pages; the parsed site objects are not mutated.
 * @complexity O(t + p) for t bundled templates and p site pages, excluding HTML byte copies.
 */
export function inheritBundledTemplates(
  { manifest, pages, bundled }: { manifest: ThemeManifest; pages: Record<string, string>; bundled?: DiscoveredTheme },
  _options: Record<string, never> = {}
): { manifest: ThemeManifest; pages: Record<string, string>; inheritedTemplateSources: Record<string, string> } {
  if (!bundled) return { manifest, pages, inheritedTemplateSources: {} };
  const missing = (bundled.manifest.templates ?? []).filter((name) => !Object.hasOwn(pages, name.replace(/\.html$/, "")));
  if (missing.length === 0) return { manifest, pages, inheritedTemplateSources: {} };
  const existing = new Set(manifest.templates ?? []);
  const added = missing.filter((name) => !existing.has(name));
  const templateFor = Object.fromEntries(added.flatMap((name) => {
    const kinds = bundled.manifest.templateFor?.[name];
    return kinds === undefined ? [] : [[name, kinds]];
  }));
  const inheritedPages = missing.map((name) => {
    const id = name.replace(/\.html$/, "");
    const html = bundled.pages[id];
    if (html === undefined) throw new Error(`Bundled theme template '${name}' has no page source`);
    return { name, id, html };
  });
  return {
    inheritedTemplateSources: Object.fromEntries(inheritedPages.map(({ name, html }) => [
      `${resolveThemeLayout({}, { apiVersion: manifest.apiVersion }).pagesDir}/${name}`, html,
    ])),
    manifest: { ...manifest, templates: [...(manifest.templates ?? []), ...added], templateFor: { ...templateFor, ...manifest.templateFor } },
    pages: { ...Object.fromEntries(inheritedPages.map(({ id, html }) => [id, html])), ...pages },
  };
}
