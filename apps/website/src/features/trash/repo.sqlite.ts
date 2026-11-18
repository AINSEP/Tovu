/**
 * @file The SQLite `TrashRepoPort`: {@link SqlTrashRepo} (Jini's `@jini-ai/cms/trash/sql`, the one Kysely body) over a
 * `content.db` handle's storage kernel — a thin subclass while call sites still hold the handle.
 * Also the content db's {@link createContentDbTransactionRunner}.
 */
import { type ContentKernel, contentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { SqliteConnectionSource } from "../../platform/db/kernel/index.js";
import { SqlTrashRepo } from "@jini-ai/cms/trash/sql";

export class SqliteTrashRepo extends SqlTrashRepo {
  /** @param required.store the content db handle, its better-sqlite3 client, or the kernel itself. */
  constructor({ store }: { store: ContentKernel | SqliteConnectionSource }) {
    super({ kernel: schemaErasedKernel({ store }), tables: { trashedItems: "trashed_items" } }, {});
  }
}

/**
 * The {@link import("./ports.js").TransactionRunner} over the content db: its storage-kernel
 * transaction (`platform/db/kernel`).
 *
 * A nested call joins the caller's open transaction — posts and redirects wrap "marker write +
 * revision-ledger append" in their own, and `deps.remove` runs inside it — so a throw anywhere rolls
 * back both. A concurrent caller (another async context) waits for its own transaction instead of
 * joining someone else's.
 *
 * @param required.store the content db handle, its better-sqlite3 client, or the kernel itself.
 * @complexity O(1) beyond `fn`.
 */
export function createContentDbTransactionRunner({ store }: { store: ContentKernel | SqliteConnectionSource }, _optional = {}) {
  const kernel = contentKernel({ store });
  return function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return kernel.transaction(fn);
  };
}
