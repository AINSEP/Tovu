/** Step 0034 adds credentials without rewriting existing members or live magic links. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";

for (const adapter of eachDialect({ tables: ["members", "member_magic_tokens"], make: db => db })) {
  test(`[${adapter.name}] 0034 preserves populated tables, defaults legacy attempts and applies once`, async t => {
    const db = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => db.close());
    // Start at the real preceding schema so indexes and all unrelated columns stay in the test.
    await db.execute(sql`ALTER TABLE members DROP COLUMN password_hash`);
    await db.execute(sql`ALTER TABLE member_magic_tokens DROP COLUMN code_hash`);
    await db.execute(sql`ALTER TABLE member_magic_tokens DROP COLUMN failed_attempts`);
    await db.execute(sql`INSERT INTO members (id,workspace_id,email,status,created_at,updated_at,version) VALUES ('member','w','member@example.com','active','2026-10-24','2026-10-24',1)`);
    await db.execute(sql`INSERT INTO member_magic_tokens (id,workspace_id,member_id,token_hash,purpose,created_at,expires_at) VALUES ('legacy','w','member','link-hash','signin','2026-10-24','2026-10-25')`);
    const membersBefore = await db.query(sql`SELECT * FROM members`);
    const tokensBefore = await db.query(sql`SELECT * FROM member_magic_tokens`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === "0034_member_auth")!;
    const options = { ledgerTable: "member_auth_test_migrations" };
    assert.deepEqual((await runMigrations(db, [step], options)).applied, [step.id]);
    assert.deepEqual(await db.query(sql`SELECT * FROM members`), [{ ...membersBefore[0], password_hash: null }]);
    assert.deepEqual(await db.query(sql`SELECT * FROM member_magic_tokens`), [{ ...tokensBefore[0], code_hash: null, failed_attempts: 0 }]);
    await db.execute(sql`UPDATE members SET password_hash = 'password-hash' WHERE id = 'member'`);
    await db.execute(sql`UPDATE member_magic_tokens SET code_hash = 'code-hash', failed_attempts = 2, purpose = 'password_reset' WHERE id = 'legacy'`);
    assert.deepEqual((await runMigrations(db, [step], options)).applied, []);
    assert.deepEqual(await db.query(sql`SELECT password_hash FROM members`), [{ password_hash: "password-hash" }]);
    assert.deepEqual(await db.query(sql`SELECT code_hash,failed_attempts,purpose FROM member_magic_tokens`), [{ code_hash: "code-hash", failed_attempts: 2, purpose: "password_reset" }]);
  });
}
