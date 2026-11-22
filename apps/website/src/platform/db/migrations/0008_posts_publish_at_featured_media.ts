import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/** Scheduled publishing + featured image (2026-10-05): two nullable columns, no backfill — every
 *  existing row reads back as "not scheduled, no featured image", exactly what it was before. */
async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  await kernel.execute(sql`ALTER TABLE posts ADD COLUMN publish_at text`);
  await kernel.execute(sql`ALTER TABLE posts ADD COLUMN featured_media_id text`);
}

export const postsPublishAtFeaturedMedia = (required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> => ({
  id: "0008_posts_publish_at_featured_media", checksum: required.checksum, up,
});
