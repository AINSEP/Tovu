declare const siteScopeKeyBrand: unique symbol;

/** Tovu site-directory identity; never accept the shared workspaceId as a scope key.
 * See ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md, Job E (2026-11-04).
 */
export type SiteScopeKey = string & { readonly [siteScopeKeyBrand]: true };
