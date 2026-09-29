import { dirname } from "node:path";

import type { SecretSealerPort } from "#src/features/webhooks/ports";
import { type ChatKernel, chatKernel, pgChatKernel } from "#src/platform/db/chat-kernel";
import { type ContentKernel, contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection, openPostgresKernel, type StorageKernel } from "#src/platform/db/kernel/index";
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
 * - PGlite: refused until R1f part 2 (the owner/socket path).
 * The journal (`ops/database-journal.db`) is not part of the store: it is SQLite on every kind.
 */

/** Which process opens the store. The API process owns it; the agent daemon is a client (PGlite: R1f). */
export type SiteStoreRole = "owner" | "client";

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
  /** Closes the connections this call opened (a caller-supplied `db` stays open). */
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
  /** Postgres: where `secretRef: { env }` is read (default `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Postgres: opens `secretRef: "site"` (default: the site key's sealer, `siteSecretSealer`). */
  sealer?: SecretSealerPort;
}

/**
 * Opens the site's store: on SQLite, `content.db` (open → recover → migrate → prepare, unless
 * `optional.db` is given) and `chat.db` beside it; on Postgres, see {@link openPostgresSiteStore}.
 *
 * @throws {StorageNotAvailableError} for `pglite`, before opening anything.
 * @throws {StorageSecretError} (Postgres) when the connection string cannot be read.
 */
export async function openSiteStore(required: OpenSiteStoreRequired, optional: OpenSiteStoreOptional = {}): Promise<SiteStore> {
  const { storage } = required;
  if (storage.kind === "pglite") {
    throw new StorageNotAvailableError("this site is stored on pglite, which lands in R1 plan slice R1f part 2; sqlite and postgres open today");
  }
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
  // The same pool, typed per history: the content tables here, the chat tables via `pgChatKernel`.
  const content = base as StorageKernel<unknown> as ContentKernel;
  try {
    await migrateContentDatabase(base);
    await migrateChatDatabase(base);
    await prepareContentStore(content, { seed: { workspace: seededWorkspace, posts: seededPosts, presentation: seededPresentation } });
  } catch (err) {
    await base.close();
    throw err;
  }
  return { storage, content, chat: pgChatKernel(base), close: () => base.close() };
}
