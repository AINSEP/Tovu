/**
 * @file In-memory {@link ToolAttemptAuditSink} — the test double for the SQLite adapter, and the
 * sink `TOVU_DB=memory` gets.
 *
 * Architectural role:
 * `features/tool-audit` adapter. Depends only on this package's own `types.ts`.
 */
import type { ToolAttemptAuditSink, ToolAttemptEvent } from "./types.js";

export interface InMemoryToolAttemptAuditSink extends ToolAttemptAuditSink {
  /** Every appended event, in append order. Test-only read surface. */
  readonly events: readonly ToolAttemptEvent[];
}

/**
 * Creates an in-memory audit sink that retains every appended event in order.
 *
 * @returns A sink plus its `events` array, which reflects appends live (it is the same array the
 * sink pushes onto, not a snapshot).
 * @complexity `append` is O(1).
 * @example
 * const sink = createInMemoryToolAttemptAuditSink();
 * await sink.append(event);
 * assert.equal(sink.events[0].phase, "requested");
 * @overallScore 100
 */
export function createInMemoryToolAttemptAuditSink(): InMemoryToolAttemptAuditSink {
  const events: ToolAttemptEvent[] = [];
  return {
    events,
    append: async (event: ToolAttemptEvent) => {
      events.push(event);
    },
  };
}
