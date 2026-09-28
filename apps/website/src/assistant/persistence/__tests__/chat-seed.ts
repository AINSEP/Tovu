import type { ChatKernel } from "#src/platform/db/chat-kernel";

/** @file A bare `ai_chats` row for the chat dialect suites whose tables reference one. */

export async function seedChat(kernel: ChatKernel, id: string, at = 1_790_000_000_000): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("ai_chats")
      .values({ id, scope_id: "ws", owner_kind: "user", owner_id: "u", title: null, created_at: at, updated_at: at, expires_at: null })
      .execute()
  );
}
