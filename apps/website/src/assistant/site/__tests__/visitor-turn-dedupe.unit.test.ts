import assert from "node:assert/strict";
import test from "node:test";
import {
  createVisitorTurnDedupe,
  readVisitorTurnId,
  VISITOR_TURN_DEDUPE_MAX_ENTRIES,
  VISITOR_TURN_DEDUPE_TTL_MS,
  VISITOR_TURN_IN_FLIGHT_CEILING_MS,
  type VisitorTurnDedupePort,
} from "../visitor-turn-dedupe.js";

/** Owner decision 11-23 ("visitor chat retry = message-ID dedupe"); reviewer rv1123d FIX 4. */
function fixture(options: { ttlMs?: number; maxEntries?: number } = {}) {
  let now = 1_000;
  const dedupe = createVisitorTurnDedupe({ clock: { nowMs: () => now } }, options);
  return { dedupe, advance: (ms: number) => { now += ms; } };
}

/**
 * The admission sequence `handleChat` runs per POST, with an injected fake provider standing in for
 * `runVisitorProviderTurn`: a refused attempt answers without ever calling it. `failAt` simulates a
 * server failure before the provider was invoked, or a client disconnect after the provider started
 * but before any response header was written; either way the server reports `delivered: false`.
 */
function fakeChatRoute({ dedupe }: { dedupe: VisitorTurnDedupePort }) {
  let providerRuns = 0;
  const post = ({ turnId, delivered = true, failAt }: { turnId: string | null; delivered?: boolean; failAt?: "before-provider" | "disconnect-before-headers" }) => {
    const admission = dedupe.admit({ scope: "site-1|203.0.113.7", turnId });
    if (!admission.admitted) return { status: 409, state: admission.state };
    if (failAt === "before-provider") { admission.finish({ delivered: false }); return { status: 500 }; }
    admission.providerStarted();
    providerRuns += 1;
    if (failAt === "disconnect-before-headers") { admission.finish({ delivered: false }); return { status: 0 }; }
    // `delivered: true` means the server finished the turn; the RESPONSE may still be lost in transit.
    admission.finish({ delivered });
    return { status: 200 };
  };
  return { post, providerRuns: () => providerRuns };
}

const TURN_A = "9f1c3a52-6d1e-4b7a-9a43-2f0c1d2e3f40";
const TURN_B = "0b6d5e7f-1a2b-4c3d-8e9f-a0b1c2d3e4f5";

test("a dropped response after acceptance: the retried POST with the same turn ID does not spend a second provider run", () => {
  const { dedupe } = fixture();
  const route = fakeChatRoute({ dedupe });
  assert.deepEqual(route.post({ turnId: TURN_A }), { status: 200 });
  // The visitor never saw that 200 (connection dropped), so the widget retries the same turn.
  assert.deepEqual(route.post({ turnId: TURN_A }), { status: 409, state: "finished" });
  assert.equal(route.providerRuns(), 1);
});

test("a retry while the first attempt is still running is refused as in-flight", () => {
  const { dedupe } = fixture();
  const first = dedupe.admit({ scope: "s", turnId: TURN_A });
  assert.equal(first.admitted, true);
  assert.deepEqual(dedupe.admit({ scope: "s", turnId: TURN_A }), { admitted: false, state: "in-flight" });
});

test("a different turn ID (the visitor's next message) is admitted", () => {
  const { dedupe } = fixture();
  const route = fakeChatRoute({ dedupe });
  route.post({ turnId: TURN_A });
  assert.deepEqual(route.post({ turnId: TURN_B }), { status: 200 });
  assert.equal(route.providerRuns(), 2);
});

test("the same turn ID from another site or address is a separate turn", () => {
  const { dedupe } = fixture();
  dedupe.admit({ scope: "site-1|a", turnId: TURN_A });
  assert.equal(dedupe.admit({ scope: "site-2|a", turnId: TURN_A }).admitted, true);
  assert.equal(dedupe.admit({ scope: "site-1|b", turnId: TURN_A }).admitted, true);
});

test("no turn ID keeps today's behaviour: every request is admitted and nothing is stored", () => {
  const { dedupe } = fixture();
  const route = fakeChatRoute({ dedupe });
  route.post({ turnId: null });
  route.post({ turnId: null });
  assert.equal(route.providerRuns(), 2);
  assert.equal(dedupe.size(), 0);
});

test("a server-side failure before the provider was invoked releases the turn so the one retry can run", () => {
  const { dedupe } = fixture();
  const route = fakeChatRoute({ dedupe });
  assert.deepEqual(route.post({ turnId: TURN_A, failAt: "before-provider" }), { status: 500 });
  assert.deepEqual(route.post({ turnId: TURN_A }), { status: 200 });
  assert.equal(route.providerRuns(), 1);
});

