import type { SiteStore } from "../open-site-store.js";
import { SqliteAssetBlobRepo } from "#src/platform/db/sqlite/media-repo.sqlite";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import { SqliteMediaRepo } from "#src/platform/db/sqlite/media-repo.sqlite";
import { SqlitePostRepo } from "#src/features/post/index";

interface ComposeContentStoresRequired {
  kernel: SiteStore["content"];
}

export function composeContentStores(required: ComposeContentStoresRequired, _optional = {}) {
  const { kernel } = required;

  // Extracted (not inlined into the return object below) so `revertRegistry` can close over the
  // SAME instance `RouteDeps.postRepo` exposes, rather than a second `SqlitePostRepo(kernel)` — both
  // are stateless wrappers over the shared kernel, so a second instance would behave
  // identically, but reusing one matches this root's existing single-instance convention (see
  // `outbox`/`settingsRepo` above).
  const postRepo = new SqlitePostRepo({ store: kernel });

  // Task 8 of the publish-content (Publish Content) feature — same "reuse one instance" convention
  // as `postRepo` just above: `publishContentApplyPort`'s own bundle/baseline reads must hit the
  // SAME rows `RouteDeps.publishContentBundleRepo`/`publishContentBaselineRepo` expose (both are
  // stateless wrappers over the shared `db`, so a second instance would behave identically, but one
  // instance matches this root's own stated convention). `changeSets` is hoisted for the identical
  // reason as `revertRegistry`'s `postRepo` above.
  const changeSets = new SqliteChangeSetRepo({ store: kernel });
  // Hoisted out of the `routeDeps` literal below for the SAME reason as `changeSets` above: the
  // apply loop's `media.apply()` must read and write through the same adapters every media route
  // uses. Both are stateless wrappers over the shared `db`, so a second instance would behave
  // identically — one instance simply matches this root's own stated convention.
  const mediaRepo = new SqliteMediaRepo({ store: kernel });
  const assetBlobRepo = new SqliteAssetBlobRepo({ store: kernel });
  return { postRepo, changeSets, mediaRepo, assetBlobRepo };
}
