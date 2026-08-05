import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * @file BYOK hostile-provider adversarial battery (2026-08-04 dispatch, item #7).
 *
 * Attacks `@jini-ai/agent-runtime`'s `listProviderModels` (`model-catalog.ts`), reached
 * through Tovu's real `.../assistant/execution/models` route, with a MALICIOUS provider —
 * never a real one, never a stub of Tovu's own logic. Every scenario below is a real
 * `node:http` server this spec starts, owns, and points `baseUrl` at (loopback — allowed by
 * the SSRF guard by design, see `byok-ssrf-guard.spec.ts`), so what's measured is Tovu's
 * ACTUAL behavior against ACTUAL hostile bytes on the wire, not a mocked stand-in for them.
 * `protocol: 'openai'` throughout (its extractor, `extractOpenAiModels`, is the simplest of
 * the four live protocols and has no interfering behavior for these payloads — confirmed
 * against source: its only filter, `isOpenAiChatModelId`, blocklists substrings like
 * "embedding"/"image"/"tts", none of which collide with any payload used here).
 *
 * **Headline finding: no bypass, everything held.** Malformed/truncated JSON, an empty
 * catalog, HTTP 500/429, a hung/slow provider (12s hard timeout — `PROVIDER_MODELS_TIMEOUT_MS`
 * in `model-catalog.ts`), 10,000 models, a multi-MB body, and XSS-shaped model ids are all
 * either classified into a real, distinct, operator-legible `{ok:false, message}` or passed
 * through as inert data with no code execution and no hang. The one soft spot (not a
 * vulnerability): oversized/10k-model responses have NO cap anywhere in the pipeline — server
 * or client — so a hostile provider can force Tovu to hold and forward an arbitrarily large
 * catalog. Flagged in that block's own test, not fixed here.
 *
 * One login per `test()` for `request`-fixture blocks (LOGIN_STRICT rationale — see
 * `byok-ssrf-guard.spec.ts`'s header), one login per `test()` for page-driven blocks.
 */

const A2UI_LOGIN = { username: "admin", password: "tovu-dev" };
async function login(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
}
async function loginPage(page: Page): Promise<void> {
  await page.goto("/admin/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', "tovu-dev");
  await page.click('.login-card button:has-text("Sign in")');
  await page.waitForSelector(".login-card", { state: "detached", timeout: 15_000 });
}
async function gotoByok(page: Page): Promise<void> {
  await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
  // The Execution section is reached through the settings dialog's own left nav (a plain
  // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
  // this click the BYOK tab below is not mounted yet and the spec times out.
  await page.getByTestId("settings-dialog-nav-execution").click();
  await page.getByRole("tab", { name: "BYOK" }).click();
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
function modelsBody(baseUrl: string) {
  return { protocol: "openai", baseUrl, apiKey: "sk-hostile-test-FAKE-KEY-NOT-REAL" };
}

/** Starts a real local "hostile provider" this spec fully controls and owns. `handler` gets
 *  the raw request/response — every scenario below crafts its own response shape directly,
 *  nothing is pre-interpreted. */
async function startDeputy(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe("malformed / truncated / empty response bodies", () => {
  test("malformed JSON, a truncated body, and a valid-but-empty model array each get a distinct, legible failure — never a crash or a raw parser exception", async ({
    request,
  }) => {
    await login(request);

    // Malformed JSON: not even close to valid — `JSON.parse` throws, caught, and reported as
    // its own `parseError` detail (truncated to 240 chars), never an uncaught 500.
    const malformed = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{this is not json at all <<<>>>");
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(malformed.baseUrl) });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.models).toEqual([]);
      // The exact V8 JSON.parse error text, not a generic "bad response" — legible to
      // whoever's debugging, not a leaked stack trace either.
      expect(body.message).toMatch(/JSON|Unexpected token|not valid/i);
    } finally {
      await malformed.close();
    }

    // Truncated: a real-shaped OpenAI catalog envelope cut off mid-object. Same JSON.parse
    // failure path as above — the point of a SEPARATE case is proving the app doesn't try
    // anything cleverer (partial-parse, best-effort recovery) that could silently drop or
    // corrupt data; it fails closed like any other malformed body.
    const truncated = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"data":[{"id":"gpt-4o","object":"mod');
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(truncated.baseUrl) });
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.models).toEqual([]);
    } finally {
      await truncated.close();
    }

    // Valid, well-formed, genuinely empty: `{"data":[]}` is not an error at the transport or
    // parse level — the provider is behaving correctly and truthfully reporting zero models.
    // Classified as `ok:false, kind:'no_models'` (a real, distinct case, not folded into a
    // generic error) with its own message, matching `model-catalog.ts`'s own contract.
    const empty = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(empty.baseUrl) });
      const body = await res.json();
      expect(body).toEqual({ ok: false, models: [], message: "Provider returned no usable text-generation models." });
    } finally {
      await empty.close();
    }
  });
});

