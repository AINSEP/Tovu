import { sql } from "kysely";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { SubmissionIpRetentionPort } from "./submission-ip-retention-port.js";

/** Site-owned schema adapter; no retention policy or timer lives here. */
export function createSubmissionIpRetentionRepo(
  { kernel }: { kernel: ContentKernel },
  _optional: Record<string, never> = {},
): SubmissionIpRetentionPort {
  let nullableConfirmed = false;
  return {
    async clearExpiredIps({ submittedBeforeOrAt }, { limit = 500 } = {}) {
      if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError("submission IP batch limit must be positive");
      if (!nullableConfirmed) {
        // A database not yet at migration 0006 still has NOT NULL source_ip. Fail before
        // writing while that old schema is present; a failed probe is retried on the next pass.
        if (kernel.dialect === "sqlite") {
          const columns = await kernel.query<{ name: string; notnull: number }>(sql`PRAGMA table_info(form_submissions)`);
          nullableConfirmed = columns.some(column => column.name === "source_ip" && column.notnull === 0);
        } else {
          const columns = await kernel.query<{ is_nullable: string }>(sql`
            SELECT is_nullable FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'form_submissions' AND column_name = 'source_ip'
          `);
          nullableConfirmed = columns.some(column => column.is_nullable === "YES");
        }
        if (!nullableConfirmed) throw new Error("submission IP retention requires the nullable source_ip migration (0006)");
      }
      // Single statement, with the predicate repeated on the write: another process may have
      // cleared a selected row already. NULL→NULL is excluded from the count. No read/modify/
      // save of data_json, no Trash filter, and no lease/outbox event to race or retain the IP.
      // The raw NULL expression bridges the still-published NOT NULL generated table type;
      // the readiness probe above verifies the real schema before issuing it.
      const result = await kernel.run(db => db.updateTable("form_submissions")
        .set({ source_ip: sql<string>`NULL` })
        .where("source_ip", "is not", null)
        .where("submitted_at", "<=", submittedBeforeOrAt)
        .where("id", "in", db.selectFrom("form_submissions")
          .select("id")
          .where("source_ip", "is not", null)
          .where("submitted_at", "<=", submittedBeforeOrAt)
          .orderBy("submitted_at").orderBy("id").limit(limit))
        .executeTakeFirst());
      return Number(result.numUpdatedRows);
    },
  };
}
