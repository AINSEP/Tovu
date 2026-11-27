import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";

import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { webhookSubscriptionCreatorKind } from "../0043_webhook_subscription_creator_kind.js";
import { runMigrations } from "../runner.js";

test("0043 preserves legacy webhooks without attributing them to an agent", async t => {
  const kernel = openMemorySqliteKernel<unknown>();
  t.after(() => kernel.close());
  await kernel.execute(sql`CREATE TABLE webhook_subscriptions (id TEXT PRIMARY KEY, label TEXT NOT NULL)`);
  await kernel.execute(sql`INSERT INTO webhook_subscriptions VALUES ('legacy', 'Existing endpoint')`);
  const steps = [webhookSubscriptionCreatorKind({ checksum: "a".repeat(64) })];
  assert.deepEqual((await runMigrations({ kernel, steps })).applied, ["0043_webhook_subscription_creator_kind"]);
  await kernel.execute(sql`INSERT INTO webhook_subscriptions (id, label, created_by_kind)
    VALUES ('agent-created', 'New agent endpoint', 'agent')`);
  await kernel.execute(sql`INSERT INTO webhook_subscriptions (id, label) VALUES ('unspecified', 'New unattributed endpoint')`);
  assert.deepEqual(await kernel.query(sql`SELECT id, label, created_by_kind FROM webhook_subscriptions ORDER BY id`), [
    { id: "agent-created", label: "New agent endpoint", created_by_kind: "agent" },
    { id: "legacy", label: "Existing endpoint", created_by_kind: null },
    { id: "unspecified", label: "New unattributed endpoint", created_by_kind: null },
  ]);
  assert.deepEqual((await runMigrations({ kernel, steps })).applied, []);
});