test.describe("HTTP error statuses", () => {
  test("500 and 429 are classified into distinct, correct kinds with the provider's own error text carried through", async ({
    request,
  }) => {
    await login(request);

    const serverError = await startDeputy((_req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "internal provider explosion" } }));
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(serverError.baseUrl) });
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.message).toBe("internal provider explosion");
    } finally {
      await serverError.close();
    }

    const rateLimited = await startDeputy((_req, res) => {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rate limit exceeded, slow down" } }));
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(rateLimited.baseUrl) });
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.message).toBe("rate limit exceeded, slow down");
    } finally {
      await rateLimited.close();
    }
  });
});

test.describe("hung / slow providers — the 12s hard timeout actually fires", () => {
  test("a response that never arrives, and one that arrives 1s after the timeout, both abort at the 12s ceiling instead of hanging forever", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    await login(request);

    // Never responds at all: holds the connection open, writes nothing, never calls `.end()`.
    const neverStart = Date.now();
    const never = await startDeputy((_req, _res) => {
      /* deliberately never respond */
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(never.baseUrl) });
      const elapsedMs = Date.now() - neverStart;
      const body = await res.json();
      expect(body.ok).toBe(false);
      // Aborted, not "eventually gave up some other way" — the real signal that
      // `PROVIDER_MODELS_TIMEOUT_MS`'s `AbortController` actually fired.
      expect(body.message).toMatch(/abort/i);
      // Bounded near the 12s ceiling, not left open indefinitely and not suspiciously instant
      // (which would mean some OTHER guard rejected it before ever reaching the timeout path).
      expect(elapsedMs).toBeGreaterThan(11_000);
      expect(elapsedMs).toBeLessThan(16_000);
    } finally {
      await never.close();
    }

    // Slow: DOES eventually respond with a perfectly valid body — 1 full second past the 12s
    // ceiling. Proves the timeout is enforced on its own clock, not "whichever comes first, a
    // real response or 12s" with some slack for an almost-there provider.
    const slowStart = Date.now();
    const slow = await startDeputy((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "gpt-4o", object: "model" }] }));
      }, 13_000);
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(slow.baseUrl) });
      const elapsedMs = Date.now() - slowStart;
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.message).toMatch(/abort/i);
      expect(elapsedMs).toBeLessThan(16_000);
    } finally {
      await slow.close();
    }
  });
});

test.describe("volume attacks: an oversized body and 10,000 models — the soft spot", () => {
  test("a multi-MB body and a 10,000-model catalog are both accepted and forwarded whole — NO size or count cap anywhere in the pipeline (flagged, not fixed)", async ({
    request,
  }) => {
    test.setTimeout(45_000);
    await login(request);

    // ~6MB of padding inside a single model's `id` string — still technically one "model", but
    // proves an oversized BODY (not just a long list) is read to completion and parsed rather
    // than rejected or truncated at any layer.
    const bigPayload = "A".repeat(6 * 1024 * 1024);
    const oversized = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: `gpt-4o-${bigPayload}`, object: "model" }] }));
    });
    try {
      const res = await request.post(MODELS_PATH, { data: modelsBody(oversized.baseUrl) });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.models).toHaveLength(1);
      expect(body.models[0].length).toBeGreaterThan(6 * 1024 * 1024);
    } finally {
      await oversized.close();
    }

    // 10,000 distinct models: no server-side cap truncates this before it reaches the browser.
    const many = Array.from({ length: 10_000 }, (_, i) => ({ id: `hostile-model-${i}`, object: "model" }));
    const flood = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: many }));
    });
    try {
      const start = Date.now();
      const res = await request.post(MODELS_PATH, { data: modelsBody(flood.baseUrl) });
      const elapsedMs = Date.now() - start;
      const body = await res.json();
      expect(body.ok).toBe(true);
      // The measured fact this test exists to pin: ALL 10,000 come back, unbounded. A future
      // fix that caps this (a real, reasonable hardening) would fail this assertion — that's
      // the intended tripwire, not a claim that 10,000 is a correct or desired behavior.
      expect(body.models).toHaveLength(10_000);
      expect(elapsedMs).toBeLessThan(20_000);
    } finally {
      await flood.close();
    }
  });
});

