import assert from "node:assert/strict";
import test from "node:test";
import type { Page, Request, Route } from "@playwright/test";

import { stubPendingRun } from "../support/assistant-run-stub.js";

/** Browser routing port only: no browser, server, model or module mocks. */
function routingPage() {
  const routes: Array<{ match: string | ((url: URL) => boolean); handle: (route: Route) => unknown }> = [];
  const page = {
    async route(match: string | ((url: URL) => boolean), handle: (route: Route) => unknown) {
      routes.push({ match, handle });
    },
  } as unknown as Page;
  async function request(pathname: string, method = "GET", data: unknown = undefined) {
    const url = new URL(pathname, "http://journey.test");
    const found = [...routes].reverse().find(({ match }) => typeof match === "function"
      ? match(url) : url.href.endsWith(match.replace(/^\*\*/, "")));
    assert.ok(found, `No browser stub handles ${method} ${url.pathname}`);
    let response: { status?: number; body?: string; json?: unknown } | undefined;
    const route = {
      request: () => ({ method: () => method, url: () => url.href, postDataJSON: () => data }) as Request,
      fulfill: async (value: typeof response) => { response = value; },
      continue: async () => { throw new Error(`Unexpected real request: ${method} ${url.pathname}`); },
    } as unknown as Route;
    await found.handle(route);
    assert.ok(response, "Route never fulfilled the request");
    return { status: response.status ?? 200, body: response.body ?? JSON.stringify(response.json),
      json: () => response!.json ?? JSON.parse(response!.body!) };
  }
  return { page, request };
}

const binding = { assistantMessageId: "answer-1", conversationId: "chat-1" };
const resource = { type: "resource", resource: { uri: "ui://tovu/ask-choice/admin/1", mimeType: "text/html", text: "<h1>Pick a plan</h1>" } };
const payloads = [
  { type: "text_delta", delta: "Which plan do you want?" },
  { type: "tool_use", id: "ask-1", name: "assistant_ask_choice", input: { title: "Pick a plan" } },
  { type: "mcp-ui", resource },
];

test("acceptance echoes the durable message and conversation from contextRef", async () => {
  const browser = routingPage();
  const stub = await stubPendingRun({ page: browser.page, payloads, toolCallStatus: 202 });
  const started = await browser.request("/api/runs", "POST", { contextRef: JSON.stringify(binding) });
  assert.equal(started.status, 201);
  assert.deepEqual(started.json(), { run: { id: "journey-run-1" }, messageId: "answer-1", conversationId: "chat-1" });
  assert.equal(stub.runStarts.length, 1);
});

test("recover returns a stable running checkpoint with renderable chat events", async () => {
  const browser = routingPage();
  await stubPendingRun({ page: browser.page, payloads, toolCallStatus: 202 });
  await browser.request("/api/runs", "POST", { contextRef: JSON.stringify(binding) });
  const first = await browser.request("/api/runs/journey-run-1/recover", "POST", { messageId: "answer-1" });
  const second = await browser.request("/api/runs/journey-run-1/recover", "POST", { messageId: "answer-1" });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json(), second.json(), "Polling must replace the same checkpoint, never append a replay");
  assert.deepEqual(first.json().message, {
    id: "answer-1", role: "assistant", runId: "journey-run-1", runStatus: "running",
    content: "Which plan do you want?",
    events: [
      { kind: "text", text: "Which plan do you want?" },
      { kind: "tool_use", id: "ask-1", name: "assistant_ask_choice", input: { title: "Pick a plan" } },
      { kind: "ext", name: "mcp-ui", data: resource },
    ],
  });
  assert.equal(first.json().conversationId, "chat-1");
});

test("SSE resume excludes frames at or before the client's last cursor", async () => {
  const browser = routingPage();
  await stubPendingRun({ page: browser.page, payloads, toolCallStatus: 202 });
  await browser.request("/api/runs", "POST", { contextRef: JSON.stringify(binding) });
  const initial = await browser.request("/api/runs/journey-run-1/events");
  assert.ok(initial.body.includes('id: 1\nevent: agent\n'));
  const resumed = await browser.request("/api/runs/journey-run-1/events?afterCursor=2");
  assert.equal(resumed.body.includes("Which plan do you want?"), false);
  assert.equal(resumed.body.includes('"id":"ask-1"'), false);
  assert.ok(resumed.body.includes('id: 3\nevent: agent\n'));
});

for (const status of [202, 409, 500] as const) {
  test(`typed-answer delivery preserves the scripted ${status} response`, async () => {
    const browser = routingPage();
    const stub = await stubPendingRun({ page: browser.page, payloads, toolCallStatus: status });
    const decision = { toolName: "assistant_ask_choice", params: { __typedAnswer: "Something in between, please" } };
    const response = await browser.request("/api/admin/v1/mcp-ui/tool-calls", "POST", decision);
    assert.equal(response.status, status);
    assert.deepEqual(stub.toolCalls, [decision]);
    assert.deepEqual(response.json(), status === 202 ? { delivered: true }
      : status === 409 ? { error: "that dialog is no longer waiting for an answer", code: "SURFACE_NOT_PENDING", reason: "unknown-or-closed" }
        : { error: "internal error", code: "INTERNAL_ERROR" });
  });
}
