/** Step 0032: additive new-address identity; existing credentials remain usable and unchanged. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlMagicLinkTokenRepo } from "#src/features/members/repo";
import { memberAuthStatements } from "../0034_member_auth.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";

for (const adapter of eachDialect({ tables: ["member_magic_tokens"], make: db => db })) {
  test(`[${adapter.name}] 0032 preserves legacy tokens and round-trips new-address tokens without members`, async t => {
    const db = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => db.close());
    // Reconstruct the preceding table so the upgrade, rather than only fresh bootstrap, is tested.
    await db.execute(sql`DROP TABLE member_magic_tokens`);
    await db.execute(sql`CREATE TABLE member_magic_tokens (id text PRIMARY KEY, workspace_id text NOT NULL, member_id text NOT NULL, token_hash text NOT NULL, purpose text NOT NULL, created_at text NOT NULL, expires_at text NOT NULL, consumed_at text)`);
    await db.execute(sql`CREATE UNIQUE INDEX member_magic_tokens_workspace_tokenhash_unique ON member_magic_tokens (workspace_id,token_hash)`);
    const legacy = { id: "old", workspace_id: "w", member_id: "existing", token_hash: "oldhash", purpose: "signin", created_at: "2026-10-24", expires_at: "2026-10-25", consumed_at: null };
    await db.execute(sql`INSERT INTO member_magic_tokens (id,workspace_id,member_id,token_hash,purpose,created_at,expires_at,consumed_at) VALUES ('old','w','existing','oldhash','signin','2026-10-24','2026-10-25',NULL)`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === "0032_member_signup_email")!;
    const options = { ledgerTable: "signup_email_test_migrations" };
    assert.deepEqual((await runMigrations(db as StorageKernel<unknown>, [step], options)).applied, [step.id]);
    assert.deepEqual(await db.query(sql`SELECT * FROM member_magic_tokens`), [{ ...legacy, email: null }]);
    // Only the challenge table was reconstructed; members already has its 0034 column.
    for (const statement of memberAuthStatements({ dialect: db.dialect }).filter(ddl => ddl.startsWith("ALTER TABLE member_magic_tokens "))) {
      await db.execute(sql.raw(statement));
    }
    const repo = new SqlMagicLinkTokenRepo(db);
    const token = { id: "new", workspaceId: "w", memberId: "reserved", email: "new@example.com", tokenHash: "newhash", purpose: "signin" as const, createdAt: "2026-10-24", expiresAt: "2026-10-25" };
    await repo.save(token);
    assert.deepEqual(await repo.findByTokenHash({ workspaceId: "w", tokenHash: "newhash" }), { ...token, consumedAt: undefined });
    const old = await repo.findByTokenHash({ workspaceId: "w", tokenHash: "oldhash" });
    assert.equal(old?.memberId, "existing");
    assert.equal(old?.email, undefined);
    assert.deepEqual((await runMigrations(db as StorageKernel<unknown>, [step], options)).applied, []);
  });
}
