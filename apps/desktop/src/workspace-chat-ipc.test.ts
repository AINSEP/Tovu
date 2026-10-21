/**
 * @file `registerWorkspaceChatIpc` — the main-process half of the desktop chat — driven through a
 * fake `ipcMain` (a handler table), a fake agent runtime (a hand-written `RunLifecycle` slice), and a
 * fake conversation store. No Electron, no daemon, no model.
 *
 * It also holds the drift check `workspace-chat-ipc.ts`'s header promises: that module INLINES its
 * channel literals (main loads `.ts` sources directly and the contracts import a build-only
 * `./sections.js`), so this test imports the contracts through the `.js`→`.ts` resolve hook and fails
 * on any divergence, keeping the contracts the source of truth.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RunProtocolEvent } from "@jini-ai/protocol";
import {
  AGENT_INVENTORY_IPC,
  CONVERSATION_IPC,
  DESKTOP_CHAT_INVOKE_CHANNELS,
  WORKING_DIRECTORY_IPC,
  WORKSPACE_CHAT_IPC,
  addresseeForStart,
  registerWorkspaceChatIpc,
} from "./workspace-chat-ipc.ts";
import type { EventSink, WorkspaceChatIpcDeps } from "./workspace-chat-ipc.ts";
import { WORKSPACE_CHAT_CHANNELS } from "./contracts/workspace-chat.ts";
import { RUNNER_AGENT_INVENTORY_CHANNELS } from "./contracts/runtime-inventory.ts";
import { WORKSPACE_CONVERSATION_CHANNELS } from "./contracts/workspace-conversations.ts";
import { RUNNER_WORKING_DIRECTORY_CHANNELS } from "./contracts/working-directory.ts";
import type { WorkspaceChatEventMessage } from "./contracts/workspace-chat.ts";

type Handler = (event: { sender: EventSink }, ...args: unknown[]) => unknown;
type StreamResult = { kind: "ok"; unsubscribe: () => void } | { kind: "replay-gap" };

/** A sender that records every push; `destroyed` flips what `isDestroyed` reports. */
function fakeSender() {
  const sent: WorkspaceChatEventMessage[] = [];
  const sender = {
    destroyed: false,
    send(channel: string, message: WorkspaceChatEventMessage) {
      assert.equal(channel, WORKSPACE_CHAT_IPC.event);
      sent.push(message);
    },
    isDestroyed() { return sender.destroyed; },
  };
  return { sender, sent };
}

const ev = (kind: string): RunProtocolEvent => ({ kind } as unknown as RunProtocolEvent);

/**
 * The whole fixture. `streamBehaviour` decides what `lifecycle.stream` does for a run: replay some
 * events synchronously, then answer `ok`, `replay-gap`, or throw (an unknown run).
 */
