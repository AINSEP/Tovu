import { kernelStampWatermark } from "@jini-ai/db/watermark/kernel";
import { WRITE_WATERMARK_TABLES } from "#src/platform/db/write-watermark-tables";
import { removeUnreadableOwnerEntries } from "#src/features/entries/unreadable-owner-entries-repair";
import { buildTrashRegistry } from "#src/features/trash/registry";
import { migrateFooterPageLinks } from "#src/features/navigation/migrate-footer-page-links";
import { type ContentKernel, schemaErasedKernel } from "#src/platform/db/content-kernel";

/**
 * @file The stored-data repairs every store opener runs once its content store is migrated and
 * prepared: `openSiteContentDb` (SQLite) and `preparePgStore` (Postgres/PGlite). One list, so a
 * repair added for one dialect's boot path can no longer be missing from the other (the
 * `site-boot-readiness.ts` pattern). Add a new repair HERE, once.
 *
 * Failure policy, per repair:
 *  - `migrateFooterPageLinks` rejects the boot, as it always has.
 *  - `removeUnreadableOwnerEntries` only logs: it removes rows nothing can read, so a site must not
 *    stay down over it. It is all-or-nothing and its marker is written only on success, so the next
 *    boot simply retries.
 */

/**
 * @param optional.migrateFooterPageLinks / removeUnreadableOwnerEntries - The repairs (tests inject fakes).
 * @param optional.logError - Where a logged-only repair failure goes.
 * @complexity The sum of the repairs' own costs; both are O(1) keyed reads on a site already repaired.
 */
export async function runBootDataRepairs(
  required: { kernel: ContentKernel },
  optional: {
    migrateFooterPageLinks?: typeof migrateFooterPageLinks;
    removeUnreadableOwnerEntries?: typeof removeUnreadableOwnerEntries;
    logError?: (line: string) => void;
  } = {}
): Promise<void> {
  const { kernel } = required;
  const {
    migrateFooterPageLinks: footer = migrateFooterPageLinks,
    removeUnreadableOwnerEntries: unreadable = removeUnreadableOwnerEntries,
    logError = console.error,
  } = optional;
  // The kernel is erased at stamp time, not here: building the binding must not touch the kernel,
  // only a repair that actually writes does.
  const stampWatermark = () => kernelStampWatermark({ kernel: schemaErasedKernel({ store: kernel }), tables: WRITE_WATERMARK_TABLES })();
  await footer({ kernel, stampWatermark });
  try {
    await unreadable({ kernel, stampWatermark, registeredTypes: () => buildTrashRegistry().values() });
  } catch (error) {
    logError(`[boot-repair] removing unreadable owner entries failed; the next boot retries: ${(error as Error).message}`);
  }
}
