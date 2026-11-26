import { afterEach, describe, expect, test, vi } from "vitest";
import { EventType } from "@ag-ui/core";
import type { AgUiEvent } from "@jini-ai/chat/core/ag-ui";
import type { RunHandlers } from "@jini-ai/chat/core";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";

import { AG_UI_RUN_PATH, createAdminAgUiRunClient, type AdminAgUiDurablePorts } from "../assistant-transport-ag-ui";
import { routeApprovalToolCall } from "@jini-ai/chat/transports/ag-ui/approval-relay";
const EXPIRED_APPROVAL_MESSAGE = "This request expired. Ask again.";
import { flushMicrotasks, streamFromChunks } from "./assistant-transport.test-helpers";
import golden from "./fixtures/admin-ag-ui-approval-wire.golden.json";

/**
 * @file P6-T2.T step 4 (admin client half) and the client part of the P6-T4.T Approvals gate: the
 * existing approval card answers a live AG-UI interrupt through one resume of the same thread,
 * the logical turn stays busy across the interrupt segment, and ordinary cards keep their route.
 */

const LAUNCH = { contextRef: {}, agentId: "claude", messageId: "msg-a1", conversationId: "conv-1" };
const CARD = { type: EventType.CUSTOM, name: "tovu.ext.mcp-ui", value: { type: "resource", resource: { uri: "ui://confirm", mimeType: "text/html", text: "<p>Delete?</p>" } } };

function frame(event: unknown): string {
  return `data: ${JSON.stringify(event as AgUiEvent)}\n\n`;
}
function sse(events: unknown[]): Response {
  return new Response(streamFromChunks(events.map(frame)), { status: 200 });
}
function interrupt({ threadId, runId, exchangeId }: { threadId: string; runId: string; exchangeId: string }) {
  return { type: EventType.RUN_FINISHED, threadId, runId,
    outcome: { type: "interrupt", interrupts: [{ id: `int-${exchangeId}`, reason: "confirmation", message: "Delete this post?", metadata: { exchangeId } }] } };
}

function recorder() {
  const rec = { events: [] as AgentEvent[], errors: [] as Error[], dones: [] as AgentEvent[][] };
  const handlers = { onEvent: (event: AgentEvent) => rec.events.push(event), onError: (error: Error) => rec.errors.push(error),
    onDone: (final: AgentEvent[]) => rec.dones.push(final) } as unknown as RunHandlers;
  return { rec, handlers };
}

/** A server that queues one response per AG-UI POST and records every request it saw. */
function server(responses: Array<() => Response>) {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    posts.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  vi.stubGlobal("fetch", fetchMock);
  return { posts };
}

function durablePorts() {
  const cancels: string[] = [];
  // The checkpoint follower of a parked run: it stays open (the run is not over), so it never settles here.
  const ports: AdminAgUiDurablePorts = { followRun: () => undefined, cancelRun: async ({ runId }) => { cancels.push(runId); } };
  return { ports, cancels };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await flushMicrotasks();
}

/** Starts a durable turn whose live segment ends on the approval card's interrupt. */
async function parkedDurableTurn(responses: Array<() => Response>) {
  const { posts } = server([() => sse([{ type: EventType.RUN_STARTED, threadId: "conv-1", runId: "run-durable-1" }, CARD,
    interrupt({ threadId: "conv-1", runId: "run-durable-1", exchangeId: "ex-1" })]), ...responses]);
  const { ports, cancels } = durablePorts();
  const client = createAdminAgUiRunClient({ durable: ports }, {});
  const { rec, handlers } = recorder();
  const cancel = new AbortController();
  await client.startAgUiRun({ input: { history: [{ id: "1", role: "user", content: "delete my post" }], conversationId: "conv-1",
    signal: new AbortController().signal, cancelSignal: cancel.signal }, handlers, durable: { launch: LAUNCH, bindRun: () => undefined } }, {});
  await flush();
  return { client, rec, posts, cancels, cancel };
}

const resumed = () => sse([{ type: EventType.RUN_STARTED, threadId: "conv-1", runId: "run-resume-2", parentRunId: "run-durable-1" },
  { type: EventType.RUN_FINISHED, threadId: "conv-1", runId: "run-resume-2" }]);