function setup({ stream }: { stream?: (input: { runId: string; onEvent: (event: RunProtocolEvent) => void }, options: { afterCursor: string | null }) => Promise<StreamResult> } = {}) {
  const handlers = new Map<string, Handler>();
  const calls: Record<string, unknown[]> = { startTurn: [], stream: [], cancel: [], get: [], unsubscribe: [], listAgents: [], pick: [], resolve: [] };
  const store = {
    list: () => [{ id: "c1", title: "One", messageCount: 0, createdAt: 1, updatedAt: 1 }],
    create: () => ({ id: "c2", title: "New", messageCount: 0, createdAt: 2, updatedAt: 2 }),
    rename: (input: unknown) => { calls.rename = [input]; },
    remove: (input: unknown) => { calls.remove = [input]; },
    loadMessages: (input: unknown) => { calls.loadMessages = [input]; return [{ id: "m1" }]; },
    saveMessage: (input: unknown) => { calls.saveMessage = [input]; },
    appendToolGap: () => undefined,
    listToolGaps: () => [],
  };
  const lifecycle = {
    stream: async (input: { runId: string; onEvent: (event: RunProtocolEvent) => void }, options: { afterCursor: string | null }): Promise<StreamResult> => {
      calls.stream!.push({ runId: input.runId, afterCursor: options.afterCursor });
      if (stream) return stream(input, options);
      return { kind: "ok", unsubscribe: () => { calls.unsubscribe!.push(input.runId); } };
    },
    cancel: async (input: unknown) => { calls.cancel!.push(input); },
    get: async ({ runId }: { runId: string }) => { calls.get!.push(runId); return runId === "known" ? { id: "known", state: "running" } : undefined; },
  };
  const runtime = {
    lifecycle,
    startTurn: async (required: unknown, optional: unknown) => { calls.startTurn!.push({ required, optional }); return { runId: "run-1" }; },
  };
  const deps = {
    ipcMain: { handle: (channel: string, listener: Handler) => { assert.ok(!handlers.has(channel), `duplicate ${channel}`); handlers.set(channel, listener); } },
    runtime: Promise.resolve(runtime),
    conversations: store,
    resolveAddressee: (siteDir: string) => { calls.resolve!.push(siteDir); return siteDir === "/tracked" ? { siteDir, name: "Tracked" } : null; },
    listAgents: async (required: { rescan: boolean }) => { calls.listAgents!.push(required); return []; },
    pickDirectory: async (current?: string) => { calls.pick!.push(current); return "/picked"; },
  } as unknown as WorkspaceChatIpcDeps;
  const registered = registerWorkspaceChatIpc(deps);
  const invoke = (channel: string, sender: EventSink, ...args: unknown[]) => handlers.get(channel)!({ sender }, ...args);
  return { handlers, calls, invoke, ...registered };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("the inlined channel literals match the contracts exactly", () => {
  assert.deepEqual({ ...WORKSPACE_CHAT_IPC }, { ...WORKSPACE_CHAT_CHANNELS });
  assert.deepEqual({ ...AGENT_INVENTORY_IPC }, { ...RUNNER_AGENT_INVENTORY_CHANNELS });
  assert.deepEqual({ ...CONVERSATION_IPC }, { ...WORKSPACE_CONVERSATION_CHANNELS });
  assert.deepEqual({ ...WORKING_DIRECTORY_IPC }, { ...RUNNER_WORKING_DIRECTORY_CHANNELS });
});

test("every claimed invoke channel gets exactly one handler, and push-only channels get none", () => {
  const { handlers } = setup();
  assert.deepEqual([...handlers.keys()].sort(), [...DESKTOP_CHAT_INVOKE_CHANNELS].sort());
  assert.equal(handlers.has(WORKSPACE_CHAT_IPC.event), false);
  assert.equal(handlers.has(WORKSPACE_CHAT_IPC.navigate), false);
});

test("addresseeForStart trusts only a tracked site, never a bare renderer-reported path", () => {
  const resolve = (siteDir: string) => (siteDir === "/tracked" ? { siteDir, name: "Tracked" } as never : null);
  assert.deepEqual(addresseeForStart({ subscriptionId: "s", prompt: "p", agentId: "a", activeSiteDir: "/tracked" }, resolve), { siteDir: "/tracked", name: "Tracked" });
  assert.equal(addresseeForStart({ subscriptionId: "s", prompt: "p", agentId: "a", activeSiteDir: "/etc" }, resolve), null);
  for (const activeSiteDir of [undefined, null, ""]) {
    assert.equal(addresseeForStart({ subscriptionId: "s", prompt: "p", agentId: "a", activeSiteDir }, () => assert.fail("must not resolve")), null);
  }
});

test("start forwards only the options the pane set, attaches the stream before resolving, and returns the run id", async () => {
  const { invoke, calls, activeSubscriptions } = setup();
  const { sender } = fakeSender();

  const minimal = await invoke(WORKSPACE_CHAT_IPC.start, sender, { subscriptionId: "s1", prompt: "hi", agentId: "claude" });
  const full = await invoke(WORKSPACE_CHAT_IPC.start, sender, {
    subscriptionId: "s2", prompt: "hi", agentId: "claude", conversationId: "c1", model: "haiku", reasoning: "low",
    attachmentPaths: ["/a.png"], activeSiteDir: "/tracked",
  });

  assert.deepEqual(minimal, { runId: "run-1" });
  assert.deepEqual(full, { runId: "run-1" });
  assert.deepEqual(calls.startTurn, [
    { required: { prompt: "hi", agentId: "claude" }, optional: { addressee: null } },
    { required: { prompt: "hi", agentId: "claude" },
      optional: { chatId: "c1", model: "haiku", reasoning: "low", attachmentPaths: ["/a.png"], addressee: { siteDir: "/tracked", name: "Tracked" } } },
  ]);
  assert.deepEqual(calls.stream, [{ runId: "run-1", afterCursor: null }, { runId: "run-1", afterCursor: null }]);
  assert.equal(activeSubscriptions(), 2);
});

test("events are pushed tagged with the subscription; a terminal end closes and detaches it", async () => {
  let onEvent!: (event: RunProtocolEvent) => void;
  const unsubscribed: string[] = [];
  const { invoke, activeSubscriptions } = setup({
    stream: async (input) => { onEvent = input.onEvent; return { kind: "ok", unsubscribe: () => unsubscribed.push(input.runId) }; },
  });
  const { sender, sent } = fakeSender();
  await invoke(WORKSPACE_CHAT_IPC.start, sender, { subscriptionId: "s1", prompt: "hi", agentId: "claude" });

  onEvent(ev("text"));
  onEvent(ev("end"));
  await tick();

  assert.deepEqual(sent, [
    { subscriptionId: "s1", kind: "event", event: ev("text") },
    { subscriptionId: "s1", kind: "event", event: ev("end") },
    { subscriptionId: "s1", kind: "closed", reason: "terminal" },
  ]);
  assert.deepEqual(unsubscribed, ["run-1"]);
  assert.equal(activeSubscriptions(), 0);
});

// Encodes a bug this test found: the real `RunLifecycle.stream` delivers an already-finished run's
// `end` synchronously during replay, so the deferred detach used to run BEFORE the registration and
// every reattach to a finished run left a dead entry in the subscription table.
test("a replayed end delivered before stream() returns does not leave a stale subscription behind", async () => {
  const released: string[] = [];
  const { invoke, activeSubscriptions } = setup({
    stream: async (input) => { input.onEvent(ev("end")); return { kind: "ok", unsubscribe: () => released.push(input.runId) }; },
  });
  const { sender, sent } = fakeSender();
  await invoke(WORKSPACE_CHAT_IPC.reattach, sender, { subscriptionId: "s1", runId: "done-run", afterCursor: "c7" });
  await tick();

  assert.deepEqual(sent.map((message) => message.kind), ["event", "closed"]);
  assert.equal(activeSubscriptions(), 0);
  assert.deepEqual(released, ["done-run"], "the lifecycle subscription is released, not leaked");
});

test("reattach passes the cursor through (null when absent) and reports a replay gap or an unknown run as closed", async () => {
  const outcomes: Array<() => Promise<StreamResult>> = [
    async () => ({ kind: "replay-gap" }),
    async () => { throw new Error("no such run"); },
    async () => ({ kind: "ok", unsubscribe: () => undefined }),
  ];
  const { invoke, calls, activeSubscriptions } = setup({ stream: () => outcomes.shift()!() });
  const { sender, sent } = fakeSender();

  await invoke(WORKSPACE_CHAT_IPC.reattach, sender, { subscriptionId: "gap", runId: "r1", afterCursor: "c3" });
  await invoke(WORKSPACE_CHAT_IPC.reattach, sender, { subscriptionId: "lost", runId: "r2" });
  await invoke(WORKSPACE_CHAT_IPC.reattach, sender, { subscriptionId: "live", runId: "r3" });

  assert.deepEqual(calls.stream, [{ runId: "r1", afterCursor: "c3" }, { runId: "r2", afterCursor: null }, { runId: "r3", afterCursor: null }]);
  assert.deepEqual(sent, [
    { subscriptionId: "gap", kind: "closed", reason: "replay-gap" },
    { subscriptionId: "lost", kind: "closed", reason: "unknown-run" },
  ]);
  assert.equal(activeSubscriptions(), 1);
});

test("detach unsubscribes and is a no-op for an unknown subscription", async () => {
  const { invoke, calls, activeSubscriptions } = setup();
  const { sender } = fakeSender();
  await invoke(WORKSPACE_CHAT_IPC.start, sender, { subscriptionId: "s1", prompt: "hi", agentId: "claude" });

  await invoke(WORKSPACE_CHAT_IPC.detach, sender, { subscriptionId: "s1" });
  await invoke(WORKSPACE_CHAT_IPC.detach, sender, { subscriptionId: "never-attached" });

  assert.deepEqual(calls.unsubscribe, ["run-1"]);
  assert.equal(activeSubscriptions(), 0);
});

test("a destroyed window stops receiving pushes and its subscription is dropped", async () => {
  let onEvent!: (event: RunProtocolEvent) => void;
  const { invoke, calls, activeSubscriptions } = setup({
    stream: async (input) => { onEvent = input.onEvent; return { kind: "ok", unsubscribe: () => { calls.unsubscribe!.push(input.runId); } }; },
  });
  const { sender, sent } = fakeSender();
  await invoke(WORKSPACE_CHAT_IPC.start, sender, { subscriptionId: "s1", prompt: "hi", agentId: "claude" });

  sender.destroyed = true;
  onEvent(ev("text"));

  assert.deepEqual(sent, []);
  assert.deepEqual(calls.unsubscribe, ["run-1"]);
  assert.equal(activeSubscriptions(), 0);
});

test("stop cancels the run with the operator reason; status maps a known run and answers null otherwise", async () => {
  const { invoke, calls } = setup();
  const { sender } = fakeSender();

  await invoke(WORKSPACE_CHAT_IPC.stop, sender, { runId: "r9" });
  assert.deepEqual(calls.cancel, [{ runId: "r9", reason: "Stopped by the operator." }]);
  assert.deepEqual(await invoke(WORKSPACE_CHAT_IPC.status, sender, { runId: "known" }), { runId: "known", state: "running" });
  assert.equal(await invoke(WORKSPACE_CHAT_IPC.status, sender, { runId: "missing" }), null);
});

test("agent inventory: list and rescan differ only in the rescan flag; the in-process daemon is always online", async () => {
  const { invoke, calls } = setup();
  const { sender } = fakeSender();
  assert.deepEqual(await invoke(AGENT_INVENTORY_IPC.list, sender), []);
  assert.deepEqual(await invoke(AGENT_INVENTORY_IPC.rescan, sender), []);
  assert.equal(await invoke(AGENT_INVENTORY_IPC.daemonOnline, sender), true);
  assert.deepEqual(calls.listAgents, [{ rescan: false }, { rescan: true }]);
});

test("conversation channels delegate to the store with the renderer's input", async () => {
  const { invoke, calls } = setup();
  const { sender } = fakeSender();
  const message = { conversationId: "c1", message: { id: "m1" } };

  assert.equal(((await invoke(CONVERSATION_IPC.list, sender)) as { id: string }[])[0]!.id, "c1");
  assert.equal(((await invoke(CONVERSATION_IPC.create, sender)) as { id: string }).id, "c2");
  await invoke(CONVERSATION_IPC.rename, sender, { id: "c1", title: "Renamed" });
  await invoke(CONVERSATION_IPC.delete, sender, { id: "c1", extra: "ignored" });
  assert.deepEqual(await invoke(CONVERSATION_IPC.loadMessages, sender, { conversationId: "c1" }), [{ id: "m1" }]);
  await invoke(CONVERSATION_IPC.saveMessage, sender, message);

  assert.deepEqual(calls.rename, [{ id: "c1", title: "Renamed" }]);
  assert.deepEqual(calls.remove, [{ id: "c1" }], "only the id reaches the store");
  assert.deepEqual(calls.loadMessages, [{ conversationId: "c1" }]);
  assert.deepEqual(calls.saveMessage, [message]);
});

test("working directory: pick delegates, recent is empty, exists/normalize accept only a real directory", async () => {
  const { invoke, calls } = setup();
  const { sender } = fakeSender();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-chat-ipc-wd-"));
  const file = path.join(dir, "file.txt");
  fs.writeFileSync(file, "x");

  assert.equal(await invoke(WORKING_DIRECTORY_IPC.pick, sender, "/current"), "/picked");
  assert.deepEqual(calls.pick, ["/current"]);
  assert.deepEqual(await invoke(WORKING_DIRECTORY_IPC.recent, sender), []);
  assert.equal(await invoke(WORKING_DIRECTORY_IPC.exists, sender, dir), true);
  for (const bad of [file, path.join(dir, "missing"), "", 42, undefined]) {
    assert.equal(await invoke(WORKING_DIRECTORY_IPC.exists, sender, bad), false, `exists(${String(bad)})`);
    assert.equal(await invoke(WORKING_DIRECTORY_IPC.normalize, sender, bad), null, `normalize(${String(bad)})`);
  }
  assert.equal(await invoke(WORKING_DIRECTORY_IPC.normalize, sender, `${dir}${path.sep}.${path.sep}`), path.resolve(dir));
});
