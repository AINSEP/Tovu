/** ADR-066 / amended Google login S1: additive identity schema, no credential rewrite. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns } from "#src/platform/db/kernel/dialect";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";

for (const adapter of eachDialect({ tables: ["members", "member_external_identities"], make: kernel => kernel })) {
  test(`[${adapter.name}] 0035 adds only identity metadata, preserves members and applies once`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => kernel.close());
    // Reproduce the real preceding schema; the matrix starts at head for other suites.
    await kernel.execute(sql`DROP TABLE member_external_identities`);
    await kernel.execute(sql`INSERT INTO members (id,workspace_id,email,status,password_hash,created_at,updated_at,version)
      VALUES ('member','w','member@example.test','active','existing-password-hash','2026-10-24','2026-10-24',1)`);
    const before = await kernel.query(sql`SELECT * FROM members`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === "0035_member_external_identities")!;
    assert.ok(step);
    assert.equal(CONTENT_MIGRATIONS.at(-2)?.id, "0034_member_auth");
    const options = { ledgerTable: "member_external_identity_test_migrations" };
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [step.id]);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM members`), before);
    assert.deepEqual((await listColumns(kernel, "member_external_identities")).map(column => column.name).sort(),
      ["id", "workspace_id", "member_id", "provider_id", "issuer", "subject", "linked_at", "unlinked_at"].sort());
    await kernel.execute(sql`INSERT INTO member_external_identities
      (id,workspace_id,member_id,provider_id,issuer,subject,linked_at,unlinked_at)
      VALUES ('identity','w','member','google','https://accounts.google.com','subject','2026-10-24','2026-10-25')`);
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, []);
    assert.deepEqual(await kernel.query(sql`SELECT unlinked_at FROM member_external_identities`), [{ unlinked_at: "2026-10-25" }]);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM members`), before);
  });
}