afterEach(() => { vi.unstubAllGlobals(); });

/** One recorded server answer, replayed byte for byte (frame by frame, as the socket would deliver). */
type RecordedAnswer = { status: number; contentType: string; body: string };
const replay = (recorded: RecordedAnswer) => () => new Response(streamFromChunks(recorded.body.split(/(?<=\n\n)/)),
  { status: recorded.status, headers: { "Content-Type": recorded.contentType } });
const goldenFinished = JSON.parse(golden.firstSegment.body.trim().split("\n\n").at(-1)!.replace(/^data: /, "")) as
  { threadId: string; runId: string; outcome: { interrupts: Array<{ id: string }> } };
const FORM_CALL = { name: "forms.fill", arguments: { __exchangeId: "ex-form", decision: "submit" } };
const APPROVE_CALL = { name: "posts.delete", arguments: { __exchangeId: "ex-1", decision: "confirm" } };

/** A delivery-only turn on the recorded thread, so the segment frames themselves reach the dock. */
async function replayedTurn(responses: Array<() => Response>) {
  const { posts } = server(responses);
  const client = createAdminAgUiRunClient({ durable: durablePorts().ports }, {});
  const { rec, handlers } = recorder();
  await client.startAgUiRun({ input: { history: [{ id: "1", role: "user", content: "delete it" }], conversationId: goldenFinished.threadId,
    signal: new AbortController().signal }, handlers }, {});
  await flush();
  const fallback = vi.fn(async () => ({ routed: "mcp-ui" }));
  return { posts, rec, fallback, route: routeApprovalToolCall({ approvals: client.approvals, fallback, copy: { sent: "Answer sent.", notSent: "Answer not sent." } }, {}) };
}
const cardUris = (events: AgentEvent[]) => events.flatMap((event) => (event.kind === "ext" && event.name === "mcp-ui"
  ? [(event.data as { resource: { uri: string } }).resource.uri] : []));
const texts = (events: AgentEvent[]) => events.flatMap((event) => (event.kind === "text" ? [event.text] : []));

