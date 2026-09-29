import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import type { SecretSealerPort } from "#src/features/webhooks/ports";
import { type ChatKernel, chatKernel, pgChatKernel } from "#src/platform/db/chat-kernel";
import { type ContentKernel, contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection, openPostgresKernel, type StorageKernel } from "#src/platform/db/kernel/index";
import { defaultPgliteSocketDir, PGLITE_SOCKET_FILE, startPgliteOwner, type PgliteOwner } from "#src/platform/db/kernel/drivers/pglite-owner";
import { openPgliteSocketKernel } from "#src/platform/db/kernel/drivers/pglite-socket";
import { migrateChatDatabase, migrateContentDatabase } from "#src/platform/db/migrations/index";
import { prepareContentStore } from "#src/platform/db/prepare-content-store";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { seededPosts, seededPresentation, seededWorkspace } from "../configuration/seed.js";
import { openSiteContentDb } from "./open-site-content-db.js";
import { resolvePostgresConnectionString } from "./storage-secret.js";

/**
 * @file The composition root's one store opener: a site's storage choice (`resolveSiteStorage`) in,
 * the content and AI chat kernels every repo is built from out (R1 plan §0).
 *
 * - SQLite: `content.db` + `chat.db` in the site folder.
 * - Postgres (R1f): one database for both — content in `public`, AI chat in `ai_chat` (ADR-067) —
 *   through one node-postgres pool. The connection string comes from the site's sealed secret or
 *   its environment variable (`storage-secret.ts`, O3); both histories are migrated to head
 *   (`migrateContentDatabase`, `migrateChatDatabase`) and the content store prepared before the
 *   store is handed back. Every step is concurrency-safe (advisory locks), so the API process and
 *   the agent daemon may both run it.
 * - PGlite (R1f part 2): one embedded data dir, `<site>/pglite/`, same two schemas. The API process
 *   (`owner`) opens it and serves it on a private Unix socket (`startPgliteOwner`); every query,
 *   the owner's own included, goes through that socket with one connection
 *   (`openPgliteSocketKernel`). The agent daemon (`client`) never opens the data dir: it waits for
 *   the owner's socket, then connects the same way. The socket path is {@link PG_SOCKET_ENV} when
 *   set (the daemon supervisor passes the owner's), else derived from the data dir.
 * The journal (`ops/database-journal.db`) is not part of the store: it is SQLite on every kind.
 */

/** Which process opens the store. The API process owns it; the agent daemon is a client (PGlite: R1f). */
export type SiteStoreRole = "owner" | "client";

/** A PGlite site's data dir, inside the site folder. */
export const PGLITE_DATA_DIR_NAME = "pglite";

/** The PGlite owner's socket file; the daemon supervisor hands the owner's to the daemon. */
export const PG_SOCKET_ENV = "TOVU_PG_SOCKET";

/** How long a PGlite client waits for its owner's socket by default. */
const PGLITE_CLIENT_WAIT_MS = 60_000;

/** A storage kind this build cannot open yet. */
export class StorageNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageNotAvailableError";
  }
}

export interface SiteStore {
  readonly storage: SiteStorage;
  readonly content: ContentKernel;
  readonly chat: ChatKernel;
  /** The Drizzle handle behind `content`, on SQLite only: the one input `sqliteOnlyServices` takes. */
  readonly sqliteDb?: ContentDb;
  /** PGlite: the owner's socket file, for the agent daemon ({@link PG_SOCKET_ENV}). */
  readonly pgliteSocketPath?: string;
  /** Closes the connections this call opened (a caller-supplied `db` stays open); a PGlite owner also stops serving. */
  close(): Promise<void>;
}

export interface OpenSiteStoreRequired {
  storage: SiteStorage;
  /** `content.db` (SQLite), also the anchor for the site folder. */
  dbPath: string;
  chatDbPath: string;
  role: SiteStoreRole;
}

export interface OpenSiteStoreOptional {
  /** An already opened, migrated and prepared content.db (the install-dir `serve` path). SQLite only. */
  db?: ContentDb;
  /** Postgres: where `secretRef: { env }` is read; PGlite: where {@link PG_SOCKET_ENV} is (default `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** PGlite client: how long to wait for the owner's socket (default 60 s). */
  pgliteClientWaitMs?: number;
  /** Postgres: opens `secretRef: "site"` (default: the site key's sealer, `siteSecretSealer`). */
  sealer?: SecretSealerPort;
}

/**
 * Opens the site's store: on SQLite, `content.db` (open → recover → migrate → prepare, unless
 * `optional.db` is given) and `chat.db` beside it; on Postgres, see {@link openPostgresSiteStore}.
 *
 * @throws {StorageSecretError} (Postgres) when the connection string cannot be read.
 * @throws {StorageNotAvailableError} (PGlite client) when the owner's socket does not appear in time.
 * @throws {PgliteOwnerLockedError} (PGlite owner) when another live process owns the data dir.
 */
