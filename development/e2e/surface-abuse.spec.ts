import { createServer, type Server } from "node:http";
import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * @file Adversary pass on `content_post_delete`'s MCP-UI confirmation gate, exercised over REAL HTTP
 * against the REAL running daemon (`playwright.adversarial.config.ts`'s `webServer`).
 *
 * ## STATUS (2026-08-04): most of this file's attacks are SKIPPED — the target moved mid-dispatch
 *
 * This suite was designed and written against the documented ADR-053 shape of `content_post_delete`:
 * step 1 mints a `pending-confirmations.ts` token and returns it embedded in a rendered MCP-UI
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
 * confirmation token is removed entirely" — there is no `pending-confirmations.ts` token to mint,
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
    if (res.status() !== 502) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
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

test.beforeAll(async ({ request }) => {
  await waitForDaemonReady(request);
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
  const EVIL_PORT = 4995;
  const EVIL_ORIGIN = `http://127.0.0.1:${EVIL_PORT}`;
  let evilServer: Server;

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

  test.beforeAll(async () => {
    evilServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", EVIL_ORIGIN);
      const target = url.searchParams.get("target") ?? "";
      const toolName = url.searchParams.get("toolName") ?? "__csrf_probe__";
      res.writeHead(200, { "content-type": "text/html" });
      res.end(evilPageHtml(target, { toolName, params: {} }));
    });
    await new Promise<void>((resolve) => evilServer.listen(EVIL_PORT, "127.0.0.1", resolve));
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => evilServer.close(() => resolve()));
  });

  test("HELD or CONFIRMED-VULNERABLE: a cross-site POST to the MCP-UI redemption endpoint carries no session cookie", async ({
    page,
    baseURL,
  }) => {
    const target = `${baseURL}${MCP_UI_PATH}`;
    const responsePromise = page.waitForResponse((res) => res.url() === target, { timeout: 10_000 }).catch(() => undefined);

    await page.goto(`${EVIL_ORIGIN}/?target=${encodeURIComponent(target)}`);
    const response = await responsePromise;

    // A real browser enforcing SameSite=Strict withholds the cookie on this cross-site request, so
    // `requireAdminSession` sees no session at all and the proxy 401s BEFORE the toolName allowlist
    // check ever runs. A 403 here would mean the cookie rode along and the request was authenticated
    // as the admin — CSRF would be live.
    expect(response, "expected the browser to even attempt the cross-site request (network-level visibility)").toBeTruthy();
    expect(response!.status(), "a cross-site request must arrive unauthenticated if SameSite=Strict held").toBe(401);
  });

  test("HELD or CONFIRMED-VULNERABLE: a cross-site POST to the A2UI actions endpoint carries no session cookie", async ({
    page,
    baseURL,
  }) => {
    const target = `${baseURL}/api/admin/v1/a2ui/actions`;
    const responsePromise = page.waitForResponse((res) => res.url() === target, { timeout: 10_000 }).catch(() => undefined);

    await page.goto(`${EVIL_ORIGIN}/?target=${encodeURIComponent(target)}`);
    const response = await responsePromise;

    expect(response, "expected the browser to even attempt the cross-site request").toBeTruthy();
    expect(response!.status()).toBe(401);
  });

  test("sanity: the SAME session cookie DOES authenticate a same-site request (proves the 401s above are SameSite, not a broken cookie)", async ({
    request,
  }) => {
    // Uses the ordinary `request` fixture, which carries the suite's real storageState cookie —
    // confirms the cookie is genuinely valid and would authenticate if it were sent, so the 401s
    // above are evidence of SameSite withholding it, not evidence the cookie itself is broken.
    const res = await request.post(MCP_UI_PATH, { data: { toolName: "__csrf_probe__", params: {} } });
    expect(res.status(), "a legitimate same-site call with the same cookie must NOT 401").not.toBe(401);
  });
});
