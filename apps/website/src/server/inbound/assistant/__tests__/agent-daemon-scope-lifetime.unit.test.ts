import assert from "node:assert/strict";
import test from "node:test";
import type express from "express";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { createScopeLifetime } from "../agent-daemon-scope-lifetime.js";

/**
 * @file The site scope's lifetime: work holds, and the one-shot dispose that fences intake,
 * revokes run credentials, cancels live runs, waits for held work, then ends parked responses,
 * clears retention timers and releases the shared resources. Real run lifecycle; recording fakes
 * for the process idle park, inventory, credentials and daemon store.
 */

function fixture({ ownsIdlePark = true } = {}) {
  const log: string[] = [];
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const processActivity = {
    hold: () => { log.push("process hold"); return () => { log.push("process release"); }; },
    stop: () => { log.push("idle park stopped"); },
  };
  const lifetime = createScopeLifetime({
    processActivity, ownsIdlePark, lifecycle,
    assistantInventory: { dispose: async () => { log.push("inventory disposed"); } },
    getRunCredentials: () => ({ revoke: ({ runId }: { runId: string }) => { log.push(`revoked ${runId}`); } }),
    getDaemonStore: () => ({ close: async () => { log.push("store closed"); } }),
    disposeAiTracing: () => { log.push("tracing disposed"); },
  } as unknown as Parameters<typeof createScopeLifetime>[0]);
  return { log, lifecycle, lifetime };
}

test("releasing a work hold twice releases the process hold once", () => {
  const { log, lifetime } = fixture();
  const release = lifetime.idlePark.hold();
  release();
  release();
  assert.deepEqual(log, ["process hold", "process release"]);
});

test("dispose fences intake at once, cancels live runs, waits for held work, then ends responses and releases resources once", async () => {
  const { log, lifecycle, lifetime } = fixture();
  await lifecycle.start({ contextRef: "fixture" }, { runId: "live-run" });
  // The executor's part: a cancel request ends the run.
  lifecycle.onCancelRequested({ runId: "live-run", listener: () => {
    log.push("cancel requested");
    void lifecycle.finish({ runId: "live-run", status: "cancelled", code: null, signal: null, resumable: false });
  } });
  const ended: string[] = [];
  lifetime.responses.add({ end: () => { ended.push("stream"); } } as unknown as express.Response);
  let timerFired = false;
  lifetime.ownerRetentionTimers.add(setTimeout(() => { timerFired = true; }, 20));
  const release = lifetime.idlePark.hold();

  const closing = lifetime.dispose();
  assert.equal(lifetime.isDisposed(), true, "intake is fenced before the first await");
  assert.equal(lifetime.dispose(), closing, "a second dispose joins the first");
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await lifecycle.get({ runId: "live-run" }))?.state, "cancelled");
  assert.deepEqual(ended, [], "parked responses stay open while work is still held");
  assert.equal(log.includes("store closed"), false);

  release();
  await closing;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(ended, ["stream"]);
  assert.equal(lifetime.responses.size, 0);
  assert.equal(timerFired, false, "owner retention timers are cleared");
  assert.equal(lifetime.ownerRetentionTimers.size, 0);
  assert.deepEqual(log, ["process hold", "revoked live-run", "cancel requested", "process release", "idle park stopped", "tracing disposed", "inventory disposed", "store closed"]);
});

test("a scope that does not own the idle park leaves it running on dispose", async () => {
  const { log, lifetime } = fixture({ ownsIdlePark: false });
  await lifetime.dispose();
  assert.deepEqual(log, ["tracing disposed", "inventory disposed", "store closed"]);
});
