import { type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import { type ContentKernel, contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection } from "#src/platform/db/kernel/index";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { openSiteContentDb } from "./open-site-content-db.js";

/**
 * @file The composition root's one store opener: a site's storage choice (`resolveSiteStorage`) in,
 * the content and AI chat kernels every repo is built from out (R1 plan §0).
 *
 * Only SQLite opens today. PGlite and Postgres land in slice R1f, which adds their branch here and
 * the twin of `sqliteOnlyServices` in `deps.ts`; until then they are refused before anything opens.
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
  close(): void;
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
}

/**
 * Opens the site's store: on SQLite, `content.db` (open → recover → migrate → prepare, unless
 * `optional.db` is given) and `chat.db` beside it.
 *
 * @throws {StorageNotAvailableError} for `pglite` and `postgres`, before opening anything.
 */
export async function openSiteStore(required: OpenSiteStoreRequired, optional: OpenSiteStoreOptional = {}): Promise<SiteStore> {
  const { storage } = required;
  if (storage.kind !== "sqlite") {
    throw new StorageNotAvailableError(`this site is stored on ${storage.kind}, which lands in R1 plan slice R1f; only sqlite opens today`);
  }
  const ownsDb = optional.db === undefined;
  const db = optional.db ?? (await openSiteContentDb(required.dbPath));
  const chatDb = openChatDb(required.chatDbPath);
  return {
    storage,
    content: contentKernel(db),
    chat: chatKernel(chatDb),
    sqliteDb: db,
    close: () => {
      closeSqliteConnection(chatDb);
      if (ownsDb) closeSqliteConnection(db);
    },
  };
}
