import { describe, expect, test } from "vitest";

import type { ChatMessage } from "@jini-ai/chat/core";

import { upsertMessage } from "../assistant-chats-dependencies.hooks";

/**
 * @file `upsertMessage` — pulled out of `createFakeAssistantChatsPort`'s `saveMessage`
 * (2026-08-06, complexity pass, second pass): that method needed the identical "find by id, then
 * splice-in-place or append" ternary twice (once for the durable `messages` map, once for the
 * `saved` map tests read back), and extracting it here removes the duplication instead of just
 * relocating it. `use-assistant-chats.unit.test.ts`'s many `saveMessage`-driven scenarios already
 * exercise this indirectly through the fake port; these tests pin the upsert's own ordering
 * contract directly, with no port, no conversation state, involved.
 */

const message = (id: string, content: string): ChatMessage => ({
  id,
  role: "user" as const,
  content,
  createdAt: 1,
});

describe("upsertMessage", () => {
  test("appends a new id to an empty list", () => {
    expect(upsertMessage([], message("m1", "hi"))).toEqual([message("m1", "hi")]);
  });

  test("appends a new id after existing entries, in order", () => {
    const list = [message("m1", "first")];
    expect(upsertMessage(list, message("m2", "second"))).toEqual([message("m1", "first"), message("m2", "second")]);
  });

  test("replaces an existing id IN PLACE — updated content, same position, not moved to the end", () => {
    const list = [message("m1", "first"), message("m2", "second"), message("m3", "third")];
    const updated = upsertMessage(list, message("m2", "second (edited)"));
    expect(updated).toEqual([message("m1", "first"), message("m2", "second (edited)"), message("m3", "third")]);
  });

  test("does not mutate the input list", () => {
    const list = [message("m1", "first")];
    const snapshot = [...list];
    upsertMessage(list, message("m2", "second"));
    expect(list).toEqual(snapshot);
  });
});
