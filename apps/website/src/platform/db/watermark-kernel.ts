import type { MirrorStorePort } from "#src/contracts/core/gated-mutations/ports";
import type { ContentKernel } from "./content-kernel.js";

/**
 * @file The site write watermark (`database_write_watermark`, SPEC-016 C-004/U-002/U-004) on the
 * content kernel, every dialect: the stamp, the read, and the read-side mirror reconciliation.
 *
 * `database_write_watermark` is a singleton row (id 1, created by `prepareContentStore`) advanced by
 * exactly 1 per gated write. The stamp is async, so it is correct only where the caller awaits it:
 * Jini cms's taxonomy write-service does (owner decision O2, `WriteServiceDeps.stampWatermark:
 * () => Promise<void> | void`). Inside a kernel transaction the UPDATE joins it (the kernel hands
 * `run()` the open transaction); outside one it is its own statement, the same envelope as the write
 * it follows.
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

/**
 * The current authoritative watermark (0 when the singleton row is missing).
 *
 * @complexity O(1) — single-row lookup by primary key.
 */
export async function readKernelWatermark(kernel: ContentKernel): Promise<number> {
  const row = await kernel.run((db) => db.selectFrom("database_write_watermark").select("value").where("id", "=", 1).executeTakeFirst());
  return Number(row?.value ?? 0);
}

/**
 * Boot-time (and on-demand) mirror reconciliation (U-004). `kernel: null` models "the content
 * database failed to open": the mirror keeps its value and is marked `'unrefreshable'`
 * (U-004-B2/REQ-05), never given a precise-looking but wrong value. Otherwise the mirror is
 * overwritten from the authoritative value, its own prior value discarded (U-004-B1: never a merge).
 *
 * @complexity O(1) plus one read when `kernel` is non-null.
 */
export async function reconcileMirror(required: { kernel: ContentKernel | null; mirror: MirrorStorePort }): Promise<void> {
  const { kernel, mirror } = required;
  if (kernel === null) {
    await mirror.markUnrefreshable();
    return;
  }
  await mirror.set(await readKernelWatermark(kernel));
}
