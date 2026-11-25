import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";

import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationContext, StorageDialect } from "@jini-ai/core/contracts/storage";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { describeEachDialect } from "../../kernel/__tests__/dialect-matrix.js";
import { AI_CHAT_SCHEMA } from "../../chat-kernel.js";
import { CHAT_LEDGER_TABLE, CHAT_MIGRATIONS, migrateChatDatabase } from "../index.js";
import { runMigrations } from "../runner.js";

/** B140: the historical title scrub, applied once through the chat ledger on every dialect. */
const SCRUB_ID = "0049_scrub_assistant_chat_titles";
const migrationContext: MigrationContext = { note: () => {} };
// Assembled at runtime so no literal credential-shaped string sits in the source.
const secret = "sk-" + "A1b2C3d4E5f6G7h8I9j0";

/** A scratch chat store carried to just before the scrub, with a per-row write log on `ai_chats`
 *  so a rewrite of an unchanged value is still visible (a value comparison alone cannot see it). */
async function scratchChatStore({ dialect }: { dialect: StorageDialect }, _optional = {}) {
  const kernel: KyselyKernel<unknown> = dialect === "sqlite" ? openMemorySqliteKernel<unknown>() : openPgliteKernel<unknown>();
  const prefix = dialect === "sqlite" ? "" : `${AI_CHAT_SCHEMA}.`;
  const t = (name: string) => sql.table(`${prefix}${name}`);
  const preceding = CHAT_MIGRATIONS.filter((step) => step.id < SCRUB_ID);
  await runMigrations({ kernel, steps: preceding }, { ledgerTable: CHAT_LEDGER_TABLE, schema: dialect === "sqlite" ? undefined : AI_CHAT_SCHEMA });
  await kernel.execute(sql`CREATE TABLE ${t("title_writes")} (id TEXT NOT NULL)`);
  if (dialect === "sqlite") {
    await kernel.execute(sql`CREATE TRIGGER title_write_log AFTER UPDATE ON ai_chats BEGIN INSERT INTO title_writes VALUES (OLD.id); END`);
  } else {
    await kernel.execute(sql.raw(`CREATE FUNCTION ai_chat.log_title_write() RETURNS trigger AS $$
      BEGIN INSERT INTO ai_chat.title_writes VALUES (OLD.id); RETURN NEW; END $$ LANGUAGE plpgsql`));
    await kernel.execute(sql.raw(`CREATE TRIGGER title_write_log AFTER UPDATE ON ai_chat.ai_chats FOR EACH ROW EXECUTE FUNCTION ai_chat.log_title_write()`));
  }
  const addChat = (id: string, title: string | null, titleSource: string) => kernel.execute(sql`
    INSERT INTO ${t("ai_chats")} (id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at)
    VALUES (${id}, 'workspace-a', 'user', 'owner-a', ${title}, ${titleSource}, 1790000000123, 1790000000456)`);
  const chats = () => kernel.query<{ id: string; title: string | null; title_source: string; created_at: number; updated_at: number }>(
    sql`SELECT id, title, title_source, created_at, updated_at FROM ${t("ai_chats")} ORDER BY id`);
  const writes = async () => (await kernel.query<{ id: string }>(sql`SELECT id FROM ${t("title_writes")} ORDER BY id`)).map((row) => row.id);
  return { kernel, addChat, chats, writes };
}

const scrubStep = () => {
  const step = CHAT_MIGRATIONS.find((each) => each.id === SCRUB_ID);
  assert.ok(step, `${SCRUB_ID} is registered in CHAT_MIGRATIONS`);
  return step;
};

describeEachDialect("historical chat title scrub", { tables: [], make: () => undefined }, (_make, dialect) => {
  // Mutation: skip the redactor -> the stored title still holds the token.
  test("a stored chat title holding a token is redacted by the migration", async () => {
    const store = await scratchChatStore({ dialect });
    try {
      await store.addChat("token", `Key ${secret} chat`, "manual");
      await store.addChat("untitled", null, "fallback");
      assert.deepEqual((await migrateChatDatabase({ kernel: store.kernel })).applied, [SCRUB_ID]);
      assert.deepEqual(await store.chats(), [
        { id: "token", title: "Key [token removed] chat", title_source: "manual", created_at: 1790000000123, updated_at: 1790000000456 },
        { id: "untitled", title: null, title_source: "fallback", created_at: 1790000000123, updated_at: 1790000000456 },
      ]);
      assert.equal(JSON.stringify(await store.chats()).includes(secret), false, "credential survived in a stored title");
      assert.deepEqual(await store.writes(), ["token"], "only the changed row is written");
      assert.deepEqual((await migrateChatDatabase({ kernel: store.kernel })).applied, [], "a rerun applies nothing");
      await scrubStep().up(store.kernel, migrationContext);
      assert.deepEqual(await store.writes(), ["token"], "reapplying to scrubbed data writes nothing");
    } finally {
      await store.kernel.close();
    }
  });

  // Mutation: write back every row -> the clean row appears in the write log.
  test("a clean title and its title_source are left untouched", async () => {
    const store = await scratchChatStore({ dialect });
    try {
      await store.addChat("clean", "Quarterly newsletter plan", "generated");
      assert.deepEqual((await migrateChatDatabase({ kernel: store.kernel })).applied, [SCRUB_ID]);
      assert.deepEqual(await store.chats(), [
        { id: "clean", title: "Quarterly newsletter plan", title_source: "generated", created_at: 1790000000123, updated_at: 1790000000456 },
      ]);
      assert.deepEqual(await store.writes(), [], "a clean title is never rewritten, even with the same value");
    } finally {
      await store.kernel.close();
    }
  });
});
