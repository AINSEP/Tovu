/** Frozen C3 starting implementation: rollback reader only, never production-imported. */
import type {
  ChatConversation,
  ChatHistoryStore,
  ChatMessage,
  ChatOwnerScope,
  ChatTitleSource,
  CreateChatConversationInput,
} from "@jini-ai/chat/core";

import type { Kysely } from "kysely";

import type { ChatDatabase, ChatKernel } from "#src/platform/db/chat-kernel";

/**
 * @file `@jini-ai/chat/core`'s {@link ChatHistoryStore}, bound to one owner, as ONE Kysely body over
 * the chat kernel (`platform/db/chat-kernel.ts`), so chat history runs on SQLite, PGlite and
 * Postgres alike (storage plan slice H2).
 *
 * A port of `@jini-ai/sqlite-chat`'s `createChatHistoryStore` (`db/chat-history/store.ts`), statement for
 * statement, over the same tables and columns: every read and write carries the owner predicate
 * (`scope_id`, `owner_kind`, `owner_id`) the store was built with, a `generated` title never
 * overwrites a `manual` one, and a message upsert never touches a row in another conversation.
 * `resumable`/`lastRunEventId` stay unstored, as there (that file's "KNOWN GAP" note).
 *
 * What differs is concurrency, made explicit for Postgres: `appendMessage`'s position is read and
 * written in one kernel transaction holding the conversation's lock ({@link conversationLockKey}).
 * On SQLite that is the `BEGIN IMMEDIATE` Jini's store took; on Postgres a plain transaction does not
 * serialize two appends, the advisory lock does. The `UNIQUE (conversation_id, position)` constraint
 * stays the backstop. Called inside another kernel transaction (the run ledger's `unlessSettled`),
 * the append joins it.
 */

/** The lock every position-assigning append to one conversation takes. */
export function conversationLockKey(conversationId: string): string {
  return `chat-conversation:${conversationId}`;
}

interface ConversationRow {
  id: string;
  title: string | null;
  title_source: string;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  message_count: number | string | bigint | null;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  agent_id: string | null;
  agent_name: string | null;
  events_json: string | null;
  attachments_json: string | null;
  run_id: string | null;
  run_status: string | null;
  created_at: number | null;
  started_at: number | null;
  ended_at: number | null;
}

function toConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    title: row.title ?? null,
    titleSource: (row.title_source ?? "fallback") as ChatTitleSource,
    messageCount: Number(row.message_count ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.expires_at === null ? {} : { expiresAt: Number(row.expires_at) }),
  };
}

/**
 * A malformed JSON column yields `undefined` rather than throwing: one half-written `events_json`
 * must not make the whole conversation unreadable (same rule as Jini's store).
 */
function safeParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.agent_name ? { agentName: row.agent_name } : {}),
    ...(row.events_json ? { events: safeParse(row.events_json) } : {}),
    ...(row.attachments_json ? { attachments: safeParse(row.attachments_json) } : {}),
    ...(row.run_id ? { runId: row.run_id } : {}),
    ...(row.run_status ? { runStatus: row.run_status as ChatMessage["runStatus"] } : {}),
    ...(row.created_at === null ? {} : { createdAt: Number(row.created_at) }),
    ...(row.started_at === null ? {} : { startedAt: Number(row.started_at) }),
    ...(row.ended_at === null ? {} : { endedAt: Number(row.ended_at) }),
  };
}

/**
 * Returns a {@link ChatHistoryStore} that can only ever see `scope`'s own conversations.
 *
 * @param kernel the chat kernel. Nothing here opens, closes or configures a database; SQLite's
 *   `ON DELETE CASCADE` needs `foreign_keys = ON`, which `openChatDb` sets.
 * @param scope the isolation predicate, resolved from the host's authentication. For a guest,
 *   `ownerId` must already be a hash of the session key (`tenant-scope.ts`).
 * @param now injectable clock, for tests that need deterministic timestamps.
 * @complexity each method is one to four indexed statements; `list` is O(owned conversations),
 *   `messages` O(messages in the conversation).
 */
