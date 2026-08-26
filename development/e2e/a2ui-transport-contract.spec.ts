import { test, expect } from "@playwright/test";

/**
 * @file Real-HTTP contract tests for the A2UI/MCP-UI inbound transport (ADR-055 Decision 1),
 * exercised against the REAL running Tovu proxy (`src/server/modules/assistant.ts`) fronting the
 * REAL daemon process this suite's `webServer` block spawns — not a hand-built express app, and not
 * a mocked `ToolExecutor`/`SurfaceExchangeStore`. This is deliberately the negative-path subset of
 * the transport's contract: every case here is reachable with NO open exchange and no agent run at
 * all, so it stays fast and deterministic enough to run on every CI build.
 *
 * The positive-path properties — a live exchange actually receiving a human's click, the buffered
 * inbox not dropping a raced delivery, cross-principal isolation against a REAL open exchange, and
 * an actual `A2uiSurfaceCard`/`McpUiSurfaceCard` mounting in the browser — were verified by hand in
 * this same dispatch (`ADS-memory/.local-artifacts/reports/20260804-a2ui-e2e-verification.md`)
 * against a real `claude -p` agent run, but are NOT re-created here: they need a real spawned agent
 * CLI (they also used to need `TOVU_ENABLE_DEMO_TOOLS=1`, removed 2026-08-26), which is too
 * slow/costly (~$0.20,
 * ~3 minutes, an external model call) to hang a routine CI run on. That gap is a known, disclosed
 * limitation of this file, not an oversight — see the report above for why.
 */

const A2UI_PATH = "/api/admin/v1/a2ui/actions";
const MCP_UI_PATH = "/api/admin/v1/mcp-ui/tool-calls";

function validAction(exchangeId: string) {
  return {
    version: "v1.0",
    action: {
      name: "some.action",
      surfaceId: exchangeId,
      sourceComponentId: "someButton",
      timestamp: new Date().toISOString(),
      context: {},
    },
  };
}

async function login(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/admin/v1/auth/login", {
    data: { username: "admin", password: "tovu-dev" },
  });
  expect(res.status()).toBe(200);
}

/**
 * Tovu's own HTTP server answers `webServer.url` (and therefore lets Playwright's readiness probe
 * pass) BEFORE its agent daemon child process has finished spawning (`src/index.ts`'s
 * `spawnAgentDaemon` runs from inside `app.listen()`'s own callback, asynchronously, after
 * migrations settle). A test that posts to a proxied route immediately after the suite starts can
 * race that gap and see a spurious `502 {"code":"BAD_GATEWAY"}` from `forwardToAgentDaemon`'s own
 * `ECONNREFUSED` catch — confirmed live, 2026-08-04 (see this dispatch's verification report).
 * Not a product bug: a human clicking through the UI is never that fast. Absorbed here with a short
 * poll rather than a bare `waitForTimeout`, so the suite is not flaky under CI load.
 */
async function waitForDaemonReady(request: import("@playwright/test").APIRequestContext): Promise<void> {
  await login(request);
  for (let attempt = 0; attempt < 40; attempt++) {
    // Any authenticated request that reaches the daemon at all (even one that 409s) proves it is
    // up. Only a `502 BAD_GATEWAY` from the proxy's own `ECONNREFUSED` catch means "keep waiting".
    const res = await request.post(A2UI_PATH, {
      data: { exchangeId: "readiness-probe", message: validAction("readiness-probe") },
    });
    if (res.status() !== 502) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

test.beforeAll(async ({ request }) => {
  await waitForDaemonReady(request);
});

test.describe("A2UI actions route — proxy + daemon contract (REQ: proxy hop, route contract)", () => {
  test("an unauthenticated browser-origin request is rejected before it can reach the daemon", async ({ request }) => {
    const res = await request.post(A2UI_PATH, {
      data: { exchangeId: "whatever", message: validAction("whatever") },
    });
    expect(res.status()).toBe(401);
  });

  test("an authenticated request with a malformed envelope is refused with 400, never reaches deliver()", async ({
    request,
  }) => {
    await login(request);
    const res = await request.post(A2UI_PATH, {
      data: { exchangeId: "some-id", message: { version: "v1.0", notARealField: true } },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("a surfaceId that disagrees with the route's exchangeId is refused with 400", async ({ request }) => {
    await login(request);
    const res = await request.post(A2UI_PATH, {
      data: { exchangeId: "exchange-a", message: validAction("exchange-b") },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("does not match exchangeId");
  });

  test("an authenticated request against an exchange that does not exist gets 409 unknown-or-closed", async ({
    request,
  }) => {
    await login(request);
    const res = await request.post(A2UI_PATH, {
      data: { exchangeId: "not-a-real-exchange", message: validAction("not-a-real-exchange") },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("unknown-or-closed");
  });
});

test.describe("MCP-UI tool-calls route — proxy contract (REQ: allowlist gate before the daemon)", () => {
  test("a non-allowlisted toolName is rejected by the PROXY itself, before the daemon is ever called", async ({
    request,
  }) => {
    await login(request);
    const res = await request.post(MCP_UI_PATH, {
      data: { toolName: "database_execute_migrate_forward", params: {} },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("TOOL_NOT_ALLOWLISTED");
  });

  test("a missing toolName is rejected with 400 by the proxy", async ({ request }) => {
    await login(request);
    const res = await request.post(MCP_UI_PATH, { data: { params: {} } });
    expect(res.status()).toBe(400);
  });

  test("unauthenticated requests never reach the daemon", async ({ request }) => {
    const res = await request.post(MCP_UI_PATH, {
      data: { toolName: "content_post_delete", params: {} },
    });
    expect(res.status()).toBe(401);
  });
});
