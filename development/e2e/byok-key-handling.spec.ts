import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

import { setByokModel } from "./byok-model-field";

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
 * reason `byok-ssrf-guard.spec.ts`'s header documents — and, since 2026-08-05, one shared login for
 * the five API tests rather than one each. **See the login-budget note on `pageLogin`**: at 11
 * `test()`s this file sits close enough to the 10-per-60s ceiling that the count is a real
 * constraint, not a nicety.
 */

const A2UI_LOGIN = { username: "admin", password: "tovu-dev" };

/**
 * ONE authenticated API context for every non-browser test in this file, replacing what used to be a
 * per-test `apiLogin(request)` against Playwright's own per-test `request` fixture. See the login
 * budget note on `pageLogin` for why the count matters. The five API tests only ever needed *an*
 * authenticated caller, never a distinct session each, so nothing observable is lost.
 */
let sharedApi: APIRequestContext;

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  sharedApi = await playwright.request.newContext({ ...(baseURL ? { baseURL } : {}) });
  const res = await sharedApi.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(
    res.status(),
    `shared API login returned ${res.status()}; 429 means this file exceeded LOGIN_STRICT (10/60s).`,
  ).toBe(200);
});

test.afterAll(async () => {
  await sharedApi?.dispose();
});

const ADMIN_ORIGIN_PATH = "/admin/";

/**
 * ## This file's login budget — read before adding a `test()`
 *
 * `LOGIN_STRICT` is **10 logins / 60s per client IP** (`dev-auth.ts:140-144`). This file has 11
 * `test()`s, and it used to perform **11 logins**: one `pageLogin` in each of the six browser tests,
 * plus one `apiLogin` in each of the five API tests. That fit only because the file was slow enough
 * for the 60s window to roll mid-run — tests 3, 7 and 9 were failing, and test 7's failure alone
 * burned a 90-second timeout.
 *
 * Fixing those three on 2026-08-05 dropped the run from 2.2 min to ~55s. All 11 logins then landed
 * inside one window and the 11th got a **429**, which surfaced as test 11 timing out in `pageLogin`
 * waiting for `.login-card` to detach — a symptom that looks nothing like a rate limit, and exactly
 * the kind this suite has historically written off as infra flake. Observed directly rather than
 * inferred: a probe on every login response printed `200` for logins 1-10 and `429` for the 11th.
 *
 * The five API logins are now a single shared context (`sharedApi` below), because that is the half
 * of the budget that can be collapsed **without changing any browser-side timing** — the six UI
 * logins are left exactly as they were. Session reuse across the browser tests was tried first and
 * rejected: it fixed test 11 but destabilised tests 7, 8 and 9, whose mount-time model-discovery
 * races are sensitive to how long the page takes to become interactive.
 *
 * **Budget now: 6 UI + 1 API = 7 of 10.** Adding three more logging-in tests will breach it again.
 */
