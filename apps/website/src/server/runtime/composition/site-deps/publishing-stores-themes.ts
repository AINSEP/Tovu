import type { SiteStore } from "../open-site-store.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeRedirects } from "./redirects.js";
import type { composeTrashAdapters } from "./trash-adapters.js";
import type { composeTrashService } from "./trash-service.js";
import { SqliteMediaContentTypeStore } from "#src/platform/db/sqlite/media-repo.sqlite";
import { SqlitePublishContentBaselineRepo } from "#src/platform/db/sqlite/publish-content-baseline-repo.sqlite";
import { SqlitePublishContentBundleRepo } from "#src/platform/db/sqlite/publish-content-bundle-repo.sqlite";
import { SqlitePublishContentPeerRepo } from "#src/features/publish-content/publish-content-peer-repo.sqlite";
import { THEME_ENTITY_TYPE } from "#src/features/trash/index";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { builtInContentSeedDbPath } from "../site-paths.js";
import { createFileBlobIndex } from "@jini-ai/cms/publish/transfer";
import { createSqlitePublishContentSeedHash } from "../publish-content-seed-hash.js";
import { bindThemeTrashAdapter } from "#src/features/theme/theme-trash-binding";
import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { themeRosterPorts } from "#src/features/theme/index";
import { syncThemeRoster } from "@jini-ai/cms/themes/preview/roster";
import { unhideIfRemoveThrows } from "@jini-ai/cms/trash/adapters/directory";
import { reportDirectoryRollbackFailure } from "#src/features/trash/index";

interface ComposePublishingStoresThemesRequired {
  kernel: SiteStore["content"];
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  workspaceId: string;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  redirectsWriteDeps: ReturnType<typeof composeRedirects>["redirectsWriteDeps"];
  resolvedThemesDir: ReturnType<typeof composeAgentPluginBootstrap>["resolvedThemesDir"];
  trashAdapters: ReturnType<typeof composeTrashAdapters>["trashAdapters"];
  trash: ReturnType<typeof composeTrashService>["trash"];
}

export function composePublishingStoresThemes(required: ComposePublishingStoresThemesRequired, _optional = {}) {
  const { kernel, resolvedSiteBinding, workspaceId, clock, idGen, redirectsWriteDeps, resolvedThemesDir, trashAdapters, trash } = required;
  // One instance for the render path and publish's media apply, which records what render reads.
  const mediaContentTypeStore = new SqliteMediaContentTypeStore({ store: kernel });
  const publishContentBundleRepo = new SqlitePublishContentBundleRepo({ store: kernel });
  const publishContentBaselineRepo = new SqlitePublishContentBaselineRepo({ store: kernel });
  // `publish-files-plan-2026-09-24.md` §3 — ONE process-lifetime instance, same "hoisted, never
  // rebuilt per request" convention as every repo above. See `routes/types.ts`'s `fileBlobIndex` doc.
  const publishContentFileBlobIndex = createFileBlobIndex();
  // Task 10 — named remote Tovus, with their API keys sealed at rest under the shared ADR-058
  // sealer/keyring below. See `routes/types.ts`'s `publishContentPeerRepo` doc.
  const publishContentPeerRepo = new SqlitePublishContentPeerRepo(kernel);
  // D1 — ONE seed lookup for both the import route's planner and the apply loop's re-verification
  // (`RouteDeps.publishContentSeedHash`), so the two can never disagree on "untouched since seed".
  const publishContentSeedHash = createSqlitePublishContentSeedHash({
    seedDbPath: builtInContentSeedDbPath({ siteName: resolvedSiteBinding.name }),
    workspaceId,
    clock,
    idGen,
    redirectsWriteDeps,
  });
  // One array shared by `routeDeps.themes` (below) and the theme-files apply's refresh hook, so a
  // published theme's partials/pages re-render without a restart (`rescanThemes` refills IN PLACE).
  const siteThemes = discoverAllBuiltInThemes({ dir: resolvedThemesDir, source: "built-in" });
  // Records what the folder looked like at discovery, so the first theme change ANOTHER process
  // makes (the agent daemon's `theme_duplicate`, or the web server's admin Duplicate seen from the
  // daemon) is noticed by this one. See `@jini-ai/cms/themes/preview/roster`.
  syncThemeRoster({ ...themeRosterPorts, themes: siteThemes, themesDir: resolvedThemesDir });
  // `theme` joins the Trash here rather than in `trashAdapters`' literal above: its adapter rescans
  // `siteThemes` after every move, and the Trash resolves adapters at call time, so this `set` is seen
  // by every later trash/restore/purge (`theme_trash`, `trash_restore_item`, the admin Trash screen).
  const themeTrashAdapter = bindThemeTrashAdapter({ themes: siteThemes, themesDir: resolvedThemesDir });
  trashAdapters.set(THEME_ENTITY_TYPE, themeTrashAdapter);
  // Folder moves before the Trash row is written; if that write throws, move the folder back.
  const removeTheme = unhideIfRemoveThrows({ onRollbackError: reportDirectoryRollbackFailure, adapter: themeTrashAdapter, remove: bindRemoveEntity({ trash, entityType: THEME_ENTITY_TYPE }) });
  return { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme };
}