test("once provider work has begun, an undelivered finish keeps the turn: the replay is refused and the provider ran once", () => {
  const { dedupe } = fixture();
  const route = fakeChatRoute({ dedupe });
  // The visitor disconnected after the provider started but before any header went out.
  assert.deepEqual(route.post({ turnId: TURN_A, failAt: "disconnect-before-headers" }), { status: 0 });
  assert.deepEqual(route.post({ turnId: TURN_A }), { status: 409, state: "finished" });
  assert.equal(route.providerRuns(), 1);
});

test("a provider failure after invocation also keeps the turn (the run was already spent)", () => {
  const { dedupe } = fixture();
  const route = fakeChatRoute({ dedupe });
  route.post({ turnId: TURN_A, delivered: false });
  assert.deepEqual(route.post({ turnId: TURN_A }), { status: 409, state: "finished" });
  assert.equal(route.providerRuns(), 1);
});

test("finish is idempotent: a late second finish cannot release a finished turn", () => {
  const { dedupe } = fixture();
  const first = dedupe.admit({ scope: "s", turnId: TURN_A });
  assert.ok(first.admitted);
  first.finish({ delivered: true });
  first.finish({ delivered: false });
  assert.equal(dedupe.admit({ scope: "s", turnId: TURN_A }).admitted, false);
});

test("entry expires after the TTL (measured from when the turn finished)", () => {
  const { dedupe, advance } = fixture({ ttlMs: 1_000 });
  const first = dedupe.admit({ scope: "s", turnId: TURN_A });
  assert.ok(first.admitted);
  advance(5_000); // a long run: still held while in flight
  assert.equal(dedupe.admit({ scope: "s", turnId: TURN_A }).admitted, false);
  first.finish({ delivered: true });
  advance(999);
  assert.equal(dedupe.admit({ scope: "s", turnId: TURN_A }).admitted, false);
  advance(1);
  assert.equal(dedupe.admit({ scope: "s", turnId: TURN_A }).admitted, true);
});

test("an in-flight turn whose finish never arrives is dropped after the in-flight ceiling", () => {
  const { dedupe, advance } = fixture({ ttlMs: 1_000 });
  dedupe.admit({ scope: "s", turnId: TURN_A });
  advance(VISITOR_TURN_IN_FLIGHT_CEILING_MS - 1);
  assert.equal(dedupe.admit({ scope: "s", turnId: TURN_A }).admitted, false);
  advance(1);
  assert.equal(dedupe.admit({ scope: "s", turnId: TURN_A }).admitted, true);
});

test("store stays bounded: the oldest entry is evicted once the cap is reached", () => {
  const { dedupe } = fixture({ maxEntries: 3 });
  for (let i = 0; i < 10; i += 1) dedupe.admit({ scope: "s", turnId: `turn-${String(i).padStart(12, "0")}` });
  assert.equal(dedupe.size(), 3);
  // The newest three are still held; the oldest was evicted and is admitted again.
  assert.equal(dedupe.admit({ scope: "s", turnId: "turn-000000000009" }).admitted, false);
  assert.equal(dedupe.admit({ scope: "s", turnId: "turn-000000000000" }).admitted, true);
});

test("default bounds are documented constants", () => {
  assert.equal(VISITOR_TURN_DEDUPE_TTL_MS, 10 * 60_000);
  assert.equal(VISITOR_TURN_DEDUPE_MAX_ENTRIES, 10_000);
  assert.equal(VISITOR_TURN_IN_FLIGHT_CEILING_MS, 30 * 60_000);
});

test("readVisitorTurnId accepts an opaque client id and treats anything else as absent", () => {
  assert.equal(readVisitorTurnId({ body: { turnId: TURN_A } }), TURN_A);
  assert.equal(readVisitorTurnId({ body: {} }), null);
  assert.equal(readVisitorTurnId({ body: null }), null);
  assert.equal(readVisitorTurnId({ body: { turnId: 42 } }), null);
  assert.equal(readVisitorTurnId({ body: { turnId: "short" } }), null);
  assert.equal(readVisitorTurnId({ body: { turnId: "x".repeat(65) } }), null);
  assert.equal(readVisitorTurnId({ body: { turnId: "has space in it!!" } }), null);
});

test("an expired later entry is swept at capacity without evicting an older live turn", () => {
  let now = 0;
  const dedupe = createVisitorTurnDedupe({ clock: { nowMs: () => now } }, { ttlMs: 5, inFlightCeilingMs: 100, maxEntries: 2 });
  assert.equal(dedupe.admit({ scope: "site", turnId: "older-live" }).admitted, true);
  const later = dedupe.admit({ scope: "site", turnId: "later-expired" });
  assert.equal(later.admitted, true);
  later.finish({ delivered: true });
  now = 5;
  assert.equal(dedupe.admit({ scope: "site", turnId: "new-turn" }).admitted, true);
  assert.equal(dedupe.size(), 2);
  assert.deepEqual(dedupe.admit({ scope: "site", turnId: "older-live" }), { admitted: false, state: "in-flight" });
});
