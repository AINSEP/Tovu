import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../runtime/composition/app.js";
import { createAssistantChatsModule } from "../runtime/composition/modules/assistant-chats.js";
import {
  createAssistantRunFinalizer,
  type AssistantRunFinalizer,
  type RunDaemonClient,
} from "../runtime/composition/modules/assistant-run-finalizer.js";
import { registerAuthRoutes } from "../inbound/admin-http/dev-auth.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";
import { AGENT_DAEMON_TOKEN_ENV_VAR, RUN_PRINCIPAL_HEADER } from "../../assistant/index.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file FINDING A (`ADS-memory/reports/2026-09-27-stuck-chat-root-cause.md`): a saved admin-chat
 * answer must not depend on a browser staying connected.
 *
 * Every test drives the real `/api/assistant/chats` routes over HTTP against the in-memory `chat.db`
 * the test composition root builds, with a fake agent daemon standing in for the real one. The
 * browser is simulated by exactly what it sends: the in-flight stub PUT, and (sometimes) a terminal
 * PUT of its own.
 */

const RESTART_LABEL = "The assistant restarted while this answer was running, so it stopped.";
const RESTART_DETAIL = "Anything it wrote before the restart is kept above. Send your message again to retry.";

interface SavedMessage {
  id: string;
  role: string;
  content: string;
  runId?: string;
  runStatus?: string;
  events?: Array<Record<string, unknown>>;
}

/** One SSE frame exactly as the daemon writes it: a named event whose data is a protocol event. */
function frame(kind: string, payload: unknown, runId = "run-1"): string {
  return `event: ${kind}\ndata: ${JSON.stringify({ runId, kind, payload })}\n\n`;
}

const text = (delta: string, runId = "run-1") => frame("agent", { type: "text_delta", delta }, runId);

/** A daemon stream the test writes frames into and closes when it chooses. */
function controllableStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    push: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
    close: () => controller.close(),
  };
}

function fakeDaemon(options: {
  events: () => Response | Promise<Response>;
  runStatus?: number | null;
}): RunDaemonClient & { opened: number } {
  const client = {
    opened: 0,
    openEvents: async () => {
      client.opened += 1;
      return options.events();
    },
    runStatus: async () => options.runStatus ?? 200,
  };
  return client;
}

function streamOf(...chunks: string[]): Response {
  return new Response(chunks.join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

function harness(daemon: RunDaemonClient | undefined, deps: RouteDeps = createRouteDeps(), checkpointIntervalMs = 0) {
  const finalizer: AssistantRunFinalizer = createAssistantRunFinalizer({
    ledger: deps.chatRunLedger,
    daemon,
    checkpointIntervalMs,
    now: () => Date.now(),
    reconnectDelayMs: 1,
    maxReconnects: 2,
  });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantChatsModule(deps, { finalizer, recoverInterrupted: true }).registerRoutes?.(app);
  return { app, deps, finalizer };
}

async function api(baseUrl: string, cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}/api/assistant/chats${path}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

async function startConversation(baseUrl: string, cookie: string): Promise<string> {
  const created = (await (await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({}) })).json()) as {
    conversation: { id: string };
  };
  const id = created.conversation.id;
  await api(baseUrl, cookie, `/${id}/messages/u1`, {
    method: "PUT",
    body: JSON.stringify({ role: "user", content: "write me a haiku" }),
  });
  return id;
}

/** What `useAssistantChats.persistRunStub` writes the moment a daemon run has an id. */
async function putStub(baseUrl: string, cookie: string, conversationId: string, runId = "run-1") {
  return api(baseUrl, cookie, `/${conversationId}/messages/a1`, {
    method: "PUT",
    body: JSON.stringify({ role: "assistant", content: "", events: [], runId, runStatus: "running" }),
  });
}

async function assistantRow(baseUrl: string, cookie: string, conversationId: string): Promise<SavedMessage> {
  const { messages } = (await (await api(baseUrl, cookie, `/${conversationId}/messages`)).json()) as {
    messages: SavedMessage[];
  };
  const row = messages.find((m) => m.id === "a1");
  assert.ok(row, "the assistant row is missing");
  return row;
}

