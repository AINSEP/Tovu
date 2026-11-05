import { escapeHtml } from "#src/platform/html/escape";

/** Add the site's one-price purchase form, using its trusted workspace and a catalog price id.
 * The external Jini script owns checkout state; themes keep their existing button styling.
 * @complexity O(html.length), with no I/O. */
export function appendProductCheckout(
  { html, workspaceId, priceId }: { html: string; workspaceId: string; priceId: string },
  _optional: Record<string, never> = {},
): string {
  const orders = `/api/commerce/v1/workspaces/${encodeURIComponent(workspaceId)}/orders`;
  const markup = `<section class="wrap commerce-checkout"><form data-commerce-checkout data-orders-url="${escapeHtml(orders)}" data-price-id="${escapeHtml(priceId)}"><button type="submit" class="button">Buy now</button><p data-checkout-status role="status" aria-live="polite"></p><a data-checkout-order hidden>View order</a></form></section><script src="/commerce/checkout.js" defer></script>`;
  return appendMarkup({ html, markup });
}

/** Both checkout controls and the deployed-shop link occupy the same theme-owned main layout. */
function appendMarkup({ html, markup }: { html: string; markup: string }): string {
  if (html.includes("</main>")) return html.replace("</main>", `${markup}</main>`);
  if (html.includes("</body>")) return html.replace("</body>", `${markup}</body>`);
  return html + markup;
}

/** A link sink still checks the configured origin even though commerce validates its configuration. */
function deployedShop({ origin, productSlug }: { origin: string; productSlug: string }): string | null {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.origin === origin ? `${origin}/products/${encodeURIComponent(productSlug)}` : null;
  } catch { return null; }
}

/** The host's activation answer gates purchase controls. Desktop management opens the deployed
 * HTTPS shop; only that shop displays a payment form. @complexity O(html.length), <=2 config reads. */
export async function productCheckoutWhenReady(
  { html, workspaceId, priceId, productSlug, currentOrigin, commerce }: { html: string; workspaceId: string; priceId: string | undefined;
    productSlug: string; currentOrigin: string;
    commerce: { status(): Promise<{ active: boolean; ready: boolean }>; checkoutOrigin(): Promise<string | null> } | undefined },
  _optional: Record<string, never> = {},
): Promise<string> {
  if (!priceId || !commerce) return html;
  const status = await commerce.status();
  if (!status.active || !status.ready) return html;
  const origin = await commerce.checkoutOrigin();
  const shop = origin ? deployedShop({ origin, productSlug }) : null;
  if (!shop) return html;
  if (currentOrigin === origin) return appendProductCheckout({ html, workspaceId, priceId });
  return appendMarkup({ html, markup: `<section class="wrap commerce-checkout"><a class="button" href="${escapeHtml(shop)}">Open shop to buy</a></section>` });
}
