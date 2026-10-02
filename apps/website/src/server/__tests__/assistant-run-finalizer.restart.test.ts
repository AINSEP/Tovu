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
  kind: "status",
  label: "The assistant restarted while this answer was running, so it stopped.",
  detail: "Anything it wrote before the restart is kept above. Send your message again to retry.",
};

function frame(kind: string, payload: unknown): string {
  return `event: ${kind}\ndata: ${JSON.stringify({ runId: "run-1", kind, payload })}\n\n`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
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
  await store.appendMessage("c1", stub);
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
    await ledger.reconcileInterrupted(2000);
    const saved = (await store.messages("c1"))[0]!;
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
    assert.equal(await createChatRunLedger(db).reconcileInterrupted(3000), 0);
    const reopened = (await createChatStoreFactory(db)(principal).messages("c1"))[0]!;
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

test("daemon disappearance cancels the interrupted turn, preserves progress, and ignores a late failed browser save", async () => {
  const db = openChatDb(":memory:");
  const ledger = createChatRunLedger(db);
  const store = createChatStoreFactory(db)(principal);
  await store.create({ id: "c1" });
  await store.appendMessage("c1", stub);
  const finalizer = createAssistantRunFinalizer({
    ledger,
    daemon: {
      openEvents: async () => new Response(frame("agent", { type: "text_delta", delta: "Partial" })),
      runStatus: async () => 404,
    },
    checkpointIntervalMs: 0,
    now: () => 1234,
  });
  try {
    finalizer.watch({ principalId: "owner", conversationId: "c1", message: stub });
    await finalizer.idle();
    await store.appendMessage("c1", { ...stub, runStatus: "failed", events: [], content: "" });
    const saved = (await store.messages("c1"))[0]!;
    assert.equal(saved.runStatus, "canceled");
    assert.equal(saved.content, "Partial");
    assert.deepEqual(saved.events, [{ kind: "text", text: "Partial" }, notice]);
    assert.equal(saved.endedAt, 1234);
  } finally {
    db.close();
  }
});

test("a genuine CLI failure still saves failed with its exit diagnosis", async () => {
  const db = openChatDb(":memory:");
  const store = createChatStoreFactory(db)(principal);
  await store.create({ id: "c1" });
  await store.appendMessage("c1", stub);
  const finalizer = createAssistantRunFinalizer({
    ledger: createChatRunLedger(db),
    daemon: {
      openEvents: async () => new Response(frame("end", { code: 1, status: "failed", resumable: false })),
      runStatus: async () => 200,
    },
    now: () => 1234,
  });
  try {
    finalizer.watch({ principalId: "owner", conversationId: "c1", message: stub });
    await finalizer.idle();
    const saved = (await store.messages("c1"))[0]!;
    assert.equal(saved.runStatus, "failed");
    assert.equal(saved.content, "");
    assert.deepEqual(saved.events, [{
      kind: "status",
      label: "Run failed — the agent process exited without answering",
      detail: "exit code 1, signal none, resumable no. The agent CLI's own stderr is shown above when it printed anything; otherwise check the server log for `[agent-daemon] run <id> ended`.",
    }]);
    assert.equal(saved.endedAt, 1234);
  } finally {
    db.close();
  }
});

test("a browser-first restart save is canceled before it can win terminal settlement as failed", async () => {
  const db = openChatDb(":memory:");
  const store = createChatStoreFactory(db)(principal);
  const ledger = createChatRunLedger(db);
  try {
    await store.create({ id: "c1" });
    await store.appendMessage("c1", stub);
    // The current chat hook maps onError + onDone to failed. Its exact restart notice distinguishes
    // interruption from a CLI failure, even when this browser save beats the server finalizer.
    await store.appendMessage("c1", { ...stub, runStatus: "failed", content: "Partial", events: [{ kind: "text", text: "Partial" }, notice] });
    assert.equal(await ledger.settle({ conversationId: "c1", messageId: "a1", runId: "run-1", status: "canceled", content: "late", events: [], endedAt: 1234 }), false);
    const saved = (await store.messages("c1"))[0]!;
    assert.equal(saved.runStatus, "canceled", "the browser must not turn process interruption into a failed run");
    assert.equal(saved.content, "Partial");
    assert.deepEqual(saved.events, [{ kind: "text", text: "Partial" }, notice]);
    assert.equal(await ledger.reconcileInterrupted(2000), 0);
  } finally {
    db.close();
  }
});

test("a browser's genuine failure with a different status notice remains failed", async () => {
  const db = openChatDb(":memory:");
  const store = createChatStoreFactory(db)(principal);
  try {
    await store.create({ id: "c1" });
    const events = [{ kind: "status", label: notice.label, detail: "The CLI reported a real error." }];
    await store.appendMessage("c1", { ...stub, runStatus: "failed", events });
    const saved = (await store.messages("c1"))[0]!;
    assert.equal(saved.runStatus, "failed");
    assert.deepEqual(saved.events, events);
  } finally {
    db.close();
  }
});
