import { afterEach, expect, test, vi } from "vitest";
import { EventType, PROTOCOL_VERSION } from "@ag-ui/core";
import { EventSchemas, RunAgentInputSchema } from "@ag-ui/core/schemas";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";
import { AG_UI_RUN_PATH, agUiRunClient } from "../assistant-transport-ag-ui";
import { streamFromChunks } from "./assistant-transport.test-helpers";

/**
 * @file AG-UI 1.0 conformance for the admin chat surface: the request the real `@ag-ui/client`
 * HttpAgent sends must be a valid 1.0 `RunAgentInput`, and a stream of 1.0-valid events must reach
 * the dock as one text reply and one completion. Pinned to the exact installed protocol line so a
 * silent downgrade or a 2.x jump fails here first.
 */

afterEach(() => vi.unstubAllGlobals());

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "find my posts" }];
const STREAM = [
  { type: EventType.RUN_STARTED, threadId: "t", runId: "r" },
  { type: EventType.TEXT_MESSAGE_START, messageId: "m1", role: "assistant" },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "Found 3 posts." },
  { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },
  { type: EventType.RUN_FINISHED, threadId: "t", runId: "r" },
] as const;

test("admin chat speaks AG-UI 1.0: a valid RunAgentInput out, valid events in, one reply and one completion", async () => {
  expect(PROTOCOL_VERSION).toBe("1.0");
  for (const event of STREAM) expect(EventSchemas.safeParse(event).success).toBe(true);
  const fetchMock = vi.fn(async () => new Response(streamFromChunks(STREAM.map((event) => `data: ${JSON.stringify(event)}\n\n`)), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const events: AgentEvent[] = [];
  const done: AgentEvent[][] = [];
  const errors: Error[] = [];
  const handlers = { onEvent: (event: AgentEvent) => events.push(event), onDone: (final: AgentEvent[]) => done.push(final), onError: (error: Error) => errors.push(error) } as unknown as RunHandlers;

  await agUiRunClient.startAgUiRun({ input: { history: HISTORY, signal: new AbortController().signal }, handlers }, {});
  await vi.waitFor(() => expect(done).toHaveLength(1));

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(AG_UI_RUN_PATH);
  const body: unknown = JSON.parse(init.body as string);
  expect(RunAgentInputSchema.safeParse(body).success).toBe(true);
  expect(errors).toEqual([]);
  expect(events.filter((event) => event.kind === "text").map((event) => (event as { text: string }).text).join("")).toBe("Found 3 posts.");
});
