import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantChatsModule } from "../assistant-chats.js";

/** The serving boot's repair of interrupted chat turns: its outcome is logged (count or failure),
 * handed to the boot-work tracker, and a failed repair never takes the chat routes down with it. */

function fakeApp() {
  const mounted: string[] = [];
  const app = new Proxy({}, { get: (_target, method) => (path: unknown) => { mounted.push(`${String(method)} ${String(path)}`); return app; } });
  return { app: app as never, mounted };
}

function module(reconcile: () => Promise<number>, onBootWork?: (work: Promise<void>) => void) {
  const finalizer = { reconcileInterrupted: reconcile } as never;
  return createAssistantChatsModule({ workspaceId: "ws" } as never, { finalizer, recoverInterrupted: true, ...(onBootWork ? { onBootWork } : {}) });
}

test("a repair that dispatched turns logs the count and is reported as boot work", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "log", (...args: unknown[]) => { logs.push(args); });
  const work: Promise<void>[] = [];
  const { app, mounted } = fakeApp();
  module(async () => 2, (pending) => { work.push(pending); }).registerRoutes!(app);
  assert.equal(work.length, 1);
  await work[0];
  assert.deepEqual(logs, [["[assistant-chats] dispatched 2 unfinished chat turn(s) to recovery"]]);
  assert.ok(mounted.length > 0, "the chat routes are mounted regardless of the repair outcome");
});

test("a failed repair is logged and settles, so the routes stay up; no boot-work tracker is optional", async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const failure = new Error("ledger unreadable");
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => { settle = resolve; });
  const { app, mounted } = fakeApp();
  module(async () => { setImmediate(settle); throw failure; }).registerRoutes!(app);
  await settled;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [["[assistant-chats] boot-time repair of interrupted chat turns failed", failure]]);
  assert.ok(mounted.includes("use /api/assistant/chats"));
});
