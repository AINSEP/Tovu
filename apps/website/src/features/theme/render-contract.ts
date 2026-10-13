import type { ThemeSlotDescriptor, TemplateNode } from "./theme.js";

/** @file Pure theme defaults and route selection, shared without loading filesystem validators. */
/**
 * The `nav`/`footer` pair `resolveSlots` hardcoded before {@link ThemeManifest.slots} was parsed.
 * Used verbatim when a static theme declares no `slots`, so such a theme renders exactly as it did.
 */
export const DEFAULT_THEME_SLOTS: Readonly<Record<string, ThemeSlotDescriptor>> = {
  nav: { source: "nav.html", honorsCurrentPage: true },
  footer: { source: "footer.html" },
};

/**
 * SPEC-004 REQ-03 fallthrough chain, keyed by route, trimmed to the spike's routes: `home` and
 * `products`/`product` are own-named only (no fallthrough — a theme that doesn't declare one
 * simply has no such page, REQ-10 spirit); `post` tries `post` first, then falls through to
 * `entry` (built-ins ship `entry`; `post` is an optional override a theme may add to specialize
 * posts — AC-07). One candidate list per route rather than a route-shaped if/else chain, so
 * {@link resolveRouteTemplateId} stays a single loop instead of re-deriving this same shape three
 * times (once per source-map type below).
 */
const ROUTE_TEMPLATE_CANDIDATES: Readonly<Record<"home" | "post" | "products" | "product", readonly string[]>> = {
  home: ["home"],
  post: ["post", "entry"],
  products: ["products"],
  product: ["product"],
};

/**
 * Shared REQ-03 resolution core behind `resolveTemplateId`/`resolveLiquidTemplateId`/
 * `resolveHandlebarsTemplateId` — the three differ only in which source-map type they resolve
 * against (declarative block trees, raw `.liquid` source, raw `.hbs` source), never in the
 * fallthrough logic itself, so that logic lives here once. `templates` is read generically
 * (presence/truthiness only, via `Record<string, unknown>`) because none of the three callers'
 * value types matter to this decision — only whether a given template id exists.
 */
function resolveRouteTemplateId(
  route: "home" | "post" | "products" | "product",
  templates: Readonly<Record<string, unknown>>
): string | null {
  for (const candidateId of ROUTE_TEMPLATE_CANDIDATES[route]) {
    if (templates[candidateId]) return candidateId;
  }
  return null;
}

/**
 * Resolve a page route to a template id — see {@link ROUTE_TEMPLATE_CANDIDATES} for the REQ-03
 * fallthrough chain this applies.
 * @complexity O(1) time and space — at most two candidate lookups.
 */
export function resolveTemplateId(
  required: { route: "home" | "post" | "products" | "product"; templates: Record<string, TemplateNode> },
  _optional: Record<string, never> = {}
): string | null {
  return resolveRouteTemplateId(required.route, required.templates);
}

/**
 * Templated-tier (LiquidJS) analogue of `resolveTemplateId`: same REQ-03 fallthrough over the raw
 * `.liquid` source map.
 * @complexity O(1) time and space — at most two candidate lookups.
 */
export function resolveLiquidTemplateId(
  required: { route: "home" | "post" | "products" | "product"; liquidTemplates: Record<string, string> },
  _optional: Record<string, never> = {}
): string | null {
  return resolveRouteTemplateId(required.route, required.liquidTemplates);
}

/**
 * Handlebars-tier analogue of `resolveTemplateId`: same REQ-03 fallthrough over the raw `.hbs`
 * source map.
 * @complexity O(1) time and space — at most two candidate lookups.
 */
export function resolveHandlebarsTemplateId(
  required: { route: "home" | "post" | "products" | "product"; handlebarsTemplates: Record<string, string> },
  _optional: Record<string, never> = {}
): string | null {
  return resolveRouteTemplateId(required.route, required.handlebarsTemplates);
}
