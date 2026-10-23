import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createVisitorConfirmations, VISITOR_CONFIRMATION_WAIT_MS, type ToolConfirmationDirective } from "../visitor-confirmations.js";

/** Real Jini exchanges with only time, IDs and scheduling replaced. No sleeping or processes. */
export function confirmationFixture() {
  let now = 0, sequence = 0;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  const clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const exchanges = createSurfaceExchangeStore({ clock, idGenerator: { newId: () => String(++sequence).padStart(22, "a") },
    defaultChannel: "visitor-tool-confirmation", scheduler: { schedule: ({ delayMs, callback }) => {
      const id = ++sequence;
      jobs.set(id, { at: now + delayMs, callback });
      return () => { jobs.delete(id); };
    } } }, { idleTtlMs: VISITOR_CONFIRMATION_WAIT_MS, maxLifetimeMs: VISITOR_CONFIRMATION_WAIT_MS });
  const confirmations = createVisitorConfirmations({ exchanges, nowMs: clock.nowMs });
  const directives: ToolConfirmationDirective[] = [];
  const abort = new AbortController();
  const request = { binding: { runId: "run", executionId: "execution", ip: "ip" },
    title: "Allow search?", summary: "Search published posts.", emit: (directive: ToolConfirmationDirective) => { directives.push(directive); },
    validate: async () => true, signal: abort.signal };
  return { clock, exchanges, confirmations, directives, abort, request, jobs,
    advance(ms: number) {
      now += ms;
      for (const [id, job] of [...jobs]) if (job.at <= now && jobs.delete(id)) job.callback();
    } };
}
