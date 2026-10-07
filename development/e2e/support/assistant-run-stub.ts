import type { Page, Request, Route } from "@playwright/test";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import { assistantContentFromEvents } from "@jini-ai/chat/core";
import { translateRunAgentPayload, type RunAgentPayload } from "../../../apps/website/src/contracts/core/assistant-run-events.js";

const RUN_ID = "journey-run-1";

export type Payload = RunAgentPayload;

function frame(event: "agent" | "end", payload: Payload, eventId: number): string {
  const data = {
    runId: RUN_ID,
    eventId: String(eventId),
    opaqueCursor: String(eventId),
    protocolVersion: 1,
    ts: new Date(0).toISOString(),
    kind: event,
    payload,
    durability: "durable",
  };
  return `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface RunStub {
  runStarts: Request[];
  toolCalls: Array<{ toolName: string; params: Record<string, unknown> }>;
}

/**
 * Stubs one pending durable answer, its attempt stream, and the mcp-ui decision endpoint.
 * The client with onCheckpoint renders the saved message, not the SSE payloads. Recovery must
 * return the same message identity and chat-core events on every poll, including after a finite
 * SSE response drops. An unbound recover request would otherwise hit the real server's 404 and
 * stop followDurableRun before a card appears.
 */
export async function stubPendingRun(
  { page, payloads, toolCallStatus }: { page: Page; payloads: Payload[]; toolCallStatus: 202 | 409 | 500 }, _optional = {},
): Promise<RunStub> {
  const stub: RunStub = { runStarts: [], toolCalls: [] };
  let message: ChatMessage | undefined;
  let conversationId: string | undefined;
  const events = payloads.map(translateRunAgentPayload).filter((event): event is AgentEvent => event !== null);
  await page.route(
    (url) => url.pathname.endsWith("/api/runs"),
    async (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      stub.runStarts.push(route.request());
      const context = JSON.parse(route.request().postDataJSON().contextRef) as { assistantMessageId: string; conversationId: string };
      conversationId = context.conversationId;
      message = { id: context.assistantMessageId, role: "assistant", runId: RUN_ID,
        runStatus: "running", content: assistantContentFromEvents({ events }), events };
      await route.fulfill({ status: 201, json: { run: { id: RUN_ID }, messageId: message.id, conversationId } });
    },
  );
  await page.route((url) => url.pathname === `/api/runs/${RUN_ID}/events`, (route) => {
    const cursor = Number(new URL(route.request().url()).searchParams.get("afterCursor") ?? 0);
    // fulfill cannot keep an SSE body open. Once the prefix is consumed, leave the resumed
    // request pending until the test page closes, like a real stream waiting for new events.
    // Retrying finite empty bodies would otherwise cause a dropped -> recover -> reopen loop.
    if (cursor >= payloads.length) return;
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "retry: 3600000\n\n" + payloads.map((p, i) => i + 1 > cursor ? frame("agent", p, i + 1) : "").join(""),
    });
  });
  await page.route((url) => url.pathname === `/api/runs/${RUN_ID}/recover`, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (!message || route.request().postDataJSON().messageId !== message.id) {
      return route.fulfill({ status: 404, json: { error: "not found" } });
    }
    return route.fulfill({ json: { message, conversationId } });
  });
  await page.route(`**/api/runs/${RUN_ID}`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { id: RUN_ID, state: "running" } }) })
      : route.continue(),
  );
  await page.route("**/api/admin/v1/mcp-ui/tool-calls", async (route) => {
    stub.toolCalls.push(route.request().postDataJSON());
    const body =
      toolCallStatus === 202
        ? { delivered: true }
        : toolCallStatus === 409
          ? { error: "that dialog is no longer waiting for an answer", code: "SURFACE_NOT_PENDING", reason: "unknown-or-closed" }
          : { error: "internal error", code: "INTERNAL_ERROR" };
    await route.fulfill({ status: toolCallStatus, contentType: "application/json", body: JSON.stringify(body) });
  });
  return stub;
}
