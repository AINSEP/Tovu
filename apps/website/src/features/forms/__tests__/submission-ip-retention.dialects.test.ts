import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createSubmissionIpRetentionRepo } from "#src/features/forms/repo.sqlite";
import { toSubmissionRecord } from "@jini-ai/cms/forms/sql";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { submissionIpRetentionMigration } from "#src/platform/db/migrations/0006_submission_ip_retention";

/** Owner retention decision 2026-10-04 / DR-002: prove real SQL writes on SQLite and PGlite. */
const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const CUTOFF = new Date(NOW - 90 * DAY).toISOString();

async function install(kernel: ContentKernel): Promise<void> {
  const step = submissionIpRetentionMigration({ checksum: "test-only" });
  // Migration steps take the untyped kernel, as the runner hands them (`dialect-matrix.ts` widens the same way).
  await kernel.transaction(() => step.up(kernel as StorageKernel<unknown>, { note() {} }));
}

async function seed(kernel: ContentKernel, rows: { id: string; age: number; workspaceId?: string; trashed?: boolean }[]) {
  await kernel.run(db => db.insertInto("form_definitions").values({
    id: "def", workspace_id: "ws", name: "Contact", slug: "contact", fields_json: "[]", notify_json: "{}",
    status: "active", created_at: CUTOFF, updated_at: CUTOFF, version: 1,
  }).execute());
  await kernel.run(db => db.insertInto("form_submissions").values(rows.map(row => ({
    id: row.id, workspace_id: row.workspaceId ?? "ws", form_definition_id: "def", data_json: '{"message":"preserve me"}',
    source_ip: "203.0.113.8", submitted_at: new Date(NOW - row.age).toISOString(),
    deleted_at: row.trashed ? CUTOFF : null, version: 7,
  }))).execute());
}

describeEachDialect("submission IP retention adapter and migration 0006", {
  tables: ["form_submissions", "form_definitions"], make: kernel => ({ kernel, repo: createSubmissionIpRetentionRepo({ kernel }) }),
}, make => {
  test("migration preserves every column; 89d/before-boundary keep IP, 90d/older clear only IP, including Trash", async () => {
    const { kernel, repo } = make();
    await seed(kernel, [
      { id: "89d", age: 89 * DAY }, { id: "before", age: 90 * DAY - 1 },
      { id: "90d", age: 90 * DAY }, { id: "old-trash", age: 91 * DAY, trashed: true },
      { id: "other-workspace", age: 91 * DAY, workspaceId: "other" },
    ]);
    const before = await kernel.run(db => db.selectFrom("form_submissions").selectAll().orderBy("id").execute());
    await install(kernel);
    assert.deepEqual(await kernel.run(db => db.selectFrom("form_submissions").selectAll().orderBy("id").execute()), before);
    assert.equal(await repo.clearExpiredIps({ submittedBeforeOrAt: CUTOFF }, { limit: 500 }), 3);
    const after = await kernel.run(db => db.selectFrom("form_submissions").selectAll().orderBy("id").execute());
    assert.deepEqual(after, before.map(row => ({ ...row, source_ip: row.submitted_at <= CUTOFF ? null : row.source_ip })));
    assert.equal(toSubmissionRecord(after.find(row => row.id === "90d")!).sourceIp, "", "published DTO gets an empty display string for the cleared IP");
    assert.equal(await repo.clearExpiredIps({ submittedBeforeOrAt: CUTOFF }, { limit: 500 }), 0);
    // Existing unique/FK/index and Trash state must survive a SQLite table rebuild too.
    await assert.rejects(kernel.run(db => db.insertInto("form_submissions").values({ ...before[0]!, id: "bad-fk", form_definition_id: "missing" }).execute()));
    await install(kernel);
    assert.deepEqual(await kernel.run(db => db.selectFrom("form_submissions").selectAll().orderBy("id").execute()), after);
  });
});

// The matrix's PGlite store is shared and may already be upgraded by another case. Probe an
// isolated table instead so the old-schema guard is asserted on every test run.
test("old NOT NULL schema rejects before changing a submission", async () => {
  const { freshSqliteContentKernel } = await import("#src/platform/db/kernel/__tests__/dialect-matrix");
  const kernel = freshSqliteContentKernel();
  try {
    // Force the legacy shape even after the coordinator installs the new migration in the
    // normal test history. This DDL affects only this disposable in-memory fixture.
    await kernel.execute(sql`DROP TABLE form_submissions`);
    await kernel.execute(sql`CREATE TABLE form_submissions (
      id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL,
      form_definition_id TEXT NOT NULL REFERENCES form_definitions(id), data_json TEXT NOT NULL,
      source_ip TEXT NOT NULL, submitted_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1
    )`);
    await seed(kernel, [{ id: "old", age: 91 * DAY }]);
    const repo = createSubmissionIpRetentionRepo({ kernel });
    await assert.rejects(repo.clearExpiredIps({ submittedBeforeOrAt: CUTOFF }, { limit: 500 }), /requires the nullable source_ip migration/);
    assert.equal((await kernel.query<{ source_ip: string }>(sql`SELECT source_ip FROM form_submissions WHERE id = 'old'`))[0]?.source_ip, "203.0.113.8");
    // A failed schema gate is retried, rather than cached forever after hot installation.
    await install(kernel);
    assert.equal(await repo.clearExpiredIps({ submittedBeforeOrAt: CUTOFF }, { limit: 500 }), 1);
    assert.equal((await kernel.query<{ source_ip: string | null }>(sql`SELECT source_ip FROM form_submissions WHERE id = 'old'`))[0]?.source_ip, null);
  } finally { await kernel.close(); }
});
