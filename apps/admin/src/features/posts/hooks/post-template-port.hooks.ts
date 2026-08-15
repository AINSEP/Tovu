/**
 * @file What `use-post-template-source.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `fetch` call. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `development/docs/architecture/wired-hooks-convention.md`.
 *
 * Unlike most ports in this app, the real implementation wraps the browser's global `fetch`, not
 * `lib/api`'s `api` client — `PostTemplateModal`'s template source is served as a static asset
 * under `/theme-assets/{themeId}/pages/{templateFilename}` (`theme-static-assets.ts`'s
 * `express.static` mount), outside the JSON API entirely. The seam still matters for the same
 * reason every other port here exists: a test can describe "this template's source is X" (or "this
 * fetch fails with Y") without a real `fetch`/network round trip.
 */
export interface PostTemplatePort {
  /** Fetches the raw template source at `url` (built by `templateAssetUrl` in
   *  `use-post-template-source.hooks.ts`) as plain text. Rejects on a non-OK HTTP response or a network
   *  failure — the caller (`useTemplateSource`) is what turns that into a describable message. */
  fetchTemplateSource(url: string): Promise<string>;
}
