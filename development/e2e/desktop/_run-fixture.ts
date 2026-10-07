import { RUN_PROTOCOL_VERSION, type RunProtocolEvent } from "@jini-ai/protocol";
import type { ChatMessage } from "@jini-ai/chat/core";
import { translateRunFrame } from "../../../apps/website/src/contracts/core/assistant-run-events.ts";

/** Mirrors daemon/http/runs.ts -> http-kit/sse.ts, including the envelope on END and SSE id.
 * The admin's durable subscription also needs the saved projection: a stream is one attempt,
 * and only /recover's message can settle the logical turn for checkpoint-capable Jini hooks. */
export function successfulRunFixture(
  { runId, reply }: { runId: string; reply: string }, _optional = {},
): { stream: string; message: ChatMessage } {
  const envelope = { runId, protocolVersion: RUN_PROTOCOL_VERSION, ts: 0, durability: "durable" } as const;
  const frames: RunProtocolEvent[] = [
    { ...envelope, eventId: `${runId}:1`, opaqueCursor: "1", kind: "agent", payload: { type: "text_delta", delta: reply } },
    { ...envelope, eventId: `${runId}:2`, opaqueCursor: "2", kind: "end", payload: { status: "succeeded", code: 0 } },
  ];
  const events = frames.flatMap((frame) => translateRunFrame(frame.kind, JSON.stringify(frame)).events);
  return {
    stream: `retry: 3600000\n\n${frames.map((frame) => `id: ${frame.opaqueCursor}\nevent: ${frame.kind}\ndata: ${JSON.stringify(frame)}\n\n`).join("")}`,
    message: { id: `${runId}-answer`, role: "assistant", content: reply, events, runId, runStatus: "succeeded", startedAt: 0, endedAt: 1, lastRunEventId: "2" },
  };
}
