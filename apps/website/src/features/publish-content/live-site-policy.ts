import { resolveRuntimeMode, type ResolveRuntimeModeOptions } from "#src/contracts/core/runtime-mode";

/**
 * @file Whether THIS instance may publish content to a live site at all.
 *
 * The live site (`TOVU_RUNTIME_MODE=production`, set in `fly.toml`'s `[env]`) is the publish
 * DESTINATION — there is nothing further for it to push to. It still RECEIVES pushes (the import,
 * bundle and blob routes), so only the outbound push routes consult this. `/auth/me` echoes it as
 * `canPublishToLive` so the admin hides every Publish entry point there; the push routes refuse
 * with {@link PUBLISH_FROM_LIVE_SITE_ERROR} in case a stale tab or direct call gets through anyway.
 */

export const PUBLISH_FROM_LIVE_SITE_CODE = "PUBLISH_FROM_LIVE_SITE";

export const PUBLISH_FROM_LIVE_SITE_ERROR =
  "This is the live site, so there is nowhere to publish to. Publish from your local copy of the site instead.";

/**
 * @param options Same env override `resolveRuntimeMode` takes; omitted reads `process.env`.
 * @returns `false` only when the runtime mode is `production`.
 * @complexity O(1).
 */
export function canPublishToLive(options?: ResolveRuntimeModeOptions): boolean {
  return resolveRuntimeMode(options) !== "production";
}
