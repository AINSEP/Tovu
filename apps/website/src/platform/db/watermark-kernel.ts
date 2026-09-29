import type { ContentKernel } from "./content-kernel.js";

/**
 * @file The site write watermark (`database_write_watermark`, SPEC-016) advanced through the content
 * kernel, for stores without the SQLite Drizzle handle (Postgres/PGlite: `pgOnlyServices`). The
 * SQLite composition keeps `sqlite/watermark.ts`'s certified synchronous `stampWatermarkTx`.
 *
 * Async, so it is correct only where the caller awaits it: Jini cms's taxonomy write-service does
 * (owner decision O2, `WriteServiceDeps.stampWatermark: () => Promise<void> | void`). Inside a
 * kernel transaction the UPDATE joins it (the kernel hands `run()` the open transaction); outside
 * one it is its own statement, the same envelope as the write it follows.
 */

/**
 * A `stampWatermark` binding over `kernel`: `value = value + 1` on the singleton row (id 1, created
 * by `prepareContentStore`).
 *
 * @complexity O(1) — one single-row UPDATE by primary key.
 */
export function kernelStampWatermark(kernel: ContentKernel): () => Promise<void> {
  return async () => {
    await kernel.run((db) =>
      db
        .updateTable("database_write_watermark")
        .set((eb) => ({ value: eb("value", "+", 1), last_stamped_at: new Date().toISOString() }))
        .where("id", "=", 1)
        .execute()
    );
  };
}
