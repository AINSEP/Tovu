import type { RawBuilder } from "kysely";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { sqliteForeignKeyCheckedTransaction, sqliteTableInfo } from "@jini-ai/db/kernel/sqlite";
import type { RawRowPort } from "@jini-ai/cms/publish/transfer";
import { createRawRowSqlitePort as createWithPolicy } from "@jini-ai/cms/publish/content/sql/raw-row-sqlite";
import { checkRawTable } from "#src/features/publish-content/backstop-policy";

/** Site content.db adapter, using Jini's storage kernel for transaction serialization (including
 * nested command gateways). It never opens a second connection and does no schema installation. */
export function createRawRowSqlitePort({ kernel, tableInfo, checkedTransaction }: { kernel: ContentKernel; tableInfo: typeof sqliteTableInfo; checkedTransaction: typeof sqliteForeignKeyCheckedTransaction }, _optional: Record<string, never> = {}): RawRowPort {
  return createWithPolicy({
    kernel: {
      dialect: kernel.dialect,
      inTransaction: () => kernel.inTransaction(),
      query: <Row>({ statement }: { statement: RawBuilder<unknown> }) => kernel.query<Row>(statement.$castTo<Row>()),
      execute: ({ statement }) => kernel.execute(statement),
    },
    tableInfo: ({ table }) => tableInfo({ kernel, table }),
    checkedTransaction: ({ work, onViolation }) => checkedTransaction({ kernel, work, onViolation }),
    checkTable: (required) => checkRawTable(required) ?? undefined,
    copy: {
      notSqlite: "Send by hand currently requires a SQLite content database.",
      foreignKeyViolation: ({ table, rowid, parent }) => `Foreign key check failed: '${table}' row '${rowid}' points at a missing '${parent}' row; this send was rolled back.`,
    },
  });
}
