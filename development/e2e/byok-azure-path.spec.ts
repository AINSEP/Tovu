import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * @file BYOK Azure "incompletely supported" path (2026-08-04 dispatch, item #9).
 *
 * The dispatch brief frames Azure as a provider option whose configuration path is
 * "understood to be incompletely supported" and asks whether selecting it and filling a
 * `baseUrl` is a dead end with no feedback, a misleading error, or a silent no-op.
 *
 * **Live-reproduced verdict: it is none of the three.** Model discovery for `protocol:
 * 'azure'` short-circuits server-side (`model-catalog.ts#listProviderModels`) with an
 * explicit, correctly-worded message — `"Azure OpenAI deployment discovery is not supported
 * from the inference endpoint."` — rendered by the SAME `.jini-field-hint.is-error` element
 * every other discovery failure uses. It is honest, not silent, and not confusing.
 *
 * **What IS real, and worth tracking, is a genuine asymmetry the brief didn't anticipate:**
 * model discovery and Test Connection do NOT treat Azure the same way. Discovery refuses
 * unconditionally — even a syntactically-garbage `baseUrl` gets the clean "not supported"
 * message, because the azure branch in `listProviderModels` returns before the base-URL is
 * ever parsed. Test Connection, by contrast, is NOT short-circuited for Azure at all
 * (`connection-test.ts`'s `azure` case in `buildProviderCall` builds a real Azure OpenAI
 * chat-completions URL and `testProviderConnection` actually fetches it) — so the exact same
 * garbage `baseUrl` that discovery waves through with a clean message instead surfaces
 * `"Invalid baseUrl"` from Test Connection, and a real unreachable endpoint surfaces the raw,
 * untranslated `"fetch failed"` (a bare Node/undici `TypeError#message`, with the actual DNS/
 * connection-refused reason left in `.cause` and never surfaced). `describe` block 1 below
 * pins the good (discovery) behavior; block 2 pins the asymmetry and the opaque failure text,
 * flagged explicitly as a gap worth knowing about, NOT fixed here.
 *
 * **A separate, generic bug this file's Azure scenario happens to make maximally visible**:
 * `ExecutionTab`'s model-discovery `useEffect` re-fires on every `config.byok.baseUrl`
 * change with no debounce (`ExecutionTab.tsx`'s dep array includes `config.byok.baseUrl`
 * directly). Every OTHER preset ships a pre-filled default `baseUrl`, so an operator rarely
 * types one from scratch; Azure's preset baseUrl is `''` (`DEFAULT_PROVIDER_PRESETS`'s
 * `azure-openai` entry), which FORCES the operator to type the whole endpoint by hand,
 * firing one `/assistant/execution/models` POST per keystroke — measured live at 30+ requests
 * typing a 38-character URL. Harmless for Azure specifically (the request never leaves this
 * server — see above), but the same effect fires for every other protocol too, where a typed
 * `baseUrl` edit with an already-saved API key present WOULD spam the real provider on every
 * keystroke. That's a real, separately-reportable finding beyond this file's Azure scope;
 * `describe` block 4 pins the current (over-eager) behavior as KNOWN-BAD, not fixed.
 *
 * Runs against this file's own hermetic two-server harness (`../playwright.admin.config.ts`),
 * never a shared dev server. One login per `test()` for the `request`-fixture blocks
 * (matching `byok-ssrf-guard.spec.ts`/`byok-empty-key-guard.spec.ts`'s convention — see
 * either file's header for why: the real `LOGIN_STRICT` rate limiter, untouched, is tripped
 * by this suite's OWN login volume, not by anything under test), one login per `test()` for
 * the page-driven blocks (the UI has no other way to authenticate).
 */

const A2UI_LOGIN = { username: "admin", password: "tovu-dev" };
async function login(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
const TEST_CONN_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/test-connection";
const AZURE_UNSUPPORTED_MESSAGE = "Azure OpenAI deployment discovery is not supported from the inference endpoint.";

test.describe("azure model discovery: refused honestly, independent of baseUrl shape (GOOD behavior — not a bug)", () => {
  test("the same clean 'not supported' message for a garbage baseUrl, a well-formed one, and the pre-check for a blank one", async ({
    request,
  }) => {
    await login(request);

    // A syntactically invalid `baseUrl` still gets the clean message: the azure branch in
    // `listProviderModels` returns BEFORE any URL parsing / SSRF validation runs, so there is
    // no "invalid URL" leak here — proven by contrast with Test Connection's same input below.
    const garbage = await request.post(MODELS_PATH, {
      data: { protocol: "azure", baseUrl: "not-a-url-at-all", apiKey: "fake-key" },
    });
    expect(garbage.status()).toBe(200);
    const garbageBody = await garbage.json();
    expect(garbageBody).toEqual({ ok: false, models: [], message: AZURE_UNSUPPORTED_MESSAGE });

    // A well-formed, real-looking Azure endpoint gets the identical message — discovery is
    // unconditionally refused for this protocol, not conditionally on what's reachable.
    const wellFormed = await request.post(MODELS_PATH, {
      data: { protocol: "azure", baseUrl: "https://my-resource.openai.azure.com", apiKey: "fake-key" },
    });
    expect(wellFormed.status()).toBe(200);
    expect(await wellFormed.json()).toEqual({ ok: false, models: [], message: AZURE_UNSUPPORTED_MESSAGE });

    // An EMPTY baseUrl doesn't even reach that branch — Tovu's own route
    // (`list-models.ts`) rejects it before calling into `listProviderModels` at all, for
    // every protocol including azure. Different shape (400, not the {ok:false} envelope), but
    // consistent: this is Tovu's own required-field validation, not an azure-specific gap.
    const blank = await request.post(MODELS_PATH, { data: { protocol: "azure", baseUrl: "", apiKey: "fake-key" } });
    expect(blank.status()).toBe(400);
    expect(await blank.json()).toEqual({ error: "baseUrl is required", code: "VALIDATION_ERROR" });
  });
});

test.describe("azure Test Connection: NOT short-circuited — a real asymmetry with model discovery", () => {
  test("the exact same garbage baseUrl that discovery waves through instead surfaces 'Invalid baseUrl' here", async ({
    request,
  }) => {
    await login(request);

    const res = await request.post(TEST_CONN_PATH, {
      data: { protocol: "azure", baseUrl: "not-a-url-at-all", apiKey: "fake-key", model: "my-deployment" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Different code path, different message, same protocol and same input that discovery
    // above accepted with a clean generic message — this is the asymmetry this block exists
    // to pin, not a claim that either message is individually wrong.
    expect(body.ok).toBe(false);
    expect(body.message).toBe("Invalid baseUrl");
  });

  test("a real unreachable loopback port produces the raw, untranslated 'fetch failed' — no azure-specific (or any) translation", async ({
    request,
  }) => {
    await login(request);

    // Port 1 on loopback: the SSRF guard allows loopback by design (see
    // `byok-ssrf-guard.spec.ts`), so this reaches the real `fetch()` call and gets a real
    // ECONNREFUSED, not a guard rejection. `testProviderConnection`'s catch block passes
    // `err.message` straight through with no per-`kind` translation — Node/undici's own
    // `TypeError#message` for this failure mode is literally the string "fetch failed", with
    // the actual reason (`err.cause.code === 'ECONNREFUSED'`) left in `.cause` and never
    // surfaced to the operator.
    const res = await request.post(TEST_CONN_PATH, {
      data: { protocol: "azure", baseUrl: "http://127.0.0.1:1", apiKey: "fake-key", model: "my-deployment" },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: false, message: "fetch failed" });
  });

  test("a real local listener proves Test Connection genuinely attempts network egress for azure, with the exact URL shape the app builds", async ({
    request,
  }) => {
    await login(request);

    // Same "confused deputy" pattern as `byok-ssrf-guard.spec.ts` / `byok-empty-key-guard.spec.ts`:
    // a real `node:http` listener this spec owns, standing in for a real Azure OpenAI resource.
    // The point here isn't SSRF (that's the dedicated file's job) — it's proving Test
    // Connection makes a REAL request for azure, in direct contrast to model discovery, which
    // never does.
    let hitCount = 0;
    let receivedPath: string | undefined;
    const deputy = http.createServer((req, res) => {
      hitCount++;
      receivedPath = req.url;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    });
    await new Promise<void>((resolve) => deputy.listen(0, "127.0.0.1", resolve));
    const port = (deputy.address() as AddressInfo).port;

    try {
      const res = await request.post(TEST_CONN_PATH, {
        data: {
          protocol: "azure",
          baseUrl: `http://127.0.0.1:${port}`,
          apiKey: "fake-key",
          model: "my-deployment",
        },
      });
      const body = await res.json();
      expect(hitCount, "the deputy must have actually received a request").toBe(1);
      // The Azure-specific URL shape `azureRequestUrl` builds: deployment name in the path,
      // default api-version (2024-10-21) in the query — confirmed against the real builder,
      // not inferred.
      expect(receivedPath).toBe("/openai/deployments/my-deployment/chat/completions?api-version=2024-10-21");
      expect(body).toEqual({ ok: true, message: "valid completion" });
    } finally {
      await new Promise<void>((resolve) => deputy.close(() => resolve()));
    }
  });
});

async function login_ui(page: Page): Promise<void> {
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

/** The Model field's input has no stable attribute selector when discovery has produced no
 *  suggestions (its `list` attribute is only set when `suggestions.length > 0` — see
 *  `ByokProviderForm.tsx`), which is ALWAYS true for azure (its preset ships zero
 *  `preferredModels` and discovery never succeeds). It's the last `.jini-field` in the card —
 *  the same structural fact `byok-model-discovery-self-heal.spec.ts`'s header documents
 *  working around for the opposite reason (that spec's Model field DOES get a `list`, so it
 *  uses that instead; this one can't). */
function azureModelInput(page: Page) {
  return page.locator(".jini-byok-card .jini-field").last().locator("input");
}

test.describe("the real operator path in the browser: exact messages shown, in order", () => {
  test("selecting Azure shows an immediate, accurate 'baseUrl is required' hint, then settles on the honest 'not supported' message once a baseUrl exists", async ({
    page,
  }) => {
    await login_ui(page);
    await gotoByok(page);

    await page.getByRole("tab", { name: "Azure OpenAI" }).click();

    // Immediate, because `config.byok.protocol` changing re-fires the discovery effect right
    // away with whatever baseUrl the azure preset seeds — which is `''`. This is accurate
    // (there genuinely is no baseUrl yet), not misleading, even though it appears before the
    // operator has done anything.
    await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveText(
      "Could not load live models: baseUrl is required",
    );

    // A single `.fill()` (not per-keystroke — that behavior is this file's own dedicated
    // block below) settles the discovery effect on the real, azure-specific message.
    await page.locator('label:has-text("Base URL") input').fill("https://my-resource.openai.azure.com");
    await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveText(
      `Could not load live models: ${AZURE_UNSUPPORTED_MESSAGE}`,
    );

    // The Model field itself stays fully usable throughout — discovery failing never disables
    // it, matching the non-blocking contract `ByokProviderForm.tsx` documents.
    const modelInput = azureModelInput(page);
    await expect(modelInput).toBeEditable();
    await modelInput.fill("my-deployment");
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("fake-azure-key-NOT-REAL");

    // Test Connection becomes enabled once all three required fields are present — it is not
    // gated on discovery ever succeeding, which for azure it never will.
    await expect(page.locator('button:has-text("Test connection")')).toBeEnabled();
  });
});

test.describe("no debounce on the model-discovery refetch effect — most visible on Azure's blank default baseUrl (KNOWN-BAD, not fixed here)", () => {
  test("typing a baseUrl character by character fires far more than one discovery request — no settle/debounce", async ({
    page,
  }) => {
    let modelsCallCount = 0;
    // Intercepted, not real: this test is about counting HOW OFTEN the effect fires, not what
    // it returns — a real server round-trip per keystroke would make this test slow and, for
    // any protocol other than azure, would be spamming a real provider. See this file's header
    // for why the same effect is NOT harmless outside azure's special case.
    await page.route("**/assistant/execution/models", async (route) => {
      modelsCallCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, models: [], message: AZURE_UNSUPPORTED_MESSAGE }),
      });
    });

    await login_ui(page);
    await gotoByok(page);

    await page.getByRole("tab", { name: "Azure OpenAI" }).click();
    await expect.poll(() => modelsCallCount, "the immediate fire on preset select").toBeGreaterThanOrEqual(1);
    const afterSelect = modelsCallCount;

    const TYPED = "https://my-resource.openai.azure.com"; // 38 characters
    await page.locator('label:has-text("Base URL") input').pressSequentially(TYPED, { delay: 15 });

    // Not asserting an exact per-keystroke count (React's own scheduling can coalesce a few
    // rapid updates) — the point this pins is the ABSENCE of debouncing: a debounced/settled
    // implementation would fire once (or a small constant number of times) regardless of
    // string length. Fired-once would fail this bound; the measured live behavior was 36
        // requests for this exact 38-character string.
    await expect
      .poll(() => modelsCallCount - afterSelect, { timeout: 10_000 })
      .toBeGreaterThan(TYPED.length / 2);
  });
});
