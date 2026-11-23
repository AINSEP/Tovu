import { SqliteMenuRepo } from "#src/features/navigation/repo.sqlite";
import { SqliteNavLocationBindingRepo } from "#src/features/navigation/repo.sqlite";
import { SqliteNewsletterListRepo } from "#src/features/newsletter/repo.sqlite";
import { SqliteTransformDefinitionRepo } from "#src/platform/db/sqlite/media-repo.sqlite";
import { builtInSeedUploadsDir } from "../site-paths.js";
import { ensureCoreMediaTransform } from "@jini-ai/cms/media/site/bootstrap";
import { ensureDefaultList } from "#src/features/newsletter/lists";
import { hydrateBlobStoreFromSeed } from "@jini-ai/cms/media/site/hydrate-blob-store-from-seed";
import { installCommentsDataModule } from "#src/features/comments/data-module-install";
import { installNewsletterDataModule } from "#src/features/newsletter/data-module-manifest";
import { rebuildNavLocationBindings } from "@jini-ai/cms/navigation";
import type { SiteStore } from "../open-site-store.js";
import type { resolveSiteBindingOverride } from "./overrides.js";
import type { createMediaBlobStore } from "#src/features/object-storage/index";
import type { createConsoleLogger } from "@jini-ai/core/primitives";

interface StartBootDataRequired {
  kernel: SiteStore["content"];
  clock: { nowMs: () => number; nowIso: () => string };
  workspaceId: string;
  dbPath: string;
  idGen: { newId: () => string };
  resolvedSiteBinding: ReturnType<typeof resolveSiteBindingOverride>;
  blobStore: ReturnType<typeof createMediaBlobStore>["blobStore"];
  consoleLogger: ReturnType<typeof createConsoleLogger>;
}

