import { normalizeAiUsage } from "@jini-ai/core/contracts/ai-trace";
import type { AgentRunTrackingOutcome } from "@jini-ai/core/contracts/observability";
import type { ProviderTurnEvent } from "@jini-ai/agent-runtime/providers/tool-turn";

type RunUsage = NonNullable<AgentRunTrackingOutcome["usage"]>;
type Counters = { readonly inputTokens: number | null; readonly outputTokens: number | null; readonly costUsd: number | null };

const NOTHING: Counters = { inputTokens: null, outputTokens: null, costUsd: null };
const KEYS = ["inputTokens", "outputTokens", "costUsd"] as const;

/** Adds two nullable counter sets; `null + null` stays `null`, so "never reported" survives the sum. */
function addCounters(a: Counters, b: Counters): Counters {
  const sum = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return { inputTokens: sum(a.inputTokens, b.inputTokens), outputTokens: sum(a.outputTokens, b.outputTokens), costUsd: sum(a.costUsd, b.costUsd) };
}

/** A cost the event reports in USD under its own `costUsd` key; anything else (a bare `cost`, a token count) is not money. */
function reportedUsd(event: ProviderTurnEvent): number | null {
  const value = (event as { readonly costUsd?: unknown }).costUsd;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * One BYOK turn's run-span usage accumulator (one per span). Telemetry observes reported use, not
 * guesses: counters come only from what the provider reported, recognized by `normalizeAiUsage`; a
 * reported zero stays a known zero, an unreported counter stays absent, and cost appears only when
 * an event explicitly reports USD — there is no pricing table, so tokens are never turned into money.
 *
 * Source semantics (the provider adapters in `@jini-ai/agent-runtime/providers`): each request opens
 * with `status: requesting`, and a request's `usage` events are cumulative snapshots of THAT request
 * (Anthropic re-emits its merged usage on every `message_delta`, Gemini re-sends `usageMetadata`). So
 * a request's delta is its latest snapshot per counter, and the run total sums those deltas across
 * the tool loop's requests — summing every event would double-count, keeping only the last would drop
 * the earlier requests.
 * @complexity O(1) per event; holds two counter sets.
 */
export function createByokRunUsage(_optional = {}) {
  let settled = NOTHING;
  let request = NOTHING;
  const total = (): RunUsage | undefined => {
    const sum = addCounters(settled, request);
    const usage: RunUsage = {};
    for (const key of KEYS) if (sum[key] !== null) usage[key] = sum[key];
    return Object.keys(usage).length > 0 ? usage : undefined;
  };
  return {
    observe(event: ProviderTurnEvent): void {
      if (event.type === "status" && event.label === "requesting") { settled = addCounters(settled, request); request = NOTHING; return; }
      if (event.type !== "usage") return;
      const usage = normalizeAiUsage({ usage: event.usage });
      request = { inputTokens: usage?.inputTokens ?? request.inputTokens, outputTokens: usage?.outputTokens ?? request.outputTokens, costUsd: reportedUsd(event) ?? request.costUsd };
    },
    total,
    /** The outcome with this run's reported usage attached, or unchanged when nothing was reported. */
    withUsage<T extends AgentRunTrackingOutcome>(outcome: T): T {
      const usage = total();
      return usage ? { ...outcome, usage } : outcome;
    },
  };
}
