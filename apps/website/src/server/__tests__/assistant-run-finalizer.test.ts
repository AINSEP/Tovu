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
import { bootAuthenticated } from "./helpers/http-test-server.js";
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

function harness(daemon: RunDaemonClient, deps: RouteDeps = createRouteDeps()) {
  const finalizer: AssistantRunFinalizer = createAssistantRunFinalizer({
    ledger: deps.chatRunLedger,
    daemon,
    checkpointIntervalMs: 0,
    reconnectDelayMs: 1,
    maxReconnects: 2,
  });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantChatsModule(deps, { finalizer }).registerRoutes?.(app);
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

test("a run the daemon forgot (it restarted) is saved failed, keeping what it produced, with the plain restart message", async (t) => {
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
  assert.equal(row.runStatus, "failed");
  assert.equal(row.content, "Half an ans");
  assert.deepEqual(row.events, [
    { kind: "text", text: "Half an ans" },
    { kind: "status", label: RESTART_LABEL, detail: RESTART_DETAIL },
  ]);
});

test("a run in flight when the API process dies is saved failed at the next boot, with what it produced so far", async (t) => {
  const stream = controllableStream();
  const daemon = fakeDaemon({ events: () => stream.response, runStatus: 404 });
  const deps = createRouteDeps();
  const { app, finalizer } = harness(daemon, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const conversationId = await startConversation(baseUrl, cookie);

  await putStub(baseUrl, cookie, conversationId);
  stream.push(text("Still writ"));
  // Let the frame reach the finalizer and its checkpoint land before the process "dies".
  await new Promise((r) => setTimeout(r, 30));

  const running = await assistantRow(baseUrl, cookie, conversationId);
  assert.equal(running.runStatus, "running", "a checkpoint must not change the status");
  assert.equal(running.content, "Still writ", "the in-flight answer was not checkpointed");

  // The next boot over the same chat database: building the routes runs the repair.
  const reboot = harness(fakeDaemon({ events: () => streamOf() }), deps);
  const rebooted = await bootAuthenticated(reboot.app, t);
  const row = await assistantRow(rebooted.baseUrl, rebooted.cookie, conversationId);
  assert.equal(row.runStatus, "failed");
  assert.equal(row.content, "Still writ");
  assert.deepEqual(row.events, [
    { kind: "text", text: "Still writ" },
    { kind: "status", label: RESTART_LABEL, detail: RESTART_DETAIL },
  ]);

  stream.close();
  await finalizer.idle();
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

test("on boot, turns stuck at running or queued are marked failed with the plain message and kept", async (t) => {
  const deps = createRouteDeps();
  // Seeded under some other admin: the repair spans every owner.
  const store = deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "another-admin" });
  await store.create({ id: "c-old" });
  await store.appendMessage("c-old", { id: "u1", role: "user", content: "hi" });
  await store.appendMessage("c-old", {
    id: "a1",
    role: "assistant",
    content: "Partial",
    events: [{ kind: "text", text: "Partial" }],
    runId: "dead-run",
    runStatus: "running",
  });
  await store.appendMessage("c-old", { id: "a2", role: "assistant", content: "", runId: "byok:x", runStatus: "queued" });
  await store.appendMessage("c-old", {
    id: "a3",
    role: "assistant",
    content: "Done",
    events: [{ kind: "text", text: "Done" }],
    runId: "fine-run",
    runStatus: "succeeded",
  });

  // Building the routes is "boot" for this module; the repair must be done before anything is served.
  const { app, finalizer } = harness(fakeDaemon({ events: () => streamOf() }), deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  // Any chat route answers only once the async repair has finished.
  assert.equal((await api(baseUrl, cookie, "")).status, 200);

  const messages = (await store.messages("c-old")) as SavedMessage[];
  const byId = new Map(messages.map((m) => [m.id, m]));
  assert.equal(messages.length, 4, "no row may be deleted");

  assert.equal(byId.get("a1")?.runStatus, "failed");
  assert.equal(byId.get("a1")?.content, "Partial");
  assert.deepEqual(byId.get("a1")?.events, [
    { kind: "text", text: "Partial" },
    { kind: "status", label: RESTART_LABEL, detail: RESTART_DETAIL },
  ]);
  assert.equal(byId.get("a2")?.runStatus, "failed");
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
