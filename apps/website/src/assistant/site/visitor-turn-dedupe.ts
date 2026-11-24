/**
 * @file Visitor-chat turn dedupe (owner decision 2026-11-23: "visitor chat retry = message-ID dedupe").
 *
 * The site-chat widget retries a `POST /api/site-assistant/chat` once when it fails before any reply
 * byte arrives (a dropped connection or a 5xx). Either failure can happen AFTER the server already
 * admitted the turn and spent a provider run on it, so a blind retry would bill the site twice for
 * one question. The widget therefore sends one stable `turnId` per visitor message, identical on
 * every automatic retry, and the route consults this port BEFORE calling the provider:
 *
 * - first attempt for `(scope, turnId)` → admitted; the route calls `providerStarted()` immediately
 *   before it invokes the provider, and `finish()` when the response ends;
 * - repeat while in flight, or within the TTL after a delivered finish → refused (the route answers
 *   with a plain-words 409; replaying the finished stream is not possible because nothing about the
 *   reply is persisted server-side, see `site-assistant-transport.ts`'s header);
 * - repeat after `finish({ delivered: false })` from a failure BEFORE `providerStarted()` → admitted,
 *   so the widget's one retry still covers a server failure that spent nothing;
 * - repeat after `finish({ delivered: false })` once the provider was started (a provider error, or
 *   the visitor disconnecting before any header was written) → refused like a delivered turn: the
 *   provider run is already spent, so replaying it would bill the site twice for one question;
 * - no `turnId` at all (a cached widget bundle from before this change) → admitted, nothing stored.
 *
 * Memory bound: at most `maxEntries` keys (default {@link VISITOR_TURN_DEDUPE_MAX_ENTRIES}). Each key
 * is `scope` + a <= 64-char id, so the default cap is a few MB at worst. When the cap is reached the
 * expired entries are swept and, if still full, the oldest admitted entry is evicted — under a flood
 * that only weakens dedupe for the oldest turn, it never refuses a new visitor. The per-IP rate
 * limiter in front of this port bounds how fast any one caller can fill it.
 */

/** How long a FINISHED turn ID stays refused. Far longer than the widget's retry pause (< 1 s). */
export const VISITOR_TURN_DEDUPE_TTL_MS = 10 * 60_000;
/** Ceiling for an in-flight entry whose `finish()` never arrives (a crashed handler), so it cannot
 *  pin memory forever. Longer than any visitor turn: the widget gives up after 90 s of silence. */
export const VISITOR_TURN_IN_FLIGHT_CEILING_MS = 30 * 60_000;
/** Size cap on stored turn keys (see the file header for the memory bound). */
export const VISITOR_TURN_DEDUPE_MAX_ENTRIES = 10_000;

/** A client turn id is opaque: a UUID today; anything else is treated as "no id" (old behaviour). */
const TURN_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type VisitorTurnAdmission =
  | {
    readonly admitted: true;
    /** Call right before invoking the provider: from here on the turn is kept even if undelivered. */
    providerStarted(): void;
    finish(required: { delivered: boolean }, optional?: Record<string, never>): void;
  }
  | { readonly admitted: false; readonly state: "in-flight" | "finished" };

/** Feature-owned port the visitor chat route consults before it spends a provider run. */
export interface VisitorTurnDedupePort {
  /** `scope` names the site and caller (e.g. `workspaceId|clientIp`); `turnId` null means the client sent none. */
  admit(required: { scope: string; turnId: string | null }, optional?: Record<string, never>): VisitorTurnAdmission;
  /** Stored key count, for the memory-bound tests and diagnostics. */
  size(): number;
}

interface Entry {
  state: "in-flight" | "finished";
  expiresAtMs: number;
  /** Set by `providerStarted()`; an undelivered finish only releases the turn while this is false. */
  providerStarted: boolean;
}

/**
 * Reads the optional `turnId` from an untrusted chat request body. Anything that is not a short
 * opaque id is treated as absent, which keeps today's behaviour rather than failing the visitor.
 * @complexity O(1) — the pattern is length-bounded.
 */
export function readVisitorTurnId({ body }: { body: unknown }, _optional: Record<string, never> = {}): string | null {
  const raw = body && typeof body === "object" ? (body as { turnId?: unknown }).turnId : undefined;
  return typeof raw === "string" && TURN_ID_PATTERN.test(raw) ? raw : null;
}

/** Drops expired entries; then, if still at the cap, the oldest admitted one (Map insertion order). */
function makeRoom({ entries, nowMs, maxEntries }: { entries: Map<string, Entry>; nowMs: number; maxEntries: number }, _optional = {}): void {
  if (entries.size < maxEntries) return;
  for (const [key, entry] of entries) if (entry.expiresAtMs <= nowMs) entries.delete(key);
  while (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
}

/**
 * Creates the in-memory, process-lifetime dedupe store. One per server process: a retry lands on
 * the same process as its first attempt in the single-process deployment this route runs in.
 * @complexity `admit` is O(1) amortised; O(n) only when the cap is hit and expired entries are swept.
 */
export function createVisitorTurnDedupe(
  { clock }: { clock: { nowMs(): number } },
  { ttlMs = VISITOR_TURN_DEDUPE_TTL_MS, inFlightCeilingMs = VISITOR_TURN_IN_FLIGHT_CEILING_MS, maxEntries = VISITOR_TURN_DEDUPE_MAX_ENTRIES }:
    { ttlMs?: number; inFlightCeilingMs?: number; maxEntries?: number } = {},
): VisitorTurnDedupePort {
  const entries = new Map<string, Entry>();
  const admitted = { admitted: true as const, providerStarted: () => {}, finish: () => {} };
  return {
    admit({ scope, turnId }) {
      if (turnId === null) return admitted;
      // JSON keeps the two parts unambiguous whatever characters the scope contains.
      const key = JSON.stringify([scope, turnId]);
      const nowMs = clock.nowMs();
      const existing = entries.get(key);
      if (existing && existing.expiresAtMs > nowMs) return { admitted: false, state: existing.state };
      entries.delete(key);
      makeRoom({ entries, nowMs, maxEntries });
      const entry: Entry = { state: "in-flight", expiresAtMs: nowMs + inFlightCeilingMs, providerStarted: false };
      entries.set(key, entry);
      return {
        admitted: true,
        providerStarted() { entry.providerStarted = true; },
        finish({ delivered }) {
          // Only the first finish counts, and only for this exact entry (it may have been evicted).
          if (entry.state !== "in-flight" || entries.get(key) !== entry) return;
          // Release only when nothing was spent; once the provider ran, keep the turn even undelivered.
          if (!delivered && !entry.providerStarted) { entries.delete(key); return; }
          entry.state = "finished";
          entry.expiresAtMs = clock.nowMs() + ttlMs;
        },
      };
    },
    size: () => entries.size,
  };
}
