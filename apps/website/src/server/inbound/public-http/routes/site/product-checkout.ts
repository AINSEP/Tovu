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
  if (html.includes("</main>")) return html.replace("</main>", `${markup}</main>`);
  if (html.includes("</body>")) return html.replace("</body>", `${markup}</body>`);
  return html + markup;
}