test("a run that ends with no browser attached is saved with its full answer and events", async (t) => {
  const daemon = fakeDaemon({
    events: () =>
      streamOf(
        frame("start", { agentId: "claude" }),
        text("Autumn wind "),
        frame("agent", { type: "tool_use", id: "t1", name: "search_posts", input: { q: "autumn" } }),
        frame("agent", { type: "tool_result", toolUseId: "t1", content: "3 posts" }),
        text("rattles the gate"),
        frame("end", { code: 0, status: "succeeded" }),
      ),
  });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  // The browser saves the stub, then the tab is closed: nothing else ever arrives from it.
  assert.equal((await putStub(baseUrl, cookie, conversationId)).status, 200);
  await finalizer.idle();

  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runStatus, "succeeded");
  // A paragraph break where the tool call sat: text from before and after a step is never glued
  // together (`@jini-ai/chat`'s `assistantContentFromEvents`, the rule the browser uses too).
  assert.equal(row.content, "Autumn wind \n\nrattles the gate");
  assert.deepEqual(row.events, [
    { kind: "text", text: "Autumn wind " },
    { kind: "tool_use", id: "t1", name: "search_posts", input: { q: "autumn" } },
    { kind: "tool_result", toolUseId: "t1", content: "3 posts", isError: false },
    { kind: "text", text: "rattles the gate" },
  ]);
});

test("streamed text deltas are saved as one text event per run, by the server finalizer and by a browser save", async (t) => {
  const daemon = fakeDaemon({
    events: () =>
      streamOf(
        frame("start", { agentId: "claude" }),
        text("Here"),
        text(" are your"),
        text(" posts."),
        frame("end", { code: 0, status: "succeeded" }),
      ),
  });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId);
  await finalizer.idle();
  const serverRow = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(serverRow.content, "Here are your posts.");
  assert.deepEqual(serverRow.events, [{ kind: "text", text: "Here are your posts." }]);

  // The browser's own save of a finished turn goes through the same PUT route.
  const browserSave = await api(baseUrl, cookie, `/${conversationId}/messages/a2`, {
    method: "PUT",
    body: JSON.stringify({
      role: "assistant",
      content: "One two",
      events: [
        { kind: "thinking", text: "Hm" },
        { kind: "thinking", text: "m." },
        { kind: "text", text: "One" },
        { kind: "text", text: " two" },
      ],
      runId: "run-2",
      runStatus: "succeeded",
    }),
  });
  assert.equal(browserSave.status, 200);
  const { messages } = (await (await api(baseUrl, cookie, `/${conversationId}/messages`)).json()) as { messages: SavedMessage[] };
  assert.deepEqual(messages.find((m) => m.id === "a2")?.events, [
    { kind: "thinking", text: "Hmm." },
    { kind: "text", text: "One two" },
  ]);
});

test("a run the daemon forgot (it restarted) is saved canceled, keeping what it produced, with the plain restart message", async (t) => {
  const daemon = fakeDaemon({
    // The daemon dies mid-answer: the stream just stops, and the respawned daemon has never heard of the run.
    events: () => streamOf(text("Half an ans")),
    runStatus: 404,
  });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId);
  await finalizer.idle();

  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runStatus, "canceled");
  assert.equal(row.content, "Half an ans");
  assert.deepEqual(row.events, [
    { kind: "text", text: "Half an ans" },
    { kind: "status", label: RESTART_LABEL, detail: RESTART_DETAIL },
  ]);
});

test("a run in flight when the API process dies is saved canceled at the next boot, with what it produced so far", async (t) => {
  const stream = controllableStream();
  const daemon = fakeDaemon({ events: () => stream.response, runStatus: 404 });
  const deps = createRouteDeps();
  const { app, finalizer } = harness(daemon, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId);
  stream.push(text("Still writ"));
  // Let the frame reach the finalizer and its checkpoint land before the process "dies".
  const running = await waitForAssistantContent(baseUrl, cookie, conversationId, "Still writ");
  assert.equal(running.runStatus, "running", "a checkpoint must not change the status");
  assert.equal(running.content, "Still writ", "the in-flight answer was not checkpointed");

  // The next serving boot over the same database: the daemon confirms the old run is gone.
  const reboot = harness(fakeDaemon({ events: () => streamOf(), runStatus: 404 }), deps);
  const rebooted = await bootAuthenticated(reboot.app, t);
  const row = await assistantRow(rebooted.baseUrl, rebooted.cookie, conversationId);
  assert.equal(row.runStatus, "canceled");
  assert.equal(row.content, "Still writ");
  assert.deepEqual(row.events, [
    { kind: "text", text: "Still writ" },
    { kind: "status", label: RESTART_LABEL, detail: RESTART_DETAIL },
  ]);

  stream.close();
  await finalizer.idle();
});

