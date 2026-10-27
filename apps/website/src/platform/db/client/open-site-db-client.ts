import { existsSync } from "node:fs";
import { dirname } from "node:path";

import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentKernel } from "../content-kernel.js";
import { type ChatDatabase, type ChatKernel, pgChatKernel } from "../chat-kernel.js";
import type { StorageKernel } from "../kernel/port.js";
import type { SiteStorage } from "../../site-dir/types.js";

/**
 * @file The agent daemon's leaf DB client (ADR-070 draft, memory plan §2.7): a site's content and
 * chat kernels over the storage the site already uses, and nothing else. It runs no migrations,
 * seeds, data repairs or plugin-migration recovery, and never starts a PGlite owner: server boot
 * owns all of those (`server/runtime/composition/open-site-store.ts`), and the daemon is spawned
 * only after the server listens, so the databases it opens are already at head.
 *
 * Only the configured driver is loaded, through `import()`: a SQLite site never loads `pg`, and a
 * Postgres site never loads better-sqlite3 or the site-key sealer of another kind. The SQLite path
 * uses the driver's file kernel rather than `openSiteChatDb`/`openSqliteContentConnection`, because
 * both of those modules import the migration runner.
 */

/** The PGlite owner's socket, passed to the daemon by the supervisor (`PG_SOCKET_ENV` in `open-site-store.ts`). */
const PG_SOCKET_ENV = "TOVU_PG_SOCKET";

/** The driver module(s) each storage kind needs; {@link openSiteDbClient} imports only the configured one. */
export interface SiteDbDrivers {
  sqlite: typeof import("../kernel/drivers/sqlite.js");
  pglite: typeof import("../kernel/drivers/pglite-socket.js");
  postgres: typeof import("../kernel/drivers/postgres.js") &
    Pick<typeof import("../../../server/runtime/composition/storage-secret.js"), "resolvePostgresConnectionString">;
}

/** Loads one storage kind's driver modules (a port, so tests can see which kind was loaded). */
export type ImportSiteDbDriver = <K extends keyof SiteDbDrivers>(kind: K) => Promise<SiteDbDrivers[K]>;

const DRIVER_IMPORTS: { [K in keyof SiteDbDrivers]: () => Promise<SiteDbDrivers[K]> } = {
  sqlite: () => import("../kernel/drivers/sqlite.js"),
  pglite: () => import("../kernel/drivers/pglite-socket.js"),
  // The connection string is read exactly as server boot reads it: the sealed file or the env var (O3).
  postgres: async () => ({
    ...(await import("../kernel/drivers/postgres.js")),
    ...(await import("../../../server/runtime/composition/storage-secret.js")),
  }),
};

function importDefaultDriver<K extends keyof SiteDbDrivers>(kind: K): Promise<SiteDbDrivers[K]> {
  return DRIVER_IMPORTS[kind]();
}

export interface SiteDbClient {
  readonly content: ContentKernel;
  readonly chat: ChatKernel;
  /** Closes every connection this client opened. */
  close(): Promise<void>;
}

export interface OpenSiteDbClientRequired {
  storage: SiteStorage;
  /** `content.db` (SQLite), also the anchor for the site folder (Postgres' sealed connection string). */
  dbPath: string;
  chatDbPath: string;
}

export interface OpenSiteDbClientOptional {
  /** Where `TOVU_DB`, `TOVU_PG_SOCKET` and a Postgres `secretRef: { env }` are read (default `process.env`). */
  env?: NodeJS.ProcessEnv;
  importDriver?: ImportSiteDbDriver;
}

/**
 * Opens a client on a site's already-migrated store.
 *
 * - SQLite: `content.db` and `chat.db`, each through the driver's file kernel (busy timeout,
 *   foreign keys; WAL is a property of the file the server set). A missing file is an error, never created.
 * - PGlite: the owner's socket from `TOVU_PG_SOCKET`; content and the `ai_chat`-scoped chat kernel share it.
 * - Postgres: the site's connection string, one pool for both kernels.
 *
 * @throws {Error} when `TOVU_DB=memory` (an in-memory store lives in the server process and cannot be
 *   shared), a SQLite file is missing, or a PGlite site has no socket in the env.
 * @throws {StorageSecretError} (Postgres) when the connection string cannot be read.
 * @complexity O(1): one driver import and at most two connection opens.
 */
export async function openSiteDbClient(required: OpenSiteDbClientRequired, optional: OpenSiteDbClientOptional = {}): Promise<SiteDbClient> {
  const env = optional.env ?? process.env;
  if (env.TOVU_DB === "memory") {
    throw new Error("TOVU_DB=memory is unsupported for a site DB client: the in-memory store lives in the server process and cannot be shared");
  }
  const importDriver = optional.importDriver ?? importDefaultDriver;
  const { storage } = required;
  if (storage.kind === "sqlite") return openSqliteClient(required, await importDriver("sqlite"));
  const base =
    storage.kind === "pglite"
      ? openPgliteKernel({ env }, await importDriver("pglite"))
      : await openPostgresKernel({ storage, dbPath: required.dbPath, env }, await importDriver("postgres"));
  // The same connection(s), typed per history: content in `public`, chat in `ai_chat` (ADR-067).
  return { content: base as ContentKernel, chat: pgChatKernel(base), close: () => base.close() };
}

async function openSqliteClient(required: OpenSiteDbClientRequired, driver: SiteDbDrivers["sqlite"]): Promise<SiteDbClient> {
  for (const filePath of [required.dbPath, required.chatDbPath]) {
    if (!existsSync(filePath)) {
      throw new Error(`${filePath} does not exist: the site's API process creates and migrates it at boot; start the site, then retry`);
    }
  }
  const content = driver.openSqliteFileKernel<ContentDatabase>(required.dbPath);
  let chat: StorageKernel<ChatDatabase>;
  try {
    chat = driver.openSqliteFileKernel<ChatDatabase>(required.chatDbPath);
  } catch (err) {
    await content.close();
    throw err;
  }
  return {
    content,
    chat,
    close: async () => {
      try {
        await chat.close();
      } finally {
        await content.close();
      }
    },
  };
}

function openPgliteKernel(required: { env: NodeJS.ProcessEnv }, driver: SiteDbDrivers["pglite"]): StorageKernel<unknown> {
  const socketPath = required.env[PG_SOCKET_ENV]?.trim();
  if (!socketPath) {
    throw new Error(`this site is stored on pglite and ${PG_SOCKET_ENV} is not set: the daemon supervisor passes the owner's socket`);
  }
  return driver.openPgliteSocketKernel<unknown>({ socketPath });
}

async function openPostgresKernel(
  required: { storage: Extract<SiteStorage, { kind: "postgres" }>; dbPath: string; env: NodeJS.ProcessEnv },
  driver: SiteDbDrivers["postgres"]
): Promise<StorageKernel<unknown>> {
  const connectionString = await driver.resolvePostgresConnectionString(
    required.storage,
    { siteDir: dirname(required.dbPath) },
    { env: required.env }
  );
  return driver.openPostgresKernel<unknown>({ connectionString });
}
