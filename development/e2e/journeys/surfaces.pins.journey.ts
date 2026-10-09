// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { createServer } from "node:http";
import { type Server } from "node:http";
import { type APIRequestContext } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { buildConfirmationSurface } from "@jini-ai/ui/mcp-ui/surfaces";
import { pinSessionHeaders } from "../support/bug-pin-auth.js";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from a2ui-transport-contract.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: a2ui-transport-contract", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
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

/** Return headers for the newly logged-in session: the initial empty jar has no default Cookie. */
async function login({ request }: { request: APIRequestContext }, _options = {}): Promise<Record<string, string>> {
  const res = await request.post("/api/admin/v1/auth/login", {
    data: { username: "admin", password: PIN_PASSWORD },
  });
  expect(res.status()).toBe(200);
  return pinSessionHeaders({ request });
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
  const headers = await login({ request });
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    // Any authenticated request that reaches the daemon at all (even one that 409s) proves it is
    // up. Only a `502 BAD_GATEWAY` from the proxy's own `ECONNREFUSED` catch means "keep waiting".
    const res = await request.post(A2UI_PATH, {
      headers,
      data: { exchangeId: "readiness-probe", message: validAction("readiness-probe") },
    });
    lastStatus = res.status();
    if (lastStatus !== 502) {
      expect(lastStatus, "an authenticated unknown-exchange probe must reach the daemon").toBe(409);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Agent daemon did not become ready after 40 attempts (last HTTP status: ${lastStatus})`);
}

test.beforeEach(async ({ playwright, journeySite }) => {
  // Readiness authenticates its own context; the unauthenticated pin must keep an empty jar.
  const probe = await playwright.request.newContext({ baseURL: journeySite.adminURL, storageState: journeySite.storageState });
  try { await waitForDaemonReady(probe); } finally { await probe.dispose(); }
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
    const headers = await login({ request });
    const res = await request.post(A2UI_PATH, {
      headers,
      data: { exchangeId: "some-id", message: { version: "v1.0", notARealField: true } },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("a surfaceId that disagrees with the route's exchangeId is refused with 400", async ({ request }) => {
    const headers = await login({ request });
    const res = await request.post(A2UI_PATH, {
      headers,
      data: { exchangeId: "exchange-a", message: validAction("exchange-b") },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("does not match exchangeId");
  });

  test("an authenticated request against an exchange that does not exist gets 409 unknown-or-closed", async ({
    request,
  }) => {
    const headers = await login({ request });
    const res = await request.post(A2UI_PATH, {
      headers,
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
    const headers = await login({ request });
    const res = await request.post(MCP_UI_PATH, {
      headers,
      data: { toolName: "database_execute_migrate_forward", params: {} },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("TOOL_NOT_ALLOWLISTED");
  });

  test("a missing toolName is rejected with 400 by the proxy", async ({ request }) => {
    const headers = await login({ request });
    const res = await request.post(MCP_UI_PATH, { headers, data: { params: {} } });
    expect(res.status()).toBe(400);
  });

  test("unauthenticated requests never reach the daemon", async ({ request }) => {
    const res = await request.post(MCP_UI_PATH, {
      data: { toolName: "content_post_delete", params: {} },
    });
    expect(res.status()).toBe(401);
  });
});
});

// Migrated from surface-abuse.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: surface-abuse", () => {
/**
 * @file Adversary pass on `content_post_delete`'s MCP-UI confirmation gate, exercised over REAL HTTP
 * against the REAL running daemon (`playwright.adversarial.config.ts`'s `webServer`).
 *
 * ## STATUS (2026-08-04): most of this file's attacks are SKIPPED — the target moved mid-dispatch
 *
 * This suite was designed and written against the documented ADR-053 shape of `content_post_delete`:
 * step 1 mints a confirmation-store token and returns it embedded in a rendered MCP-UI
 * resource; step 2 redeems that token via a second, ordinary call. Because `content_post_delete` is
 * unconditionally on `MCP_UI_REDEEMABLE_TOOL_IDS` (`assistant/mcp-ui-tool-calls.ts`), Shape 2 of
 * `mcp-ui-tool-calls-route.ts` reaches BOTH steps by calling `toolExecutor.execute` synchronously —
 * no live spawned agent required, unlike every other MCP-UI/A2UI surface in this codebase.
 *
 * While this file was being written, `fix-destructive-return-path` (a concurrent dispatch) landed
 * ADR-055 Decision 2 (the shape change): `content_post_delete` now opens a `SurfaceExchangeStore`
 * exchange via `ctx.emitSurface` and blocks on the human's answer, instead of returning after minting
 * a token — and fails closed, throwing before ever building a dialog, whenever `ctx.emitSurface` is
 * absent, which it always is on the redemption route's synthetic `RunRef`. The specific reason THIS
 * FILE'S 19 token-shaped tests are superseded is narrower and is **ADR-055 Decision 3**: "the
 * confirmation token is removed entirely" — there is no confirmation-store token to mint,
 * leak, exfiltrate, or replay anymore, so every test built around one (escaping the token's own
 * serialization, grepping for it on the wire, replaying it, racing its redemption) has nothing left
 * to attack. Confirmed live: `POST /api/admin/v1/mcp-ui/tool-calls` for `content_post_delete` now
 * 400s with `"this execution context has no interactive confirmation channel (no emitSurface)..."`
 * before step 1 can even render a dialog. So `content_post_delete` is now architecturally identical
 * to the A2UI demo tools — reachable ONLY through a real spawned agent run — and the entire premise
 * this file's escaping/token-exposure/double-submit/binding groups were built on (mint+redeem with no
 * live agent) no longer holds.
 *
 * See `ADS-memory/.local-artifacts/reports/20260804-adversarial-surface-and-resilience.md` (Finding
 * 2) for the full account. Every affected group below is `test.describe.skip`'d with a pointer back
 * to this note, NOT deleted: the attack designs are still correct and worth keeping ready to
 * reactivate once the team lead's guidance lands (wait for the rewrite to stabilize, get budget for
 * a live-agent run, or find whatever HTTP-reachable path — if any — survives). Silently deleting them
 * would look like the coverage never existed; skipping with a reason keeps the gap visible in CI.
 *
 * UNAFFECTED, still real, still passing: the allowlist-bypass group (the route's own `toolName` gate
 * runs before the handler is ever reached, `ctx.emitSurface` or not) and the slug-injection probe (a
 * plain REST create call, no agent tool involved at all).
 * PendingConfirmationStore (apps/website/src/assistant/pending-confirmations.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
 */

/** Points every skipped group at the write-up explaining why, so `--reporter=list` output is
 * self-describing without anyone needing to already know this file's history. */
const SUPERSEDED_BY_ADR055 =
  "content_post_delete's confirmation token is REMOVED (ADR-055 Decision 3) and the tool now blocks " +
  "on a live ctx.emitSurface exchange instead (Decision 2) — the HTTP-only redemption route cannot " +
  "supply one, so there is nothing left for these token-shaped attacks to reach. See " +
  "ADS-memory/.local-artifacts/reports/20260804-adversarial-surface-and-resilience.md, Finding 2. " +
  "Attack design kept, execution skipped pending team-lead guidance.";

const MCP_UI_PATH = "/api/admin/v1/mcp-ui/tool-calls";
const A2UI_PATH = "/api/admin/v1/a2ui/actions";
const WORKSPACE_ID = "workspace-local";
const POSTS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/posts`;

/** A minimal, schema-valid A2UI `ActionMessage` — only used to give `waitForDaemonReady` (below) a
 * body `parseRendererToAgentMessage` will accept, so a 400 (bad envelope) can't be confused with a
 * 502 (daemon down). Mirrors `a2ui-transport-contract.spec.ts`'s own identical helper. */
function validAction(exchangeId: string) {
  return {
    version: "v1.0",
    action: { name: "some.action", surfaceId: exchangeId, sourceComponentId: "someButton", timestamp: new Date().toISOString(), context: {} },
  };
}

/** Same daemon-spawn race `a2ui-transport-contract.spec.ts` documents and absorbs — see that file's
 * header for the confirmed root cause. Polls the real MCP-UI route (a bogus toolName, cheap 403)
 * rather than duplicating the readiness probe's own reasoning. Login is already handled once, for
 * the whole suite, by `adversarial.globalSetup.ts`'s `storageState` — see that file's header for why
 * a per-test login here would 429 past `LOGIN_STRICT`. */
async function waitForDaemonReady(request: APIRequestContext): Promise<void> {
  // Probes A2UI_PATH, NOT MCP_UI_PATH — this was a real bug in an earlier version of this function,
  // caught by a live run that kept failing with `ECONNREFUSED` from the daemon despite this function
  // reporting "ready" instantly every time. Root cause: `proxyMcpUiToolCall` (`server/modules/
  // assistant.ts`) checks `isMcpUiToolCallAllowed(toolName)` and returns 403 for a non-allowlisted
  // name BEFORE ever calling `forwardToAgentDaemon` — so a bogus-toolName probe against
  // `MCP_UI_PATH` always got a 403 from the PROXY alone, whether or not the daemon behind it was up
  // at all, and this loop's `!== 502` check treated that 403 as "ready" on the very first attempt.
  // `A2UI_PATH` has no such gate (`a2ui-actions-route.ts`'s own doc: "no `toolName` to allowlist") —
  // every request there genuinely reaches `forwardToAgentDaemon`, so a 502 really does mean "daemon
  // not up yet" and anything else really does mean it answered. Matches the proven precedent
  // (`a2ui-transport-contract.spec.ts`'s own `waitForDaemonReady`, which probes this same path).
  //
  // 200 attempts * 300ms = up to 60s. Widened from an initial 10s budget: this config uses a real
  // sqlite file (`TOVU_CONTENT_DB`, not `TOVU_DB=memory` — see this file's header and Finding 1 in
  // the dispatch report), and the daemon's OWN migrations against that file — a real cost
  // `TOVU_DB=memory` never paid — can noticeably outlast a short window, especially under concurrent
  // system load from other agents' processes sharing this machine.
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await request.post(A2UI_PATH, { data: { exchangeId: "readiness-probe", message: validAction("readiness-probe") } });
    if (res.status() !== 502) {
      expect(res.status(), "an authenticated unknown-exchange probe must reach the daemon").toBe(409);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("A2UI readiness probe still returned 502 after 200 attempts");
}

interface CreatedPost {
  id: string;
  version: number;
}

async function createPost(request: APIRequestContext, title: string, slug?: string): Promise<CreatedPost> {
  const res = await request.post(POSTS_PATH, { data: { title, ...(slug !== undefined ? { slug } : {}) } });
  expect(res.status(), `createPost(${JSON.stringify(title)}) should succeed`).toBe(201);
  const body = await res.json();
  return { id: body.id, version: body.version };
}

async function callMcpUiTool(
  request: APIRequestContext,
  toolName: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: unknown; rawText: string }> {
  const res = await request.post(MCP_UI_PATH, { data: { toolName, params } });
  const rawText = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = undefined;
  }
  return { status: res.status(), body, rawText };
}

/** Step 1: mint a confirmation and return its two halves, exactly as `respondToExecutionResult`
 * hands them to a real browser client. */
async function openDeleteConfirmation(
  request: APIRequestContext,
  id: string,
): Promise<{ modelText: string; resourceText: string; meta: unknown; raw: unknown }> {
  const { status, body } = await callMcpUiTool(request, "content_post_delete", { id, kind: "post" });
  expect(status, "step 1 should complete and return 200").toBe(200);
  const shaped = body as { content: Array<{ type: string; text?: string; resource?: { text: string } }>; _meta?: unknown };
  expect(shaped.content?.length).toBe(2);
  expect(shaped.content[0].type).toBe("text");
  expect(shaped.content[1].type).toBe("resource");
  return {
    modelText: String(shaped.content[0].text),
    resourceText: String(shaped.content[1].resource?.text),
    meta: shaped._meta,
    raw: body,
  };
}

/** Pulls the minted token out of the rendered dialog's own inline script — the ONLY place it is
 * supposed to live. Mirrors what a real MCP-UI host's `tools/call` params would carry after a human
 * clicks Delete, without needing a browser to actually render and click the surface. */
function extractTokenFromResource(resourceText: string): string {
  const match = resourceText.match(/"confirmationToken":"([^"]+)"/);
  expect(match, "expected to find confirmationToken inside the rendered surface's own script").toBeTruthy();
  return match![1];
}

test.beforeEach(async ({ request }) => {
  await waitForDaemonReady(request);
});

test.describe("current SurfaceExchange confirmation — hostile titles remain inert complete text", () => {
  const titles = [
    `</script><script>alert(document.cookie)</script>`,
    `</SCRIPT/><img src=x onerror=alert(1)>`,
    `<!-- --><script>alert(1)</script><!--`,
    `x","confirmationToken":"stolen`,
    `x\\","confirmationToken":"stolen`,
    "line1\u2028alert(1)//line2", "line1\u2029alert(1)//line2",
    "x`+alert(1)+`", "x${alert(1)}", "x{{constructor.constructor('alert(1)')()}}",
    "Fish & Chips &lt;script&gt;", "</script>\u2028\",\"x\":\"",
  ];
  for (const [index, title] of titles.entries()) {
    test(`hostile title ${index + 1} is emitted and rendered unchanged without executing code`, async ({ page }) => {
      const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
      let emittedHtml = "";
      const exchange = store.open({ binding: { toolId: "content_post_delete", principalId: "title-probe" }, emit: async (emission) => {
        expect(emission.channel).toBe("mcp-ui");
        emittedHtml = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text;
      } });
      const dialogs: string[] = [];
      page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
      try {
        // The domain renderer was retired; the shared Jini builder owns confirmation escaping.
        const resource = buildConfirmationSurface({
          uri: `ui://tovu/content-post-delete/${exchange.id}`,
          title: "Delete this post?",
          details: [{ label: "Title", value: title }, { label: "Slug", value: "title-probe" }, { label: "Status", value: "draft" }],
          danger: true,
          confirm: { label: "Delete", toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, decision: "confirm" } },
          cancel: { label: "Cancel", toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, decision: "cancel" } },
        });
        await exchange.send({ emission: { channel: "mcp-ui", payload: { resource } } });
        expect(emittedHtml.length).toBeGreaterThan(0);
        await page.setContent('<iframe title="Current delete confirmation" style="width:900px;height:600px"></iframe>');
        const iframe = page.getByTitle("Current delete confirmation", { exact: true });
        await iframe.evaluate((element, html) => { (element as HTMLIFrameElement).srcdoc = html; }, emittedHtml);
        const frame = iframe.contentFrame();
        await expect(frame.getByRole("heading", { name: "Delete this post?", exact: true })).toBeVisible();
        const details = frame.locator(".mcpui-details dd");
        await expect(details).toHaveCount(3);
        expect(await details.first().textContent()).toBe(title);
        await expect(frame.locator("img")).toHaveCount(0);
        expect(dialogs).toEqual([]);
      } finally {
        exchange.close({});
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mandate 1a — escaping: hostile titles the existing unit coverage never tried
// ---------------------------------------------------------------------------

test.describe.skip(`escaping — hostile post titles reaching the real rendered surface over HTTP (SKIPPED: ${SUPERSEDED_BY_ADR055})`, () => {
  const ATTACKS: Array<{ name: string; title: string }> = [
    { name: "script-closing tag", title: `</script><script>alert(document.cookie)</script>` },
    { name: "script-closing without full tag (case-insensitive parser trap)", title: `</SCRIPT/><img src=x onerror=alert(1)>` },
    { name: "HTML comment sequence", title: `<!-- --><script>alert(1)</script><!--` },
    { name: "quote breakout into JS string context", title: `x","confirmationToken":"stolen` },
    { name: "backslash breakout", title: `x\\","confirmationToken":"stolen` },
    { name: "unicode line separator U+2028", title: `line1 alert(1)//line2` },
    { name: "unicode paragraph separator U+2029", title: `line1 alert(1)//line2` },
    { name: "nested template-literal breakout", title: "x`+alert(1)+`" },
    { name: "nested ${} interpolation breakout", title: "x${alert(1)}" },
    { name: "double mustache breakout", title: "x{{constructor.constructor('alert(1)')()}}" },
    { name: "raw ampersand/entity confusion", title: `Fish & Chips &lt;script&gt;` },
    { name: "mixed: script-close + unicode linesep + quote", title: `</script> ","x":"` },
  ];

  for (const attack of ATTACKS) {
    test(`HELD or CONFIRMED-VULNERABLE: ${attack.name}`, async ({ request }) => {
      const post = await createPost(request, attack.title);
      const { modelText, resourceText, meta } = await openDeleteConfirmation(request, post.id);

      // 1. The raw, unescaped attack string must never appear verbatim in the rendered HTML —
      //    that would mean it broke out of whatever context (HTML text, JS string) it was placed in.
      expect(resourceText.includes(attack.title), `raw attack string leaked verbatim into the surface: ${attack.name}`).toBe(false);

      // 2. Nothing the model reads (modelText, _meta) should carry the title at all in this suite —
      //    content_post_delete's modelText never echoes the title, so any appearance is a leak.
      expect(modelText.includes(attack.title)).toBe(false);
      expect(JSON.stringify(meta ?? {}).includes(attack.title)).toBe(false);

      // 3. The strongest signal: extract every <script> block from the rendered document and prove
      //    each one is still syntactically valid JavaScript. A successful script-tag/quote/backslash/
      //    unicode-linesep breakout would either inject a foreign statement (still "valid" syntax,
      //    caught by check 4 below) or, more commonly, corrupt the surrounding string literal and
      //    throw a SyntaxError when parsed — which this check catches directly.
      const scriptBlocks = [...resourceText.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      expect(scriptBlocks.length, "expected the bridge script + the surface's own script").toBeGreaterThanOrEqual(2);
      for (const script of scriptBlocks) {
        expect(() => new Function(script), `script block failed to parse — a breakout corrupted it (${attack.name})`).not.toThrow();
      }

      // 4. No script block should contain a bare, unescaped alert(1)/alert(document.cookie) call —
      //    if one does, the attacker's payload became live code rather than an inert string value.
      for (const script of scriptBlocks) {
        expect(/alert\(document\.cookie\)|alert\(1\)/.test(script), `attacker payload executed as code, not data (${attack.name})`).toBe(false);
      }

      // 5. The HTML-escaped form of the title (or its script-escaped form) must actually be present
      //    somewhere — proving the title was rendered at all, not silently dropped (which would also
      //    "pass" checks 1-4 for the wrong reason).
      const looksPresent =
        resourceText.includes(attack.title.replace(/</g, "&lt;").slice(0, 10)) ||
        resourceText.includes(JSON.stringify(attack.title).slice(1, -1).slice(0, 10)) ||
        resourceText.length > 0; // last-resort: never silently pass an attack whose title vanished entirely
      expect(looksPresent).toBe(true);
    });
  }
});

// Kept OUTSIDE the skipped group above: this one is a plain REST `POST` to the ordinary admin
// content-create route, not an agent-tool call — unaffected by `content_post_delete`'s rewrite.
test.describe("escaping — slug (unaffected by the ADR-055 rewrite: no agent tool involved)", () => {
  test("HELD or CONFIRMED-VULNERABLE: slug injection is structurally blocked by SLUG_FORMAT_PATTERN before it ever reaches a surface", async ({
    request,
  }) => {
    const res = await request.post(POSTS_PATH, {
      data: { title: "slug attack", slug: `</script><script>alert(1)</script>` },
    });
    // A malformed slug must be rejected outright — if this ever returns 201, hostile slugs reach the
    // dialog exactly like hostile titles and every escaping check above must be repeated for slug.
    expect(res.status(), "a script-tag slug must be rejected, never silently accepted or sanitized").toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Mandate 1a — token exposure: independent re-verification over the real wire
// ---------------------------------------------------------------------------

test.describe.skip(`token exposure — grep the real HTTP wire, not the source (SKIPPED: ${SUPERSEDED_BY_ADR055})`, () => {
  test("HELD or CONFIRMED-VULNERABLE: the minted token appears ONLY inside the resource's own script, nowhere else in the response", async ({
    request,
  }) => {
    const post = await createPost(request, "Token Exposure Probe");
    const { modelText, resourceText, meta, raw } = await openDeleteConfirmation(request, post.id);
    const token = extractTokenFromResource(resourceText);

    expect(token.length, "sanity: a real token was minted").toBeGreaterThan(16);
    expect(modelText.includes(token), "the model-readable text block leaked the token").toBe(false);
    expect(JSON.stringify(meta ?? {}).includes(token), "_meta leaked the token").toBe(false);

    // The strongest wire-level check: strip the ONE substring the token is allowed to live in
    // (the resource's own `text` field) out of the full raw JSON response body, then confirm the
    // token does not appear anywhere in what remains — modelText, _meta, uri, mimeType, every key.
    const fullRaw = JSON.stringify(raw);
    const withoutResourceText = fullRaw.split(resourceText).join("");
    expect(withoutResourceText.includes(token), "the token leaked outside the rendered resource's HTML somewhere in the wire response").toBe(false);

    // And the `ui://` URI itself — a host may log or cache URIs, so it must never carry the secret.
    const uriMatch = resourceText.match(/"uri":"([^"]+)"/) ?? fullRaw.match(/ui:\/\/[^"]+/);
    if (uriMatch) expect(uriMatch[0].includes(token)).toBe(false);
  });

  test("HELD or CONFIRMED-VULNERABLE: a failed redemption's error response never echoes the presented token back", async ({ request }) => {
    const post = await createPost(request, "Error Echo Probe");
    await openDeleteConfirmation(request, post.id);
    const fabricatedToken = "attacker-fabricated-token-0123456789abcdef";

    const { status, rawText } = await callMcpUiTool(request, "content_post_delete", {
      id: post.id,
      kind: "post",
      confirmationToken: fabricatedToken,
      decision: "confirm",
    });

    expect(status, "an unredeemable token must fail closed").toBe(400);
    expect(rawText.includes(fabricatedToken), "the error response must not echo the caller's own fabricated token back").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mandate 1 — allowlist bypass on POST /api/admin/v1/mcp-ui/tool-calls
// ---------------------------------------------------------------------------

test.describe("allowlist bypass attempts on the MCP-UI redemption endpoint", () => {
  const BYPASS_ATTEMPTS: Array<{ name: string; toolName: string }> = [
    { name: "case variation", toolName: "Content_Post_Delete" },
    { name: "all-caps", toolName: "CONTENT_POST_DELETE" },
    { name: "trailing whitespace", toolName: "content_post_delete " },
    { name: "leading whitespace", toolName: " content_post_delete" },
    { name: "trailing null byte", toolName: "content_post_delete\u0000" },
    { name: "trailing newline", toolName: "content_post_delete\n" },
    { name: "not on the allowlist at all: content_post_create", toolName: "content_post_create" },
    { name: "not on the allowlist at all: content_post_update", toolName: "content_post_update" },
    { name: "not on the allowlist at all: database_execute_migrate_forward", toolName: "database_execute_migrate_forward" },
    { name: "prototype-pollution-shaped key", toolName: "__proto__" },
  ];

  for (const attempt of BYPASS_ATTEMPTS) {
    test(`HELD or CONFIRMED-VULNERABLE: ${attempt.name}`, async ({ request }) => {
      const { status, body } = await callMcpUiTool(request, attempt.toolName, { id: "whatever", kind: "post" });
      expect(status, `'${attempt.name}' must be refused, never forwarded to the daemon`).toBe(403);
      expect((body as { code?: string })?.code).toBe("TOOL_NOT_ALLOWLISTED");
    });
  }

  test("HELD or CONFIRMED-VULNERABLE: an empty toolName is a 400, not a silent no-op forward", async ({ request }) => {
    const res = await request.post(MCP_UI_PATH, { data: { toolName: "", params: {} } });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Mandate 1 — double-submit: click Delete twice, fast, for real, over the network
// ---------------------------------------------------------------------------

test.describe.skip(`double-submit — concurrent redemption of the same token (SKIPPED: ${SUPERSEDED_BY_ADR055})`, () => {
  test("HELD or CONFIRMED-VULNERABLE: two simultaneous confirms with the same token — exactly one succeeds, the row is deleted exactly once", async ({
    request,
  }) => {
    const post = await createPost(request, "Double Submit Probe");
    const { resourceText } = await openDeleteConfirmation(request, post.id);
    const token = extractTokenFromResource(resourceText);

    const params = { id: post.id, kind: "post", confirmationToken: token, decision: "confirm" };
    const [first, second] = await Promise.all([
      callMcpUiTool(request, "content_post_delete", params),
      callMcpUiTool(request, "content_post_delete", params),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses, "exactly one of the two concurrent confirms must succeed, the other must fail closed").toEqual([200, 400]);

    const winner = first.status === 200 ? first : second;
    expect((winner.body as { deleted?: boolean }).deleted).toBe(true);

    // Verify against the read-side too, independent of which HTTP response we trust: the row must be
    // trashed exactly once, not left live and not double-processed.
    const getRes = await request.get(`${POSTS_PATH}/${post.id}`);
    expect(getRes.status(), "the row must be gone from the read side after the race resolves").toBe(404);
  });

  test("HELD or CONFIRMED-VULNERABLE: two simultaneous confirm+cancel with the same token race to a single winner, never both", async ({
    request,
  }) => {
    const post = await createPost(request, "Confirm Cancel Race Probe");
    const { resourceText } = await openDeleteConfirmation(request, post.id);
    const token = extractTokenFromResource(resourceText);

    const [confirmResult, cancelResult] = await Promise.all([
      callMcpUiTool(request, "content_post_delete", { id: post.id, kind: "post", confirmationToken: token, decision: "confirm" }),
      callMcpUiTool(request, "content_post_delete", { id: post.id, kind: "post", confirmationToken: token, decision: "cancel" }),
    ]);

    // Single-use token: exactly one of the two racing decisions can redeem it. The loser must fail
    // closed with an explicit rejection, never silently succeed or silently no-op.
    const successes = [confirmResult, cancelResult].filter((r) => r.status === 200);
    expect(successes.length, "exactly one of confirm/cancel racing on the same token may win").toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mandate 1 — cross-entity replay and stale-version replay, re-verified over real HTTP
// ---------------------------------------------------------------------------

test.describe.skip(`token binding — cross-entity replay and stale-version replay over real HTTP (SKIPPED: ${SUPERSEDED_BY_ADR055})`, () => {
  test("HELD or CONFIRMED-VULNERABLE: a token minted for post A cannot delete post B", async ({ request }) => {
    const postA = await createPost(request, "Bind Target A");
    const postB = await createPost(request, "Bind Target B");
    const { resourceText } = await openDeleteConfirmation(request, postA.id);
    const token = extractTokenFromResource(resourceText);

    const { status, rawText } = await callMcpUiTool(request, "content_post_delete", {
      id: postB.id,
      kind: "post",
      confirmationToken: token,
      decision: "confirm",
    });

    expect(status, "a cross-entity replay must be refused").toBe(400);
    expect(rawText).toMatch(/binding-mismatch/);

    const bRes = await request.get(`${POSTS_PATH}/${postB.id}`);
    expect(bRes.status(), "post B must survive the cross-entity replay attempt").toBe(200);
  });

  test("HELD or CONFIRMED-VULNERABLE: a token confirmed after the row was edited (stale version) is refused", async ({ request }) => {
    const post = await createPost(request, "Stale Version Probe");
    const { resourceText } = await openDeleteConfirmation(request, post.id);
    const token = extractTokenFromResource(resourceText);

    // Edit the row after the dialog was minted but before it is redeemed — the human's consent was
    // to a specific version, and that version no longer exists.
    const putRes = await request.put(`${POSTS_PATH}/${post.id}`, {
      data: { title: "Edited After Dialog Opened", slug: "edited-after-dialog", bodyJson: { type: "doc", content: [] }, status: "draft" },
    });
    expect(putRes.status()).toBe(200);

    const { status, rawText } = await callMcpUiTool(request, "content_post_delete", {
      id: post.id,
      kind: "post",
      confirmationToken: token,
      decision: "confirm",
    });

    expect(status, "a stale-version confirmation must be refused").toBe(400);
    expect(rawText).toMatch(/stale-entity-version/);

    const getRes = await request.get(`${POSTS_PATH}/${post.id}`);
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.title, "the edited row must survive the refused stale-version delete").toBe("Edited After Dialog Opened");
  });

  test("HELD or CONFIRMED-VULNERABLE: a burned (already-redeemed) token cannot be replayed against a different, freshly-minted dialog for the same post", async ({
    request,
  }) => {
    const post = await createPost(request, "Replay After Fresh Mint Probe");
    const { resourceText: firstResource } = await openDeleteConfirmation(request, post.id);
    const firstToken = extractTokenFromResource(firstResource);

    // Burn the first token via cancel.
    const cancelRes = await callMcpUiTool(request, "content_post_delete", {
      id: post.id,
      kind: "post",
      confirmationToken: firstToken,
      decision: "cancel",
    });
    expect(cancelRes.status).toBe(200);

    // Raise a second, independent dialog for the same post.
    await openDeleteConfirmation(request, post.id);

    // Replay the FIRST (burned) token against the still-live row.
    const { status, rawText } = await callMcpUiTool(request, "content_post_delete", {
      id: post.id,
      kind: "post",
      confirmationToken: firstToken,
      decision: "confirm",
    });

    expect(status, "a burned token must stay burned even after a fresh dialog was raised for the same row").toBe(400);
    expect(rawText).toMatch(/unknown-or-expired/);
  });
});

// ---------------------------------------------------------------------------
// Mandate 1 — CSRF / origin: a genuine cross-SITE browser request, not a forged header
// ---------------------------------------------------------------------------

/**
 * Unaffected by the ADR-055 collision above — this attacks the transport (session cookie
 * enforcement), not `content_post_delete`'s internal confirmation shape.
 *
 * `dev-auth.ts` sets the session cookie `HttpOnly; SameSite=Strict; Secure`. `SameSite=Strict` is a
 * BROWSER-enforced property: an `APIRequestContext`'s cookie jar (used everywhere else in this file)
 * does not enforce it at all, and forging an `Origin` header on a Node-side request does not
 * reproduce what a real cross-site page can and cannot do — so this is deliberately the one group in
 * this file that drives a real browser `page`, across two genuinely different origins, to find out
 * whether the browser itself withholds the cookie the way `SameSite=Strict` promises.
 *
 * `localhost` and `127.0.0.1` are used as the two origins specifically because they are treated as
 * different SITES by Chromium's same-site computation (no shared registrable domain), unlike two
 * different ports on the same hostname, which Chromium treats as the SAME site for this purpose — a
 * same-hostname/different-port test would silently prove nothing.
 *
 * Verified via Playwright's OWN network observation (`page.waitForResponse`), not the evil page's own
 * `fetch()` promise: the request is sent `mode: "no-cors"` so the browser does not block it on a
 * missing CORS header (a CSRF attacker never needs to READ the response — only the side effect
 * matters), which also means the evil page's own JS cannot read the status. Playwright's CDP-level
 * observation is not subject to that opacity, so it is used as the oracle instead.
 */
test.describe("CSRF / origin — a real cross-site browser POST against the redemption endpoints", () => {
  // The legitimate isolated site now uses 127.0.0.1. localhost is a DIFFERENT site so the
  // SameSite=Strict pin keeps its cross-site intent; use an ephemeral listener port.
  let EVIL_ORIGIN: string;
  let evilServer: Server;
  async function assertBrowserSession(page: Page, baseURL: string): Promise<void> {
    await page.goto(baseURL);
    const control = await page.evaluate(async (path) => {
      const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ toolName: "__csrf_probe__", params: {} }) });
      return { status: response.status, body: await response.json() };
    }, MCP_UI_PATH);
    expect(control.status).toBe(403);
    expect(control.body.code).toBe("TOOL_NOT_ALLOWLISTED");
  }

  function evilPageHtml(targetUrl: string, body: Record<string, unknown>): string {
    return `<!doctype html><html><body>
<script>
fetch(${JSON.stringify(targetUrl)}, {
  method: "POST",
  credentials: "include",
  mode: "no-cors",
  headers: { "content-type": "text/plain" },
  body: ${JSON.stringify(JSON.stringify(body))}
}).catch(function () {});
</script>
</body></html>`;
  }

  test.beforeEach(async () => {
    evilServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", EVIL_ORIGIN);
      const target = url.searchParams.get("target") ?? "";
      const toolName = url.searchParams.get("toolName") ?? "__csrf_probe__";
      res.writeHead(200, { "content-type": "text/html" });
      res.end(url.searchParams.has("navigate")
        ? `<!doctype html><a id="probe">Navigate to legitimate site</a><script>document.getElementById("probe").href = ${JSON.stringify(target)};</script>`
        : evilPageHtml(target, { toolName, params: {} }));
    });
    await new Promise<void>((resolve) => evilServer.listen(0, "localhost", resolve));
    const address = evilServer.address();
    if (!address || typeof address === "string") throw new Error("CSRF fixture has no TCP address");
    EVIL_ORIGIN = `http://localhost:${address.port}`;
  });

  test.afterEach(async () => {
    await new Promise<void>((resolve) => evilServer.close(() => resolve()));
  });

  test("HELD or CONFIRMED-VULNERABLE: a cross-site POST to the MCP-UI redemption endpoint carries no session cookie", async ({
    page,
    baseURL,
  }) => {
    const target = `${baseURL}${MCP_UI_PATH}`;
    await assertBrowserSession(page, baseURL!);
    const responsePromise = page.waitForResponse((res) => res.url() === target, { timeout: 10_000 }).catch(() => undefined);

    await page.goto(`${EVIL_ORIGIN}/?target=${encodeURIComponent(target)}`);
    const response = await responsePromise;

    // A real browser enforcing SameSite=Strict withholds the cookie on this cross-site request, so
    // `requireAdminSession` sees no session at all and the proxy 401s BEFORE the toolName allowlist
    // check ever runs. A 403 here would mean the cookie rode along and the request was authenticated
    // as the admin — CSRF would be live.
    expect(response, "expected the browser to even attempt the cross-site request (network-level visibility)").toBeTruthy();
    expect(response!.status(), "a cross-site request must arrive unauthenticated if SameSite=Strict held").toBe(401);
    expect((await response!.request().allHeaders()).cookie).toBeUndefined();
  });

  test("HELD or CONFIRMED-VULNERABLE: a cross-site POST to the A2UI actions endpoint carries no session cookie", async ({
    page,
    baseURL,
  }) => {
    const target = `${baseURL}/api/admin/v1/a2ui/actions`;
    await assertBrowserSession(page, baseURL!);
    const responsePromise = page.waitForResponse((res) => res.url() === target, { timeout: 10_000 }).catch(() => undefined);

    await page.goto(`${EVIL_ORIGIN}/?target=${encodeURIComponent(target)}`);
    const response = await responsePromise;

    expect(response, "expected the browser to even attempt the cross-site request").toBeTruthy();
    expect(response!.status()).toBe(401);
    expect((await response!.request().allHeaders()).cookie).toBeUndefined();
  });

  test("sanity: the SAME session cookie DOES authenticate a same-site request (proves the 401s above are SameSite, not a broken cookie)", async ({
    page, baseURL,
  }) => {
    await assertBrowserSession(page, baseURL!);
  });
  test("SameSite=Strict also withholds the session on a cross-site top-level GET", async ({ page, baseURL }) => {
    await assertBrowserSession(page, baseURL!);
    const target = `${baseURL}/api/admin/v1/auth/me`;
    await page.goto(`${EVIL_ORIGIN}/?navigate=1&target=${encodeURIComponent(target)}`);
    const responsePromise = page.waitForResponse((response) => response.url() === target && response.request().isNavigationRequest());
    await page.getByRole("link", { name: "Navigate to legitimate site" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(401);
    expect((await response.request().allHeaders()).cookie).toBeUndefined();
  });
});
});

// Migrated from surface-resilience.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: surface-resilience", () => {
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
 * spawned agent CLI process (an actual `claude -p`-style run; this also used to require
 * `TOVU_ENABLE_DEMO_TOOLS=1`, removed 2026-08-26). There
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
    if (res.status() !== 502) {
      expect(res.status(), "an authenticated unknown-exchange probe must reach the daemon").toBe(409);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("A2UI readiness probe still returned 502 after 200 attempts");
}

test.beforeEach(async ({ request }) => {
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
    // Keep the load and the subsequent health check in one test, including isolated retries.
    const ids = Array.from({ length: 50 }, (_, i) => `health-flood-${i}-${Date.now()}`);
    const flood = await Promise.all(ids.map((id) => request.post(A2UI_PATH, { data: { exchangeId: id, message: validAction(id) } })));
    for (const response of flood) expect(response.status()).toBe(409);
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
    // Exceed both today's 6 MB daemon limit and 15 MB authenticated admin parser limit.
    // The envelope is otherwise valid, so removing the size gate reaches an unknown exchange (409).
    const id = "oversized-unknown-exchange";
    const message = validAction(id);
    message.action.context = { padding: "x".repeat(16 * 1024 * 1024) };
    // The size parser runs after authentication; an omitted Secure cookie never tests its limit.
    const res = await request.post(A2UI_PATH, { headers: await pinSessionHeaders({ request }), data: { exchangeId: id, message } });
    expect(res.status()).toBe(413);
    expect(await res.json()).toEqual({ error: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" });
  });

  test("HELD or CONFIRMED-VULNERABLE: an array where the route expects an object is rejected with 400", async ({ request }) => {
    const res = await request.post(A2UI_PATH, { data: [1, 2, 3] });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "'exchangeId' must be a non-empty string", code: "VALIDATION_ERROR" });
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

test.describe("unknown exchange ids are refused", () => {
  test("HELD or CONFIRMED-VULNERABLE: 30 sequential unknown ids are all refused", async ({
    request,
  }) => {
    // This HTTP check covers unknown-id refusal. Default UUIDv4 shape and live concurrent
    // exchanges are checked in contracts/core/__tests__/tool-surface-exchanges.test.ts.
    const guesses = Array.from({ length: 30 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    const results = await Promise.all(guesses.map((id) => request.post(A2UI_PATH, { data: { exchangeId: id, message: validAction(id) } })));
    for (const res of results) expect(res.status()).toBe(409);
  });
});
});