export function createChatHistoryStore(
  kernel: ChatKernel,
  scope: ChatOwnerScope,
  now: () => number = Date.now
): ChatHistoryStore {
  const { scopeId, ownerKind, ownerId } = scope;

  /** This scope's conversations, projected as {@link ConversationRow}s with their message count. */
  function ownedConversations(db: Kysely<ChatDatabase>) {
    return db
      .selectFrom("ai_chats as c")
      .select((eb) => [
        "c.id",
        "c.title",
        "c.title_source",
        "c.created_at",
        "c.updated_at",
        "c.expires_at",
        eb
          .selectFrom("ai_chat_messages as m")
          .select((sb) => sb.fn.countAll().as("n"))
          .whereRef("m.conversation_id", "=", "c.id")
          .as("message_count"),
      ])
      .where("c.scope_id", "=", scopeId)
      .where("c.owner_kind", "=", ownerKind)
      .where("c.owner_id", "=", ownerId);
  }

  async function get(id: string): Promise<ChatConversation | null> {
    const row = await kernel.run((db) => ownedConversations(db).where("c.id", "=", id).executeTakeFirst());
    return row ? toConversation(row as ConversationRow) : null;
  }

  async function messages(conversationId: string): Promise<ChatMessage[]> {
    const rows = await kernel.run((db) =>
      db
        .selectFrom("ai_chat_messages as m")
        .innerJoin("ai_chats as c", "c.id", "m.conversation_id")
        .select([
          "m.id",
          "m.role",
          "m.content",
          "m.agent_id",
          "m.agent_name",
          "m.events_json",
          "m.attachments_json",
          "m.run_id",
          "m.run_status",
          "m.created_at",
          "m.started_at",
          "m.ended_at",
        ])
        .where("m.conversation_id", "=", conversationId)
        .where("c.scope_id", "=", scopeId)
        .where("c.owner_kind", "=", ownerKind)
        .where("c.owner_id", "=", ownerId)
        .orderBy("m.position")
        .execute()
    );
    return rows.map(toMessage);
  }

  /** Writes one message into a conversation this scope owns; `false` when it does not own it. */
  function writeMessage(conversationId: string, m: ChatMessage): Promise<boolean> {
    return kernel.transaction(async () => {
      await kernel.lockKey(conversationLockKey(conversationId));
      const owned = await kernel.run((db) =>
        db
          .selectFrom("ai_chats")
          .select("id")
          .where("id", "=", conversationId)
          .where("scope_id", "=", scopeId)
          .where("owner_kind", "=", ownerKind)
          .where("owner_id", "=", ownerId)
          .executeTakeFirst()
      );
      if (!owned) return false;

      const existing = await kernel.run((db) =>
        db
          .selectFrom("ai_chat_messages")
          .select("position")
          .where("id", "=", m.id)
          .where("conversation_id", "=", conversationId)
          .executeTakeFirst()
      );
      const position = existing ? Number(existing.position) : await nextPosition(conversationId);

      // The conflict target is `id`, the GLOBAL key: the `where` keeps an id that already lives in
      // another conversation from updating THAT row (Jini's "colliding id to its OWN chat" case).
      await kernel.run((db) =>
        db
          .insertInto("ai_chat_messages")
          .values({
            id: m.id,
            conversation_id: conversationId,
            role: m.role,
            content: m.content,
            agent_id: m.agentId ?? null,
            agent_name: m.agentName ?? null,
            events_json: m.events ? JSON.stringify(m.events) : null,
            attachments_json: m.attachments ? JSON.stringify(m.attachments) : null,
            run_id: m.runId ?? null,
            run_status: m.runStatus ?? null,
            position,
            created_at: m.createdAt ?? now(),
            started_at: m.startedAt ?? null,
            ended_at: m.endedAt ?? null,
          })
          .onConflict((oc) =>
            oc
              .column("id")
              .doUpdateSet((eb) => ({
                content: eb.ref("excluded.content"),
                events_json: eb.ref("excluded.events_json"),
                attachments_json: eb.ref("excluded.attachments_json"),
                run_id: eb.ref("excluded.run_id"),
                run_status: eb.ref("excluded.run_status"),
                started_at: eb.ref("excluded.started_at"),
                ended_at: eb.ref("excluded.ended_at"),
              }))
              .where((eb) => eb("ai_chat_messages.conversation_id", "=", eb.ref("excluded.conversation_id")))
          )
          .execute()
      );

      // A new message is activity: the list orders by `updated_at`.
      await kernel.run((db) => db.updateTable("ai_chats").set({ updated_at: now() }).where("id", "=", conversationId).execute());
      return true;
    });
  }

  async function nextPosition(conversationId: string): Promise<number> {
    const row = await kernel.run((db) =>
      db
        .selectFrom("ai_chat_messages")
        .select((eb) => eb.fn.max("position").as("max"))
        .where("conversation_id", "=", conversationId)
        .executeTakeFirst()
    );
    return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1;
  }

  return {
    async list() {
      const rows = await kernel.run((db) => ownedConversations(db).orderBy("c.updated_at", "desc").execute());
      return rows.map((row) => toConversation(row as ConversationRow));
    },

    get,

    async create(input: CreateChatConversationInput) {
      const ts = now();
      await kernel.run((db) =>
        db
          .insertInto("ai_chats")
          .values({
            id: input.id,
            scope_id: scopeId,
            owner_kind: ownerKind,
            owner_id: ownerId,
            title: input.title ?? null,
            title_source: input.titleSource ?? "fallback",
            created_at: ts,
            updated_at: ts,
            expires_at: input.expiresAt ?? null,
          })
          .execute()
      );
      const created = await get(input.id);
      // Unreachable: the insert used this exact scope. Asserted so a future change to either
      // statement fails loudly instead of returning a malformed conversation.
      if (!created) throw new Error(`ai_chats: created conversation ${input.id} was not readable in its own scope`);
      return created;
    },

    async rename(id: string, title: string, source: ChatTitleSource = "manual") {
      // A generated title never overwrites a typed one: in the WHERE clause, so a concurrent
      // rename cannot slip between a read and this write.
      await kernel.run((db) =>
        db
          .updateTable("ai_chats")
          .set({ title, title_source: source, updated_at: now() })
          .where("id", "=", id)
          .where("scope_id", "=", scopeId)
          .where("owner_kind", "=", ownerKind)
          .where("owner_id", "=", ownerId)
          .$if(source === "generated", (qb) => qb.where("title_source", "<>", "manual"))
          .execute()
      );
      return get(id);
    },

    async touch(id: string, options?: { readonly expiresAt?: number }) {
      const ts = now();
      await kernel.run((db) =>
        db
          .updateTable("ai_chats")
          .set(options?.expiresAt === undefined ? { updated_at: ts } : { updated_at: ts, expires_at: options.expiresAt })
          .where("id", "=", id)
          .where("scope_id", "=", scopeId)
          .where("owner_kind", "=", ownerKind)
          .where("owner_id", "=", ownerId)
          .execute()
      );
    },

    async delete(id: string) {
      // Messages, agent sessions and tool approvals go with it through `ON DELETE CASCADE`.
      await kernel.run((db) =>
        db
          .deleteFrom("ai_chats")
          .where("id", "=", id)
          .where("scope_id", "=", scopeId)
          .where("owner_kind", "=", ownerKind)
          .where("owner_id", "=", ownerId)
          .execute()
      );
    },

    messages,

    async appendMessage(conversationId: string, message: ChatMessage) {
      if (!(await writeMessage(conversationId, message))) return null;
      const saved = await messages(conversationId);
      return saved.find((m) => m.id === message.id) ?? null;
    },
  };
}
