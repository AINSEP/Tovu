/**
 * @file The Google Workspace product catalog (`products.json`): which products the plugin ships and
 * which Google scopes each one needs. Turns the host's opaque scope-set ids (the products being
 * connected) into the exact scope list the sign-in requests.
 *
 * Exists because enabling a product and granting its scopes are separate steps: the catalog is the
 * one place that says what a product needs, so the sign-in never asks for more than the products
 * being connected. v1 ships Sheets only, on `drive.file` (files the person picked or Tovu created).
 * Per-workspace on/off state is added here when the connection panel stores it.
 */
import catalog from '../products.json' with { type: 'json' };

const GOOGLE_SCOPE = /^https:\/\/www\.googleapis\.com\/auth\/[a-z.]+$/;

/** A catalog entry that is not well formed stops the plugin loading, instead of requesting odd scopes. @complexity O(s). */
function assertScopes(scopes, where) {
  if (!Array.isArray(scopes) || !scopes.every((scope) => GOOGLE_SCOPE.test(scope))) {
    throw new Error(`products.json ${where} must list Google OAuth scope URLs. Fix the plugin package.`);
  }
  return Object.freeze([...scopes]);
}

/** The validated, frozen catalog. @complexity O(p * s). */
function readCatalog(raw) {
  const products = raw.products.map((product) => Object.freeze({
    ...product,
    requiredScopes: assertScopes(product.requiredScopes, `products '${product.id}' requiredScopes`),
    optionalScopes: assertScopes(product.optionalScopes, `products '${product.id}' optionalScopes`),
  }));
  return Object.freeze({ baseScopes: assertScopes(raw.baseScopes, 'baseScopes'), products: Object.freeze(products) });
}

export const PRODUCTS = readCatalog(catalog);

/**
 * The scopes to request for these products: the base scope plus each product's required scopes,
 * de-duplicated in catalog order. An id the catalog does not know is refused, never ignored, so a
 * typo cannot silently connect less than the person chose.
 * @param {{ productIds: readonly string[] }} required
 * @returns {readonly string[]}
 * @complexity O(p * s).
 */
export function scopesFor(required, _optional = {}) {
  const chosen = required.productIds.map((id) => {
    const product = PRODUCTS.products.find((entry) => entry.id === id);
    if (!product) throw new Error(`Google Workspace has no product '${id}'. Choose one of: ${PRODUCTS.products.map((entry) => entry.id).join(', ')}.`);
    return product;
  });
  return [...new Set([...PRODUCTS.baseScopes, ...chosen.flatMap((product) => product.requiredScopes)])];
}
