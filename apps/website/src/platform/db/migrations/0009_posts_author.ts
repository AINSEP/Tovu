import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/** Shared with the synchronous fresh-only bootstrap so its DDL cannot drift from this step. */
export const POSTS_AUTHOR_SQLITE_STATEMENTS = [
  "ALTER TABLE posts ADD COLUMN author text",
  "ALTER TABLE posts ADD COLUMN show_author integer NOT NULL DEFAULT 0",
] as const;

/** Additive byline storage: existing content retains unknown authors and hidden bylines.
 * The runner commits both columns and its ledger entry together; reruns apply nothing (ADR-066). */
async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  await kernel.execute(sql.raw(POSTS_AUTHOR_SQLITE_STATEMENTS[0]));
  await kernel.execute(kernel.dialect === "postgres"
    ? sql`ALTER TABLE posts ADD COLUMN show_author boolean NOT NULL DEFAULT false`
    : sql.raw(POSTS_AUTHOR_SQLITE_STATEMENTS[1]));
}

export const postsAuthor = (required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> => ({
  id: "0009_posts_author", checksum: required.checksum, up,
});
