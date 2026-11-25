import { createMediaApi } from "@jini-ai/admin/screens/media/api/media-api";
import { request } from "../../../lib/admin-http/request";
import { siteUrl } from "../../../lib/site-url";

/**
 * @file The admin's media binding: `@jini-ai/admin`'s media API client, bound once to this host's
 * authenticated `request` and public-site `siteUrl`. Every media caller reads this singleton; the
 * credential/provider-map types live with the factory in `@jini-ai/admin/screens/media/api/media-api`.
 */

/**
 * One media-generation vendor's stored credentials, keyed by ENGINE-CANONICAL provider id (`grok`,
 * `nanobanana`, …) — see `features/media/media-provider-catalog.ts` for why the spelling matters.
 *
 * Structurally `@jini-ai/ui`'s `MediaProviderCredentials` and mirrors
 * `apps/website/src/features/media/provider-credential-store.ts`'s `MediaProviderCredentialView` on the server. `apiKey`
 * is send-only: the operator types one and it goes up, but no response ever carries it back — a
 * stored key comes back as `apiKeyConfigured`/`apiKeyTail` instead.
 */

/**
 * The image a public post shows as its cover: the `/m/` route's core `public` rendition (WebP,
 * uncropped, generated once and cached server-side — `apps/website/src/features/media/bootstrap.ts`).
 * The Edit post cover slot shows this one so it matches the published page (owner 2026-10-11:
 * it showed the `og` 1200 × 630 share crop squeezed into a 220px band; the public page shows the
 * whole image). A browser that opened the post already has it cached. `v1` because that bootstrap
 * is find-or-create and never mints a second version; callers still fall back to
 * {@link mediaOriginalUrl} when this fails to load (no `sharp`, a gated asset, a newer version).
 */

/** The admin API calls of the media feature, over this host's `request`. */
export const mediaApi = createMediaApi({ request, siteUrl });
