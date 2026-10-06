import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import { followDurableRun, type DurableSubscriptionPorts } from "../durable-run-subscription";

export function durableSubscriptionFixture(
  { checkpoint = true }: { checkpoint?: boolean } = {}, _optional = {},
) {
  let saved: ChatMessage | null | "gone" = null;
  const timers = new Set<() => void>();
  const opened: Parameters<DurableSubscriptionPorts["stream"]>[0][] = [];
  const closed: number[] = [];
  const events: AgentEvent[] = [];
  const done: AgentEvent[][] = [];
  const errors: string[] = [];
  const checkpoints: ChatMessage[] = [];
  const reads: unknown[] = [];
  const ports: DurableSubscriptionPorts = {
    read: async (required) => { reads.push(required); return saved; },
    stream: (required) => { const index = opened.length; opened.push(required); return () => { closed.push(index); }; },
    schedule: ({ work }) => { timers.add(work); return () => { timers.delete(work); }; },
  };
  const abort = new AbortController();
  followDurableRun({ runId: "old", binding: { messageId: "answer", conversationId: "chat" }, signal: abort.signal, ports,
    handlers: { onEvent: (event) => events.push(event), onDone: (value) => done.push(value), onError: (error) => errors.push(error.message),
      ...(checkpoint ? { onCheckpoint: (message: ChatMessage) => checkpoints.push(message) } : {}),
    },
  }, {});
  return { opened, closed, events, done, errors, checkpoints, reads, timers, abort,
    save: (message: typeof saved) => { saved = message; },
    async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); },
    async tick() { for (const work of [...timers]) { timers.delete(work); work(); } for (let i = 0; i < 12; i++) await Promise.resolve(); },
  };
}
