/** Step 0044: creator kind on scheduled sends/posts (existing rows stay `person`) + the resume-hold table. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";

const CAMPAIGN_COLUMNS = sql`id, workspace_id, status, subject, from_name, from_email, reply_to, list_id, counters_json, version, created_by_principal, created_at, updated_at`;
const campaignValues = (id: string) => sql`${id}, 'w', 'scheduled', 's', 'n', 'a@example.com', 'a@example.com', 'l', '{}', 1, 'p', '2026-11-24', '2026-11-24'`;

for (const adapter of eachDialect({ tables: ["newsletter_campaigns", "posts", "agent_pause_holds"], make: db => db })) {
  test(`[${adapter.name}] 0044 attributes existing scheduled sends to a person and adds the resume-hold table`, async t => {
    const db = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => db.close());
    // Reconstruct the preceding shape so the upgrade, rather than only fresh bootstrap, is tested.
    await db.execute(sql`DROP TABLE agent_pause_holds`);
    await db.execute(sql`ALTER TABLE newsletter_campaigns DROP COLUMN created_by_kind`);
    await db.execute(sql`ALTER TABLE posts DROP COLUMN created_by_kind`);
    await db.execute(sql`INSERT INTO newsletter_campaigns (${CAMPAIGN_COLUMNS}) VALUES (${campaignValues("legacy")})`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === "0044_agent_pause_creator_kind")!;
    const options = { ledgerTable: "agent_pause_test_migrations" };
    assert.deepEqual((await runMigrations({ kernel: db as KyselyKernel<unknown>, steps: [step] }, options)).applied, [step.id]);
    assert.deepEqual(await db.query(sql`SELECT id, created_by_kind FROM newsletter_campaigns`), [{ id: "legacy", created_by_kind: "person" }]);
    await db.execute(sql`INSERT INTO newsletter_campaigns (${CAMPAIGN_COLUMNS}) VALUES (${campaignValues("unstated")})`);
    await db.execute(sql`INSERT INTO newsletter_campaigns (${CAMPAIGN_COLUMNS}, created_by_kind) VALUES (${campaignValues("agent-made")}, 'agent')`);
    assert.deepEqual(await db.query(sql`SELECT id, created_by_kind FROM newsletter_campaigns ORDER BY id`),
      [{ id: "agent-made", created_by_kind: "agent" }, { id: "legacy", created_by_kind: "person" }, { id: "unstated", created_by_kind: "person" }]);
    assert.deepEqual(await db.query(sql`SELECT created_by_kind FROM posts`), []);
    await db.execute(sql`INSERT INTO agent_pause_holds (workspace_id, held_since) VALUES ('w', '2026-11-24')`);
    await assert.rejects(db.execute(sql`INSERT INTO agent_pause_holds (workspace_id, held_since) VALUES ('w', '2026-11-25')`), "one hold per workspace");
    assert.deepEqual((await runMigrations({ kernel: db as KyselyKernel<unknown>, steps: [step] }, options)).applied, []);
  });
}