async function pageLogin(page: Page): Promise<void> {
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', "tovu-dev");
  const loginResponse = page.waitForResponse((r) => r.url().includes("/auth/login"));
  await page.click('.login-card button:has-text("Sign in")');
  // Asserted explicitly so a rate-limited login can never again present as a mystery selector
  // timeout 15 seconds later.
  const status = (await loginResponse).status();
  expect(
    status,
    `login returned ${status}; 429 means this file has exceeded LOGIN_STRICT (10 logins / 60s) — `
      + `see the login-budget note above.`,
  ).toBe(200);
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
 * ports where one's decimal string is a literal prefix of the other's (e.g. `3600` / `36000`) —
 * an OS-assigned ephemeral port can't be arranged to have that relationship.
 *
 * **Choosing those ports is not free — see `assertPortIsDialable` below.** The original pair here
 * was `6000`/`60000`, and `6000` is on the WHATWG Fetch "bad port" list, which Node's global
 * `fetch` enforces. That made the prefix-port test structurally incapable of observing the thing
 * it is named for, for months, while looking like an ordinary assertion failure.
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

/**
 * Preflight: prove a fixed port is actually dialable by a Node `fetch` before asking the PRODUCT
 * to dial it.
 *
 * Root-caused 2026-08-05. This exists because of a specific, non-obvious failure mode that cost a
 * session: the model-discovery path in `@jini-ai/agent-runtime` (`model-catalog.ts`, `await fetch(url, …)`)
 * uses Node's GLOBAL `fetch`, not the same package's `pinnedFetch` (which dials via `node:http.request`
 * and is unaffected). Global `fetch` implements the WHATWG Fetch spec's "bad port" blocking: a request
 * to a port on that list becomes a network error BEFORE ANY SOCKET IS OPENED. Measured — deputy bound
 * on `127.0.0.1` in every case:
 *
 *     6000  -> fetch ERROR "bad port"   deputy hits = 0     (6000 is X11, on the list)
 *     60000 -> fetch 200                deputy hits = 1
 *     6100  -> fetch 200                deputy hits = 1
 *
 * A blocked port therefore presents EXACTLY as "the deputy received nothing" — indistinguishable at a
 * glance from "the guard blocked it", which is the conclusion a security test like the prefix-port case
 * below is most likely to be misread as having proved. This check converts that into a self-describing
 * failure naming the real cause. Other list members to avoid: 6566, 6665-6669, 6679, 6697, 10080.
 */
/**
 * Fill the BYOK API-key field and **wait for the form's own state to have committed it** before the
 * caller edits anything else.
 *
 * Root-caused 2026-08-05. `ExecutionTab.tsx`'s model-discovery effect lists only `config.byok.baseUrl`
 * as a dependency but reads `apiKey` FRESH at fire time (this is the MSG-1 mechanism the KNOWN-BAD
 * battery below pins). The consequence for a test: a Base URL edit that beats React's commit of the
 * key fires exactly one discovery request carrying an **empty** key — and then never re-fires for
 * that URL, because the key is not a dependency. The server short-circuits an empty key before any
 * outbound call (`model-catalog.ts:337`, `PROTOCOLS_REQUIRING_API_KEY`), so the deputy is never
 * dialed and the test reads as "the listener saw nothing".
 *
 * Observed twice, both on runs where an earlier test had timed out and slowed the page: test 9 failed
 * with `x-api-key: undefined`, and test 8 with `apiKey: ""` captured on the wire.
 *
 * The readiness signal is the "Save key" button's enabled state, which `AdminByokKeyPanel.tsx` derives
 * from `canSaveKey` — i.e. from React state, not from the DOM value `fill()` just wrote. That makes
 * this a real condition to wait on rather than a hard wait.
 */
async function fillApiKeyAndAwaitCommit(page: Page, key: string): Promise<void> {
  await page.locator(".jini-byok-card .jini-field-input-row input").fill(key);
  await expect(page.locator('.assistant-key-footer button:has-text("Save key")')).toBeEnabled({
    timeout: 15_000,
  });
}

async function assertPortIsDialable(port: number): Promise<void> {
  const outcome = await fetch(`http://localhost:${port}/__preflight`)
    .then(() => "dialable")
    .catch((error: unknown) => {
      const cause = (error as { cause?: { message?: string } }).cause?.message;
      return `NOT dialable: ${cause ?? (error as Error).message}`;
    });
  expect(
    outcome,
    `Port ${port} could not be dialed by Node's global fetch, so this test cannot observe the `
      + `product reaching it — the result would be a meaningless zero. If this says "bad port", the `
      + `port is on the WHATWG Fetch blocked list; pick a different one.`,
  ).toBe("dialable");
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
    await page.getByRole("tab", { name: "Anthropic", exact: true }).click();

    await page.locator('.jini-byok-card .jini-field-input-row input').fill("   \t\t   ");
    await setByokModel(page, "claude-sonnet-4-5");
    // `missingRequiredFields` (`@jini-ai/ui/features/execution/rules.ts`) checks
    // `config.apiKey.trim()` — a whitespace-only key must read as "missing", same as empty.
    await expect(page.locator('button:has-text("Test connection")')).toBeDisabled();
  });

  test("a Gemini key containing &, #, ?, %, +, and a raw newline never injects a second query parameter — it round-trips as one encoded value", async () => {
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [] }));
    });

    try {
      const nastyKey = "realkey&malicious=1&admin=true#frag?q=1%25encoded+plus\nnewline";
      const res = await sharedApi.post(MODELS_PATH, {
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

  test("an API key with leading/trailing whitespace is sent to the provider BYTE-FOR-BYTE — no client or server-side trim", async () => {
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    });

    try {
      const untrimmedKey = "  sk-test-PADDED-KEY-FAKE-NOT-REAL  ";

      /**
       * Channel 1 — Google's query-string path, which is the ONLY one of the two that can carry
       * the padding intact.
       *
       * This test originally asserted the whole padded key on `openai`'s `authorization` header,
       * on the stated premise that "HTTP header VALUES may carry leading/trailing spaces without
       * being folded". **That premise is false** (root-caused 2026-08-05). RFC 7230 requires a
       * RECIPIENT to strip leading and trailing optional whitespace from a header field value, and
       * Node's llhttp does exactly that, so a `node:http` deputy can never see the trailing spaces
       * no matter what the product sent. Measured against a bare `node:http` server, Tovu not
       * involved at all:
       *
       *     SENT  authorization = "Bearer   sk-test-PADDED-KEY-FAKE-NOT-REAL  "
       *     RECVD authorization = "Bearer   sk-test-PADDED-KEY-FAKE-NOT-REAL"
       *     RECVD x-api-key     = "sk-test-PADDED-KEY-FAKE-NOT-REAL"
       *
       * (Note `x-api-key`: with the padded key as the WHOLE field value, both ends are stripped.
       * On `authorization` the leading spaces survive only because `Bearer ` precedes them, which
       * makes them interior bytes rather than leading OWS.)
       *
       * `googleProviderModelsUrl` percent-encodes the key into the URL via
       * `url.searchParams.set('key', apiKey)`, and the padding survives that round trip exactly —
       * the same machinery the `&`/`#`/`?`/`%`/`+`/newline case above already proves. So the
       * byte-for-byte property is asserted here, where it is genuinely observable.
       */
      const googleDeputy = await startDeputy((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
      });
      try {
        const googleRes = await sharedApi.post(MODELS_PATH, {
          data: {
            protocol: "google",
            baseUrl: `http://127.0.0.1:${googleDeputy.port}`,
            apiKey: untrimmedKey,
          },
        });
        expect(googleRes.status()).toBe(200);
        expect(googleDeputy.hits()).toBe(1);
        // Documents an observed footgun, not a security hole: an operator who pastes a key with
        // accidental whitespace gets a byte-for-byte broken credential rather than a silently
        // corrected one — `missingRequiredFields`'s `.trim()` check only decides whether the field
        // counts as "filled", it never trims the value that is actually SENT. Same for the server:
        // `list-models.ts`'s `.trim()` appears only in a presence test, never assigned back.
        const receivedUrl = new URL(`http://x${googleDeputy.lastUrl()}`);
        expect(receivedUrl.searchParams.get("key")).toBe(untrimmedKey);
      } finally {
        await googleDeputy.close();
      }

      /**
       * Channel 2 — `openai`'s header path (`providerModelsHeaders`: `authorization: Bearer ${apiKey}`)
       * is a genuinely different code path, so it is still worth pinning; it is just asserted to
       * the limit of what the channel can actually show. The trailing OWS is stripped by the
       * receiving parser (above), so it is excluded here EXPLICITLY rather than silently — and the
       * leading padding, which does survive as interior bytes, is asserted in full. If the product
       * ever starts trimming, those leading spaces disappear and this fails.
       */
      const res = await sharedApi.post(MODELS_PATH, {
        data: { protocol: "openai", baseUrl: `http://127.0.0.1:${deputy.port}`, apiKey: untrimmedKey },
      });
      expect(res.status()).toBe(200);
      expect(deputy.hits()).toBe(1);
      const trailingStrippedByHttpFraming = untrimmedKey.replace(/\s+$/, "");
      expect(deputy.lastHeaders()?.authorization).toBe(`Bearer ${trailingStrippedByHttpFraming}`);
    } finally {
      await deputy.close();
    }
  });

  test("a key containing CRLF never achieves header injection, and the route degrades to ok:false rather than a 500", async () => {
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    });

    try {
      const crlfKey = "sk-test-CRLF-FAKE\r\nX-Injected-Header: evil\r\nSecond-Line: also-evil";
      const res = await sharedApi.post(MODELS_PATH, {
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

  test("a 10,000-character API key does not hang or crash discovery or test-connection", async () => {
    const deputy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "deputy-model", object: "model" }] }));
    });

    try {
      const hugeKey = "k".repeat(10_000);
      const start = Date.now();
      const res = await sharedApi.post(MODELS_PATH, {
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

  test("redactSecrets scrubs the real API key out of an upstream error that echoes it back — both the non-2xx and the 2xx-bad-reply branches", async () => {
    const canaryKey = "sk-test-ECHO-CANARY-9f3a7c";

    // Branch 1: model-catalog.ts's `!response.ok` path — a misbehaving/hostile endpoint reflects
    // the caller's own Authorization header back in a 401 error body.
    const deputy401 = await startDeputy((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Invalid credentials: ${req.headers.authorization}` } }));
    });
    try {
      const res = await sharedApi.post(MODELS_PATH, {
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
      const res = await sharedApi.post(TEST_CONN_PATH, {
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
      // deputy below.
      //
      // **The non-empty list used to be justified backwards here.** The previous comment claimed an
      // EMPTY `models` array was the thing that "strips the `list=\"jini-byok-model-options\"`
      // attribute this file's model-field selector depends on". As of `ByokProviderForm`'s
      // `3b5d648d` refactor the opposite holds: `showModelPicker = liveModels.length > 0`, so a
      // NON-empty list is what replaces the plain `list=`-bearing input with a `SearchableModelSelect`
      // — and this stub is what produced it. That is what made this test spend 90s waiting on a field
      // that was on screen the whole time. It also made the test FLAKY rather than reliably broken:
      // before discovery resolves the plain input does render, so whichever side won the race decided
      // the result, and it could go green while asserting against a UI shape that no longer exists.
      //
      // The stub stays non-empty (its real job is keeping the request off the public internet); the
      // model field is now reached through `byok-model-field.ts`, which handles both shapes.
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

      await fillApiKeyAndAwaitCommit(page, canaryKey);
      await page.locator('label:has-text("Base URL") input').fill(`http://127.0.0.1:${deputy.port}`);
      await setByokModel(page, "gpt-4o");

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
/**
 * **Every browser test in this file pins its provider tab explicitly, and that is load-bearing.**
 *
 * Root-caused 2026-08-05 after test 9 failed in perfect correlation with test 7 across eleven runs —
 * test 9 failed on exactly the runs where test 7 timed out, and passed on exactly the runs where it
 * did not. The link is **cross-test state leakage through the SERVER-SIDE settings ledger**, not a
 * race: test 7 selects the OpenAI provider tab, and `useSettingsSlice`'s 600ms autosave persists that
 * choice for the workspace. Every later test that clicks only the "BYOK" tab then inherits OpenAI.
 * Test 7 timing out at 90s is simply what guarantees the debounce has time to land.
 *
 * The consequence was subtle enough to be worth spelling out: test 9's deputy WAS reached, and it DID
 * receive the live key — as `authorization: Bearer sk-ant-PORT-WALK-CANARY`, OpenAI's header shape,
 * so the `x-api-key` assertion read `undefined`. Observed directly:
 *
 *     REQ {"protocol":"openai","baseUrl":"http://localhost:3600","apiKey":"sk-ant-PORT-WALK-CANARY"}
 *     DEPUTY-PREFIX-HEADERS {... "authorization":"Bearer sk-ant-PORT-WALK-CANARY" ...}
 *
 * So the security property was TRUE and demonstrated the whole time; only the header NAME under
 * assertion was wrong for the inherited provider. Pinning the tab makes each test assert against the
 * provider it was actually written for — every canary in this battery is `sk-ant-…` — and restores
 * `e2e-test-architecture`'s "tests must pass in any order" property.
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
    await page.getByRole("tab", { name: "Anthropic", exact: true }).click();

    const canaryKey = "sk-ant-KEYSTROKE-LEAK-CANARY";
    await fillApiKeyAndAwaitCommit(page, canaryKey);

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
    // other's — `3600` sits inside `36000` — mirroring an operator pausing partway through typing
    // a port number and briefly landing on a DIFFERENT real local service.
    //
    // The pair is `3600`/`36000` and NOT the more obvious `6000`/`60000` because 6000 (X11) is on
    // the WHATWG Fetch blocked-port list — see `assertPortIsDialable`. Both of these are off that
    // list AND below macOS's ephemeral range (49152+), so neither can be transiently squatted by an
    // outbound connection from an unrelated process mid-run.
    const PREFIX_PORT = 3600;
    const FINAL_PORT = 36000;
    const echoAuth = (req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    };
    const deputyPrefix = await startFixedDeputy(PREFIX_PORT, echoAuth);
    const deputyFinal = await startFixedDeputy(FINAL_PORT, echoAuth);

    try {
      // Before trusting a "the deputy received nothing" reading, prove the deputy is reachable at
      // all. Without this, an unusable port and a genuinely blocked request are the same observation.
      await assertPortIsDialable(PREFIX_PORT);
      await assertPortIsDialable(FINAL_PORT);

      await pageLogin(page);
      await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
      // The Execution section is reached through the settings dialog's own left nav (a plain
      // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
      // this click the BYOK tab below is not mounted yet and the spec times out.
      await page.getByTestId("settings-dialog-nav-execution").click();
      await page.getByRole("tab", { name: "BYOK" }).click();
      await page.getByRole("tab", { name: "Anthropic", exact: true }).click();

      const canaryKey = "sk-ant-PORT-WALK-CANARY";
      await fillApiKeyAndAwaitCommit(page, canaryKey);

      const baseUrlInput = page.locator('label:has-text("Base URL") input');

      // KNOWN-BAD: the prefix-port listener — never the operator's intended endpoint, just a value
      // the field held for a moment — genuinely receives the real key over the wire (Anthropic's
      // header shape: `x-api-key`, `providerModelsHeaders` in `model-catalog.ts`).
      //
      // Polling the RECEIVED KEY rather than a hit COUNT is deliberate and load-bearing. A count is
      // satisfied by any request at all — including this file's own `assertPortIsDialable` preflight
      // — so it can go non-zero without the leak having happened. The header value can only become
      // `canaryKey` if the product actually shipped the live key to a host the operator never meant
      // to contact, which IS the property this test exists to pin. It is also the assertion that
      // flips the moment MSG-1 is fixed (debounce, or `apiKey` dropped from the discovery payload),
      // which is the "come re-evaluate this pin" signal the describe block's header describes.
      await baseUrlInput.fill(`http://localhost:${PREFIX_PORT}`);
      await expect.poll(() => deputyPrefix.lastHeaders()?.["x-api-key"]).toBe(canaryKey);

      await baseUrlInput.fill(`http://localhost:${FINAL_PORT}`);
      await expect.poll(() => deputyFinal.lastHeaders()?.["x-api-key"]).toBe(canaryKey);
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
      await page.getByRole("tab", { name: "Anthropic", exact: true }).click();

      await fillApiKeyAndAwaitCommit(page, canaryKey);
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
      await page.getByRole("tab", { name: "Anthropic", exact: true }).click();
      await fillApiKeyAndAwaitCommit(page, "sk-ant-RACE-CANARY");

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
