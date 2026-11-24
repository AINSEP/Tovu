import { createPublishToLiveAvailabilityStore } from "@jini-ai/admin/publish-content/screen/hooks/publish-availability.store";

import { useSyncExternalStore } from "react";

/**
 * @file Whether this admin may publish to a live site at all — the ONE flag every Publish entry
 * point reads: the section buttons (`use-publish-section-button.hooks.ts`), the Dashboard's
 * "Publish all content", and `requestPublish` itself (which covers the `?publish=` deep link, the
 * chat capability and WebMCP, since they all open the dialog through it).
 *
 * `false` only on the live site: the server answers `/auth/me` with `canPublishToLive: false` when
 * `TOVU_RUNTIME_MODE=production` (`features/publish-content/live-site-policy.ts` on the server,
 * which also refuses the push routes). `apps/admin/src/App.hooks.ts` feeds this store from that response.
 *
 * Defaults to `true`: every screen that shows a Publish button sits behind the sign-in gate, which
 * only opens after `/auth/me` answered, and an older server without the field could publish.
 */

/** This admin app's single instance — every Publish entry point reads it; `App.hooks.ts` and
 *  `App.session.ts` feed it from `/auth/me`. The store's logic lives in `@jini-ai/admin`. */
export const { setPublishToLiveAvailable, isPublishToLiveAvailable, usePublishToLiveAvailable } =
  createPublishToLiveAvailabilityStore();