export async function openSiteStore(required: OpenSiteStoreRequired, optional: OpenSiteStoreOptional = {}): Promise<SiteStore> {
  const { storage } = required;
  if (storage.kind === "pglite") return openPgliteSiteStore(storage, required, optional);
  if (storage.kind === "postgres") return openPostgresSiteStore(storage, required, optional);
  const ownsDb = optional.db === undefined;
  const db = optional.db ?? (await openSiteContentDb(required.dbPath));
  const chatDb = openChatDb(required.chatDbPath);
  return {
    storage,
    content: contentKernel(db),
    chat: chatKernel(chatDb),
    sqliteDb: db,
    close: async () => {
      closeSqliteConnection(chatDb);
      if (ownsDb) closeSqliteConnection(db);
    },
  };
}

/**
 * Postgres: connection string (O3) → one pool → content history to head → chat history to head
 * (`ai_chat`) → watermark row + first-run demo seed. Closes the pool when any step fails.
 */
async function openPostgresSiteStore(
  storage: Extract<SiteStorage, { kind: "postgres" }>,
  required: OpenSiteStoreRequired,
  optional: OpenSiteStoreOptional
): Promise<SiteStore> {
  if (optional.db !== undefined) throw new Error("openSiteStore: a caller-supplied SQLite db cannot back a postgres site");
  const connectionString = await resolvePostgresConnectionString(storage, { siteDir: dirname(required.dbPath) }, optional);
  const base = openPostgresKernel<unknown>({ connectionString });
  return preparePgStore({ storage, base, close: () => base.close() });
}

/**
 * PGlite: owner = start serving `<site>/pglite/` on its socket, then connect to it like any client;
 * client = wait for the owner's socket, then connect. Both then run the same head-migrate + prepare
 * as Postgres (idempotent and lock-serialized, so whichever process gets there second finds nothing
 * to do). The owner stops serving when the store closes or any step fails.
 */
async function openPgliteSiteStore(
  storage: Extract<SiteStorage, { kind: "pglite" }>,
  required: OpenSiteStoreRequired,
  optional: OpenSiteStoreOptional
): Promise<SiteStore> {
  if (optional.db !== undefined) throw new Error("openSiteStore: a caller-supplied SQLite db cannot back a pglite site");
  const dataDir = join(dirname(required.dbPath), PGLITE_DATA_DIR_NAME);
  const fromEnv = (optional.env ?? process.env)[PG_SOCKET_ENV]?.trim();
  const socketDir = fromEnv ? dirname(fromEnv) : defaultPgliteSocketDir(dataDir);
  let owner: PgliteOwner | undefined;
  if (required.role === "owner") owner = await startPgliteOwner({ dataDir }, { socketDir });
  const socketPath = owner?.socketPath ?? join(socketDir, PGLITE_SOCKET_FILE);
  const stopOwner = async () => {
    await owner?.close();
  };
  try {
    if (owner === undefined) await waitForPgliteSocket(socketPath, optional.pgliteClientWaitMs ?? PGLITE_CLIENT_WAIT_MS);
  } catch (err) {
    await stopOwner();
    throw err;
  }
  const base = openPgliteSocketKernel<unknown>({ socketPath });
  const store = await preparePgStore({
    storage,
    base,
    close: async () => {
      try {
        await base.close();
      } finally {
        await stopOwner();
      }
    },
  });
  return { ...store, pgliteSocketPath: socketPath };
}

/** Polls for the owner's socket file; the owner creates it only once it accepts connections. */
async function waitForPgliteSocket(socketPath: string, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  while (!existsSync(socketPath)) {
    if (Date.now() >= deadline) {
      throw new StorageNotAvailableError(
        `this site is stored on pglite and its owner (the site's API process) is not serving ${socketPath}; start the site, then retry`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * Postgres and PGlite alike: content history to head → chat history to head (`ai_chat`) → watermark
 * row + first-run demo seed, over one kernel. `close` runs when any step fails.
 */
async function preparePgStore(required: {
  storage: Exclude<SiteStorage, { kind: "sqlite" }>;
  base: StorageKernel<unknown>;
  close: () => Promise<void>;
}): Promise<SiteStore> {
  const { storage, base, close } = required;
  // The same connection(s), typed per history: the content tables here, the chat tables via `pgChatKernel`.
  const content = base as ContentKernel;
  try {
    await migrateContentDatabase(base);
    await migrateChatDatabase(base);
    await prepareContentStore(content, { seed: { workspace: seededWorkspace, posts: seededPosts, presentation: seededPresentation } });
  } catch (err) {
    await close();
    throw err;
  }
  return { storage, content, chat: pgChatKernel(base), close };
}
