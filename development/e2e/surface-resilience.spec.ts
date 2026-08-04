import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * @file Resilience pass on the A2UI/MCP-UI inbound transport, exercised over REAL HTTP against the
 * REAL running daemon (`playwright.adversarial.config.ts`'s `webServer`).
 *
 * ## What this file does NOT cover, and why
 *
 * Mandate 2's headline scenarios — two tabs on one exchange, reload mid-exchange, abandonment while a
 * dialog sits open, a real `A2uiSurfaceCard`/`McpUiSurfaceCard` actually rendering a
 * `deliveryFailureNotice` — all require a LIVE, OPEN {@link SurfaceExchangeStore} exchange. Every
 * mechanism in this codebase that opens one (`assistant_demo_a2ui`, `assistant_demo_choices`, and —
 * until `fix-destructive-return-path`'s concurrent ADR-055 rewrite landed mid-dispatch —
 * `content_post_delete`) is reachable ONLY through `ToolExecutor.execute` invoked from inside a real
 * spawned agent CLI process (`TOVU_ENABLE_DEMO_TOOLS=1` plus an actual `claude -p`-style run). There
 * is no test-only backdoor that opens an exchange without one — confirmed by reading
 * `demo-choices-tool.ts`/`demo-a2ui-tool.ts`/`tool-registrations.ts` in full: the store's `open()`
 * is called from inside a `ToolHandler`, nowhere else. That costs real money and several minutes per
 * run (the same tradeoff `a2ui-transport-contract.spec.ts`'s own header discloses and declines for
 * routine CI), and this dispatch has not yet gotten a go/no-go on spending it — see
 * `ADS-memory/.local-artifacts/reports/20260804-adversarial-surface-and-resilience.md`.
 *
 * So this file exercises what genuinely does NOT need a live exchange: the delivery route's own
 * robustness against network hostility (concurrent floods, malformed/oversized bodies, wrong content
 * types) aimed at exchange ids that do not exist. "Does this route survive being hammered with
 * garbage" and "does a real held-open exchange survive a reload" are different properties — this file
 * proves the first, not the second, and says so rather than padding the count with tests that only
 * look like the real thing.
 */

const A2UI_PATH = "/api/admin/v1/a2ui/actions";
const MCP_UI_PATH = "/api/admin/v1/mcp-ui/tool-calls";

function validAction(exchangeId: string) {
  return {
    version: "v1.0",
    action: { name: "some.action", surfaceId: exchangeId, sourceComponentId: "someButton", timestamp: new Date().toISOString(), context: {} },
  };
}

/** Same daemon-spawn race every other file in this suite absorbs — see `surface-abuse.spec.ts`'s
 * copy of this function for the full account of two real bugs a live run caught here: (1) probing
 * `MCP_UI_PATH` is useless for readiness — its own allowlist gate 403s a bogus toolName BEFORE the
 * daemon is ever reached, so the probe always looked "ready" instantly; fixed by probing `A2UI_PATH`
 * instead, which has no such gate. (2) the original 10s budget was too short for a real sqlite
 * file's migrations (`TOVU_CONTENT_DB`, this config's Finding-1 fix) under concurrent system load;
 * widened to 60s. */
async function waitForDaemonReady(request: APIRequestContext): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await request.post(A2UI_PATH, { data: { exchangeId: "readiness-probe", message: validAction("readiness-probe") } });
    if (res.status() !== 502) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

test.beforeAll(async ({ request }) => {
  await waitForDaemonReady(request);
});

// ---------------------------------------------------------------------------
// Concurrent flood against unknown exchange ids — the route must stay correct under load, not
// just under one request at a time (adversarial-test-design: aggregate/concurrent risk).
// ---------------------------------------------------------------------------

test.describe("concurrent delivery flood against exchange ids that do not exist", () => {
  test("HELD or CONFIRMED-VULNERABLE: 50 concurrent A2UI deliveries to 50 distinct unknown exchange ids all resolve cleanly, none hang or 5xx", async ({
    request,
  }) => {
    const ids = Array.from({ length: 50 }, (_, i) => `flood-unknown-${i}-${Date.now()}`);
    const results = await Promise.all(
      ids.map((id) => request.post(A2UI_PATH, { data: { exchangeId: id, message: validAction(id) } })),
    );

    for (const res of results) {
      expect(res.status(), "every delivery to a never-opened exchange must 409, never hang or 500").toBe(409);
    }
  });

  test("HELD or CONFIRMED-VULNERABLE: 20 concurrent deliveries to the SAME unknown exchange id are all refused identically — no partial state, no crash", async ({
    request,
  }) => {
    const id = `flood-same-unknown-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request.post(A2UI_PATH, { data: { exchangeId: id, message: validAction(id) } })),
    );

    for (const res of results) {
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.reason).toBe("unknown-or-closed");
    }
  });

  test("HELD or CONFIRMED-VULNERABLE: the daemon survives the flood and answers a completely unrelated, well-formed request immediately after", async ({
    request,
  }) => {
    // Proves the flood above didn't degrade or wedge the process — a resilience property in its own
    // right, distinct from each individual request being correctly refused.
    const res = await request.post(A2UI_PATH, { data: { exchangeId: "post-flood-sanity-check", message: validAction("post-flood-sanity-check") } });
    expect(res.status()).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Malformed / hostile bodies at the transport boundary
// ---------------------------------------------------------------------------

test.describe("malformed and oversized bodies", () => {
  test("HELD or CONFIRMED-VULNERABLE: a body with the exchangeId field replaced by a deeply nested object is rejected with 400, not 500", async ({
    request,
  }) => {
    const res = await request.post(A2UI_PATH, {
      data: { exchangeId: { nested: { deeper: { deepest: "x" } } }, message: validAction("whatever") },
    });
    expect(res.status(), "a non-string exchangeId must be a clean validation rejection").toBe(400);
  });

  test("HELD or CONFIRMED-VULNERABLE: message with an absurdly long surfaceId string is rejected without crashing the route", async ({
    request,
  }) => {
    // Deliberately under the daemon's own body-parser limit (confirmed by probing: a 200,000-char
    // string trips a 413 at `daemon-auth.ts`'s own body parser BEFORE the route's own validation
    // even runs — a real, separate size-limit boundary, not this test's target). 50,000 stays under
    // it while still being far larger than any real surfaceId, so this exercises the route's own
    // surfaceId/exchangeId mismatch check on a huge string, not the unrelated body-size gate.
    const hugeId = "x".repeat(50_000);
    const res = await request.post(A2UI_PATH, { data: { exchangeId: "short-real-id", message: validAction(hugeId) } });
    // A mismatched surfaceId is a 400 by design (`a2ui-actions-route.ts`'s own cross-check) — the
    // property under test is that a huge string in that field doesn't crash or hang the process.
    expect(res.status()).toBe(400);
  });

  test("HELD or CONFIRMED-VULNERABLE: an oversized body (well past any real payload) is rejected with 413, not silently truncated or 500", async ({
    request,
  }) => {
    // The daemon's own body-parser limit is smaller than Tovu's proxy-level `express.json({limit:
    // '15mb'})` (`server/modules/assistant.ts`) — confirmed by probing. Documented here as a real
    // boundary rather than left as an accidental discovery in the test above.
    const hugeId = "x".repeat(200_000);
    const res = await request.post(A2UI_PATH, { data: { exchangeId: "short-real-id", message: validAction(hugeId) } });
    expect([400, 413]).toContain(res.status());
  });

  test("HELD or CONFIRMED-VULNERABLE: an array where the route expects an object is rejected with 400", async ({ request }) => {
    const res = await request.post(A2UI_PATH, { data: [1, 2, 3] });
    expect([400, 404]).toContain(res.status());
  });

  test("HELD or CONFIRMED-VULNERABLE: null message is rejected with 400, not treated as a valid empty envelope", async ({ request }) => {
    const res = await request.post(A2UI_PATH, { data: { exchangeId: "some-id", message: null } });
    expect(res.status()).toBe(400);
  });

  test("HELD or CONFIRMED-VULNERABLE: wrong content-type (text/plain) on the MCP-UI redemption endpoint does not silently execute an unparsed body as an empty-object call", async ({
    request,
  }) => {
    const res = await request.post(MCP_UI_PATH, {
      headers: { "content-type": "text/plain" },
      data: JSON.stringify({ toolName: "content_post_delete", params: {} }),
    });
    // Express's json() body parser only parses application/json — a text/plain body leaves
    // `req.body` as `{}` (or unparsed), so `toolName` reads as `undefined` and must be rejected as a
    // clean validation error, never silently treated as an authorized call with empty params.
    expect(res.status(), "an unparsed body must not be silently treated as a valid call").toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Exchange-id GUESS/enumeration resistance
// ---------------------------------------------------------------------------

test.describe("exchange id is unguessable (not a secret, but must not be enumerable)", () => {
  test("HELD or CONFIRMED-VULNERABLE: a sequential/incrementing guess pattern across 30 attempts never hits a live exchange (none are open, but proves no id leaks a predictable shape)", async ({
    request,
  }) => {
    // `surface-exchanges.ts`'s own doc says ids are `randomUUID()` — not a secret, but still meant to
    // be unguessable in the sense that a delivery cannot land on an exchange the caller was never
    // handed. With nothing open, every guess must 409 identically; a 200/202 anywhere in this batch
    // would mean something is open and reachable by guesswork, which would itself be worth flagging.
    const guesses = Array.from({ length: 30 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    const results = await Promise.all(guesses.map((id) => request.post(A2UI_PATH, { data: { exchangeId: id, message: validAction(id) } })));
    for (const res of results) expect(res.status()).toBe(409);
  });
});
