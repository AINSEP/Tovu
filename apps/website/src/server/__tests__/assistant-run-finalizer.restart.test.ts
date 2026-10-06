import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createChatRunLedger, createChatStoreFactory } from "#src/assistant/index";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { createAssistantRunFinalizer } from "../runtime/composition/modules/assistant-run-finalizer.js";

/** Real chat storage and finalizer, without HTTP listeners. Only the daemon stream is substituted. */
const principal = { kind: "user" as const, workspaceId: "ws", userId: "owner" };
const stub = { id: "a1", role: "assistant" as const, content: "", events: [], runId: "run-1", runStatus: "running" as const };
const notice = {
  kind: "status" as const,
  label: "The assistant restarted while this answer was running, so it stopped.",
  detail: "Anything it wrote before the restart is kept above.",
};

function frame(kind: string, payload: unknown): string {
  return `event: ${kind}\ndata: ${JSON.stringify({ runId: "run-1", kind, payload })}\n\n`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

for (const missing of ["run-id", "durable-store"] as const) {
  test(`serving boot cancels a row with no ${missing} once and keeps its saved answer`, async () => {
    const db = openChatDb(":memory:");
    const ledger = createChatRunLedger(db);
    const store = createChatStoreFactory(db)(principal);
    const events = [{ kind: "text" as const, text: "Saved partial" }];
    try {
      await store.create({ id: "c1" });
      await store.appendMessage({ conversationId: "c1", message: missing === "run-id"
        ? { id: "a1", role: "assistant", content: "Saved partial", events, runStatus: "running" }
        : { ...stub, content: "Saved partial", events } });
      const finalizer = createAssistantRunFinalizer({
        ledger: missing === "durable-store" ? { ...ledger, durable: undefined } : ledger,
        daemon: { openEvents: async () => { throw new Error("orphan must not be watched"); },
          runStatus: async () => { throw new Error("orphan must not be probed"); } }, now: () => 1234,
      });
      assert.equal(await finalizer.reconcileInterrupted({ now: 1234 }), 1);
      assert.equal(await finalizer.reconcileInterrupted({ now: 2345 }), 0);
      await finalizer.idle();
      const saved = (await store.messages({ conversationId: "c1" }))[0]!;
      assert.equal(saved.runStatus, "canceled");
      assert.equal(saved.content, "Saved partial");
      assert.deepEqual(saved.events, [...events, { kind: "status", label: "Stopped. Saved work is above." }]);
      assert.equal(saved.endedAt, 1234);
    } finally { db.close(); }
  });
}

test("a missing daemon attempt without durable recovery settles canceled instead of stranding its row", async () => {
  const db = openChatDb(":memory:");
  const ledger = createChatRunLedger(db);
  const store = createChatStoreFactory(db)(principal);
  try {
    await store.create({ id: "c1" });
    const message = { ...stub, content: "Saved partial", events: [{ kind: "text" as const, text: "Saved partial" }] };
    await store.appendMessage({ conversationId: "c1", message });
    const finalizer = createAssistantRunFinalizer({ ledger: { ...ledger, durable: undefined },
      daemon: { openEvents: async () => new Response(null, { status: 404 }), runStatus: async () => 404 },
      reconnectDelayMs: 0, now: () => 1234,
    });
    finalizer.watch({ principalId: "owner", conversationId: "c1", message });
    await finalizer.idle();
    const saved = (await store.messages({ conversationId: "c1" }))[0]!;
    assert.equal(saved.runStatus, "canceled");
    assert.equal(saved.content, "Saved partial");
    assert.deepEqual(saved.events, [...message.events, { kind: "status", label: "Stopped. Saved work is above." }]);
  } finally { db.close(); }
});

for (const [reason, expectedLaunches] of [["HTTP 400: invalid_request_error", 0], ["HTTP 503: overloaded", 1]] as const) {
  test(`a failed stream uses the shared retryability policy: ${reason}`, async () => {
    const db = openChatDb(":memory:");
    const store = createChatStoreFactory(db)(principal);
    let launches = 0;
    try {
      await store.create({ id: "c1" });
      await store.appendMessage({ conversationId: "c1", message: stub });
      const finalizer = createAssistantRunFinalizer({ ledger: createChatRunLedger(db), reconnectDelayMs: 0,
        daemon: {
          openEvents: async ({ runId }) => new Response(runId === "run-1"
            ? frame("agent", { type: "text_delta", delta: "Partial" }) + frame("error", { message: reason }) + frame("end", { status: "failed", code: 1 })
            : frame("end", { status: "succeeded", code: 0 })),
          runStatus: async () => 200, launch: async () => { launches++; },
        }, now: () => 1234,
      });
      finalizer.watch({ principalId: "owner", conversationId: "c1", message: stub });
      await finalizer.idle();
      const saved = (await store.messages({ conversationId: "c1" }))[0]!;
      assert.equal(launches, expectedLaunches);
      assert.equal(saved.runStatus, expectedLaunches ? "succeeded" : "failed");
      assert.equal(saved.content.startsWith("Partial"), true);
      assert.equal(saved.events?.some((event) => event.kind === "status" && event.label === reason), true);
    } finally { db.close(); }
  });
}

test("a buffered completed run settles despite a pending checkpoint, and stays succeeded after reopening chat.db", async () => {
  const dir = mkdtempSync(join(tmpdir(), "n08-restart-"));
  const path = join(dir, "chat.db");
  let db = openChatDb(path);
  const checkpointEntered = deferred();
  const releaseCheckpoint = deferred();
  const checkpointFinished = deferred();
  const terminalSaved = deferred();
  let terminalWritten = false;
  let checkpointCalls = 0;
  const ledger = createChatRunLedger(db);
  const store = createChatStoreFactory(db)(principal);
  await store.create({ id: "c1" });
  await store.appendMessage({ conversationId: "c1", message: stub });
  const finalizer = createAssistantRunFinalizer({
    ledger: {
      ...ledger,
      // Delay a progress write before it reaches storage, as asynchronous storage can do.
      // It is deliberately released AFTER settlement to challenge stale-write protection too.
      async checkpoint(progress) {
        checkpointCalls += 1;
        checkpointEntered.resolve();
        await releaseCheckpoint.promise;
        const written = await ledger.checkpoint(progress);
        checkpointFinished.resolve();
        return written;
      },
      async settle(settlement) {
        const written = await ledger.settle(settlement);
        terminalWritten = written;
        terminalSaved.resolve();
        return written;
      },
    },
    daemon: {
      openEvents: async () => new Response(
        frame("agent", { type: "text_delta", delta: "Finished " }) +
        frame("agent", { type: "text_delta", delta: "answer" }) + frame("end", { code: 0, status: "succeeded" }),
      ),
      runStatus: async () => 200,
    },
    checkpointIntervalMs: 0,
    now: () => 1234,
  });
  try {
    finalizer.watch({ principalId: "owner", conversationId: "c1", message: stub });
    await checkpointEntered.promise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([terminalSaved.promise, new Promise<void>((done) => { timer = setTimeout(done, 500); })]);
    } finally {
      clearTimeout(timer);
    }
    // Reproduce startup repair while a completed answer's progress write is still pending.
    await ledger.reconcileInterrupted({ now: 2000 });
    const saved = (await store.messages({ conversationId: "c1" }))[0]!;
    assert.equal(saved.runStatus, "succeeded", "startup must not turn an already-ended answer into an interrupted turn");
    assert.equal(terminalWritten, true, "terminal settlement must not wait for an unrelated progress write");
    assert.equal(checkpointCalls, 1, "progress writes must stay bounded while storage is slow");
    assert.equal(saved.content, "Finished answer");
    assert.deepEqual(saved.events, [{ kind: "text", text: "Finished answer" }]);
    assert.equal(saved.endedAt, 1234);

    releaseCheckpoint.resolve();
    await finalizer.idle();
    // Let the deliberately late checkpoint finish before physically reopening the database.
    await checkpointFinished.promise;
    db.close();
    db = openChatDb(path);
    assert.equal(await createChatRunLedger(db).reconcileInterrupted({ now: 3000 }), 0);
    const reopened = (await createChatStoreFactory(db)(principal).messages({ conversationId: "c1" }))[0]!;
    assert.equal(reopened.runStatus, "succeeded");
    assert.equal(reopened.content, "Finished answer");
    assert.deepEqual(reopened.events, [{ kind: "text", text: "Finished answer" }]);
    assert.equal(reopened.endedAt, 1234);
  } finally {
    releaseCheckpoint.resolve();
    await finalizer.idle();
    await checkpointFinished.promise;
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// Daemon disappearance now continues the same message. The incident regression lives in
// assistant-durable-finalizer.unit.test.ts and exercises boot, CAS, reconstruction and completion.

test("an authentication failure keeps its partial answer and never launches a continuation", async () => {
  const db = openChatDb(":memory:");
  const store = createChatStoreFactory(db)(principal);
  await store.create({ id: "c1" });
  await store.appendMessage({ conversationId: "c1", message: stub });
  let launches = 0;
  const finalizer = createAssistantRunFinalizer({
    ledger: createChatRunLedger(db), reconnectDelayMs: 0,
    daemon: {
      openEvents: async () => new Response(frame("agent", { type: "text_delta", delta: "Partial" }) +
        frame("error", { message: "Not logged in" }) + frame("end", { code: 1, status: "failed" })),
      runStatus: async () => 200, launch: async () => { launches++; },
    }, now: () => 1234,
  });
  try {
    finalizer.watch({ principalId: "owner", conversationId: "c1", message: stub });
    await finalizer.idle();
    const saved = (await store.messages({ conversationId: "c1" }))[0]!;
    assert.equal(saved.runStatus, "canceled");
    assert.equal(saved.content, "Partial");
    assert.equal(saved.events?.at(-1)?.kind, "status");
    assert.deepEqual(saved.events?.at(-1), { kind: "status", label: "Not logged in. Saved work is above." });
    assert.equal(launches, 0);
  } finally { db.close(); }
});

test("a request-bound run retains its ordinary browser terminal status", async () => {
  const db = openChatDb(":memory:");
  const store = createChatStoreFactory(db)(principal);
  const ledger = createChatRunLedger(db);
  const byokStub = { ...stub, runId: "byok:run-1" };
  try {
    await store.create({ id: "c1" });
    await store.appendMessage({ conversationId: "c1", message: byokStub });
    // BYOK/AG-UI live on their request and are excluded from durable continuation.
    // Presentation text no longer rewrites a request-bound terminal status.
    await store.appendMessage({ conversationId: "c1", message: { ...byokStub, runStatus: "failed", content: "Partial", events: [{ kind: "text", text: "Partial" }, notice] } });
    assert.equal(await ledger.settle({ conversationId: "c1", messageId: "a1", runId: "byok:run-1", status: "canceled", content: "late", events: [], endedAt: 1234 }), false);
    const saved = (await store.messages({ conversationId: "c1" }))[0]!;
    assert.equal(saved.runStatus, "failed");
    assert.equal(saved.content, "Partial");
    assert.deepEqual(saved.events, [{ kind: "text", text: "Partial" }, notice]);
    assert.equal(await ledger.reconcileInterrupted({ now: 2000 }), 0);
  } finally {
    db.close();
  }
});

test("a browser-first restart save of a daemon run stays running, and the finalizer's proof settles it canceled, never failed", async () => {
  const db = openChatDb(":memory:");
  const store = createChatStoreFactory(db)(principal);
  const ledger = createChatRunLedger(db);
  try {
    await store.create({ id: "c1" });
    await store.appendMessage({ conversationId: "c1", message: stub });
    await ledger.checkpoint({ conversationId: "c1", messageId: "a1", runId: "run-1", content: "Server partial", events: [{ kind: "text", text: "Server partial" }] });
    // The browser losing its stream does not prove the daemon run died or released its
    // conversation slot (2026-10-05), so this save must not terminalize the row, nor replace the
    // server's checkpoint with the browser's stale partial.
    await store.appendMessage({ conversationId: "c1", message: { ...stub, runStatus: "failed", content: "Partial", events: [{ kind: "text", text: "Partial" }, notice] } });
    const retained = (await store.messages({ conversationId: "c1" }))[0]!;
    assert.equal(retained.runStatus, "running");
    assert.equal(retained.content, "Server partial");
    // Only the finalizer's 404 proof terminalizes it, and as canceled, not failed.
    assert.equal(await ledger.settle({ conversationId: "c1", messageId: "a1", runId: "run-1", status: "canceled", content: "Server partial", events: [{ kind: "text", text: "Server partial" }, notice], endedAt: 1234 }), true);
    const saved = (await store.messages({ conversationId: "c1" }))[0]!;
    assert.equal(saved.runStatus, "canceled", "the browser must not turn process interruption into a failed run");
    assert.deepEqual(saved.events, [{ kind: "text", text: "Server partial" }, notice]);
  } finally {
    db.close();
  }
});

test("an unknown daemon terminal snapshot cannot create a server-owned message", async () => {
  const db = openChatDb(":memory:");
  const store = createChatStoreFactory(db)(principal);
  try {
    await store.create({ id: "c1" });
    const events = [{ kind: "status" as const, label: notice.label, detail: "The CLI reported a real error." }];
    await store.appendMessage({ conversationId: "c1", message: { ...stub, runStatus: "failed", events } });
    const saved = (await store.messages({ conversationId: "c1" }))[0]!;
    assert.equal(saved, undefined);
  } finally {
    db.close();
  }
});
