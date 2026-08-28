/**
 * @file In-memory `AnalyticsSinkPort` adapter for the ingest half of the `analytics` library.
 *
 * Purpose:
 * `LocalBufferSink` is the minimal, test/dev-friendly adapter for the WRITE seam declared in
 * `ports.ts` (ADR-006 rule-of-two: this is the "built now" adapter; `ForwardingSink` is
 * named-next and out of scope for this ingest-only slice). It simply appends each normalized hit
 * to an in-memory array — no durability, no rollup wiring. A future `repo.sqlite.ts` would write
 * `analytics_events` for real; that table/DDL is a Tier-3 storage concern this slice does not own.
 *
 * How it relates to the project:
 * - Mirrors the `InMemoryPostRepo` shape/convention (`src/features/post/repo.memory.ts`).
 * - Used directly by ingest tests as the `AnalyticsSinkPort` dependency for `ingestHit`.
 */
import type { AnalyticsSinkCapabilities, AnalyticsSinkPort } from "./ports.js";
import type { NormalizedHit } from "./types.js";

/** Default number of rows `list()` returns when the caller does not request a specific count. */
const DEFAULT_LIST_LIMIT = 50;

/**
 * Hard ceiling on rows a single `list()` call can return, independent of what a caller requests.
 * The in-memory buffer itself is unbounded (no TTL/prune wired at this ingest-only stage — see
 * file header), so the read accessor is the one place that must not trust caller-supplied size
 * (resource-bounds discipline: a caller cannot force an unbounded array copy through this seam).
 */
const MAX_LIST_LIMIT = 500;

/**
 * Clamps a caller-requested `list()` size into `[1, MAX_LIST_LIMIT]`, substituting
 * {@link DEFAULT_LIST_LIMIT} for `undefined`/non-finite input (e.g. `NaN` from an unparsed query
 * string) rather than propagating it into `Array.prototype.slice`, where a `NaN` argument silently
 * degrades to unrelated (and confusing) slice behavior.
 *
 * @complexity O(1).
 * @overallScore 100/100
 */
function clampListLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_LIST_LIMIT);
}

/**
 * Minimal in-memory `AnalyticsSinkPort`. Durable within the process only (`capabilities().durable`
 * describes what the sink promises to its callers, not disk persistence — no rollup/storage table
 * backs this adapter; see file header).
 *
 * @complexity O(1) amortized per `accept`/`acceptBatch` call (array append).
 * @overallScore 100/100
 */
export class LocalBufferSink implements AnalyticsSinkPort {
  private hits: NormalizedHit[];

  constructor(initialHits: NormalizedHit[] = []) {
    this.hits = [...initialHits];
  }

  capabilities(): AnalyticsSinkCapabilities {
    // ADR-046 Phase 1: this adapter is a process-local array — it does NOT survive a restart.
    // Previously self-reported `durable: true`, which capability-inventory.ts's INV-03 check
    // flagged as an untrustworthy claim (see `SqliteBufferSink` in
    // `db/sqlite/analytics-sink.sqlite.ts` for the adapter that actually earns `durable: true`).
    return { durable: false, batch: true };
  }

  async accept(hit: NormalizedHit): Promise<void> {
    this.hits.push(hit);
  }

  async acceptBatch(hits: readonly NormalizedHit[]): Promise<void> {
    this.hits.push(...hits);
  }

  /** Test/inspection accessor. Returns a defensive copy so callers cannot mutate internal state. */
  all(): NormalizedHit[] {
    return [...this.hits];
  }

  /**
   * Returns the most recently accepted hits, newest first — the read side behind the admin
   * "recent hits" screen. This is a raw read over the in-memory buffer, NOT an aggregate/rollup
   * query (there is no rollup layer at this stage; see file header).
   *
   * @param input.limit - Desired row count; clamped via {@link clampListLimit} to
   *   `[1, MAX_LIST_LIMIT]`, defaulting to {@link DEFAULT_LIST_LIMIT}.
   * @returns A newest-first defensive-copy slice; callers cannot mutate internal state.
   * @complexity O(limit) — a bounded tail slice plus reverse, not a scan of the full buffer.
   * @overallScore 100/100
   */
  list(input: { limit?: number } = {}): NormalizedHit[] {
    const limit = clampListLimit(input.limit);
    return this.hits.slice(-limit).reverse();
  }
}
