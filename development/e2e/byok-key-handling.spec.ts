import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * @file BYOK key-handling edge cases + leakage battery (2026-08-04 dispatch, Item 6).
 *
 * The dispatch's own framing of the highest-value case here: Google/Gemini passes the API key
 * as a query-string value (`googleProviderModelsUrl` in `@jini-ai/agent-runtime/providers/
 * google.ts`, via `url.searchParams.set('key', apiKey)`) — can a hostile key inject a SECOND
 * query parameter? Traced through the source first: `URLSearchParams.set` always percent-encodes
 * its value per `application/x-www-form-urlencoded`, so a string-concatenation-style injection
 * (`&foo=bar` splitting into a second param) should be structurally impossible here — this is
 * verified empirically below against a REAL local listener, not asserted from the source
 * reading alone.
 *
 * Every network-facing case here uses a real `node:http` "confused deputy" listener on loopback
 * (same pattern as `byok-ssrf-guard.spec.ts`/`byok-empty-key-guard.spec.ts`) rather than
 * `page.route` stubbing: the whole point is to observe exactly what Tovu's SERVER sends over the
 * wire (query string shape, header bytes, error-body redaction), which a client-side route stub
 * cannot show. Zero real provider keys, zero quota spent. Run against this file's hermetic
 * two-server harness (`../playwright.admin.config.ts`), never a real provider or the shared dev
 * server.
 *
 * One login per `test()`, not per case within a battery, for the same `LOGIN_STRICT` rate-limiter
 * reason `byok-ssrf-guard.spec.ts`'s header documents.
 */

const A2UI_LOGIN = { username: "admin", password: "tovu-dev" };
async function apiLogin(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
}

