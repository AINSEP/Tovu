import type { SiteRenderContext } from "@jini-ai/cms/public-http/http/site/render-context";
import type { JsonObject } from "@jini-ai/core/primitives";
import { entryList as entryListWithPorts, productEntryList as productEntryListWithPorts, productEntryContent as productEntryContentWithPorts } from "@jini-ai/cms/public-http/http/site/render/components/entry-lists";
import { formatMoney } from "@jini-ai/commerce/money";
import { renderCoverImageTag } from "#src/features/theme/static-render-content";

/** Host binding: Tovu's cover `<img>` renderer and its "No published posts yet." copy. */
export function entryList(ctx: SiteRenderContext, props: JsonObject): string {
  return entryListWithPorts({ ctx, props, renderCoverImageTag, emptyPostsText: "No published posts yet." });
}

/** Host binding: the catalog's money formatter and Tovu's "No products available yet." copy. */
export function productEntryList(ctx: SiteRenderContext): string {
  return productEntryListWithPorts({ ctx, formatMoney, emptyProductsText: "No products available yet." });
}

/** Host binding: the catalog's money formatter over the product-detail fallback body. */
export function productEntryContent(ctx: SiteRenderContext): string {
  return productEntryContentWithPorts({ ctx, formatMoney });
}