describe("admin AG-UI approvals (P6-T2.T step 4, P6-T4.T Approvals gate)", () => {
  test("the existing approval card answers a live AG-UI interrupt with one resume", async () => {
    const { client, posts, rec } = await parkedDurableTurn([resumed, resumed]);
    const fallback = vi.fn(async () => ({ routed: "mcp-ui" }));
    const card = routeApprovalToolCall({ approvals: client.approvals, fallback, copy: { sent: "Answer sent.", notSent: "Answer not sent." } }, {});
    const click = () => card({ name: "posts.delete", arguments: { __exchangeId: "ex-1", decision: "confirm" } });
    const results = await Promise.all([click(), click()]);
    await flush();

    expect(posts).toHaveLength(2);
    expect(fallback, "the decision must not go to the MCP-UI tool-calls route").not.toHaveBeenCalled();
    expect(posts.map((post) => post.url)).toEqual([AG_UI_RUN_PATH, AG_UI_RUN_PATH]);
    const body = posts[1]!.body;
    expect(body).toMatchObject({ threadId: "conv-1", parentRunId: "run-durable-1", messages: [], tools: [], context: [],
      resume: [{ interruptId: "int-ex-1", status: "resolved", payload: "allow" }] });
    expect(body.runId).not.toBe("run-durable-1");
    expect(results.every((result) => (result as { isError: boolean }).isError === false)).toBe(true);
    expect(rec.errors).toEqual([]);
    expect(rec.dones, "the parked run is still the follower's to finish").toEqual([]);
  });

  test("an interrupt segment end keeps the turn busy and settles once after resume", async () => {
    const usage = (outputTokens: number) => ({ type: EventType.CUSTOM, name: "tovu.usage", value: { kind: "usage", outputTokens } });
    const text = (messageId: string, delta: string) => [{ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta }, { type: EventType.TEXT_MESSAGE_END, messageId }];
    server([
      () => sse([{ type: EventType.RUN_STARTED, threadId: "conv-2", runId: "seg-1" }, ...text("m1", "Checking."), usage(3), CARD,
        interrupt({ threadId: "conv-2", runId: "seg-1", exchangeId: "ex-2" })]),
      () => sse([{ type: EventType.RUN_STARTED, threadId: "conv-2", runId: "seg-2", parentRunId: "seg-1" }, ...text("m2", "Deleted."), usage(7),
        { type: EventType.RUN_FINISHED, threadId: "conv-2", runId: "seg-2" }]),
    ]);
    const client = createAdminAgUiRunClient({ durable: durablePorts().ports }, {});
    const { rec, handlers } = recorder();
    await client.startAgUiRun({ input: { history: [{ id: "1", role: "user", content: "delete it" }], conversationId: "conv-2", signal: new AbortController().signal }, handlers }, {});
    await flush();
    expect(rec.dones, "an interrupt segment end is not completion").toEqual([]);
    expect(rec.errors, "nor is it an error").toEqual([]);

    await expect(client.approvals.answer({ exchangeId: "ex-2", allow: true }, {})).resolves.toBe(true);
    await flush();
    expect(rec.errors).toEqual([]);
    expect(rec.dones).toHaveLength(1);
    const final = rec.dones[0]!;
    expect(final.filter((event) => event.kind === "text").map((event) => (event as { text: string }).text).join("")).toContain("Checking.");
    expect(final.filter((event) => event.kind === "text").map((event) => (event as { text: string }).text).join("")).toContain("Deleted.");
    expect(final.filter((event) => event.kind === "usage")).toEqual([{ kind: "usage", outputTokens: 7 }]);
  });

  test("ordinary cards still use their own route during an AG-UI run", async () => {
    const { client, posts } = await parkedDurableTurn([]);
    const fallback = vi.fn(async () => ({ routed: "mcp-ui" }));
    const card = routeApprovalToolCall({ approvals: client.approvals, fallback, copy: { sent: "Answer sent.", notSent: "Answer not sent." } }, {});
    const otherCard = { name: "posts.publish", arguments: { __exchangeId: "ex-other", decision: "confirm" } };
    const typedAnswer = { name: "ask_choice", arguments: { choice: "blue" } };
    await expect(card(otherCard)).resolves.toEqual({ routed: "mcp-ui" });
    await expect(card(typedAnswer)).resolves.toEqual({ routed: "mcp-ui" });
    expect(fallback.mock.calls).toEqual([[otherCard], [typedAnswer]]);
    expect(posts, "no resume was posted for a card the interrupt did not name").toHaveLength(1);
  });

  test("an expired resume shows the plain refusal once", async () => {
    const refusal = () => new Response(JSON.stringify({ error: EXPIRED_APPROVAL_MESSAGE, detail: "RAW-DAEMON-CANARY parked call gone" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const { client, rec } = await parkedDurableTurn([refusal, refusal]);
    const card = routeApprovalToolCall({ approvals: client.approvals, fallback: vi.fn(), copy: { sent: "Answer sent.", notSent: "Answer not sent." } }, {});
    const result = await card({ name: "posts.delete", arguments: { __exchangeId: "ex-1", decision: "cancel" } });
    await card({ name: "posts.delete", arguments: { __exchangeId: "ex-1", decision: "cancel" } });
    await flush();
    expect(result).toMatchObject({ isError: true });
    expect(rec.errors.map((error) => error.message)).toEqual([EXPIRED_APPROVAL_MESSAGE]);
    expect(rec.dones).toEqual([]);
  });

  test("an expired resume of a delivery-only turn shows the plain refusal once and ends the turn once", async () => {
    server([() => sse([{ type: EventType.RUN_STARTED, threadId: "conv-3", runId: "seg-1" }, CARD, interrupt({ threadId: "conv-3", runId: "seg-1", exchangeId: "ex-3" })]),
      () => new Response("HTTP 400 RAW-DAEMON-CANARY", { status: 400 })]);
    const client = createAdminAgUiRunClient({ durable: durablePorts().ports }, {});
    const { rec, handlers } = recorder();
    await client.startAgUiRun({ input: { history: [{ id: "1", role: "user", content: "x" }], conversationId: "conv-3", signal: new AbortController().signal }, handlers }, {});
    await flush();
    await expect(client.approvals.answer({ exchangeId: "ex-3", allow: false }, {})).resolves.toBe(false);
    await flush();
    expect(rec.errors.map((error) => error.message)).toEqual([EXPIRED_APPROVAL_MESSAGE]);
    expect(rec.dones).toHaveLength(1);
  });

  /**
   * The cross-stack half of the Approvals gate: the bytes replayed here are the live server route's,
   * recorded and pinned by `apps/website/src/server/__tests__/assistant-ag-ui-resume.integration.test.ts`
   * ("admin AG-UI golden wire"), so the two halves cannot drift. The server-side witnesses for allow,
   * deny, expiry/shutdown, a foreign owner or run, and replay live in that same file and are not
   * repeated here; this test proves the client accepts what that server actually emits.
   */
  test("admin AG-UI resumes a real parked approval and still renders ordinary cards", async () => {
    const turn = await replayedTurn([replay(golden.firstSegment), replay(golden.resumeSegment)]);
    expect(cardUris(turn.rec.events), "the existing card renders for both cards").toEqual(["ui://tovu/forms.fill/ex-form", "ui://tovu/posts.delete/ex-1"]);
    expect(turn.rec.dones, "the interrupt segment end is not completion").toEqual([]);

    await expect(turn.route(FORM_CALL)).resolves.toEqual({ routed: "mcp-ui" });
    expect(turn.fallback.mock.calls, "the ordinary card's decision keeps its own mcp-ui route").toEqual([[FORM_CALL]]);
    const results = await Promise.all([turn.route(APPROVE_CALL), turn.route(APPROVE_CALL)]);
    await flush();
    expect(turn.fallback).toHaveBeenCalledTimes(1);
    expect(results.map((result) => (result as { isError: boolean }).isError)).toEqual([false, false]);
    expect(turn.posts.map((post) => post.url), "one first segment, one resume").toEqual([AG_UI_RUN_PATH, AG_UI_RUN_PATH]);
    expect(turn.posts[1]!.body).toMatchObject({ threadId: goldenFinished.threadId, parentRunId: goldenFinished.runId,
      resume: [{ interruptId: goldenFinished.outcome.interrupts[0]!.id, status: "resolved", payload: "allow" }] });

    expect(turn.rec.errors).toEqual([]);
    expect(turn.rec.dones, "the logical turn settles once").toHaveLength(1);
    expect(texts(turn.rec.events).join(""), "no delta repeats across the two segments").toBe("Checking.Deleted.");
    expect(cardUris(turn.rec.events), "no card repeats").toHaveLength(2);
    expect(texts(turn.rec.dones[0]!).join("")).toBe("Checking.Deleted.");
    expect(cardUris(turn.rec.dones[0]!)).toHaveLength(2);

    const refused = await replayedTurn([replay(golden.firstSegment), replay(golden.refusal)]);
    await refused.route(APPROVE_CALL);
    await refused.route(APPROVE_CALL);
    await flush();
    expect(JSON.parse(golden.refusal.body), "the server's refusal is the sentence the dock shows").toEqual({ error: EXPIRED_APPROVAL_MESSAGE });
    expect(refused.rec.errors.map((error) => error.message), "the refusal shows the plain sentence once").toEqual([EXPIRED_APPROVAL_MESSAGE]);
    expect(refused.rec.dones).toHaveLength(1);
  });

  test("Stop while an approval is parked cancels the owned run once", async () => {
    const { client, cancels, cancel } = await parkedDurableTurn([]);
    cancel.abort();
    await client.stopAgUiRun({ runId: "run-durable-1" }, {});
    await client.stopAgUiRun({ runId: "run-durable-1" }, {});
    expect(cancels).toEqual(["run-durable-1"]);
    expect(client.approvals.answersExchange({ exchangeId: "ex-1" }, {}), "Stop ends the right to answer").toBe(false);
  });
});
