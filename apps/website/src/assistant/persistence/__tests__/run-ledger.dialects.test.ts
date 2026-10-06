import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChatKernel } from "#src/platform/db/chat-kernel";
import { createChatRunLedger, type RunRef } from "../run-ledger.js";
import { createTenantScopedChatStore } from "../tenant-scope.js";
import { describeEachChatDialect } from "./chat-dialect-matrix.js";

/**
 * @file The run ledger's one Kysely body on SQLite and PGlite (storage plan §4): every method, a
 * rollback, and the two races it exists for — two settles of one run, and a browser save racing the
 * finalizer's settle.
 */

// Past 2^31: the time columns must hold epoch milliseconds on Postgres (BIGINT), not INTEGER.
const T0 = 1_790_000_000_000;
const RESTART_NOTICE = {
  kind: "status",
  label: "The assistant restarted while this answer was running, so it stopped.",
  detail: "Anything it wrote before the restart is kept above. Send your message again to retry.",
};

const RUN: RunRef = { conversationId: "c1", messageId: "a1", runId: "run-1" };

interface Seed {
  id: string;
  role?: string;
  content?: string;
  events?: unknown;
  eventsJson?: string | null;
  runId?: string | null;
  runStatus?: string | null;
  position: number;
  endedAt?: number | null;
}

async function seed(kernel: ChatKernel, messages: Seed[]): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("ai_chats")
      .values({ id: "c1", scope_id: "ws", owner_kind: "user", owner_id: "u", title: null, created_at: T0, updated_at: T0, expires_at: null })
      .execute()
  );
  for (const m of messages) {
    await kernel.run((db) =>
      db
        .insertInto("ai_chat_messages")
        .values({
          id: m.id,
          conversation_id: "c1",
          role: m.role ?? "assistant",
          content: m.content ?? "",
          agent_id: null,
          agent_name: null,
          events_json: m.eventsJson !== undefined ? m.eventsJson : m.events === undefined ? null : JSON.stringify(m.events),
          attachments_json: null,
          run_id: m.runId === undefined ? "run-1" : m.runId,
          run_status: m.runStatus === undefined ? "running" : m.runStatus,
          position: m.position,
          created_at: T0,
          started_at: null,
          ended_at: m.endedAt ?? null,
        })
        .execute()
    );
  }
}

async function row(kernel: ChatKernel, id: string) {
  const found = await kernel.run((db) =>
    db.selectFrom("ai_chat_messages").select(["content", "events_json", "run_status", "ended_at"]).where("id", "=", id).executeTakeFirstOrThrow()
  );
  return { ...found, events: found.events_json === null ? null : JSON.parse(found.events_json), ended_at: found.ended_at === null ? null : Number(found.ended_at) };
}

async function chatUpdatedAt(kernel: ChatKernel): Promise<number> {
  const found = await kernel.run((db) => db.selectFrom("ai_chats").select("updated_at").where("id", "=", "c1").executeTakeFirstOrThrow());
  return Number(found.updated_at);
}

const settlement = (content: string, overrides: Partial<RunRef> = {}) => ({
  ...RUN,
  ...overrides,
  status: "succeeded" as const,
  content,
  events: [{ kind: "text" as const, text: content }],
  endedAt: T0 + 5_000,
});

