import type { RateLimitProfile } from "@jini-ai/core/contracts/site/http-kit-rate-limit";

/**
 * Politeness toward the TARGET site, counted per workspace and host: an import that walks a whole
 * sitemap stays well under it, while a looping agent cannot hammer someone else's server.
 */
export const WEB_FETCH_PER_HOST: RateLimitProfile = { windowSeconds: 60, max: 30, burst: 0 };