test("a run that goes quiet right after a frame the interval skipped still gets that frame checkpointed", async (t) => {
  const stream = controllableStream();
  const daemon = fakeDaemon({ events: () => stream.response, runStatus: 404 });
  const deps = createRouteDeps();
  const { app, finalizer } = harness(daemon, deps, 40);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);
  await putStub(baseUrl, cookie, conversationId);

  const realTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const checkpoint = deps.chatRunLedger.checkpoint.bind(deps.chatRunLedger);
  let firstSaved!: () => void;
  const first = new Promise<void>((resolve) => { firstSaved = resolve; });
  let lastSaved!: () => void;
  const last = new Promise<void>((resolve) => { lastSaved = resolve; });
  const saved: string[] = [];
  t.mock.method(deps.chatRunLedger, "checkpoint", async (input: Parameters<typeof checkpoint>[0]) => {
    await checkpoint(input);
    saved.push(input.content);
    if (input.content === "Still ") firstSaved();
    if (input.content === "Still writ") lastSaved();
  });
  const bounded = async (signal: Promise<void>) => {
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([signal, new Promise<never>((_resolve, reject) => { timer = realTimeout(() => reject(new Error("checkpoint signal timed out")), 2000); })]);
    } finally {
      realClearTimeout(timer!);
    }
  };
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  let armed!: () => void;
  const trailingArmed = new Promise<void>((resolve) => { armed = resolve; });
  const fakeTimeout = globalThis.setTimeout;
  // A plain swap, not `t.mock.method`: the test context restores its method mocks again when the
  // test ends, AFTER `t.mock.timers.reset()` below, and that second restore puts the mock-timers
  // `setTimeout` back on `globalThis` for every later test in this file — their reconnect `delay`
  // then never fires and each one hangs to its timeout.
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    const timer = fakeTimeout(...args);
    if (args[1] === 40) armed();
    return timer;
  }) as typeof setTimeout;
  try {
    stream.push(text("Still "));
    await bounded(first);
    stream.push(text("writ"));
    await bounded(trailingArmed);
    assert.deepEqual(saved, ["Still "], "the second frame must be skipped inside the interval");
    t.mock.timers.tick(39);
    assert.deepEqual(saved, ["Still "], "no checkpoint before the trailing deadline");
    t.mock.timers.tick(1);
    await bounded(last);
    assert.deepEqual(saved, ["Still ", "Still writ"]);
    const running = await assistantRow(baseUrl, cookie, conversationId);
    assert.equal(running.runStatus, "running");
    assert.equal(running.content, "Still writ", "the quiet run's last frame must be persisted before termination");
  } finally {
    globalThis.setTimeout = fakeTimeout;
    t.mock.timers.reset();
    stream.close();
    await finalizer.idle();
  }
  // Stream termination is a separate transition; both checkpoints above were observed in-flight.
  assert.equal((await assistantRow(baseUrl, cookie, conversationId)).content, "Still writ");
});

test("when the browser saves the finished turn first, the finalizer does not overwrite it", async (t) => {
  const stream = controllableStream();
  const daemon = fakeDaemon({ events: () => stream.response });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId);
  const browserSave = await api(baseUrl, cookie, `/${conversationId}/messages/a1`, {
    method: "PUT",
    body: JSON.stringify({
      role: "assistant",
      content: "From the tab",
      events: [{ kind: "text", text: "From the tab" }],
      runId: "run-1",
      runStatus: "succeeded",
    }),
  });
  assert.equal(browserSave.status, 200);

  stream.push(text("From the server"));
  stream.push(frame("end", { code: 0, status: "succeeded" }));
  stream.close();
  await finalizer.idle();

  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runStatus, "succeeded");
  assert.equal(row.content, "From the tab");
});