describeEachChatDialect("ChatRunLedger", (kernel) => ({ kernel, ledger: createChatRunLedger(kernel) }), (make) => {
  test("settle writes the final state once and touches the conversation; later settles are ignored", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", content: "", position: 0 }]);

    assert.equal(await ledger.settle(settlement("Final")), true);
    assert.deepEqual(await row(kernel, "a1"), {
      content: "Final",
      events_json: JSON.stringify([{ kind: "text", text: "Final" }]),
      events: [{ kind: "text", text: "Final" }],
      run_status: "succeeded",
      ended_at: T0 + 5_000,
    });
    assert.equal(await chatUpdatedAt(kernel), T0 + 5_000);

    assert.equal(await ledger.settle({ ...settlement("Second"), endedAt: T0 + 9_000 }), false);
    assert.equal((await row(kernel, "a1")).content, "Final");
    assert.equal(await chatUpdatedAt(kernel), T0 + 5_000, "a refused settle must not touch the conversation");
  });

  test("settle refuses another run id, a user row, and an unknown row", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [
      { id: "a1", content: "stub", position: 0 },
      { id: "u1", role: "user", content: "hi", runId: "run-1", runStatus: null, position: 1 },
    ]);
    assert.equal(await ledger.settle(settlement("x", { runId: "run-2" })), false);
    assert.equal(await ledger.settle(settlement("x", { messageId: "u1" })), false);
    assert.equal(await ledger.settle(settlement("x", { messageId: "nope" })), false);
    assert.equal((await row(kernel, "a1")).content, "stub");
    assert.equal((await row(kernel, "u1")).content, "hi");
  });

  test("unlessSettled runs the write while unsettled and skips it once settled", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", content: "", position: 0 }]);

    assert.deepEqual(await ledger.unlessSettled(RUN, async () => "wrote"), { written: true, value: "wrote" });
    // An unknown row counts as unsettled (the browser's first save of a turn).
    assert.deepEqual(await ledger.unlessSettled({ ...RUN, messageId: "new" }, async () => 1), { written: true, value: 1 });

    await ledger.settle(settlement("Final"));
    let called = false;
    assert.deepEqual(
      await ledger.unlessSettled(RUN, async () => {
        called = true;
      }),
      { written: false }
    );
    assert.equal(called, false);
    // A retry: the same message under a new run id is a new turn.
    assert.deepEqual(await ledger.unlessSettled({ ...RUN, runId: "run-2" }, async () => "retry"), { written: true, value: "retry" });
  });

  test("a write that throws inside unlessSettled rolls back everything it wrote", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", content: "stub", position: 0 }]);
    await assert.rejects(
      ledger.unlessSettled(RUN, async () => {
        await kernel.run((db) => db.updateTable("ai_chat_messages").set({ content: "half" }).where("id", "=", "a1").execute());
        throw new Error("boom");
      }),
      /boom/
    );
    assert.equal((await row(kernel, "a1")).content, "stub");
  });

  test("checkpoint saves progress without changing the status, and never touches a settled row", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", content: "", position: 0 }]);
    const progress = { ...RUN, content: "Half", events: [{ kind: "text" as const, text: "Half" }] };

    assert.equal(await ledger.checkpoint(progress), true);
    assert.deepEqual(await row(kernel, "a1"), {
      content: "Half",
      events_json: JSON.stringify([{ kind: "text", text: "Half" }]),
      events: [{ kind: "text", text: "Half" }],
      run_status: "running",
      ended_at: null,
    });
    assert.equal(await ledger.checkpoint({ ...progress, runId: "run-2", content: "other" }), false);

    await ledger.settle(settlement("Final"));
    assert.equal(await ledger.checkpoint({ ...progress, content: "late" }), false);
    assert.equal((await row(kernel, "a1")).content, "Final");
  });

  test("reconcileInterrupted cancels interrupted rows across the batch without changing completed or user rows", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [
      { id: "a1", content: "Partial", events: [{ kind: "text", text: "Partial" }], position: 0 },
      { id: "a2", content: "", runStatus: "queued", runId: "byok:x", position: 1, endedAt: T0 + 1 },
      { id: "a3", content: "", eventsJson: "{not json", position: 2 },
      { id: "a4", content: "Done", events: [{ kind: "text", text: "Done" }], runStatus: "succeeded", position: 3 },
      { id: "u1", role: "user", content: "hi", runStatus: "running", position: 4 },
    ]);

    assert.equal(await ledger.reconcileInterrupted({ now: T0 + 7 }), 3);

    assert.deepEqual(await row(kernel, "a1"), {
      content: "Partial",
      events_json: JSON.stringify([{ kind: "text", text: "Partial" }, RESTART_NOTICE]),
      events: [{ kind: "text", text: "Partial" }, RESTART_NOTICE],
      run_status: "canceled",
      ended_at: T0 + 7,
    });
    const a2 = await row(kernel, "a2");
    assert.equal(a2.run_status, "canceled");
    assert.equal(a2.ended_at, T0 + 1, "an existing ended_at is kept");
    assert.deepEqual((await row(kernel, "a3")).events, [RESTART_NOTICE], "a corrupt event log is replaced, not fatal");
    assert.equal((await row(kernel, "a4")).run_status, "succeeded");
    assert.equal((await row(kernel, "u1")).run_status, "running", "user rows are not runs");

    assert.equal(await ledger.reconcileInterrupted({ now: T0 + 8 }), 0);
  });

  test("reconcileInterrupted offers the stored owner and stub to recovery and keeps adopted rows running", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [
      { id: "a1", content: "Partial", events: [{ kind: "text", text: "Partial" }], position: 0 },
      { id: "a2", runId: "byok:x", runStatus: "queued", position: 1 },
    ]);
    const seen: unknown[] = [];
    assert.equal(await ledger.reconcileInterrupted({ now: T0 + 7 }, { recover: async (input) => {
      seen.push(input);
      return input.message.runId === "run-1";
    } }), 1);
    assert.deepEqual(seen, [
      { principalId: "u", conversationId: "c1", message: { id: "a1", role: "assistant", content: "Partial", events: [{ kind: "text", text: "Partial" }], runId: "run-1", runStatus: "running" } },
      { principalId: "u", conversationId: "c1", message: { id: "a2", role: "assistant", content: "", events: [], runId: "byok:x", runStatus: "queued" } },
    ]);
    assert.equal((await row(kernel, "a1")).run_status, "running");
    assert.equal((await row(kernel, "a1")).content, "Partial");
    assert.deepEqual((await row(kernel, "a2")).events, [RESTART_NOTICE]);
    assert.equal((await row(kernel, "a2")).run_status, "canceled");
  });

  test("reconcileInterrupted cannot cancel a retry that replaced the probed run", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", position: 0 }]);
    assert.equal(await ledger.reconcileInterrupted({ now: T0 + 7 }, { recover: async () => {
      await kernel.run((db) => db.updateTable("ai_chat_messages").set({ run_id: "run-new", content: "New answer" }).where("id", "=", "a1").execute());
      return false;
    } }), 0);
    assert.equal((await row(kernel, "a1")).run_status, "running");
    assert.equal((await row(kernel, "a1")).content, "New answer");
    assert.equal((await row(kernel, "a1")).ended_at, null);
  });

  test("reconcileInterrupted preserves a checkpoint written during the daemon probe", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", position: 0 }]);
    assert.equal(await ledger.reconcileInterrupted({ now: T0 + 7 }, { recover: async () => {
      assert.equal(await ledger.checkpoint({ ...RUN, content: "Latest", events: [{ kind: "text", text: "Latest" }] }), true);
      return false;
    } }), 1);
    assert.equal((await row(kernel, "a1")).content, "Latest");
    assert.deepEqual((await row(kernel, "a1")).events, [{ kind: "text", text: "Latest" }, RESTART_NOTICE]);
    assert.equal((await row(kernel, "a1")).run_status, "canceled");
  });

  test("a browser restart notice cannot terminalize a live daemon row or erase its checkpoint", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", content: "Latest", events: [{ kind: "text", text: "Latest" }], position: 0 }]);
    const store = createTenantScopedChatStore(kernel, { kind: "user", workspaceId: "ws", userId: "u" }, ledger);
    const saved = await store.appendMessage({ conversationId: "c1", message: {
      id: "a1", role: "assistant", runId: "run-1", runStatus: "failed", content: "Stale", events: [{ ...RESTART_NOTICE, kind: "status" as const }], endedAt: T0 + 1,
    } });
    assert.equal(saved?.runStatus, "running");
    assert.equal(saved?.content, "Latest");
    assert.deepEqual(saved?.events, [{ kind: "text", text: "Latest" }]);
    assert.equal((await row(kernel, "a1")).ended_at, null);
    assert.equal(await ledger.settle(settlement("Recovered answer")), true);
    assert.equal((await row(kernel, "a1")).content, "Recovered answer");
    assert.equal((await row(kernel, "a1")).run_status, "succeeded");
  });

  test("two concurrent settles of one run: exactly one wins, and the row holds the winner", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", content: "", position: 0 }]);
    const results = await Promise.all([ledger.settle(settlement("From finalizer")), ledger.settle(settlement("From browser"))]);
    assert.equal(results.filter(Boolean).length, 1);
    const winner = results[0] ? "From finalizer" : "From browser";
    assert.equal((await row(kernel, "a1")).content, winner);
  });

  test("a browser save racing the finalizer's settle never overwrites the settled answer", async () => {
    const { kernel, ledger } = make();
    await seed(kernel, [{ id: "a1", content: "", position: 0 }]);
    // The browser's late save: a terminal "run forgotten" with no events, written only while unsettled.
    const browserSave = ledger.unlessSettled(RUN, async () => {
      await kernel.run((db) =>
        db.updateTable("ai_chat_messages").set({ content: "", events_json: "[]", run_status: "failed" }).where("id", "=", "a1").execute()
      );
      return "browser";
    });
    const finalizer = ledger.settle(settlement("The answer"));
    const [browser, settled] = await Promise.all([browserSave, finalizer]);
    // Whichever took the run's lock first wins; the other must be a no-op.
    assert.equal(browser.written !== settled, true, "exactly one of the two writes may land");
    const final = await row(kernel, "a1");
    assert.equal(final.content, settled ? "The answer" : "");
  });
});
