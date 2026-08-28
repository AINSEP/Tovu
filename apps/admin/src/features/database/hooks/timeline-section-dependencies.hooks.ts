import { api, type AdminLedgerRow } from "@/lib/api";
import type { TimelineSectionPort } from "./timeline-section-port.hooks";

/**
 * @file The only place `use-timeline-section.hooks.ts` reaches `lib/api` — see `timeline-section-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultTimelineSectionPort: TimelineSectionPort = {
  getDatabaseTimeline: (options) => api.getDatabaseTimeline(options),
};

/** Seed state for {@link createFakeTimelineSectionPort}. */
export interface FakeTimelineSectionPortOptions {
  items?: AdminLedgerRow[];
  nextCursor?: string | null;
  /** When set, `getDatabaseTimeline()` rejects with this instead of resolving — for load-failure
   *  tests. */
  getDatabaseTimelineError?: Error;
}

/**
 * An in-memory {@link TimelineSectionPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). Always returns the same seeded page regardless of the
 * requested filters/cursor — this hook's own filter/cursor bookkeeping lives in the CALLER, not the
 * port (same precedent `comment-queue-dependencies.hooks.ts`'s own doc comment states for its
 * `listCommentsQueue`), so a test asserts the hook passed through the right options via the fake's
 * own call log instead of simulating server-side filtering.
 */
export function createFakeTimelineSectionPort(options: FakeTimelineSectionPortOptions = {}): TimelineSectionPort & {
  /** Every `getDatabaseTimeline` call's options, in call order. */
  readonly calls: Array<{ kind?: string; outcome?: string; fromDate?: string; toDate?: string; cursor?: string; limit?: number }>;
} {
  const calls: Array<{ kind?: string; outcome?: string; fromDate?: string; toDate?: string; cursor?: string; limit?: number }> = [];

  return {
    calls,
    async getDatabaseTimeline(reqOptions = {}) {
      calls.push(reqOptions);
      if (options.getDatabaseTimelineError) throw options.getDatabaseTimelineError;
      return { items: options.items ?? [], nextCursor: options.nextCursor ?? null };
    },
  };
}
