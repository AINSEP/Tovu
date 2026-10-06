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

const CONTINUED = "\n\n---\n\nContinued\n\n";

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
  const continued = new Set<string>();
  const client = {
    opened: 0,
    launch: async ({ run }: { run: { runId: string } }) => { continued.add(run.runId); },
    openEvents: async ({ runId }: { runId: string }) => {
      client.opened += 1;
      if (continued.has(runId)) return streamOf(frame("end", { status: "succeeded", code: 0 }, runId));
      return options.events();
    },
    runStatus: async ({ runId }: { runId: string }) => continued.has(runId) ? 200 : options.runStatus ?? 200,
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

  // A request-bound BYOK browser save of a finished turn goes through the same PUT route.
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
      runId: "byok:run-2",
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

test("a run the daemon forgot continues its saved partial answer and completes the same message", async (t) => {
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
  assert.equal(row.runStatus, "succeeded");
  assert.equal(row.content, "Half an ans" + CONTINUED);
  assert.deepEqual(row.events, [
    { kind: "text", text: "Half an ans" + CONTINUED },
    { kind: "status", code: "run_recovering", label: "Continuing…" },
  ]);
});

test("a run in flight when the API process dies continues at the next serving boot with its saved checkpoint", async (t) => {
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
  await reboot.finalizer.idle();
  const row = await assistantRow(rebooted.baseUrl, rebooted.cookie, conversationId);
  assert.equal(row.runStatus, "succeeded");
  assert.equal(row.content, "Still writ" + CONTINUED);
  assert.deepEqual(row.events, [
    { kind: "text", text: "Still writ" + CONTINUED },
    { kind: "status", code: "run_recovering", label: "Continuing…" },
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
  // The daemon's 404 now continues the same message with the reviewed preserved-segment divider.
  const completed = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(completed.runStatus, "succeeded");
  assert.equal(completed.content, "Still writ" + CONTINUED);
  assert.deepEqual(completed.events, [
    { kind: "text", text: "Still writ" + CONTINUED },
    { kind: "status", code: "run_recovering", label: "Continuing…" },
  ]);
});

test("a browser terminal snapshot cannot beat the authoritative finalizer", async (t) => {
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
  assert.equal(row.content, "From the server");
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

test("a browser stub with another attempt id cannot reopen an already-terminal message", async (t) => {
  const { app, finalizer } = harness(fakeDaemon({ events: () => streamOf(text("Saved answer"), frame("end", { status: "succeeded", code: 0 })) }));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);
  await putStub(baseUrl, cookie, conversationId, "run-1"); await finalizer.idle();
  await putStub(baseUrl, cookie, conversationId, "run-2"); await finalizer.idle();
  const row = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(row.runId, "run-1"); assert.equal(row.runStatus, "succeeded"); assert.equal(row.content, "Saved answer");
});

// Cross-owner serving discovery, terminal absorption and exclusions now share recover().
// Their DI and dialect regressions live in recover.unit.test.ts and durable-run-store.dialects.test.ts.

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

// Live proof still renews watches; dead proof continues rather than using the former cancellation
// fallback. assistant-chat-recovery-bounds.unit.test.ts exercises that transition with injected time.

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
    // The follow loop supplies its fresh live proof to recovery before renewing this watch.
    assert.deepEqual(requests, ["/events", "", "/events"].map((suffix) => ({ path: `/api/runs/${encodeURIComponent(runId)}${suffix}`, token: "Bearer finalizer-test-token", principal: user.id })));
  } finally {
    if (previousUrl === undefined) delete process.env.JINI_AGENT_DAEMON_URL; else process.env.JINI_AGENT_DAEMON_URL = previousUrl;
    if (previousToken === undefined) delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR]; else process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = previousToken;
  }
});
