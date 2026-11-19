import type { SiteStorage } from "#src/platform/site-dir/types";
import { openSiteStore, type SiteStore, type SiteStoreRole } from "../open-site-store.js";
import { builtInContentSeedDbPath, defaultChatDbPath } from "../site-paths.js";
import { dirname } from "node:path";
import { hydrateContentDbFromSeed } from "#src/platform/db/sqlite/hydrate-content-db-from-seed";
import { isInMemoryDbPath } from "@jini-ai/db/data-modules";
import { mkdirSync } from "node:fs";
import { resolveSiteDirForDatabase } from "#src/platform/site-dir/site-databases";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import { startChatExpirySweep } from "#src/assistant/persistence/chat-expiry-sweep";
import { startMailRetention } from "#src/features/mail/retention";
import { startSubmissionIpExpirySweep } from "#src/features/forms/submission-ip-expiry-sweep";
import { type CreateSiteRouteDepsOverrides, resolveSiteBindingOverride } from "./overrides.js";

/**
 * First-boot-only: turns a deployed container's stock `content.seed.db` into this site's live
 * `content.db`, exactly once — same presence-not-contents gate `seedSiteThemes()` above uses for
 * `themes/`, so a live db from any later boot is never touched (see `hydrateContentDbFromSeed()`'s
 * own header for the full rationale). Hoisted out of `createSiteRouteDeps` for the same reason
 * {@link assertOverridesPairedOrAbsent} is: one branch counted once here, not inline in the
 * composition root. A no-op whenever `overrides.db` is supplied — that caller (`boot-site-dir.ts`'s
 * install-dir path) has already opened its own db before reaching here, so `dbPath` is never even
 * read in that branch.
 */
function hydrateContentDbIfNeeded({ dbPath, storage }: { dbPath: string; storage: SiteStorage }, { overrides }: { overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}): void {
  if (overrides?.db !== undefined || storage.kind !== "sqlite") return;
  // The served site's stock seed, by its binding's name, not `basename(siteDir())`: see
  // {@link resolveExportOutputRootDir}'s doc for why the env/cwd site can be a different one.
  hydrateContentDbFromSeed({ seedDbPath: builtInContentSeedDbPath({ siteName: resolveSiteBindingOverride(overrides).name }), dbPath });
}

function prepareCompositionStorage({ dbPath, overrides }: {
  dbPath: string; overrides: Partial<CreateSiteRouteDepsOverrides>;
}, _options = {}) {
  const anchor = isInMemoryDbPath({ dbPath }) ? ":memory:" : resolveSiteDirForDatabase({ dbPath, siteDir: overrides.siteBinding?.dir });
  const storage = resolveSiteStorage({ siteDir: anchor });
  if (!isInMemoryDbPath({ dbPath }) && storage.kind === "sqlite" && !overrides.db) mkdirSync(dirname(dbPath), { recursive: true });
  return storage;
}

/**
 * What a composition hands its store's `onClose`: the disposer a `register*`/`subscribe` call
 * returned, or the promise of one (`EventBusPort.subscribe` is async), so every registration goes
 * through the one collector whatever its return shape.
 */
export type StoreCloseRegistration = (() => unknown) | Promise<() => unknown>;

/**
 * The prelude's store step (R1 plan R1d): the site's storage choice from its `.site-meta.json`
 * (absent = SQLite), then the content + chat store it names. When `overrides.db` is supplied (the
 * install-dir `serve` path), that SAME handle is reused rather than opening/migrating a second db —
 * `bootSiteDir` has already validated, migrated, and stamped it (BR-05/BR-06).
 *
 * The API process (`owner`) also starts the hourly guest-chat expiry sweep here, on the chat kernel
 * of that store, plus daily form-submitter IP cleanup when the package/schema gates are ready;
 * the agent daemon (`client`) leaves retention to it. The returned store's `close()`
 * drains boot work before disposing registrations, then stops the sweeps (waiting for a pass in
 * flight) before closing the underlying store, so no pass ever queries a closed store.
 * `release` is what {@link createSiteRouteDeps} runs when the rest of
 * the composition fails: close what this call opened, or only stop the sweep on a supplied store.
 *
 * `onClose` collects the composition's registrations (a resolve-phase handler or slot bound to this
 * store's repos, a bus subscription) so both `close()` and `release` remove them first. Without it, a
 * closed site's handler stays on every request's path, querying a database that is no longer open.
 */