const ADMIN_ORIGIN_PATH = "/admin/";
async function pageLogin(page: Page): Promise<void> {
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', "tovu-dev");
  await page.click('.login-card button:has-text("Sign in")');
  await page.waitForSelector(".login-card", { state: "detached", timeout: 15_000 });
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
const TEST_CONN_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/test-connection";

async function startDeputy(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void>; hits: () => number; lastUrl: () => string | undefined; lastHeaders: () => http.IncomingHttpHeaders | undefined }> {
  let hitCount = 0;
  let lastUrl: string | undefined;
  let lastHeaders: http.IncomingHttpHeaders | undefined;
  const server = http.createServer((req, res) => {
    hitCount += 1;
    lastUrl = req.url;
    lastHeaders = req.headers;
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    hits: () => hitCount,
    lastUrl: () => lastUrl,
    lastHeaders: () => lastHeaders,
  };
}

/**
 * Same shape as `startDeputy`, but on a CALLER-CHOSEN fixed port rather than an OS-assigned one.
 * Only the MSG-1 battery below needs this: proving a "prefix" host actually exists requires two
 * ports where one's decimal string is a literal prefix of the other's (e.g. `6000` / `60000`) —
 * an OS-assigned ephemeral port can't be arranged to have that relationship.
 */
async function startFixedDeputy(
  port: number,
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void>; hits: () => number; lastHeaders: () => http.IncomingHttpHeaders | undefined }> {
  let hitCount = 0;
  let lastHeaders: http.IncomingHttpHeaders | undefined;
  const server = http.createServer((req, res) => {
    hitCount += 1;
    lastHeaders = req.headers;
    handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    hits: () => hitCount,
    lastHeaders: () => lastHeaders,
  };
}

test.describe("byok key-handling edge cases", () => {
  test("client-side: a whitespace-only API key keeps Test Connection disabled, matching the server's own guard", async ({
    page,
  }) => {
    test.slow();
    await pageLogin(page);
    await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
    // The Execution section is reached through the settings dialog's own left nav (a plain
    // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
    // this click the BYOK tab below is not mounted yet and the spec times out.
    await page.getByTestId("settings-dialog-nav-execution").click();
    await page.getByRole("tab", { name: "BYOK" }).click();

    await page.locator('.jini-byok-card .jini-field-input-row input').fill("   \t\t   ");
    await page.locator('input[list="jini-byok-model-options"]').fill("claude-sonnet-4-5");
    // `missingRequiredFields` (`@jini-ai/ui/features/execution/rules.ts`) checks
    // `config.apiKey.trim()` — a whitespace-only key must read as "missing", same as empty.
    await expect(page.locator('button:has-text("Test connection")')).toBeDisabled();
  });

  test("a Gemini key containing &, #, ?, %, +, and a raw newline never injects a second query parameter — it round-trips as one encoded value", async ({
    request,
  }) => {
    await apiLogin(request);
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [] }));
    });

    try {
      const nastyKey = "realkey&malicious=1&admin=true#frag?q=1%25encoded+plus\nnewline";
      const res = await request.post(MODELS_PATH, {
        data: { protocol: "google", baseUrl: `http://127.0.0.1:${deputy.port}`, apiKey: nastyKey },
      });
      expect(res.status()).toBe(200);
      expect(deputy.hits()).toBe(1);

      const receivedUrl = new URL(`http://x${deputy.lastUrl()}`);
      // Exactly one `key` param — never split into `key` + `malicious` + `admin` + ... by the
      // hostile `&`s embedded in the value.
      expect(receivedUrl.searchParams.getAll("key")).toHaveLength(1);
      expect(receivedUrl.searchParams.has("malicious")).toBe(false);
      expect(receivedUrl.searchParams.has("admin")).toBe(false);
      // And the value the deputy actually received decodes back to the exact original string —
      // proving this isn't just "no injection" but "no corruption" either.
      expect(receivedUrl.searchParams.get("key")).toBe(nastyKey);
    } finally {
      await deputy.close();
    }
  });

  test("an API key with leading/trailing whitespace is sent to the provider BYTE-FOR-BYTE — no client or server-side trim", async ({
    request,
  }) => {
    await apiLogin(request);
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    });

    try {
      // `openai`'s header path (`providerModelsHeaders`: `authorization: Bearer ${apiKey}`) is the
      // most direct read of what actually left the server: HTTP header VALUES may carry leading/
      // trailing spaces without being folded, so this is legible on the wire without any encoding
      // to account for (unlike the Google query-string cases above).
      const untrimmedKey = "  sk-test-PADDED-KEY-FAKE-NOT-REAL  ";
      const res = await request.post(MODELS_PATH, {
        data: { protocol: "openai", baseUrl: `http://127.0.0.1:${deputy.port}`, apiKey: untrimmedKey },
      });
      expect(res.status()).toBe(200);
      expect(deputy.hits()).toBe(1);
      // Documents an observed footgun, not a security hole: an operator who pastes a key with
      // accidental whitespace gets a byte-for-byte broken credential rather than a silently
      // corrected one — `missingRequiredFields`'s `.trim()` check only decides whether the field
      // counts as "filled", it never trims the value that is actually SENT.
      expect(deputy.lastHeaders()?.authorization).toBe(`Bearer ${untrimmedKey}`);
    } finally {
      await deputy.close();
    }
  });

  test("a key containing CRLF never achieves header injection, and the route degrades to ok:false rather than a 500", async ({
    request,
  }) => {
    await apiLogin(request);
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    });

    try {
      const crlfKey = "sk-test-CRLF-FAKE\r\nX-Injected-Header: evil\r\nSecond-Line: also-evil";
      const res = await request.post(MODELS_PATH, {
        data: { protocol: "openai", baseUrl: `http://127.0.0.1:${deputy.port}`, apiKey: crlfKey },
      });
      // Whatever happened underneath (fetch/undici rejecting the malformed header value outright,
      // or something more permissive), the route's own contract holds: it never 500s a caller for
      // a hostile-but-well-formed-JSON request body.
      expect(res.status()).toBe(200);
      const body = await res.json();
      // The measured, unambiguous proof of "no injection": IF the deputy was ever reached, it must
      // not have received the injected header, regardless of which layer stopped it.
      if (deputy.hits() > 0) {
        expect(deputy.lastHeaders()?.["x-injected-header"]).toBeUndefined();
        expect(deputy.lastHeaders()?.["second-line"]).toBeUndefined();
      } else {
        // The likelier real outcome: undici's fetch() rejects an invalid header VALUE before any
        // connection is attempted, and the route classifies that as a graceful failure.
        expect(body.ok).toBe(false);
      }
    } finally {
      await deputy.close();
    }
  });

  test("a 10,000-character API key does not hang or crash discovery or test-connection", async ({ request }) => {
    await apiLogin(request);
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "deputy-model", object: "model" }] }));
    });

    try {
      const hugeKey = "k".repeat(10_000);
      const start = Date.now();
      const res = await request.post(MODELS_PATH, {
        data: { protocol: "openai", baseUrl: `http://127.0.0.1:${deputy.port}`, apiKey: hugeKey },
      });
      const elapsedMs = Date.now() - start;
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.models).toContain("deputy-model");
      expect(deputy.lastHeaders()?.authorization).toBe(`Bearer ${hugeKey}`);
      // Loose smoke bound, same rationale as `byok-ssrf-guard.spec.ts`'s own latency assertions —
      // not an SLA, just proof nothing degenerated into pathological (e.g. O(n^2) redaction regex)
      // behavior on a large input.
      expect(elapsedMs).toBeLessThan(10_000);
    } finally {
      await deputy.close();
    }
  });

  test("redactSecrets scrubs the real API key out of an upstream error that echoes it back — both the non-2xx and the 2xx-bad-reply branches", async ({
    request,
  }) => {
    await apiLogin(request);
    const canaryKey = "sk-test-ECHO-CANARY-9f3a7c";

    // Branch 1: model-catalog.ts's `!response.ok` path — a misbehaving/hostile endpoint reflects
    // the caller's own Authorization header back in a 401 error body.
    const deputy401 = await startDeputy((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Invalid credentials: ${req.headers.authorization}` } }));
    });
    try {
      const res = await request.post(MODELS_PATH, {
        data: { protocol: "openai", baseUrl: `http://127.0.0.1:${deputy401.port}`, apiKey: canaryKey },
      });
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.message).toBeDefined();
      expect(body.message as string).not.toContain(canaryKey);
    } finally {
      await deputy401.close();
    }

    // Branch 2: connection-test.ts's 2xx-but-not-the-expected-smoke-reply path — this module's own
    // comment documents this exact branch as a previously-missing redaction spot ("two independent
    // audits reproduced that... the redaction was simply missing on this one branch"), now fixed.
    // This re-proves the fix holds rather than re-discovering the original gap.
    const deputy200Echo = await startDeputy((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: `unexpected reply, your key was ${req.headers.authorization}` } }],
        }),
      );
    });
    try {
      const res = await request.post(TEST_CONN_PATH, {
        data: {
          protocol: "openai",
          baseUrl: `http://127.0.0.1:${deputy200Echo.port}`,
          apiKey: canaryKey,
          model: "gpt-4o",
        },
      });
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.message as string).not.toContain(canaryKey);
    } finally {
      await deputy200Echo.close();
    }
  });

  test("browser-level: an endpoint that echoes the API key in its error body never shows the raw key anywhere in the settings UI", async ({
    page,
  }) => {
    test.slow();
    const canaryKey = "sk-test-DOM-CANARY-4b1e";
    const deputy = await startDeputy((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Access denied for ${req.headers.authorization}` } }));
    });

    try {
      await pageLogin(page);
      // Stubbed so mount-time model discovery (which fires automatically the instant BYOK mode is
      // selected — see `byok-model-discovery-self-heal.spec.ts`'s header) never reaches the real
      // anthropic.com/openai.com default endpoints before this test points the base URL at the
      // deputy below. A non-empty list is deliberate: an EMPTY `models` array overrides the
      // preset's own non-empty `preferredModels` fallback (`ByokProviderForm.tsx`'s `suggestions`),
      // which strips the `list="jini-byok-model-options"` attribute this file's model-field
      // selector depends on.
      await page.route("**/assistant/execution/models", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, models: ["stub-model"] }) }),
      );
      await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
      // The Execution section is reached through the settings dialog's own left nav (a plain
      // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
      // this click the BYOK tab below is not mounted yet and the spec times out.
      await page.getByTestId("settings-dialog-nav-execution").click();
      await page.getByRole("tab", { name: "BYOK" }).click();
      await page.getByRole("tab", { name: "OpenAI", exact: true }).click();

      await page.locator('.jini-byok-card .jini-field-input-row input').fill(canaryKey);
      await page.locator('label:has-text("Base URL") input').fill(`http://127.0.0.1:${deputy.port}`);
      await page.locator('input[list="jini-byok-model-options"]').fill("gpt-4o");

      const consoleMessages: string[] = [];
      page.on("console", (msg) => consoleMessages.push(msg.text()));

      await page.locator('button:has-text("Test connection")').click();
      await expect(page.locator(".jini-byok-test-status.is-error")).toBeVisible({ timeout: 15_000 });

      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toContain(canaryKey);
      expect(consoleMessages.join("\n")).not.toContain(canaryKey);
    } finally {
      await deputy.close();
    }
  });
});

