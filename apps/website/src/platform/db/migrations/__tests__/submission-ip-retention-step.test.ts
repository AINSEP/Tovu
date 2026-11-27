import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";

import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { submissionIpRetentionMigration } from "../0006_submission_ip_retention.js";

const cases = [
  { title: "a missing source_ip column", columns: "", error: "form_submissions.source_ip is missing" },
  { title: "a missing non-IP column", columns: "source_ip TEXT NOT NULL,", drop: true, error: "form_submissions schema changed; revise this migration before applying it" },
  { title: "a renamed column at the original column count", columns: "source_ip TEXT NOT NULL,", rename: true, error: "form_submissions schema changed; revise this migration before applying it" },
  { title: "an incoming foreign key", columns: "source_ip TEXT NOT NULL,", references: true, error: "form_submissions acquired an incoming foreign key; revise this migration before applying it" },
] as const;

for (const scenario of cases) {
  test(`0006 refuses ${scenario.title} without discarding the submission or changing the schema`, async t => {
    const kernel = openMemorySqliteKernel<unknown>();
    t.after(() => kernel.close());
    await kernel.execute(sql`CREATE TABLE form_definitions (id TEXT PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO form_definitions VALUES ('contact')`);
    await kernel.execute(sql`CREATE TABLE form_submissions (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL,
      form_definition_id TEXT NOT NULL REFERENCES form_definitions(id) ON DELETE RESTRICT,
      ${sql.raw(scenario.columns)}
      data_json TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      deleted_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    )`);
    if ("drop" in scenario) {
      await kernel.execute(sql`ALTER TABLE form_submissions DROP COLUMN deleted_at`);
    } else if ("rename" in scenario) {
      await kernel.execute(sql`ALTER TABLE form_submissions RENAME COLUMN deleted_at TO archived_at`);
    }
    const data = '{"message":"retain this submission"}';
    if (scenario.columns) {
      await kernel.execute(sql`INSERT INTO form_submissions
        (id, workspace_id, form_definition_id, source_ip, data_json, submitted_at)
        VALUES ('s1', 'w1', 'contact', '203.0.113.8', ${data}, '2026-01-01T00:00:00.000Z')`);
    } else {
      await kernel.execute(sql`INSERT INTO form_submissions
        (id, workspace_id, form_definition_id, data_json, submitted_at)
        VALUES ('s1', 'w1', 'contact', ${data}, '2026-01-01T00:00:00.000Z')`);
    }
    if ("references" in scenario) {
      // An empty child table is enough to make a rebuild unsafe. A seeded child would also make
      // DROP fail, masking a missing preflight guard.
      await kernel.execute(sql`CREATE TABLE submission_receipts (
        id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE
      )`);
    }
    const schema = () => kernel.query(sql`SELECT type, name, sql FROM sqlite_schema ORDER BY type, name`);
    const before = await schema();
    const step = submissionIpRetentionMigration({ checksum: "a".repeat(64) });
    await assert.rejects(kernel.transaction(() => step.up(kernel, { note() {} })), { message: scenario.error });
    assert.deepEqual(await schema(), before);
    assert.deepEqual(await kernel.query(sql`SELECT id, data_json FROM form_submissions`), [{ id: "s1", data_json: data }]);
  });
}