test("when the finalizer saves first, a later browser save for the same run is ignored", async (t) => {
  const daemon = fakeDaemon({
    events: () => streamOf(text("The real answer"), frame("end", { code: 0, status: "succeeded" })),
  });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId);
  await finalizer.idle();

  // A tab that slept through the run, woke after a daemon restart and gave up on it: failed, empty.
  const late = await api(baseUrl, cookie, `/${conversationId}/messages/a1`, {
    method: "PUT",
    body: JSON.stringify({ role: "assistant", content: "", events: [], runId: "run-1", runStatus: "failed" }),
  });
  assert.equal(late.status, 200);
  const { message } = (await late.json()) as { message: SavedMessage };
  assert.equal(message.runStatus, "succeeded", "the response must report what is actually stored");

  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runStatus, "succeeded");
  assert.equal(row.content, "The real answer");

  // A late in-flight stub for the same run must not reopen it either.
  await putStub(baseUrl, cookie, conversationId);
  assert.equal((await assistantRow(baseUrl, cookie, conversationId)).runStatus, "succeeded");
  assert.equal(finalizer.activeCount(), 0, "a settled run must not be watched again");
});

test("a retry (same message, new run id) is a new turn and is not blocked by the earlier terminal row", async (t) => {
  let call = 0;
  const daemon = fakeDaemon({
    events: () => {
      call += 1;
      return call === 1
        ? streamOf(frame("end", { code: 1, signal: null, status: "failed", resumable: false }))
        : streamOf(text("Second try worked", "run-2"), frame("end", { code: 0, status: "succeeded" }, "run-2"));
    },
  });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId, "run-1");
  await finalizer.idle();
  assert.equal((await assistantRow(baseUrl, cookie, conversationId)).runStatus, "failed");

  await putStub(baseUrl, cookie, conversationId, "run-2");
  await finalizer.idle();
  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runId, "run-2");
  assert.equal(row.runStatus, "succeeded");
  assert.equal(row.content, "Second try worked");
});

test("on boot, turns stuck at running or queued are marked canceled with the plain message and kept", async (t) => {
  const deps = createRouteDeps();
  // Seeded under some other admin: the repair spans every owner.
  const store = deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "another-admin" });
  await store.create({ id: "c-old" });
  await store.appendMessage({ conversationId: "c-old", message: { id: "u1", role: "user", content: "hi" } });
  await store.appendMessage({
    conversationId: "c-old",
    message: {
      id: "a1",
      role: "assistant",
      content: "Partial",
      events: [{ kind: "text", text: "Partial" }],
      runId: "dead-run",
      runStatus: "running",
    },
  });
  await store.appendMessage({ conversationId: "c-old", message: { id: "a2", role: "assistant", content: "", runId: "byok:x", runStatus: "queued" } });
  await store.appendMessage({
    conversationId: "c-old",
    message: {
      id: "a3",
      role: "assistant",
      content: "Done",
      events: [{ kind: "text", text: "Done" }],
      runId: "fine-run",
      runStatus: "succeeded",
    },
  });

  // This harness opts into serving-boot recovery; export route registration does not.
  const { app, finalizer } = harness(fakeDaemon({ events: () => streamOf(), runStatus: 404 }), deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  // Any chat route answers only once the async repair has finished.
  assert.equal((await api(baseUrl, cookie, "")).status, 200);

  const messages = (await store.messages({ conversationId: "c-old" })) as SavedMessage[];
  const byId = new Map(messages.map((m) => [m.id, m]));
  assert.equal(messages.length, 4, "no row may be deleted");

  assert.equal(byId.get("a1")?.runStatus, "canceled");
  assert.equal(byId.get("a1")?.content, "Partial");
  assert.deepEqual(byId.get("a1")?.events, [
    { kind: "text", text: "Partial" },
    { kind: "status", label: RESTART_LABEL, detail: RESTART_DETAIL },
  ]);
  assert.equal(byId.get("a2")?.runStatus, "canceled");
  assert.deepEqual(byId.get("a2")?.events, [{ kind: "status", label: RESTART_LABEL, detail: RESTART_DETAIL }]);
  assert.equal(byId.get("a3")?.runStatus, "succeeded");
  assert.deepEqual(byId.get("a3")?.events, [{ kind: "text", text: "Done" }]);
  assert.equal(finalizer.activeCount(), 0);
});

test("BYOK and AG-UI run ids are not watched: the daemon does not hold them", async (t) => {
  const daemon = fakeDaemon({ events: () => streamOf() });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId, "byok:1234");
  await putStub(baseUrl, cookie, conversationId, "agui:5678");
  assert.equal(daemon.opened, 0);
  assert.equal(finalizer.activeCount(), 0);
});

async function waitForAssistantContent(baseUrl: string, cookie: string, conversationId: string, expected: string): Promise<SavedMessage> {
  const deadline = Date.now() + 2000;
  let row = await assistantRow(baseUrl, cookie, conversationId);
  while (row.content !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    row = await assistantRow(baseUrl, cookie, conversationId);
  }
  assert.equal(row.content, expected, "checkpoint did not land before the deadline");
  return row;
}