/**
 * MSG-1 addition (routed from the team lead, sourced from `ADS-memory/reports/findings/
 * 2026-08-04-byok-discovery-keystroke-key-leak.md`): `ExecutionTab.tsx`'s model-discovery
 * `useEffect` (`Jini/packages/ui/src/features/execution/react/components/ExecutionTab.tsx:110-114`)
 * has `config.byok.baseUrl` as a dependency, no debounce, and passes the WHOLE `config.byok` —
 * including `apiKey` — to `loadModels` on every fire. `apiKey` itself is not a dep, so typing the
 * KEY doesn't refire discovery, but the key is read fresh at fire time. Net effect: once a key is
 * saved, every edit to Base URL re-sends that real key to whatever URL the field holds at that
 * instant — including values the operator never intended to finish on. Composed with the SSRF
 * guard's documented loopback carve-out (`byok-ssrf-guard.spec.ts`: allowed at ANY port, by
 * design), a half-typed `http://localhost:NNNN` walks real local ports with the key attached.
 *
 * PINNED AS KNOWN-BAD, NOT FIXED, on the team lead's explicit instruction: the fix lives in
 * `ExecutionTab.tsx` in the Jini repo (debounce the effect, drop `apiKey` from the discovery
 * payload, or require an explicit "discover" action are the candidate shapes), and picking one is
 * an owner decision, not this audit's call.
 *
 * **Judgment call on `test.fail()` vs. a plain green pin** (the team lead's own carve-out: use
 * per-test judgment, say so if `test.fail()` is wrong for a given case). Every `expect` in the
 * first two tests below already asserts the CURRENT, observed (bad) behavior as a VALUE —
 * "N requests fired", "this field equals the real key" — not the desired/fixed behavior the way
 * `byok-state-races.spec.ts`'s two `test.fail()` pins do. That already gives the identical
 * self-invalidating property `test.fail()` exists to provide: today, with the bug present, these
 * tests PASS (green, reusable, no chronic red to get numb to); the moment a fix lands — a
 * debounce, or `apiKey` dropped from the discovery payload — the counts/values these tests assert
 * stop matching reality and the tests FAIL, which is exactly the "come re-evaluate this pin"
 * signal. Wrapping an already-passing value-assertion in `test.fail()` would invert that: it would
 * make the suite report the CORRECT/fixed behavior as an "unexpected pass" failure, which is
 * backwards. `test.fail()` is the right tool for a test that asserts the DESIRED behavior and
 * currently fails (that's what makes `byok-state-races.spec.ts`'s two pins genuine `test.fail()`
 * candidates); it is not the right tool for a test that already asserts the CURRENT behavior and
 * currently passes. The third test below (redaction) asserts a PROTECTIVE mechanism holds, not a
 * bug — plain green, no pin semantics needed. The fourth (no cancellation) is the same
 * current-value-pin shape as the first two.
 */