test.describe("the real operator path in the browser: does the UI hang, stay usable, and recover", () => {
  test("a malformed response shows a clear error without wedging the form, and a subsequent Test Connection against a healthy deputy recovers it", async ({
    page,
  }) => {
    await loginPage(page);

    const malformed = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{not json");
    });
    try {
      await gotoByok(page);
      // Default protocol is Anthropic; switch to OpenAI (the protocol every deputy in this
      // file speaks) and point its baseUrl at the hostile deputy.
      await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
      await page.locator('label:has-text("Base URL") input').fill(malformed.baseUrl);
      await expect(page.locator(".jini-field-hint.is-error[role='status']")).toBeVisible({ timeout: 10_000 });

      // The form stays fully interactive while that error is showing — a hostile response
      // must not disable or freeze anything else on the page.
      const apiKeyInput = page.locator('.jini-byok-card .jini-field-input-row input');
      await apiKeyInput.fill("sk-openai-test-FAKE-KEY-NOT-REAL");
      await expect(apiKeyInput).toHaveValue("sk-openai-test-FAKE-KEY-NOT-REAL");
      const modelInput = page.locator(".jini-byok-card .jini-field").last().locator("input");
      await modelInput.fill("gpt-4o");
      await expect(page.locator('button:has-text("Test connection")')).toBeEnabled();
    } finally {
      await malformed.close();
    }

    // Recovery: swap in a well-behaved deputy at the SAME baseUrl port is not possible (ports
    // differ), so instead point at a fresh healthy deputy and click Test Connection — this is
    // exactly `byok-model-discovery-self-heal.spec.ts`'s own proven re-fire mechanism, now
    // proven to also clear a HOSTILE-origin error, not just a benign one.
    const healthy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "gpt-4o", object: "model" }] }));
    });
    try {
      await page.locator('label:has-text("Base URL") input').fill(healthy.baseUrl);
      await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveCount(0, { timeout: 10_000 });
    } finally {
      await healthy.close();
    }
  });
});

test.describe("10,000 models rendered in the real browser: no hang", () => {
  test("the datalist renders all 10,000 options and the page stays interactive within a bounded time", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await loginPage(page);

    const many = Array.from({ length: 10_000 }, (_, i) => ({ id: `flood-model-${i}`, object: "model" }));
    const flood = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: many }));
    });
    try {
      await gotoByok(page);
      await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
      const start = Date.now();
      await page.locator('label:has-text("Base URL") input').fill(flood.baseUrl);

      const modelInput = page.locator(".jini-byok-card .jini-field").last().locator("input");
      // `list` only appears once discovery succeeds — its presence alone proves the 10k-item
      // response was fully processed and reached the form, not stuck/dropped mid-flight.
      await expect(modelInput).toHaveAttribute("list", "jini-byok-model-options", { timeout: 20_000 });
      const optionCount = await page.evaluate(
        () => document.getElementById("jini-byok-model-options")?.querySelectorAll("option").length ?? 0,
      );
      const elapsedMs = Date.now() - start;
      expect(optionCount).toBe(10_000); // uncapped — see the API-level test's own flag on this
      expect(elapsedMs).toBeLessThan(20_000);

      // The page is still responsive after rendering 10,000 DOM nodes — proves "doesn't hang",
      // not just "eventually finishes": a real keystroke into an unrelated field still lands.
      const apiKeyInput = page.locator('.jini-byok-card .jini-field-input-row input');
      await apiKeyInput.fill("sk-openai-test-FAKE-KEY-NOT-REAL");
      await expect(apiKeyInput).toHaveValue("sk-openai-test-FAKE-KEY-NOT-REAL");
    } finally {
      await flood.close();
    }
  });
});

test.describe("XSS in model ids — highest severity item in this file", () => {
  test("a model id containing a live <img onerror> payload renders as inert text/attribute value; it never executes", async ({
    page,
  }) => {
    await loginPage(page);

    let dialogFired = false;
    page.on("dialog", async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    // A classic, unambiguous execution proof: if this ever renders as real markup instead of
    // text/an attribute value, `onerror` fires because `src=x` is never a loadable image.
    const XSS_PAYLOAD = '<img src=x onerror="window.__xssFired = true">';
    const hostile = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: XSS_PAYLOAD, object: "model" }, { id: "gpt-4o", object: "model" }] }));
    });
    try {
      await gotoByok(page);
      await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
      await page.locator('label:has-text("Base URL") input').fill(hostile.baseUrl);

      const modelInput = page.locator(".jini-byok-card .jini-field").last().locator("input");
      await expect(modelInput).toHaveAttribute("list", "jini-byok-model-options", { timeout: 10_000 });

      // The measured facts, not an inference: no `<img>` element with `src="x"` exists
      // anywhere in the live DOM (it would if the payload had been parsed as HTML instead of
      // set as a DOM property/attribute value), and the page-global marker the payload's own
      // `onerror` would have set was never set.
      const imgExists = await page.evaluate(() => document.querySelectorAll('img[src="x"]').length);
      expect(imgExists).toBe(0);
      const xssFired = await page.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
      expect(xssFired).toBeUndefined();
      expect(dialogFired).toBe(false);
      expect(consoleErrors).toEqual([]);

      // The payload DID reach the DOM — as the literal, inert string value of a real
      // `<option>` — proving this isn't a false negative from the model being filtered out or
      // discovery failing silently.
      const optionValues = await page.evaluate(() => {
        const dl = document.getElementById("jini-byok-model-options");
        return dl ? Array.from(dl.querySelectorAll("option")).map((o) => o.getAttribute("value")) : null;
      });
      expect(optionValues).toContain(XSS_PAYLOAD);
    } finally {
      await hostile.close();
    }
  });
});
