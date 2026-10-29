import type { SecretSealerPort } from "@jini-ai/platform/secrets";
import type { ChatKernel } from "../db/chat-kernel.js";
import type { ContentKernel } from "../db/content-kernel.js";
import type { ContentDb, ContentDbOpenOptions, ContentDbSeedData } from "../db/sqlite/content-db.js";
import type { SiteStorage } from "./types.js";

/** Which process opens the store. The API process owns it; the agent daemon is a client (PGlite: R1f). */
export type SiteStoreRole = "owner" | "client";

export interface SiteStore {
  readonly storage: SiteStorage;
  readonly content: ContentKernel;
  readonly chat: ChatKernel;
  /** The Drizzle handle behind `content`, on SQLite only: the one input `sqliteOnlyServices` takes. */
  readonly sqliteDb?: ContentDb;
  /** PGlite: the owner's socket file, for the agent daemon (`TOVU_PG_SOCKET`). */
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
  /** SQLite acquisition belongs to the embedding host, including reopen after recovery. */
  sqliteOpen?: ContentDbOpenOptions["open"];
  /** An already opened, migrated and prepared content.db (the install-dir `serve` path). SQLite only. */
  db?: ContentDb;
  /** Postgres: where `secretRef: { env }` is read; PGlite: where a client reads `TOVU_PG_SOCKET` (default `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** PGlite client: how long to wait for the owner's socket (default 60 s). */
  pgliteClientWaitMs?: number;
  /** Postgres: opens `secretRef: "site"` (default: the site key's sealer, `siteSecretSealer`). */
  sealer?: SecretSealerPort;
  /** Postgres/PGlite: the first-run seed (default: the demo seed; `tovu init` passes its template's). */
  seed?: ContentDbSeedData;
}