test.describe("KNOWN-BAD, pinned not fixed: baseUrl edits re-send the saved API key to every intermediate host (MSG-1)", () => {
  test("mechanism: typing into Base URL re-sends the real saved API key on every intermediate keystroke value, not just the one the operator finishes on", async ({
    page,
  }) => {
    test.slow();
    await pageLogin(page);
    await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
    // The Execution section is reached through the settings dialog's own left nav (a plain
    // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
    // this click the BYOK tab below is not mounted yet and the spec times out.
    await page.getByTestId("settings-dialog-nav-execution").click();
    await page.getByRole("tab", { name: "BYOK" }).click();

    const canaryKey = "sk-ant-KEYSTROKE-LEAK-CANARY";
    await page.locator('.jini-byok-card .jini-field-input-row input').fill(canaryKey);

    const captured: Array<{ baseUrl: string; apiKey: string }> = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/assistant/execution/models")) {
        const data = req.postDataJSON() as { baseUrl?: string; apiKey?: string } | null;
        if (data) captured.push({ baseUrl: data.baseUrl ?? "", apiKey: data.apiKey ?? "" });
      }
    });

    const baseUrlInput = page.locator('label:has-text("Base URL") input');
    await baseUrlInput.fill("");
    const finalUrl = "http://ab.cd.ef.example";
    await baseUrlInput.pressSequentially(finalUrl, { delay: 80 });
    // Let every request this fired actually get sent (not just committed to React state).
    await page.waitForTimeout(1_000);

    // KNOWN-BAD #1: no debounce — more than one request fired for one typed string.
    expect(captured.length).toBeGreaterThan(1);
    // KNOWN-BAD #2: EVERY one of them — including the ones for a value the operator never
    // intended to finish on — carried the real key.
    for (const call of captured) {
      expect(call.apiKey).toBe(canaryKey);
    }
    // KNOWN-BAD #3: at least one captured value is a genuine strict prefix of the final string —
    // the literal "https://a, https://ap, https://api, ..." shape MSG-1 describes.
    const hasGenuinePrefix = captured.some(
      (c) => c.baseUrl.length > 0 && c.baseUrl !== finalUrl && finalUrl.startsWith(c.baseUrl),
    );
    expect(hasGenuinePrefix).toBe(true);
  });

  test("composed with the loopback SSRF carve-out: a real, unintended local listener on a PREFIX port receives the live key mid-edit", async ({
    page,
  }) => {
    test.slow();
    // Fixed (not OS-assigned) ports, chosen so one's decimal string is a literal prefix of the
    // other's — `6000` sits inside `60000` — mirroring an operator pausing partway through typing
    // a port number and briefly landing on a DIFFERENT real local service.
    const echoAuth = (req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    };
    const deputyPrefix = await startFixedDeputy(6000, echoAuth);
    const deputyFinal = await startFixedDeputy(60000, echoAuth);

    try {
      await pageLogin(page);
      await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
      // The Execution section is reached through the settings dialog's own left nav (a plain
      // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
      // this click the BYOK tab below is not mounted yet and the spec times out.
      await page.getByTestId("settings-dialog-nav-execution").click();
      await page.getByRole("tab", { name: "BYOK" }).click();

      const canaryKey = "sk-ant-PORT-WALK-CANARY";
      await page.locator('.jini-byok-card .jini-field-input-row input').fill(canaryKey);

      const baseUrlInput = page.locator('label:has-text("Base URL") input');
      await baseUrlInput.fill("http://localhost:6000");
      await expect.poll(() => deputyPrefix.hits()).toBeGreaterThanOrEqual(1);

      await baseUrlInput.fill("http://localhost:60000");
      await expect.poll(() => deputyFinal.hits()).toBeGreaterThanOrEqual(1);

      // KNOWN-BAD: the port-6000 listener — never the operator's intended endpoint, just a value
      // the field held for a moment — genuinely received the real key over the wire (Anthropic's
      // header shape: `x-api-key`, `providerModelsHeaders` in `model-catalog.ts`).
      expect(deputyPrefix.lastHeaders()?.["x-api-key"]).toBe(canaryKey);
      expect(deputyFinal.lastHeaders()?.["x-api-key"]).toBe(canaryKey);
    } finally {
      await deputyPrefix.close();
      await deputyFinal.close();
    }
  });

  test("open question 1 (MSG-1): redactSecrets DOES cover an error surfaced from one of these unintended prefix requests", async ({
    page,
  }) => {
    test.slow();
    const canaryKey = "sk-ant-ECHO-FROM-PREFIX-CANARY";
    const deputy = await startFixedDeputy(6100, (req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `bad credentials: ${req.headers["x-api-key"]}` } }));
    });

    try {
      await pageLogin(page);
      await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
      // The Execution section is reached through the settings dialog's own left nav (a plain
      // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
      // this click the BYOK tab below is not mounted yet and the spec times out.
      await page.getByTestId("settings-dialog-nav-execution").click();
      await page.getByRole("tab", { name: "BYOK" }).click();

      await page.locator('.jini-byok-card .jini-field-input-row input').fill(canaryKey);
      await page.locator('label:has-text("Base URL") input').fill("http://localhost:6100");

      // ANSWER: yes — `listProviderModels`'s `!response.ok` branch redacts before this ever
      // reaches the UI (`model-catalog.ts`: `detail: redactSecrets(detail, [input.apiKey])`).
      const errorHint = page.locator(".jini-field-hint.is-error[role='status']");
      await expect(errorHint).toBeVisible({ timeout: 15_000 });
      const errorText = await errorHint.innerText();
      expect(errorText).not.toContain(canaryKey);
    } finally {
      await deputy.close();
    }
  });

  test("open question 2 (MSG-1): no cancellation — every fired discovery request races to completion, none are aborted by a newer edit", async ({
    page,
  }) => {
    test.slow();
    const ok = (_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "m", object: "model" }] }));
    };
    const deputyA = await startFixedDeputy(6200, ok);
    const deputyB = await startFixedDeputy(6201, ok);
    const deputyC = await startFixedDeputy(6202, ok);

    try {
      await pageLogin(page);
      await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
      // The Execution section is reached through the settings dialog's own left nav (a plain
      // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
      // this click the BYOK tab below is not mounted yet and the spec times out.
      await page.getByTestId("settings-dialog-nav-execution").click();
      await page.getByRole("tab", { name: "BYOK" }).click();
      await page.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-RACE-CANARY");

      const baseUrlInput = page.locator('label:has-text("Base URL") input');
      // Three distinct edits in quick succession — only the last is the field's final value, but
      // `useExecutionTab.ts`'s `modelDiscoveryTicket` only decides which RESPONSE gets rendered;
      // it never calls `.abort()` on an earlier in-flight request, and nothing in
      // `list-models.ts` wires the Tovu-server-side fetch to the client request's lifecycle
      // either. So all three should complete server-side regardless of the client having moved on.
      await baseUrlInput.fill("http://localhost:6200");
      await baseUrlInput.fill("http://localhost:6201");
      await baseUrlInput.fill("http://localhost:6202");

      // ANSWER: no cancellation — all three land, not just the final one.
      await expect.poll(() => deputyA.hits()).toBeGreaterThanOrEqual(1);
      await expect.poll(() => deputyB.hits()).toBeGreaterThanOrEqual(1);
      await expect.poll(() => deputyC.hits()).toBeGreaterThanOrEqual(1);
    } finally {
      await deputyA.close();
      await deputyB.close();
      await deputyC.close();
    }
  });
});