test("a dropped stream reconnects from event zero and saves every event exactly once", async (t) => {
  let connection = 0;
  const daemon = fakeDaemon({ events: () => ++connection === 1
    ? streamOf(text("First "))
    : streamOf(text("First "), text("second"), frame("end", { code: 0, status: "succeeded" })), runStatus: 200 });
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);
  await putStub(baseUrl, cookie, conversationId);
  await finalizer.idle();
  assert.equal(daemon.opened, 2);
  assert.equal(finalizer.activeCount(), 0);
  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runStatus, "succeeded");
  assert.equal(row.content, "First second");
  assert.deepEqual(row.events, [{ kind: "text", text: "First second" }]);
});

test("reconnect exhaustion keeps a live run watched until the daemon proves it gone", { timeout: 5000 }, async (t) => {
  const daemon = fakeDaemon({ events: () => streamOf(text("Partial")), runStatus: 200 });
  let probes = 0;
  // A live daemon outlasts the reconnect budget, then disappears. The finalizer must still own
  // the row at that point; returning abandoned while live would strand it after the daemon dies.
  daemon.runStatus = async () => ++probes <= 3 ? 200 : 404;
  const { app, finalizer } = harness(daemon);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);
  await putStub(baseUrl, cookie, conversationId);
  await finalizer.idle();
  assert.equal(daemon.opened, 4, "the live run remains watched beyond two reconnects");
  assert.equal(finalizer.activeCount(), 0);
  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runStatus, "canceled", "the watch must observe the later unknown-run proof");
  assert.equal(row.content, "Partial");
  assert.deepEqual(row.events, [{ kind: "text", text: "Partial" }, {
    kind: "status",
    label: "The assistant restarted while this answer was running, so it stopped.",
    detail: "Anything it wrote before the restart is kept above. Send your message again to retry.",
  }]);
});

test("the default daemon client forwards token, principal and encoded run path through reconnect to a saved answer", async (t) => {
  const deps = createRouteDeps();
  const { app, finalizer } = harness(undefined, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  const { user } = await me.json() as { user: { id: string } };
  const daemonApp = express();
  const runId = "run with/slash";
  const requests: Array<{ path: string; token?: string; principal?: string }> = [];
  let opened = 0;
  daemonApp.use((req, res) => {
    const principal = req.get(RUN_PRINCIPAL_HEADER);
    requests.push({ path: req.originalUrl, token: req.get("authorization"), principal });
    if (req.method !== "GET" || req.get("authorization") !== "Bearer finalizer-test-token" || principal !== user.id) { res.sendStatus(403); return; }
    if (req.originalUrl === `/api/runs/${encodeURIComponent(runId)}/events`) {
      opened += 1;
      res.type("text/event-stream").send(opened === 1 ? text("First ", runId) : text("First ", runId) + text("answer", runId) + frame("end", { code: 0, status: "succeeded" }, runId));
    } else if (req.originalUrl === `/api/runs/${encodeURIComponent(runId)}`) res.json({ status: "running" });
    else res.sendStatus(404);
  });
  const daemonUrl = await startTestServer(daemonApp, t);
  const previousUrl = process.env.JINI_AGENT_DAEMON_URL;
  const previousToken = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  process.env.JINI_AGENT_DAEMON_URL = daemonUrl;
  process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = "finalizer-test-token";
  try {
    const conversationId = await startConversation(baseUrl, cookie);
    await putStub(baseUrl, cookie, conversationId, runId);
    await finalizer.idle();
    const row = await assistantRow(baseUrl, cookie, conversationId);
    assert.equal(row.runStatus, "succeeded");
    assert.equal(row.content, "First answer");
    assert.deepEqual(row.events, [{ kind: "text", text: "First answer" }]);
    assert.deepEqual(requests, ["/events", "", "/events"].map((suffix) => ({ path: `/api/runs/${encodeURIComponent(runId)}${suffix}`, token: "Bearer finalizer-test-token", principal: user.id })));
  } finally {
    if (previousUrl === undefined) delete process.env.JINI_AGENT_DAEMON_URL; else process.env.JINI_AGENT_DAEMON_URL = previousUrl;
    if (previousToken === undefined) delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR]; else process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = previousToken;
  }
});