export async function openCompositionStore(
  { dbPath }: { dbPath: string },
  { overrides = {} }: { overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}
): Promise<{ store: SiteStore; release: () => Promise<void>; onClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void; beforeClose: (required: { drain: () => Promise<void> }, optional?: Record<string, never>) => void }> {
  const storage = prepareCompositionStorage({ dbPath, overrides });
  hydrateContentDbIfNeeded({ dbPath, storage }, { overrides });
  const role = overrides.storeRole ?? "owner";
  const supplied = overrides.store;
  // SQLite: `openSiteContentDb` (open → ADR-023 §2 crash recovery → migrate → watermark + demo
  // seed) unless `overrides.db`, then `chat.db` beside it (`defaultChatDbPath`). `chat.db`'s
  // directory is `dirname(dbPath)`, which the content open already required to exist.
  const opened = supplied ?? (await openSiteStore({ storage, dbPath, chatDbPath: resolveChatDbPath({ dbPath }, { overrides }), role }, { db: overrides.db, ...(overrides.sqliteOpen ? { sqliteOpen: overrides.sqliteOpen } : {}) }));
  const { stopChatSweep, stopSubmissionIpSweep, stopMailRetention } = startOwnerSweeps({ role, opened }, { overrides });
  const registrations: StoreCloseRegistration[] = [];
  const bootDrains: Array<() => Promise<void>> = [];
  const stopStoreUsers = async (): Promise<void> => {
    // Boot still uses the inventory, journal and repos that the disposers below release.
    await Promise.all(bootDrains.map((drain) => drain()));
    await Promise.all(registrations.splice(0).map(async (registration) => (await registration)()));
    await Promise.all([stopChatSweep(), stopSubmissionIpSweep(), stopMailRetention()]);
  };
  const store: SiteStore = {
    ...opened,
    close: async () => {
      await stopStoreUsers();
      await opened.close();
    },
  };
  overrides.onStoreOpened?.({ store: store });
  return {
    store,
    release: supplied === undefined ? store.close : stopStoreUsers,
    onClose: ({ registration }, _optional = {}) => { registrations.push(registration); },
    beforeClose: ({ drain }, _optional = {}) => { bootDrains.push(drain); },
  };
}

/**
 * Extracted from {@link composeSiteRouteDeps} and {@link openCompositionStore} to keep their
 * complexity down: the chat database path, `overrides.chatDbPath` or `chat.db` beside the content db.
 */
export function resolveChatDbPath(
  { dbPath }: { dbPath: string },
  { overrides = {} }: { overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}
): string {
  return overrides.chatDbPath ?? defaultChatDbPath({}, { contentDbPath: dbPath });
}

/**
 * Extracted from {@link openCompositionStore} to keep its complexity down: the owner-only background
 * sweeps (guest-chat expiry, submission-IP expiry, mail retention) and their stop functions, each a
 * no-op on a client.
 */
function startOwnerSweeps(
  { role, opened }: { role: SiteStoreRole; opened: SiteStore },
  { overrides = {} }: { overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}
): { stopChatSweep: () => Promise<void>; stopSubmissionIpSweep: () => Promise<void>; stopMailRetention: () => Promise<void> } {
  const stopChatSweep = startOwnerChatExpirySweep({ role, chat: opened.chat }, { timing: overrides.chatExpirySweep });
  // Owner only, just like chat retention. Stop both passes before closing the supplied/opened
  // store, including composition-failure cleanup. Jini's export and migration 0006 gate the IP sweep.
  const stopSubmissionIpSweep = role === "owner"
    ? startSubmissionIpExpirySweep({ kernel: opened.content })
    : async () => {};
  const stopMailRetention = role === "owner" ? startMailRetention({ db: opened.content }) : async () => {};
  return { stopChatSweep, stopSubmissionIpSweep, stopMailRetention };
}

/** The guest-chat expiry sweep, on the owner only; its stop function (a no-op on a client). */
function startOwnerChatExpirySweep(
  { role, chat }: { role: SiteStoreRole; chat: SiteStore["chat"] },
  { timing = {} }: { timing?: CreateSiteRouteDepsOverrides["chatExpirySweep"] } = {}
): () => Promise<void> {
  return role === "owner" ? startChatExpirySweep({ store: chat }, timing) : async () => {};
}
