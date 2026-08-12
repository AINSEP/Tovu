import type { CommercePriceRecord, CommerceProductRecord } from "./types";

/**
 * @file `storefront.ts` — maps Commerce catalog records into the public site render pipeline's
 * product shape (2026-08-12: "wire products into template render data").
 *
 * Purpose:
 * The render pipeline's `SiteProduct` (`src/server/http/site/render.ts`) is deliberately shaped
 * structurally rather than imported from a specific data source's module — its own doc says so
 * explicitly, for the sample store plugin, so the core render engine never depends on any one
 * plugin/feature's types. This module keeps that same decoupling in the other direction:
 * `features/commerce` does not import `SiteProduct` or anything from `server/http/site` — it
 * returns a plain object structurally compatible with it, and the route layer
 * (`server/routes/site/products.ts`) is what bridges the two, exactly as `SiteProduct`'s own doc
 * already establishes as the pattern.
 *
 * Deliberately NOT included in this mapping this pass, named explicitly rather than silently
 * dropped:
 *  - `images` — a real product image needs the ADR-027 transform-registry pipeline
 *    (`mediaTransformVersions`, `renderImageTag`) to produce a safe, validated `/m/...` URL; a
 *    shortcut construction here would bypass that validation. The templates already degrade
 *    gracefully to a placeholder card when `images` is absent (see `fashion-modern/templates/
 *    products.liquid`'s own header comment), so omitting it is a safe, honest default, not a
 *    silent gap.
 *  - `stock` — Commerce has no inventory-tracking table yet (only the unrelated sample `store`
 *    plugin does, via `p_store__products.stock` with a real OCC-guarded decrement). Fabricating a
 *    number here would violate the standing "never present unproven capability as working" rule
 *    (this feature's own context packet, C5). `SiteProduct.stock` is widened to optional so a
 *    Commerce-sourced product can honestly omit it rather than claim a specific count.
 */

/** The public-render-facing shape this module produces — structurally compatible with
 * `SiteProduct` (`server/http/site/render.ts`), not imported from it. See file header. */
export interface StorefrontSiteProduct {
  id: string;
  title: string;
  /** Cents. */
  price: number;
  /** Cents. `undefined` = not on sale. */
  compareAtPrice?: number;
}

/**
 * Chooses which of a product's prices to display on a storefront card, when more than one exists.
 * Prefers a one-time price over a recurring one (a shop grid shows what buying it once costs, not
 * a subscription rate) and, among ties, the cheapest — matching the intuitive "what's the price"
 * a shopper expects rather than an arbitrary insertion-order pick.
 *
 * @returns `null` if `prices` contains no `status: "active"` entry — the caller's job is to skip
 *   the product entirely in that case, not display a priceless card.
 * @complexity Time: O(n) in `prices.length`. Space: O(n) for the filtered pool.
 */
export function pickDisplayPrice(prices: readonly CommercePriceRecord[]): CommercePriceRecord | null {
  const active = prices.filter((p) => p.status === "active");
  if (active.length === 0) return null;
  const oneTime = active.filter((p) => p.billingInterval === undefined);
  const pool = oneTime.length > 0 ? oneTime : active;
  return pool.reduce((cheapest, p) => (p.unitAmountCents < cheapest.unitAmountCents ? p : cheapest));
}

/**
 * Maps one product + its already-chosen display price into the storefront render shape.
 *
 * @complexity Time/space: O(1).
 */
export function toSiteProduct(input: {
  product: CommerceProductRecord;
  price: CommercePriceRecord;
}): StorefrontSiteProduct {
  return {
    id: input.product.id,
    title: input.product.name,
    price: input.price.unitAmountCents,
    compareAtPrice: input.price.compareAtAmountCents,
  };
}

/**
 * Maps a product list into storefront render shapes, silently skipping any product with no
 * `status: "active"` price to display (not an error — an admin can legitimately publish a product
 * before pricing it) rather than crashing the whole page render over one incomplete row.
 *
 * @complexity Time: O(p) where p = `items.length` (each `pickDisplayPrice` call is O(prices for
 * that product), already summed by the caller's own query pattern). Space: O(p).
 */
export function toSiteProducts(
  items: readonly { product: CommerceProductRecord; prices: readonly CommercePriceRecord[] }[]
): StorefrontSiteProduct[] {
  const out: StorefrontSiteProduct[] = [];
  for (const { product, prices } of items) {
    const price = pickDisplayPrice(prices);
    if (price) out.push(toSiteProduct({ product, price }));
  }
  return out;
}
