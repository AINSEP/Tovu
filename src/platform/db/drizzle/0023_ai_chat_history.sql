-- Custom SQL migration file, put your code below! --
--
-- Durable AI chat history: `ai_chats` + `ai_chat_messages`, backing the admin assistant's
-- conversation list today and the public visitor assistant later.
--
-- WHY THIS IS A CORE MIGRATION AND NOT A PLUGIN DATA MODULE.
-- The AI Assistant admin section, the `admin.assistant.manage` permission, and the
-- `site.assistant.public_enabled` kill switch already live in core; splitting the feature's data
-- across the plugin boundary would leave half of it uninstallable and half not. The decisive
-- reason is narrower, though: `features/plugins/data-module.ts`'s column grammar is
-- `TEXT|INTEGER|REAL|BLOB` with plain indexes only — it has no FK grammar (its own comment:
-- "chokepoint-validated, not FK-enforced (v1)"), no CHECK constraints, and no partial indexes.
-- Every constraint below that makes an invalid row unrepresentable is something that seam cannot
-- express, so the plugin route would silently downgrade this schema to a convention.
--
-- WHY THIS IS COPIED FROM JINI RATHER THAN CREATED BY IT.
-- The statements below are `CHAT_HISTORY_DDL`, exported by `@jini-ai/sqlite`'s `chat-history`
-- module, reproduced verbatim. Tovu deliberately does NOT call that package's
-- `ensureChatHistoryTables`: `@jini-ai/sqlite`'s own `openDatabase`/`migrate` own
-- `<dataDir>/app.sqlite`, and pointing a second migrator at `content.db` would write DDL behind
-- Tovu's snapshot/backup tooling and behind this journal. One database, one migrator.
-- `src/assistant/persistence/__tests__/ddl-parity.test.ts` fails if this file and that constant
-- ever drift, so "verbatim" is enforced rather than merely claimed here.
--
-- The Jini store's cascade assumes `PRAGMA foreign_keys = ON`. `infra/sqlite/content-db.ts:76-81`
-- already sets it, along with `journal_mode = WAL` and `busy_timeout = 5000` — the last of which
-- is what stops the retention sweep starving concurrent inserts, and is exactly what Open
-- Design's equivalent schema omits.
--
-- On `scope_id`: NOT NULL from this first migration on purpose. Tovu's `content.db` is
-- multi-workspace by design, and while adding the column later would be trivial, BACKFILLING it
-- would be impossible — pre-existing rows carry no evidence of which workspace they belonged to,
-- leaving a choice between deleting history and guessing. It holds a workspace id here; the Jini
-- port keeps the name generic because another host may partition by something else.
--
-- On `owner_id`: a user id when `owner_kind = 'user'`, and a HASH of the visitor's session key
-- when `owner_kind = 'guest'`. The raw cookie value never reaches this table.

CREATE TABLE IF NOT EXISTS ai_chats (
  id            TEXT PRIMARY KEY,
  scope_id      TEXT NOT NULL,
  owner_kind    TEXT NOT NULL CHECK (owner_kind IN ('user','guest')),
  owner_id      TEXT NOT NULL,
  title         TEXT,
  title_source  TEXT NOT NULL DEFAULT 'fallback'
                CHECK (title_source IN ('fallback','generated','manual')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  expires_at    INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_chats_owner
  ON ai_chats(scope_id, owner_kind, owner_id, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_chats_expiry
  ON ai_chats(expires_at) WHERE expires_at IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  agent_id        TEXT,
  agent_name      TEXT,
  events_json     TEXT,
  attachments_json TEXT,
  run_id          TEXT,
  run_status      TEXT,
  position        INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  started_at      INTEGER,
  ended_at        INTEGER,
  UNIQUE (conversation_id, position)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_order
  ON ai_chat_messages(conversation_id, position);
