import { afterEach, expect, test, vi } from "vitest";
import { EventType } from "@ag-ui/core";
import type { RunHandlers } from "@jini-ai/chat/core";
import { AG_UI_RUN_PATH, createAdminAgUiRunClient } from "../assistant-transport-ag-ui";
import { streamFromChunks } from "./assistant-transport.test-helpers";

afterEach(() => { vi.unstubAllGlobals(); });

test("Durable AG-UI sends the three prepared context fields and no claimed authority", async () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(streamFromChunks([
    `data: ${JSON.stringify({ type: EventType.RUN_STARTED, threadId: "conv-context", runId: "run-context" })}\n\n`,
    `data: ${JSON.stringify({ type: EventType.RUN_FINISHED, threadId: "conv-context", runId: "run-context" })}\n\n`,
  ]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const client = createAdminAgUiRunClient({ durable: {
    followRun: () => undefined, cancelRun: async () => undefined, cancelPendingRun: async () => {},
  } }, {});
  const launch = { attachmentIds: ["att-1"], pluginRefIds: ["ui-ux-design"], model: "opus", reasoning: "high",
    pageContext: { path: "/pages/page-1", section: "pages", entry: { kind: "page", id: "page-1", title: "Open page" } },
    folders: ["/tmp/picked"], agentPluginState: { decision: { selected: ["ui-ux-design"] }, excluded: ["excluded-plugin"] } };
  const handlers = { onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() } as unknown as RunHandlers;
  await client.startAgUiRun({ input: { history: [{ id: "u1", role: "user", content: "this page" }],
    conversationId: "conv-context", signal: new AbortController().signal }, handlers,
    durable: { launch: { messageId: "msg-context", conversationId: "conv-context", agentId: "claude",
      contextRef: { ...launch, prompt: "ignored", principalId: "claimed", recoverySessionId: "claimed-session", recoveryMode: "native",
        routine: { routineId: "claimed-routine", runId: "claimed-run" } } }, bindRun: () => undefined } }, {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![0]).toBe(AG_UI_RUN_PATH);
  const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as { forwardedProps: { durableRun: unknown } };
  expect(sent.forwardedProps.durableRun).toEqual({ conversationId: "conv-context", assistantMessageId: "msg-context", launch });
});