export function startBootData(required: StartBootDataRequired, _optional = {}) {
  const { kernel, clock, workspaceId, dbPath, idGen, resolvedSiteBinding, blobStore, consoleLogger } = required;

  // ADR-PIPE-012 D-5/D-8 (T043/T044): the persistent composition root uses the real SQLite
  // adapters for both navigation repo ports, and runs the binding-index rebuild once at boot
  // (after the SQLite db above has already opened) so the derived index starts in sync with
  // whatever menus this content.db already holds. Fire-and-forget, mirroring `settingsReady`'s
  // shape — logged and swallowed rather than aborting boot, matching W-003's "logs and continues
  // on failure" contract (ADR-PIPE-012 Wiring Map).
  const menuRepo = new SqliteMenuRepo({ store: kernel });
  const navLocationBindingRepo = new SqliteNavLocationBindingRepo({ store: kernel });
  const menuBindingsReady = rebuildNavLocationBindings({
    menuRepo,
    bindingRepo: navLocationBindingRepo,
    clock,
    workspaceId: workspaceId,
  })
    .then(() => undefined)
    .catch((err) => {
      consoleLogger.error({ message: `rebuildNavLocationBindings failed at boot: ${(err as Error).message}` });
    });

  // SPEC-011 (Newsletter, ADR-PIPE-011 T011/W-010): boot-time `declareDataModule()` invocation for
  // Newsletter's real 5-table manifest, on the storage kernel of the SAME connection as the Drizzle
  // `ContentDb` (`declareDataModule` bridges the handle to its one kernel). Idempotent —
  // `declareDataModule()`'s own skip-if-exists logic makes repeated boot calls safe (T010 proves the
  // failure/rollback path separately). Fire-and-forget, mirroring `menuBindingsReady`'s shape: logged
  // and swallowed rather than aborting boot on failure — a failed install leaves Newsletter's admin
  // routes 404/500ing against missing tables, but never bricks the rest of the server.
  const newsletterListRepo = new SqliteNewsletterListRepo({ store: kernel });
  // T030: seed the workspace's default "all subscribers" list right after the tables exist —
  // idempotent (`ensureDefaultList` is itself a find-or-create), matching `declareDataModule()`'s own
  // skip-if-exists convention.
  const newsletterReady = installNewsletterDataModule({ db: kernel, dbPath })
    .then(() => ensureDefaultList({ deps: { listRepo: newsletterListRepo, clock, ids: idGen }, input: { workspaceId: workspaceId } }))
    .then(() => undefined)
    .catch((err) => {
      consoleLogger.error({ message: `installNewsletterDataModule failed at boot: ${(err as Error).message}` });
    });

  /**
   * ADR-031/ADR-023 (SPEC-033) — Comments' `declareDataModule()` call, against the SAME shared
   * connection Newsletter's install just used. Chained AFTER `newsletterReady`
   * resolves (NOT fired in parallel), for the exact same reason `seoReady` is chained after
   * `settingsReady` above: two independent fire-and-forget async chains racing SQLite calls
   * (including SPEC-032's exclusive-lock pragma toggling) against ONE shared connection produced
   * a real, deterministically-reproduced "database is locked" failure — caught via a live
   * multi-boot smoke test, not a synthetic case. This is the identical hazard class this file's
   * own `seoReady` comment already documents; this fixes the same mistake made fresh here.
   */
  const commentsReady = newsletterReady
    .then(() => installCommentsDataModule({ db: kernel, dbPath }))
    .catch((err) => {
      consoleLogger.error({ message: `installCommentsDataModule failed at boot: ${(err as Error).message}` });
    });

  // ADR-027 §4 — the core "public" transform definition that lets the unauthenticated `/m/`
  // rendition route serve ANY asset at all (`media/bootstrap.ts`'s file header has the full
  // diagnosis: with zero rows in `transform_registry`, every `/m/` request 404s regardless of
  // what media exists). Hoisted here (rather than down with the other media repos below) so this
  // call and the returned `RouteDeps.transformDefinitionRepo` field share the SAME repo instance
  // rather than two independent wrappers over the same table. Chained after `commentsReady`, not
  // fired in parallel, for the identical single-SQLite-connection transaction hazard every `Ready`
  // chain in this function documents; fire-and-forget and not exposed on `RouteDeps`, mirroring
  // `menuBindingsReady`'s shape — nothing downstream needs to gate a request on this resolving,
  // since `ensureCoreMediaTransform` is idempotent and the window between boot and its single
  // insert completing is a few milliseconds.
  const transformDefinitionRepo = new SqliteTransformDefinitionRepo({ store: kernel });
  const mediaTransformReady = commentsReady
    .then(() =>
      ensureCoreMediaTransform({
        deps: { clock, idGen, transformRepo: transformDefinitionRepo },
        input: { workspaceId: workspaceId },
      })
    )
    .catch((err) => {
      consoleLogger.error({ message: `ensureCoreMediaTransform failed at boot: ${(err as Error).message}` });
    });

  // Fills in stock blob BYTES for `media`/`asset_blobs` rows this site inherited from
  // `content.seed.db` (see `hydrate-blob-store-from-seed.ts`'s own header for the incident this
  // closes). Hoisted here — rather than left inline down with the other media fields below — for
  // the same reason `transformDefinitionRepo` above is: this call and the returned
  // `RouteDeps.blobStore` field must share the SAME instance, not two independent adapters over the
  // same backing store. Fired independently, NOT chained after `commentsReady`/`mediaTransformReady`
  // above: unlike those two, this touches no SQLite connection at all — it only reads the seed
  // payload off disk and calls `blobStore.exists`/`put` — so it carries none of the shared-
  // connection hazard the rest of this function's `Ready` chain exists to avoid. Exposed on
  // `RouteDeps` (unlike `mediaTransformReady`) purely so a boot-integration test can await
  // deterministic completion instead of racing a fire-and-forget background copy; no route or
  // caller needs to gate on it — `hydrateBlobStoreFromSeed`'s own per-key gate makes every run after
  // the first an all-`skipped` no-op. It calls `blobStore.putIfAbsent()` — one atomic call per key
  // now, not a separate `exists()`/`put()` pair (see that file's header for the race that closes).
  // `resolvedUploadsDir`/`blobStore` are resolved in the prelude above (a bad
  // TOVU_MEDIA_BLOB_STORE config must throw before any fire-and-forget boot promise starts).
  const blobHydrationReady = hydrateBlobStoreFromSeed({
    seedUploadsDir: builtInSeedUploadsDir({ siteName: resolvedSiteBinding.name }),
    blobStore,
  }).catch((err) => {
    consoleLogger.error({ message: `hydrateBlobStoreFromSeed failed at boot: ${(err as Error).message}` });
    return undefined;
  });
  return { menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, commentsReady, transformDefinitionRepo, mediaTransformReady, blobHydrationReady };
}
