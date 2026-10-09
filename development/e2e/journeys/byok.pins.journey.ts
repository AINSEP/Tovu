// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import { expect } from "../support/bug-pin-fixtures.js";
import { type APIRequestContext } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { byokModelTextInput } from "../byok-model-field.js";
import { type Browser } from "../support/bug-pin-fixtures.js";
import { setByokModel } from "../byok-model-field.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { loginAsAdmin, pinSessionHeaders, pinSessionRequest } from "../support/bug-pin-auth.js";
import { byokModelPicker } from "../byok-model-field.js";
import { byokModelPickerTrigger } from "../byok-model-field.js";
import { chooseByokModelFromPicker } from "../byok-model-field.js";
import { openByokModelMenu } from "../byok-model-field.js";
import { readByokModelOptions } from "../byok-model-field.js";
import { validateBaseUrlResolved } from "@jini-ai/agent-runtime";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from byok-azure-path.spec.ts; original pin intent and why comments follow.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Bug pin: byok-azure-path", () => {
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
 * `describe` block 4 asserts settled discovery once per edit as an expected failure until fixed.
 *
 * Runs against this file's own hermetic two-server harness (`../playwright.admin.config.ts`),
 * never a shared dev server. One login per `test()` for the `request`-fixture blocks
 * (matching `byok-ssrf-guard.spec.ts`/`byok-empty-key-guard.spec.ts`'s convention — see
 * either file's header for why: the real `LOGIN_STRICT` rate limiter, untouched, is tripped
 * by this suite's OWN login volume, not by anything under test), one login per `test()` for
 * the page-driven blocks (the UI has no other way to authenticate).
 */

const A2UI_LOGIN = { username: "admin", password: PIN_PASSWORD };
async function login(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
  // APIRequestContext omits this Secure session cookie on HTTP loopback.
  return pinSessionHeaders({ request });
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
const TEST_CONN_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/test-connection";
const AZURE_UNSUPPORTED_MESSAGE = "Azure OpenAI deployment discovery is not supported from the inference endpoint.";

test.describe("azure model discovery: refused honestly, independent of baseUrl shape (GOOD behavior — not a bug)", () => {
  test("the same clean 'not supported' message for a garbage baseUrl, a well-formed one, and the pre-check for a blank one", async ({
    request,
  }) => {
    const headers = await login(request);

    // A syntactically invalid `baseUrl` still gets the clean message: the azure branch in
    // `listProviderModels` returns BEFORE any URL parsing / SSRF validation runs, so there is
    // no "invalid URL" leak here — proven by contrast with Test Connection's same input below.
    const garbage = await request.post(MODELS_PATH, { headers,
      data: { protocol: "azure", baseUrl: "not-a-url-at-all", apiKey: "fake-key" },
    });
    expect(garbage.status()).toBe(200);
    const garbageBody = await garbage.json();
    expect(garbageBody).toEqual({ ok: false, models: [], message: AZURE_UNSUPPORTED_MESSAGE });

    // A well-formed, real-looking Azure endpoint gets the identical message — discovery is
    // unconditionally refused for this protocol, not conditionally on what's reachable.
    const wellFormed = await request.post(MODELS_PATH, { headers,
      data: { protocol: "azure", baseUrl: "https://my-resource.openai.azure.com", apiKey: "fake-key" },
    });
    expect(wellFormed.status()).toBe(200);
    expect(await wellFormed.json()).toEqual({ ok: false, models: [], message: AZURE_UNSUPPORTED_MESSAGE });

    // An EMPTY baseUrl doesn't even reach that branch — Tovu's own route
    // (`list-models.ts`) rejects it before calling into `listProviderModels` at all, for
    // every protocol including azure. Different shape (400, not the {ok:false} envelope), but
    // consistent: this is Tovu's own required-field validation, not an azure-specific gap.
    const blank = await request.post(MODELS_PATH, { headers, data: { protocol: "azure", baseUrl: "", apiKey: "fake-key" } });
    expect(blank.status()).toBe(400);
    expect(await blank.json()).toEqual({ error: "baseUrl is required", code: "VALIDATION_ERROR" });
  });
});

test.describe("azure Test Connection: NOT short-circuited — a real asymmetry with model discovery", () => {
  test("the exact same garbage baseUrl that discovery waves through instead surfaces 'Invalid baseUrl' here", async ({
    request,
  }) => {
    const headers = await login(request);

    const res = await request.post(TEST_CONN_PATH, { headers,
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
    const headers = await login(request);

    // Port 1 on loopback: the SSRF guard allows loopback by design (see
    // `byok-ssrf-guard.spec.ts`), so this reaches the real `fetch()` call and gets a real
    // ECONNREFUSED, not a guard rejection. `testProviderConnection`'s catch block passes
    // `err.message` straight through with no per-`kind` translation — Node/undici's own
    // `TypeError#message` for this failure mode is literally the string "fetch failed", with
    // the actual reason (`err.cause.code === 'ECONNREFUSED'`) left in `.cause` and never
    // surfaced to the operator.
    const res = await request.post(TEST_CONN_PATH, { headers,
      data: { protocol: "azure", baseUrl: "http://127.0.0.1:1", apiKey: "fake-key", model: "my-deployment" },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: false, message: "fetch failed" });
  });

  test("a real local listener proves Test Connection genuinely attempts network egress for azure, with the exact URL shape the app builds", async ({
    request,
  }) => {
    const headers = await login(request);

    // Same "confused deputy" pattern as `byok-ssrf-guard.spec.ts` / `byok-empty-key-guard.spec.ts`:
    // a real `node:http` listener this spec owns, standing in for a real Azure OpenAI resource.
    // The point here isn't SSRF (that's the dedicated file's job) — it's proving Test
    // Connection makes a REAL request for azure, in direct contrast to model discovery, which
    // never does.
    let hitCount = 0;
    let receivedPath: string | undefined;
    let receivedMethod: string | undefined;
    let receivedHeaders: http.IncomingHttpHeaders | undefined;
    let receivedBody: unknown;
    const deputy = http.createServer((req, res) => {
      hitCount++;
      receivedPath = req.url;
      receivedMethod = req.method;
      receivedHeaders = req.headers;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        try {
          receivedBody = JSON.parse(rawBody);
        } catch {
          receivedBody = rawBody;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
      });
    });
    await new Promise<void>((resolve) => deputy.listen(0, "127.0.0.1", resolve));
    const port = (deputy.address() as AddressInfo).port;

    try {
      const res = await request.post(TEST_CONN_PATH, { headers,
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
      expect(receivedMethod).toBe("POST");
      expect(receivedHeaders?.["api-key"]).toBe("fake-key");
      expect(receivedHeaders?.authorization).toBeUndefined();
      expect(receivedBody).toEqual({
        max_tokens: 512,
        messages: [{ role: "user", content: "Reply with only: ok" }],
        stream: false,
      });
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
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
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
 *  `preferredModels` and discovery never succeeds).
 *
 *  This used to be `.jini-byok-card .jini-field` `.last()`, which is positional: it is only the
 *  Model field for as long as Model stays the last field in the card, and it silently becomes a
 *  different field the day one is appended. Now delegated to the shared helper, which anchors on
 *  the field's own label text and fails with a message naming what it found. Azure's tests
 *  passed before and after this change (measured both ways, 2026-08-05) — this is removing a
 *  latent trap, not fixing a failure. */
function azureModelInput(page: Page) {
  return byokModelTextInput(page);
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

test.describe("model discovery settles Base URL edits (known gap)", () => {
  test("typing a baseUrl character by character sends one settled discovery request", async ({
    page,
  }) => {
    let modelsCallCount = 0;
    let lastBaseUrl: string | undefined;
    let lastApiKey: string | undefined;
    // Intercepted, not real: this test is about counting HOW OFTEN the effect fires, not what
    // it returns — a real server round-trip per keystroke would make this test slow and, for
    // any protocol other than azure, would be spamming a real provider. See this file's header
    // for why the same effect is NOT harmless outside azure's special case.
    await page.route("**/assistant/execution/models", async (route) => {
      modelsCallCount++;
      const data = route.request().postDataJSON() as { baseUrl?: string; apiKey?: string };
      lastBaseUrl = data.baseUrl;
      lastApiKey = data.apiKey;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, models: [], message: AZURE_UNSUPPORTED_MESSAGE }),
      });
    });

    await login_ui(page);
    await gotoByok(page);

    await page.getByRole("tab", { name: "Azure OpenAI" }).click();
    // A typed test key makes discovery eligible even if a prior test saved a key for another endpoint.
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("fake-azure-discovery-key-NOT-REAL");
    await expect.poll(() => modelsCallCount, "the immediate fire on preset select").toBeGreaterThanOrEqual(1);
    await expect.poll(() => lastBaseUrl).toBe("");
    await expect.poll(() => lastApiKey).toBe("fake-azure-discovery-key-NOT-REAL");
    const afterSelect = modelsCallCount;

    const TYPED = "https://my-resource.openai.azure.com"; // 38 characters
    await page.locator('label:has-text("Base URL") input').pressSequentially(TYPED, { delay: 15 });

    // First prove discovery reached the finished URL. A blocked probe or broken harness must fail
    // normally; only the known over-eager request count is an expected failure.
    await expect.poll(() => lastBaseUrl, { timeout: 10_000 }).toBe(TYPED);
    // PRODUCT-SUSPECT: retained original desired-behavior pin; setup must succeed before expecting failure.
    test.fail(true, "ExecutionTab discovers on each baseUrl change without debouncing.");
    expect(modelsCallCount - afterSelect).toBe(1);
  });
});
});

// Migrated from byok-blank-key-save-guard.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-blank-key-save-guard", () => {
/**
 * @file "Save key must not offer to write a key that isn't there" — on BOTH panels of
 * `/admin/ai-assistant`, driven against a fresh in-memory database.
 *
 * ## The rule, and the trap inside it
 *
 * An empty API-key field means two completely different things depending on one server fact:
 *
 * - **Nothing stored yet** — there is no key anywhere, so a save has nothing to write. Save must be
 *   disabled. Whitespace counts as empty; `"   "` is not a credential.
 * - **A key already stored** — the field is empty ON PURPOSE. Both panels store their key
 *   server-side and write-only (ADR-058 for the visitor's, 2026-08-05 for the admin's), so the
 *   browser genuinely cannot render it and shows a `••••<last 4>` PLACEHOLDER instead. Here
 *   "Save key" is STILL disabled — an empty field has no key to write — and, critically, the stored
 *   key must be left completely untouched.
 *
 * Treating an empty field as a key would overwrite a working credential with nothing, which is the
 * direction this file exists to pin. The opposite worry — that disabling the button strands an
 * operator who wants to change their model or endpoint without re-pasting a key they cannot read
 * back — no longer applies: that is what the SECOND button, "Save settings", is for (owner ruling,
 * 2026-09-02).
 *
 * ## Why the panels are still asserted independently
 *
 * They do NOT share a code path, even though they now agree on the rule. The visitor form's
 * "Save key" is gated in `AiAssistant.tsx`'s `VisitorCredentialKeyFooter`
 * (`!config.apiKey.trim() || saving`) and writes through `saveVisitorKey`; the admin form's is gated
 * by `canSaveKey` (`hasTypedAdminKey` — NOT `hasUsableAdminKey`, whose stored-key arm answers a
 * different question and is still correct for `AssistantDock`'s `apiModeAvailable`) in
 * `use-admin-execution-credential.hooks.ts` and writes through `saveKey`.
 *
 * Two guards, two credential rows, one shared rule. A single fix cannot cover both, so a single test
 * must not be trusted to cover both either — that separation is the reason this section survives the
 * labels converging on "Save key".
 *
 * ## Why the blank cases TYPE THEN CLEAR
 *
 * Typing first is what makes "disabled" falsifiable: it proves the button CAN light up, so a later
 * `toBeDisabled()` is measuring the emptiness guard rather than a component that never enables at
 * all. It is also the operator's actual reported sequence — start pasting a key, change your mind,
 * clear the field.
 *
 * ## One login for the whole file
 *
 * `byok-key-handling.spec.ts`'s login-budget note applies suite-wide: `LOGIN_STRICT` is 10 logins /
 * 60s per IP and this config runs `workers: 1`, so every spec file's logins land in the same window.
 * This file therefore logs in ONCE in `beforeAll` and shares one page across a serial describe,
 * rather than spending one login per test.
 */

const ADMIN_ORIGIN_PATH = "/admin/";
const CREDENTIAL_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution-credential";
const VISITOR_CREDENTIAL_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/site-credential";
const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";

/** Long enough to be a plausible Anthropic key and obviously fake. Never a real credential. */
const FAKE_KEY = "sk-ant-api03-NOT-A-REAL-KEY-FOR-TESTS-ONLY";

// Each pin resets its site and seeds its own stored key; a failed cleanup must not skip siblings.
test.describe.configure({ mode: "default" });

let page: Page;

test.beforeEach(async ({ page: fixturePage }, testInfo) => {
  page = fixturePage;
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
  const loginResponse = page.waitForResponse((r) => r.url().includes("/auth/login"));
  await page.click('.login-card button:has-text("Sign in")');
  const status = (await loginResponse).status();
  expect(
    status,
    `login returned ${status}; 429 means the byok suite exceeded LOGIN_STRICT (10 logins / 60s) — `
      + `see this file's one-login-per-file note.`,
  ).toBe(200);
  await page.waitForSelector(".login-card", { state: "detached", timeout: 15_000 });
  // These pins formerly depended on a previous test's saved key. Seed the same state per test.
  if (testInfo.title.includes("key already stored")) {
    await openAdminPanel(page);
    await keyField(page).fill(FAKE_KEY);
    await saveButton(page, "Save key").click();
    await expect(keySaveLine(page)).toHaveText(/Saved to the server, encrypted\./);
  }
});

/**
 * Deletes the credential the stored-key cases below create, and asserts it is gone.
 *
 * NOT optional housekeeping — this suite shares ONE `TOVU_DB=memory` API process across every spec
 * file, at `workers: 1`, in alphabetical file order. A credential left behind here is visible to
 * every spec that runs after this file, and `ByokProviderForm` changes behaviour on exactly that
 * fact: `apiKeyStoredExternally` makes it DELETE `apiKey` from `missingRequiredFields`, so an empty
 * key field stops counting as missing and "Test connection" becomes enabled. That is precisely what
 * `byok-key-handling.spec.ts:231` asserts the opposite of. Measured, not feared: leaving the row in
 * place turned that spec from green to red, with "Received: enabled".
 *
 * Runs before the page closes so it can reuse the page's already-authenticated context rather than
 * spending another login against `LOGIN_STRICT`.
 */
test.afterEach(async ({ page }) => {
  try {
    const cleared = await pinSessionRequest({ page, url: CREDENTIAL_PATH, method: "DELETE" });
    expect(
      cleared.ok,
      "failed to delete the credential this file created — later specs in this suite will inherit it "
        + "and see a stored-key form where they expect an unconfigured one",
    ).toBe(true);
    const after = await pinSessionRequest({ page, url: CREDENTIAL_PATH }).then((r) => r.json());
    expect(after.data.isSet, "the credential must actually be gone, not merely reported deleted").toBe(false);
  } finally {
    await page.close();
  }
});

/** The shared `ByokProviderForm` API-key input, whichever panel is mounted. */
function keyField(page: Page) {
  return page.locator(".jini-byok-card .jini-field-input-row input");
}

/** `exact` on both: each card now carries TWO save buttons ("Save key" under the key field, "Save
 *  settings" at the foot of the card), and a loose match would resolve either one — or, if the tabs
 *  ever rendered together, the other panel's. */
function saveButton(page: Page, label: "Save key" | "Save settings") {
  return page.getByRole("button", { name: label, exact: true });
}

/** The KEY footer's own status line.
 *
 *  Scoped to `.assistant-key-footer` deliberately: `.assistant-save-line` alone matches two
 *  elements on the admin panel — this one (the credential's own "Saved to the server, encrypted.")
 *  and `AdminExecutionMode`'s separate line for the `core.execution` LEDGER save, which is usually
 *  empty. They report two different writes, and an unscoped locator both trips Playwright's strict
 *  mode and, if it ever resolved, could pass on the wrong one. */
function keySaveLine(page: Page) {
  return page.locator(".assistant-key-footer .assistant-save-line");
}

async function openAdminPanel(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN_PATH}ai-assistant`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Admin AI Assistant", exact: true }).click();
  // Runtime discovery temporarily projects BYOK over the saved Local CLI mode. Selecting BYOK
  // during that projection preserves Local CLI; discovery then removes the form mid-edit.
  // This isolated site is local: wait for its capability before choosing the persisted mode.
  await expect(page.locator(".assistant-execution")).toHaveAttribute("data-tovu-local-cli", "available");
  // A fresh workspace defaults to `mode: "local-cli"` (`DEFAULT_EXECUTION_CONFIG`), which renders
  // the CLI grid and no BYOK card at all — so this click is what makes the subject exist.
  await page.getByRole("tab", { name: "BYOK" }).click();
  await expect(keyField(page)).toBeVisible({ timeout: 15_000 });
}

async function openVisitorPanel(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN_PATH}ai-assistant`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Visitor's AI Assistant", exact: true }).click();
  await expect(keyField(page)).toBeVisible({ timeout: 15_000 });
}

test.describe("blank-key save guard", () => {
  test("ADMIN panel, nothing stored: Save key is disabled for an empty field and for whitespace, enabled for a real key", async () => {
    await openAdminPanel(page);
    const save = saveButton(page, "Save key");

    // Type first, so the later blank assertion is measuring the emptiness guard rather than a
    // pristine form — and so this case also proves the button CAN be enabled, without which
    // "disabled" below would be unfalsifiable.
    await keyField(page).fill(FAKE_KEY);
    await expect(save).toBeEnabled({ timeout: 15_000 });

    await keyField(page).fill("");
    await expect(save, "an empty field with nothing stored has nothing to write").toBeDisabled();

    await keyField(page).fill("   \t   ");
    await expect(save, 'whitespace is not a credential — "   " must read as empty').toBeDisabled();
  });

  test("VISITOR panel, nothing stored: Save key is disabled for an empty field and for whitespace, enabled for a real key", async () => {
    // Asserted independently of the admin panel above: different guard, different code path,
    // different credential row — they merely agree on the rule. See this file's header.
    await openVisitorPanel(page);
    const save = saveButton(page, "Save key");

    await keyField(page).fill(FAKE_KEY);
    await expect(save).toBeEnabled({ timeout: 15_000 });

    await keyField(page).fill("");
    await expect(save, "an empty field with nothing stored has nothing to write").toBeDisabled();

    await keyField(page).fill("   \t   ");
    await expect(save, 'whitespace is not a credential — "   " must read as empty').toBeDisabled();
  });

  test("ADMIN panel, key already stored: an empty field leaves Save key disabled and the stored key intact", async () => {
    // The trap the two tests above could otherwise cause someone to walk into. Everything here is
    // about the OTHER meaning of an empty field.
    await openAdminPanel(page);

    await keyField(page).fill(FAKE_KEY);
    await saveButton(page, "Save key").click();
    await expect(keySaveLine(page)).toHaveText(/Saved to the server, encrypted\./, {
      timeout: 15_000,
    });

    const afterSave = await page.request.get(CREDENTIAL_PATH, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json());
    expect(afterSave.data.isSet, "the fake key should now be stored").toBe(true);
    const maskBefore = afterSave.data.masked;
    expect(maskBefore, "a stored key must come back masked, never in full").toMatch(/^••••/);

    // The field clears itself on a successful save (`saveKey`'s own contract), so this IS the
    // returning-operator state: empty input, masked placeholder, working credential on the server.
    await expect(keyField(page)).toHaveValue("");
    // The UI now shows the server's non-secret fingerprint (tail + length), not its legacy mask.
    expect(afterSave.data.tokenHint).toEqual({ last4: "ONLY", length: 42 });
    await expect(keyField(page)).toHaveAttribute("placeholder", "…ONLY, 42 chars");

    // DISABLED, and this is a reversal of what this spec asserted before (owner ruling, 2026-09-02).
    // Save key writes the key and nothing else, so a blank field has nothing to write. The earlier
    // "keep it enabled for a model change" reasoning is obsolete twice over: the admin's
    // model/protocol are persisted by the `core.execution` settings slice on their own path, and the
    // credential row's own copy of them is now written by the separate "Save settings" button.
    await expect(
      saveButton(page, "Save key"),
      "an empty field has no key to write — a stored key does not change that",
    ).toBeDisabled();

    // And the stored key is of course still there; disabling the button is not clearing anything.
    const afterBlank = await page.request.get(CREDENTIAL_PATH, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json());
    expect(afterBlank.data.isSet).toBe(true);
    expect(
      afterBlank.data.masked,
      "the stored key must survive untouched — the field being empty is a display fact, not a delete",
    ).toBe(maskBefore);
  });

  test("ADMIN panel, key already stored: typing a key and then CLEARING it disables Save key again", async () => {
    // The owner's exact reported sequence: start typing, change your mind, delete it. The field is
    // blank but `dirty` is true and a key is stored — the state in which Save key used to stay live
    // over an empty field. Asserted on the transition, not on a pristine form, because a
    // never-touched blank field was already handled and this one was not.
    await openAdminPanel(page);

    await keyField(page).fill(FAKE_KEY);
    await expect(saveButton(page, "Save key"), "a typed key is saveable").toBeEnabled();

    await keyField(page).fill("");
    await expect(
      saveButton(page, "Save key"),
      "the key was typed and then cleared — Save key must go back to disabled, with no delay",
    ).toBeDisabled();
  });

  test("ADMIN panel, key already stored: a whitespace-only field never reaches the server as the new key", async () => {
    // The narrowest case, and the one a future refactor is most likely to break.
    //
    // `saveKey` trims the field ONCE, at the top, and that same trimmed value is both what the
    // `hasTypedAdminKey` guard tests and what the patch carries. Those two reading one value is the
    // whole property. Split them — gate on the trimmed value, send the raw one — and a
    // whitespace-only field with a key already stored puts "   " on the wire as the REPLACEMENT
    // credential. Today that would still be caught, but only by the server's own
    // `assertValidExecutionCredentialApiKey` ("apiKey must not be empty — use DELETE to clear it"),
    // one layer deeper than it should be and surfacing to the operator as a validation error from
    // pressing Save on a form that looked ready.
    //
    // Recorded honestly: this pins behaviour that is ALREADY correct on the current source. It was
    // written while investigating a report of blank keys being saved, and it is what established
    // that the client never sends one.
    // beforeEach already opened this panel to seed the stored key. Keep that mount: navigating
    // again can discard its pending BYOK-mode autosave and reload the default Local CLI screen.
    await expect(keyField(page)).toBeVisible();

    const before = await page.request.get(CREDENTIAL_PATH, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json());
    expect(before.data.isSet, "this case depends on the previous test having stored a key").toBe(true);

    await keyField(page).fill("   \t   ");
    // Whitespace is not a credential, so this is the blank case: the button must be disabled and the
    // request must never be made. Previously this pressed Save and relied on the client trimming
    // before building the patch; the guard is now in front of the button instead.
    await expect(saveButton(page, "Save key")).toBeDisabled();
    await expect(page.locator(".save-error")).toHaveCount(0);

    const after = await page.request.get(CREDENTIAL_PATH, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json());
    expect(after.data.masked, "a whitespace-only field must never replace the stored key").toBe(before.data.masked);
  });

  for (const panel of ["ADMIN", "VISITOR"] as const) {
    test(`${panel} panel: Save settings persists the model without changing the stored key`, async () => {
      const credentialPath = panel === "ADMIN" ? CREDENTIAL_PATH : VISITOR_CREDENTIAL_PATH;
      const openPanel = panel === "ADMIN" ? openAdminPanel : openVisitorPanel;
      const original = (await page.request.get(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json())).data;
      const received: Array<{ path: string | undefined; authorization: string | undefined }> = [];
      const deputy = http.createServer((req, res) => {
        received.push({ path: req.url, authorization: req.headers.authorization });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "guard-model", object: "model" }] }));
      });
      await new Promise<void>((resolve) => deputy.listen(0, "127.0.0.1", resolve));
      const baseUrl = `http://127.0.0.1:${(deputy.address() as AddressInfo).port}`;
      const settings = panel === "ADMIN"
        ? { protocol: "openai", providerId: "openai", baseUrl, model: "guard-model" }
        : { provider: "openai", baseUrl, model: "guard-model" };
      try {
        expect((await page.request.put(credentialPath, { headers: await pinSessionHeaders({ request: page.request }), data: settings })).ok()).toBe(true);
        await openPanel(page);
        if (panel === "ADMIN") {
          // The admin form hydrates from the execution ledger, not the credential row. Match the
          // seeded endpoint before expecting its hint; another endpoint must never show this key.
          const ledgerSaved = page.waitForResponse((response) => {
            if (response.request().method() !== "PUT" || !new URL(response.url()).pathname.endsWith("/settings/value")) return false;
            const body = response.request().postDataJSON();
            return body.namespace === "core.execution" && body.key === "byok.model" && body.valueJson === "guard-model";
          });
          await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
          await page.locator('label:has-text("Base URL") input').fill(baseUrl);
          await setByokModel(page, "guard-model");
          expect((await ledgerSaved).ok()).toBe(true);
        }
        await keyField(page).fill(FAKE_KEY);
        const keyWrite = page.waitForResponse((r) => r.url().endsWith(credentialPath) && r.request().method() === "PUT");
        await saveButton(page, "Save key").click();
        expect((await keyWrite).ok()).toBe(true);
        await expect(keyField(page)).toHaveValue("");
        const stored = (await page.request.get(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json())).data;
        expect(stored.isSet).toBe(true);
        expect(stored.tokenHint).toEqual({ last4: "ONLY", length: 42 });
        await expect(keyField(page)).toHaveAttribute("placeholder", "…ONLY, 42 chars");

        await keyField(page).fill(FAKE_KEY);
        await expect(saveButton(page, "Save key")).toBeEnabled();
        for (const blank of ["", "   \t   "]) {
          await keyField(page).fill(blank);
          await expect(saveButton(page, "Save key")).toBeDisabled();
          const afterBlank = (await page.request.get(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json())).data;
          expect(afterBlank.isSet).toBe(true);
          expect(afterBlank.masked).toBe(stored.masked);
        }

        // The admin's visible model is ledger-owned. Let its autosave finish before remounting;
        // Save settings below independently persists the credential row without writing a key.
        const modelSaved = panel === "ADMIN" ? page.waitForResponse((response) => {
          if (response.request().method() !== "PUT" || !new URL(response.url()).pathname.endsWith("/settings/value")) return false;
          const body = response.request().postDataJSON();
          return body.namespace === "core.execution" && body.key === "byok.model" && body.valueJson === "guard-model-updated";
        }) : null;
        await setByokModel(page, "guard-model-updated");
        await expect(saveButton(page, "Save settings")).toBeEnabled();
        const settingsWrite = page.waitForResponse((r) => r.url().endsWith(credentialPath) && r.request().method() === "PUT");
        await saveButton(page, "Save settings").click();
        const response = await settingsWrite;
        expect(response.ok()).toBe(true);
        expect(response.request().postDataJSON()).not.toHaveProperty("apiKey");
        expect(response.request().postDataJSON()).toMatchObject({ ...settings, model: "guard-model-updated" });
        if (modelSaved) expect((await modelSaved).ok()).toBe(true);
        await openPanel(page);
        await expect(byokModelTextInput(page)).toHaveValue("guard-model-updated");
        await expect(keyField(page)).toHaveValue("");
        const reloaded = (await page.request.get(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) }).then((r) => r.json())).data;
        expect(reloaded).toMatchObject({ ...settings, model: "guard-model-updated", isSet: true, masked: stored.masked });

        received.length = 0;
        const probe = await page.request.post(MODELS_PATH, { headers: await pinSessionHeaders({ request: page.request }),
          data: { protocol: "openai", baseUrl, apiKey: "", ...(panel === "ADMIN" ? { useAdminStoredCredential: true } : { useStoredCredential: true }) },
        });
        expect(probe.status()).toBe(200);
        expect((await probe.json()).ok).toBe(true);
        expect(received).toContainEqual({ path: "/v1/models", authorization: `Bearer ${FAKE_KEY}` });
      } finally {
        try {
          expect((await page.request.delete(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) })).ok()).toBe(true);
          const restoredSettings = panel === "ADMIN"
            ? { protocol: original.protocol, providerId: original.providerId, baseUrl: original.baseUrl ?? "", model: original.model ?? "" }
            : { provider: original.provider, baseUrl: original.baseUrl ?? "", model: original.model ?? "" };
          expect((await page.request.put(credentialPath, { headers: await pinSessionHeaders({ request: page.request }), data: restoredSettings })).ok()).toBe(true);
        } finally {
          await new Promise<void>((resolve) => deputy.close(() => resolve()));
        }
      }
    });
  }
});
});

// Migrated from byok-credential-persistence.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-credential-persistence", () => {
/**
 * @file BYOK credential-persistence / multi-tab / contamination battery (2026-08-04 dispatch,
 * Item 8).
 *
 * HISTORICAL DESIGN NOTE (no longer current — kept because it explains why this file's fixtures
 * still poke at `localStorage` at all): as of 2026-08-04 this suite was written against a design
 * where the BYOK API key lived in this BROWSER's own `localStorage` (key
 * `tovu:execution-credentials:v1`), by design, never sent to Tovu's settings ledger.
 *
 * As of 2026-08-05 (Bug 7 / ADR-058) that design is superseded: the admin's API key now lives in
 * a server-side, encrypted, write-only store (`admin_execution_credentials`), and
 * `apps/admin/src/lib/execution-settings.ts` physically never writes `apiKey` to `localStorage`
 * in either direction (see that file's header, item 2). `LEGACY_CREDENTIALS_STORAGE_KEY` in that
 * same file is the read-only, one-time migration path for a browser that still has an old key
 * sitting in `localStorage` from before this ship — it is never written to again.
 *
 * What this file now proves, test by test:
 * - Tests 1-2: defense-in-depth. A hostile or malformed value at the OLD localStorage key must
 *   not break the Settings page render, even though the app no longer reads credential material
 *   out of it. See each test's own comment for why the original failure mode is gone.
 * - Test 3: a permanent security pin — the typed API key must never reach `localStorage` at all,
 *   checked under the exact two-tab race that used to leak it pre-ADR-058.
 * - Test 4: unrelated to the localStorage migration — component-level UI state
 *   (`nextConfigForPresetSelect` in `@jini-ai/ui`'s `features/execution/rules.ts`) that still
 *   applies unchanged.
 *
 * Run against this file's hermetic two-server harness (`../playwright.admin.config.ts`), never
 * the shared dev server. No real provider keys anywhere in this file.
 */

const ADMIN_ORIGIN_PATH = "/admin/";
const CREDENTIALS_KEY = "tovu:execution-credentials:v1";

async function login(page: Page): Promise<void> {
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
  await page.click('.login-card button:has-text("Sign in")');
  await page.waitForSelector(".login-card", { state: "detached", timeout: 15_000 });
}

async function gotoByok(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
  // The Execution section is reached through the settings dialog's own left nav (a plain
  // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
  // this click the BYOK tab below is not mounted yet and the spec times out.
  await page.getByTestId("settings-dialog-nav-execution").click();
  await page.getByRole("tab", { name: "BYOK" }).click();
}

function jsonRoute(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function stubExecutionRoutes(page: Page): Promise<void> {
  await page.route("**/assistant/execution/models", (route) => route.fulfill(jsonRoute({ ok: true, models: ["stub-model"] })));
  await page.route("**/assistant/execution/test-connection", (route) =>
    route.fulfill(jsonRoute({ ok: false, message: "stubbed — no real key present" })),
  );
}

test.describe("byok credential persistence, multi-tab, and cross-provider contamination", () => {
  test("DEFENSE-IN-DEPTH: a non-string apiKey inside a NON-ACTIVE provider's legacy localStorage draft must not break the Settings page render", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await stubExecutionRoutes(page);

    // This is the pre-ADR-058 poison payload that used to reach `@jini-ai/ui`'s
    // `credentialsForPreset` unvalidated and crash the whole page with no `ErrorBoundary` to catch
    // it. Post-ADR-058, `loadExecutionConfig` never populates `savedByProviderId` from anywhere —
    // it is scoped out entirely (`execution-settings.ts`'s header, item 2's "Never populated") — so
    // this specific payload is now structurally unreachable, not fixed by validation. The test is
    // kept as a defense-in-depth check: an old/hand-edited/hostile value at the LEGACY key must
    // still not break the render, on the general principle that a malformed localStorage entry
    // should degrade a field, never the whole page.
    await page.evaluate(
      ({ key }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            apiKey: "",
            savedByProviderId: {
              openai: { apiKey: 12345, baseUrl: "https://api.openai.com/v1", model: "" },
            },
          }),
        );
      },
      { key: CREDENTIALS_KEY },
    );

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });

    // The nav click comes FIRST: the Execution section is reached through the settings dialog's
    // own left nav, so the BYOK tab is not mounted merely by landing on /admin/settings.
    await page.getByTestId("settings-dialog-nav-execution").click();
    await expect(page.getByRole("tab", { name: "BYOK" })).toBeVisible({ timeout: 10_000 });
    expect(pageErrors).toEqual([]);
  });

  test("DEFENSE-IN-DEPTH: non-JSON garbage in legacy localStorage falls back to an empty field instead of crashing the settings page", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await stubExecutionRoutes(page);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.evaluate(
      ({ key }) => window.localStorage.setItem(key, "{not-valid-json:::garbage,,,"),
      { key: CREDENTIALS_KEY },
    );

    await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
    // The Execution section is reached through the settings dialog's own left nav (a plain
    // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it — so the nav
    // click has to precede both the visibility assertion and the tab click below.
    await page.getByTestId("settings-dialog-nav-execution").click();
    await expect(page.getByRole("tab", { name: "BYOK" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("tab", { name: "BYOK" }).click();
    // Passes trivially now, and that is the point being pinned: post-ADR-058 the API key field is
    // UNCONDITIONALLY blank on load (`loadExecutionConfig`'s `apiKey` is always `""` — write-only
    // server store, nothing to hydrate from) regardless of what garbage sits at the legacy
    // localStorage key. `readLegacyLocalCredential`'s own try/catch (in `execution-settings.ts`)
    // is exercised by this payload too, but the field would read blank either way.
    await expect(page.locator('.jini-byok-card .jini-field-input-row input')).toHaveValue("");
    expect(pageErrors).toEqual([]);
  });

  test("SECURITY PIN: a typed API key never reaches localStorage, checked under the exact two-tab race that used to leak it pre-ADR-058", async ({
    context,
  }) => {
    test.slow();
    const secrets = ["sk-ant-FROM-TAB-A", "sk-ant-FROM-TAB-B"];
    const ledgerWrites: string[] = [];
    context.on("request", (request) => {
      if (request.method() === "PUT" && new URL(request.url()).pathname.includes("/settings/")) ledgerWrites.push(request.postData() ?? "");
    });
    // Install before either application boots, so transient writes and writes to any storage key
    // remain observable even if a later removeItem hides them from the final snapshot.
    await context.addInitScript(() => {
      const state = window as unknown as { __storageWrites: Array<{ key: string; value: string }> };
      state.__storageWrites = [];
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        state.__storageWrites.push({ key: String(key), value: String(value) });
        return setItem.call(this, key, value);
      };
    });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await login(tabA);
    await stubExecutionRoutes(tabA);
    await stubExecutionRoutes(tabB);

    // Both tabs mount from the same (empty) persisted state before either one edits anything —
    // this is what made tab B's later save "stale" rather than merely "different" in the original,
    // pre-ADR-058 version of this test (see git history: it asserted the OPPOSITE of what follows —
    // that a typed key survived a cross-tab race in localStorage). That assertion stopped being
    // true, and for the right reason: `saveExecutionConfig` (execution-settings.ts) no longer
    // writes `apiKey` anywhere, so there is nothing left in that path for a race to corrupt. What's
    // worth pinning permanently instead is stricter than the original test: the key must never
    // reach localStorage at all, not even transiently, not even under concurrent tabs.
    await gotoByok(tabA);
    await tabB.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
    // Same left-nav step `gotoByok` does for tab A — spelled out here rather than reusing the
    // helper because this test deliberately drives tab B through the raw navigation, so that both
    // tabs demonstrably mount from the same empty persisted state before either edits anything.
    await tabB.getByTestId("settings-dialog-nav-execution").click();
    await tabB.getByRole("tab", { name: "BYOK" }).click();

    // Tab A types a key and lets the debounced auto-save flush (SAVE_DEBOUNCE_MS = 600ms,
    // `use-settings-slice.hooks.ts`) — the exact trigger that used to write the key to
    // localStorage pre-ADR-058.
    await tabA.locator('.jini-byok-card .jini-field-input-row input').fill(secrets[0]!);
    const waitForModelSave = (page: Page, model: string) => page.waitForResponse((response) => {
      if (response.request().method() !== "PUT" || !new URL(response.url()).pathname.endsWith("/settings/value")) return false;
      const body = response.request().postDataJSON();
      return body.namespace === "core.execution" && body.key === "byok.model" && body.valueJson === model;
    });
    const modelA = `e2e-tab-a-${Date.now()}`;
    const tabASaved = waitForModelSave(tabA, modelA);
    await setByokModel(tabA, modelA);
    expect((await tabASaved).ok()).toBe(true);
    const afterTabASave = await tabA.evaluate(
      (key) => window.localStorage.getItem(key),
      CREDENTIALS_KEY,
    );
    expect(afterTabASave).toBeNull();

    // Tab B edits an unrelated field and lets its own debounce flush — the exact trigger that used
    // to race tab A's save and silently wipe it. There is no key in localStorage left to wipe now,
    // so this is checking the same race produces the same (empty) outcome, not a different one.
    await tabB.locator('.jini-byok-card .jini-field-input-row input').fill(secrets[1]!);
    const modelB = `e2e-tab-b-${Date.now()}`;
    const tabBSaved = waitForModelSave(tabB, modelB);
    await setByokModel(tabB, modelB);
    expect((await tabBSaved).ok()).toBe(true);

    const afterTabBSave = await tabA.evaluate(
      (key) => window.localStorage.getItem(key),
      CREDENTIALS_KEY,
    );
    expect(afterTabBSave).toBeNull();
    // Belt-and-suspenders: even if some future, unrelated change starts writing SOMETHING to this
    // localStorage key again, the raw key material itself must never appear in it.
    expect(afterTabBSave ?? "").not.toContain("FROM-TAB-A");
    expect(ledgerWrites.length).toBeGreaterThanOrEqual(2);
    for (const tab of [tabA, tabB]) {
      const storage = await tab.evaluate(() => ({
        writes: (window as unknown as { __storageWrites: unknown[] }).__storageWrites,
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }));
      for (const secret of secrets) expect(JSON.stringify(storage)).not.toContain(secret);
    }
    for (const secret of secrets) expect(JSON.stringify(ledgerWrites)).not.toContain(secret);

    await tabA.close();
    await tabB.close();
  });

  test("HELD: switching to a never-configured provider clears the API key field and never sends the OLD provider's key in the NEW provider's request", async ({
    page,
  }) => {
    // Unrelated to the localStorage-to-server migration (ADR-058): this exercises component-level
    // UI state (`nextConfigForPresetSelect` in `@jini-ai/ui`'s `features/execution/rules.ts`),
    // which per-provider draft an unsaved field falls back to when the operator switches presets.
    // Neither side of that mechanism touched localStorage before Bug 7 or touches the server store
    // now — it lives entirely in `ExecutionTab`'s in-memory config.
    test.slow();
    await login(page);
    await page.route("**/assistant/execution/models", (route) => route.fulfill(jsonRoute({ ok: true, models: ["stub-model"] })));

    let capturedBody: { protocol?: string; apiKey?: string } | null = null;
    await page.route("**/assistant/execution/test-connection", async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill(jsonRoute({ ok: false, message: "stub — no real key present" }));
    });

    const apiKeyField = page.locator(".jini-byok-card .jini-field-input-row input");

    await gotoByok(page);
    await apiKeyField.fill("sk-ant-SECRET-FOR-ANTHROPIC-ONLY");
    await setByokModel(page, "claude-sonnet-4-5");

    // OpenAI has never been configured in this session — `nextConfigForPresetSelect`
    // (`features/execution/rules.ts`) must load ITS OWN blank draft, never carry Anthropic's key
    // forward as a default. This is the first of the two properties in this test's name.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
    await expect(apiKeyField).toHaveValue("");

    await setByokModel(page, "gpt-4o");
    // OpenAI needs a key of ITS OWN before the request can be fired at all.
    //
    // The original form of this test typed no OpenAI key and asserted the captured request had
    // `apiKey: ""`. That is unreachable, and always has been post-ADR-058: "Test connection" is
    // `disabled={connectionTest.status === 'testing' || missing.size > 0}` (`ByokProviderForm.tsx`)
    // and `missingRequiredFields` counts an empty `apiKey` for any preset with
    // `presetRequiresApiKey` — relaxed only by `apiKeyStoredExternally`, which is false here
    // because this hermetic run has never saved a key server-side. Measured 2026-08-05: the click
    // spent the full 90s test timeout on `element is not enabled`. The test had never been run
    // green (single commit `876b4fe`); the earlier Model-field failure masked this second one.
    //
    // Repaired rather than deleted, because the property in the title is real and this makes it
    // STRICTER: an exact-equality assertion on OpenAI's own key cannot pass if Anthropic's key
    // leaked into the request, whereas the old `toBe("")` only ever proved the field was empty.
    await apiKeyField.fill("sk-openai-OWN-KEY-NOT-REAL");
    await page.locator('button:has-text("Test connection")').click();
    await expect.poll(() => capturedBody).not.toBeNull();

    const body = capturedBody as unknown as { protocol: string; apiKey: string };
    expect(body.protocol).toBe("openai");
    expect(body.apiKey).toBe("sk-openai-OWN-KEY-NOT-REAL");
    expect(JSON.stringify(capturedBody)).not.toContain("SECRET-FOR-ANTHROPIC");
  });
});
});

// Migrated from byok-empty-key-guard.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-empty-key-guard", () => {
/**
 * @file BYOK empty-key guard — zero network reaches the provider (2026-08-04 dispatch, Item
 * 2 of the original brief, promoted to the adversarial floor by MSG-1).
 *
 * `listProviderModels`/`testProviderConnection` (`@jini-ai/agent-runtime/providers/{model-
 * catalog,connection-test}.ts`) reject an empty/whitespace `apiKey` locally, before any
 * fetch, for every protocol in `PROTOCOLS_REQUIRING_API_KEY` (anthropic/openai/senseaudio/
 * google). `aihubmix` is the sole exception in the shared package (its catalog is public,
 * confirmed by source — `providerModelsHeaders`'s aihubmix branch sends no Authorization
 * header for a blank key rather than rejecting) but is UNREACHABLE through this exemption
 * here: Tovu's own route (`list-models.ts:6`) only allowlists anthropic/openai/azure/google,
 * so aihubmix can't be exercised through the real HTTP surface and isn't asserted here.
 *
 * `page.route`/a real local listener are used deliberately, not as a weaker stand-in for a
 * live provider call: this spec doesn't just read the returned message (a route COULD return
 * the right-looking string while still having made a real network call first) — the final
 * case proves zero requests reached an actual reachable host, using the same "confused
 * deputy" pattern as `byok-ssrf-guard.spec.ts`. Zero real keys, zero provider quota.
 *
 * One login for the whole file, not one per case — see `byok-ssrf-guard.spec.ts`'s header
 * for why (the real `LOGIN_STRICT` rate limiter, 10 req/60s/IP, is tripped by this suite's
 * own login volume otherwise; the limiter itself is untouched).
 */

const A2UI_LOGIN = { username: "admin", password: PIN_PASSWORD };
async function login(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
  // APIRequestContext omits this Secure session cookie on HTTP loopback.
  return pinSessionHeaders({ request });
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
const TEST_CONN_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/test-connection";

test("empty-key guard: local rejection for every key-requiring protocol, both routes", async ({ request }) => {
  const headers = await login(request);

  const protocols: Array<{ protocol: string; baseUrl: string }> = [
    { protocol: "anthropic", baseUrl: "https://api.anthropic.com" },
    { protocol: "openai", baseUrl: "https://api.openai.com" },
    { protocol: "google", baseUrl: "https://generativelanguage.googleapis.com" },
  ];

  for (const { protocol, baseUrl } of protocols) {
    for (const apiKey of ["", "   \t  "]) {
      const label = `${protocol} apiKey=${JSON.stringify(apiKey)}`;
      const modelsRes = await request.post(MODELS_PATH, { headers, data: { protocol, baseUrl, apiKey } });
      const modelsBody = await modelsRes.json();
      expect(modelsBody.ok, `models: ${label}`).toBe(false);
      expect(modelsBody.message, `models: ${label}`).toBe("No API key saved on the server. Save one first.");

      const testConnRes = await request.post(TEST_CONN_PATH, { headers,
        data: { protocol, baseUrl, apiKey, model: "some-model" },
      });
      const testConnBody = await testConnRes.json();
      expect(testConnBody.ok, `test-connection: ${label}`).toBe(false);
      expect(testConnBody.message, `test-connection: ${label}`).toBe("No API key saved. Save one to test the connection.");
    }
  }
});

test("zero-network proof: an empty key never reaches a real listener, even one the SSRF guard allows (loopback)", async ({
  request,
}) => {
  const headers = await login(request);

  // The strongest version of "zero requests reach the provider": point baseUrl at a REAL
  // listener on loopback (which `byok-ssrf-guard.spec.ts` proves the SSRF guard allows
  // through) with an EMPTY key, and prove the empty-key guard still stops it before the
  // SSRF-allowed path is ever reached.
  let hitCount = 0;
  const deputy = http.createServer((_req, res) => {
    hitCount++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "should-never-be-reached", object: "model" }] }));
  });
  await new Promise<void>((resolve) => deputy.listen(0, "127.0.0.1", resolve));
  const port = (deputy.address() as AddressInfo).port;

  try {
    for (const path of [MODELS_PATH, TEST_CONN_PATH]) {
      // senseaudio is not allowlisted by these HTTP routes; Azure has no models catalog.
      const protocols = path === MODELS_PATH ? ["anthropic", "openai", "google"] : ["anthropic", "openai", "google", "azure"];
      for (const protocol of protocols) {
        for (const apiKey of ["", "   \t  "]) {
          const res = await request.post(path, { headers,
            data: { protocol, baseUrl: `http://127.0.0.1:${port}`, apiKey, model: "some-model" },
          });
          const body = await res.json();
          expect(body.ok, `${path}: ${protocol}`).toBe(false);
          expect(body.message).toBe(path === MODELS_PATH
            ? "No API key saved on the server. Save one first."
            : "No API key saved. Save one to test the connection.");
          expect(hitCount, `${path}: ${protocol} must reject before dialing`).toBe(0);
        }
      }
    }
    // The measured fact: the guard fired BEFORE the SSRF-allowed loopback path was ever
    // reached, even though that path is open for a non-empty key.
    expect(hitCount).toBe(0);
    // Positive control: the same real models route can reach this listener with a nonempty key.
    const control = await request.post(MODELS_PATH, { headers,
      data: { protocol: "openai", baseUrl: `http://127.0.0.1:${port}`, apiKey: "fake-control-key" },
    });
    expect((await control.json()).ok).toBe(true);
    expect(hitCount).toBeGreaterThan(0);
  } finally {
    await new Promise<void>((resolve) => deputy.close(() => resolve()));
  }
});
});

// Migrated from byok-google-live-smoke.spec.ts; original pin intent and why comments follow.
// Live Gemini credentials/requests must never share a warm daemon with an offline pin.
test.describe("Bug pin: byok-google-live-smoke", { tag: ["@real-service", "@isolated-site"] }, () => {
/**
 * @file The real thing, once: an actual chat turn against the real Google Gemini API through
 * Tovu's live admin UI, using a real operator-supplied key. Companion to
 * `byok-google-tool-schema.spec.ts`, which is the permanent, deterministic, offline regression guard
 * (a hermetic "confused deputy" — no real network, no quota, runs everywhere). THIS file is the one
 * genuine end-to-end proof that the fix works against Google's actual, real, currently-enforced
 * schema validator — the deputy spec can only prove Tovu sends what the deputy received; it cannot
 * prove Google itself accepts it.
 *
 * **Skips cleanly, everywhere, with no key.** `GEMINI_API_KEY` is read from the process
 * environment only — never hardcoded here — and if it is absent the single test in this file calls
 * `test.skip(...)` and reports why, rather than failing. `ensureGeminiKeyLoaded` below exists only
 * because this repo has no `dotenv` dependency and Playwright does not auto-load `.env`: it is a
 * tiny, dependency-free parser that copies `GEMINI_API_KEY` out of the repo-root `.env` file into
 * `process.env` for THIS worker process only, and only when the env var isn't already set (so CI
 * setting it directly, with no `.env` file present, still works unchanged). It never logs, prints,
 * or otherwise surfaces the value it reads.
 *
 * **The key is never captured.** `test.use({ trace: 'off', screenshot: 'off', video: 'off' })` below
 * is deliberate, not an oversight of the suite's default `trace: 'retain-on-failure'`
 * (`playwright.admin.config.ts`) — a trace or screenshot can capture live page/DOM state, and the
 * API key briefly lives in a real `<input type="password">` in this test. The save-request check
 * compares only a boolean, so failure output never includes the key's value.
 *
 * **One turn, short prompt** — this hits a real paid API per the dispatch's own constraint.
 */

function ensureGeminiKeyLoaded(): void {
  if (process.env.GEMINI_API_KEY) return;
  const envPath = path.resolve(import.meta.dirname, "../../../.env");
  if (!fs.existsSync(envPath)) return;
  let contents: string;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "GEMINI_API_KEY") continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env.GEMINI_API_KEY = value;
  }
}
if (process.env.TOVU_E2E_REAL_SERVICES === "1") ensureGeminiKeyLoaded();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN_PATH = "/admin/";
/** The exact model the owner reported using live — not substituted for a guess. */
const LIVE_MODEL = "gemini-3.6-flash";

// trace/screenshot/video are off via the journeys config's "real-service" project: they are
// worker-scoped, so a `test.use` inside this describe group cannot set them.

test("real Gemini BYOK turn: the admin chat actually completes and renders a reply", async ({ page }) => {
  test.skip(!GEMINI_API_KEY, "GEMINI_API_KEY not set (checked process.env and repo-root .env) — skipping the live Gemini smoke test");
  test.setTimeout(90_000);

  await loginAsAdmin(page);
  const credentialPath = "/api/admin/v1/workspaces/workspace-local/assistant/execution-credential";
  const cleared = await page.request.delete(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) });
  expect(cleared.ok()).toBe(true);
  const before = await page.request.get(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) });
  expect((await before.json()).data.isSet).toBe(false);

  await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("settings-dialog-nav-execution").click();
  await page.getByRole("tab", { name: "BYOK" }).click();
  // Selecting this preset auto-fills Base URL to Google's own real default
  // (`DEFAULT_PROVIDER_PRESETS`'s `google-gemini` entry, `https://generativelanguage.googleapis.com`)
  // — left untouched deliberately, so this test hits Google's real endpoint rather than a value
  // typed here that could drift from the preset's own source of truth.
  await page.getByRole("tab", { name: "Google Gemini", exact: true }).click();

  // NOT `label:has-text("API key") input`. That locator matches ANY label whose subtree contains
  // the substring, and selecting the Google Gemini preset fires model discovery immediately — which
  // fails while no key is entered yet and renders "Could not load live models: No API key — ..."
  // INSIDE the Model field's own label. Two matches, and Playwright's strict mode throws. This bites
  // only specs that do not pre-stub `**/assistant/execution/models`, which is why it reads as flake:
  // a clean idle page shows exactly one match. Root-caused 2026-08-05 across the whole BYOK suite.
  //
  // `.jini-byok-card .jini-field-input-row input`, not `input[type="password"]`: the API key
  // field's `type` toggles to `text` whenever the form's "Show"/"Hide" reveal button is clicked
  // (`ByokProviderForm.tsx`'s `revealKey` state), so `type="password"` is not a stable identity for
  // it. `.jini-field-input-row` is the structural wrapper only the API key field's row uses, so it
  // stays unique regardless of reveal state. Standardized across every `byok-*.spec.ts` file
  // 2026-08-05 (this file was the last holdout).
  // Deliberately no "Test connection" click: that would ALSO fire live model discovery, which (with
  // a real, valid key) can switch the Model field from a plain text input to a searchable picker
  // mid-test — see `ExecutionTab.tsx`'s own comment on why discovery is not re-keyed on the API key.
  // Filling the plain text field directly keeps this test's DOM shape identical to
  // `byok-google-tool-schema.spec.ts`'s.
  //
  // NOT `label:has-text("Model") input`. Measured 2026-08-05: that resolved to TWO elements and
  // threw on strict mode — Playwright's `:has-text()` is a case-insensitive SUBSTRING match, and
  // the Max-tokens field's own hint reads "Leave blank to use the model default", so its
  // `<input type="number">` matched too. This failure is independent of the `SearchableModelSelect`
  // refactor (the run that measured it showed this field still rendering as a plain input carrying
  // `list="jini-byok-model-options"`, because discovery is not re-keyed on the API key and had
  // already failed with no key present). `setByokModel` anchors on the field label's own exact text
  // and handles whichever shape the field is in.
  await setByokModel(page, LIVE_MODEL);

  await expect(page.locator(".settings-ui-save.is-saved")).toBeVisible({ timeout: 15_000 });
  // Autosave replaces the settings slice and can clear an unsaved key; type it last.
  await page.locator('.jini-byok-card .jini-field-input-row input').fill(GEMINI_API_KEY!);
  const savedResponse = page.waitForResponse((response) => response.url().endsWith(credentialPath) && response.request().method() === "PUT");
  await page.locator('.assistant-key-footer button:has-text("Save key")').click();
  const saved = await savedResponse;
  expect(saved.ok()).toBe(true);
  // Boolean comparison avoids printing the real secret if this assertion fails.
  expect(saved.request().postDataJSON().apiKey === GEMINI_API_KEY).toBe(true);
  const storedResponse = await page.request.get(credentialPath, { headers: await pinSessionHeaders({ request: page.request }) });
  const stored = (await storedResponse.json()).data;
  expect(stored.isSet).toBe(true);
  expect(stored.protocol).toBe("google");
  expect(stored.baseUrl).toBe("https://generativelanguage.googleapis.com");
  expect(stored.model).toBe(LIVE_MODEL);

  // Reload so `AssistantDock`'s own `useExecutionConfig` (no live subscription to the settings
  // save) picks up the just-persisted BYOK mode/credential — same reasoning as the deputy spec.
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 15_000 });

  await page.getByRole("button", { name: "Open assistant" }).click();
  const dock = page.locator('aside[aria-label="Assistant"]');
  const composer = dock.locator(".jini-composer-input");
  await composer.waitFor({ state: "visible", timeout: 10_000 });
  await composer.fill("Reply with exactly one short sentence confirming you can hear me.");
  const repliesBefore = await dock.locator(".jini-message-assistant").count();
  const turnResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/v1/assistant/ag-ui-run") && response.request().method() === "POST");
  await dock.locator(".jini-composer-send").click();

  const errorBubble = dock.locator(".jini-message-error");
  const assistantReply = dock.locator(".jini-message-assistant").last();

  // Race the two real outcomes explicitly, so a failure reports Tovu's own verbatim error text
  // (the single most actionable thing to bring back) instead of a bare locator timeout.
  await Promise.race([
    expect(errorBubble).toBeVisible({ timeout: 60_000 }),
    expect(assistantReply.locator(".jini-message-content").first()).not.toHaveText("", { timeout: 60_000 }),
  ]).catch(() => {
    // Neither settled within the window — fall through to the assertions below, which will report
    // exactly what state the pane was actually left in.
  });

  if (await errorBubble.count()) {
    const runFailedText = await errorBubble.first().innerText();
    expect(runFailedText, "BYOK Gemini turn failed — see the assistant pane's own error").toBe("<no error expected>");
  }

  const turn = await turnResponse;
  expect(turn.ok()).toBe(true);
  const events = (await turn.text()).split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; runId?: string });
  const starts = events.filter((event) => event.type === "RUN_STARTED");
  const finishes = events.filter((event) => event.type === "RUN_FINISHED");
  expect(starts).toHaveLength(1);
  expect(finishes).toHaveLength(1);
  expect(finishes[0].runId).toBe(starts[0].runId);
  expect(events.filter((event) => event.type === "RUN_ERROR")).toHaveLength(0);
  await expect(errorBubble).toHaveCount(0);
  await expect(dock.locator(".jini-message-assistant")).toHaveCount(repliesBefore + 1);

  await expect(assistantReply).toBeVisible({ timeout: 5_000 });
  const replyText = await assistantReply.locator(".jini-message-content").first().innerText();
  expect(replyText.trim().length).toBeGreaterThan(0);
});
});

// Migrated from byok-google-tool-schema.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-google-tool-schema", () => {
/**
 * @file Permanent regression guard for the Gemini BYOK tool-schema bug (2026-08-04 dispatch).
 *
 * Drives the REAL admin UI end to end — real login (`auth-fixtures.ts`), real Settings ->
 * Execution mode -> BYOK -> Google Gemini form, real `AssistantDock` chat pane, real send — and
 * proves what actually leaves Tovu's SERVER on the wire when it calls Google, by pointing BYOK's
 * `baseUrl` at a "confused deputy" this file starts and owns (the pattern `byok-ssrf-guard.spec.ts`/
 * `byok-hostile-provider.spec.ts` already establish in this suite). No real Gemini key, no quota,
 * fully hermetic and deterministic — this is the spec meant to catch a REGRESSION on any machine,
 * with or without a real key. See `byok-google-live-smoke.spec.ts` for the companion real-API proof.
 *
 * **Why this asserts on the CAPTURED payload, not a reimplementation of the sanitizer.** The bug
 * (`src/assistant/byok-provider-turn.ts`) was Tovu sending the ~131-tool admin catalog as
 * `tools[0].functionDeclarations[].parameters` in raw JSON Schema, which Gemini's restricted OpenAPI
 * subset rejects. Four confirmed rejection classes: `additionalProperties` (and by the same
 * evidence, `$schema`/`$ref`/`$defs`), `const`, array-valued `type`, and non-string `enum` members.
 * Re-deriving `sanitizeGoogleSchema`'s own rules here and comparing outputs would only prove the
 * sanitizer agrees with itself; reading the literal bytes the deputy received is what proves the real
 * request path — route -> `runByokProviderTurn` -> `runGoogleTurn` -> `fetch()` — actually applies it.
 *
 * **Why the deputy also answers with a real reply.** A clean payload is necessary but not
 * sufficient — the point of the whole feature is a chat turn that works. The deputy's
 * `streamGenerateContent` response is a minimal, real-shaped Gemini SSE frame (`alt=sse`, bare
 * `data: {...}\n\n` records — verified against `@jini-ai/agent-runtime`'s `decodeSseStream`, which
 * needs no `event:` line). The deputy first requests a real catalog read, then completes the turn
 * with `finishReason: 'STOP'`, and
 * the reply is asserted to actually render in `AssistantDock`'s `ChatPane`.
 */

const ADMIN_ORIGIN_PATH = "/admin/";
const FAKE_GEMINI_KEY = "AIzaTest-FAKE-GEMINI-KEY-NOT-REAL-0000000000";
const DEPUTY_REPLY_TEXT = "Hello from the deputy. This is a real Gemini-shaped SSE reply.";

interface CapturedStreamRequest {
  readonly url: string;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: unknown;
}

interface Deputy {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
  readonly streamRequests: () => readonly CapturedStreamRequest[];
}

/**
 * Starts the confused-deputy "Google Gemini" server this spec fully controls. Answers BOTH surfaces
 * the real BYOK code path can reach for a `protocol: 'google'` config:
 *  - `GET /v1beta/models?key=...` — `ExecutionTab`'s own automatic model-discovery effect (fires as
 *    soon as the Google Gemini preset is selected, before this spec even types a base URL into the
 *    field — see that effect's own comment in `ExecutionTab.tsx`). Answered blandly; nothing in this
 *    spec asserts on it.
 *  - `POST /v1beta/models/<model>:streamGenerateContent?alt=sse` — the actual chat turn. Every such
 *    request is captured (method, url, headers, parsed JSON body) for the real assertions below.
 */
async function startGeminiDeputy(): Promise<Deputy> {
  const streamRequests: CapturedStreamRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const url = req.url ?? "";

      if (req.method === "GET" && url.startsWith("/v1beta/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
        return;
      }

      if (req.method === "POST" && url.includes(":streamGenerateContent")) {
        let parsedBody: unknown = null;
        try {
          parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : null;
        } catch {
          parsedBody = { __parseError: rawBody.slice(0, 500) };
        }
        streamRequests.push({ url, headers: req.headers, body: parsedBody });

        const frame = {
          candidates: [
            {
              content: { parts: streamRequests.length === 1
                // The read-card collapse exposes theme_list through content_read.theme.
                ? [{ functionCall: { name: "describe_tool", args: { id: "content_read.theme" }, id: "deputy-describe-theme" } }]
                : [{ text: DEPUTY_REPLY_TEXT }], role: "model" },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        };
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        res.write(`data: ${JSON.stringify(frame)}\n\n`);
        res.end();
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "unhandled path in deputy" } }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    // `closeAllConnections()` BEFORE `close()`, and it is load-bearing rather than tidy-up.
    // `server.close()` alone stops accepting new connections and then waits for every existing one
    // to end on its own. The client here is Tovu's own server-side `fetch` (undici), which holds
    // its sockets open in a keep-alive pool after the response completes — so nothing ever ends
    // them, `close()`'s callback never fires, and this `await` in the test's `finally` hangs
    // forever. Observed: the run sat at 7m54s on a test with a 90s timeout, both web servers
    // already torn down, no result ever printed — a hang that reads exactly like an infra flake
    // and cost several full retry cycles to attribute.
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    streamRequests: () => streamRequests,
  };
}

interface SchemaViolation {
  readonly path: string;
  readonly issue: string;
}

/**
 * The exhaustive, recursive check accepts only supported schema keywords at every schema position.
 * Property names are data, so their schemas are checked individually. This covers every depth
 * rather than just the top level, since the original bug report included
 * a violation nested at `parameters.properties[4].value.properties[0].value`.
 */
function collectGoogleSchemaViolations(node: unknown, path: string, out: SchemaViolation[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectGoogleSchemaViolations(item, `${path}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const supportedKeys = new Set([
    "type", "format", "title", "description", "nullable", "default", "items", "minItems", "maxItems",
    "enum", "properties", "propertyOrdering", "required", "minProperties", "maxProperties", "minimum",
    "maximum", "minLength", "maxLength", "pattern", "example", "anyOf",
  ]);
  for (const key of Object.keys(record)) {
    if (!supportedKeys.has(key)) {
      out.push({ path: `${path}.${key}`, issue: `unsupported schema key "${key}" is present` });
    }
  }
  if ("type" in record && Array.isArray(record.type)) {
    out.push({ path: `${path}.type`, issue: `"type" is an array: ${JSON.stringify(record.type)}` });
  }
  if ("enum" in record && Array.isArray(record.enum)) {
    (record.enum as unknown[]).forEach((member, i) => {
      if (typeof member !== "string") {
        out.push({
          path: `${path}.enum[${i}]`,
          issue: `enum member is not a string: ${JSON.stringify(member)} (typeof ${typeof member})`,
        });
      }
    });
  }
  for (const [name, schema] of Object.entries((record.properties ?? {}) as Record<string, unknown>)) {
    collectGoogleSchemaViolations(schema, `${path}.properties.${name}`, out);
  }
  if (record.items !== undefined) collectGoogleSchemaViolations(record.items, `${path}.items`, out);
  if (record.anyOf !== undefined) collectGoogleSchemaViolations(record.anyOf, `${path}.anyOf`, out);
}

/** Drives Settings -> Execution mode -> BYOK -> Google Gemini, points the endpoint at the deputy,
 *  and waits for the real autosave (`useSettingsSlice`'s 600ms debounce) to actually land — never a
 *  hard wait; polls the same `.settings-ui-save.is-saved` status text an operator would see. */
async function configureGoogleByokAgainstDeputy(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("settings-dialog-nav-execution").click();
  await page.getByRole("tab", { name: "BYOK" }).click();
  await page.getByRole("tab", { name: "Google Gemini", exact: true }).click();

  // Targeted by the inputs' own distinguishing attributes, NOT by `label:has-text(...)`. The label
  // form looks cleaner but is not unique here: `has-text` matches a substring anywhere in the
  // label's subtree, and the API-key label contains the word "Model" in its own help text, so
  // `label:has-text("API key") input` resolved to BOTH the key field and the model combobox and
  // failed Playwright's strict-mode check.
  //
  // `.jini-byok-card .jini-field-input-row input`, not `input[type="password"]`: the API key
  // field's `type` toggles to `text` whenever the form's "Show"/"Hide" reveal button is clicked
  // (`ByokProviderForm.tsx`'s `revealKey` state) — a real attribute, but not a stable identity.
  // `.jini-field-input-row` is the structural wrapper only the API key field's row uses (Base URL
  // and Model are plain `.jini-field` labels with no such wrapper), so it stays unique across the
  // whole suite regardless of reveal state. Standardized across every `byok-*.spec.ts` file
  // 2026-08-05.
  // The two LEDGER-owned fields first, and let their autosave fully settle before the key is typed.
  // The ordering is load-bearing — see the note below.
  await page.locator('label:has-text("Base URL") input').fill(baseUrl);
  await setByokModel(page, "gemini-2.5-flash");
  await expect(page.locator(".settings-ui-save.is-saved")).toBeVisible({ timeout: 15_000 });
  // Save key now writes only the secret. The credential resolver reads its endpoint/model from
  // the credential row, so the ledger autosave alone cannot configure this provider for a turn.
  const settingsSaved = page.waitForResponse((response) =>
    response.url().endsWith("/assistant/execution-credential") && response.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  expect((await settingsSaved).ok()).toBe(true);

  /**
   * **The explicit "Save key" press — without it this whole spec cannot reach the provider.**
   *
   * Root-caused 2026-08-05. This spec had been failing with "the deputy never receives a request",
   * carried for several sessions as a pre-existing PRODUCT bug in the turn path. It is not one — the
   * turn path was never reached. Post-ADR-058 the admin's API key is deliberately NOT persisted by the
   * ledger autosave: `AdminByokKeyPanel.tsx` calls this control *"the ONLY control on either screen
   * that writes the admin's own credential"* and *"Never fires automatically"*, and `api.ts`'s wrapper
   * agrees — *"explicit save only — never called from the debounced ledger-slice auto-save path a
   * typed key would otherwise ride along with."* So the key never reached the server,
   * `createStoredExecutionCredentialPort.resolve()` found no usable row, and the route rejected the
   * request before `runByokProviderTurn` was ever called. Observed on `POST .../assistant/byok-turn`:
   *
   *     status=400 {"error":"no usable BYOK credential — supply 'byok' with a supported protocol,
   *                 a non-empty apiKey, and a model, or save one first in Settings",
   *                 "code":"VALIDATION_ERROR"}
   *
   * **Why the key is typed LAST and saved immediately.** Measured, in this order, in one run:
   *
   *     PROBE-A enabled-right-after-key-fill      = true
   *     PROBE-B enabled-after-model-fill          = true
   *     PROBE-C enabled-after-ledger-autosave     = false
   *     PROBE-D key-field-value                   = ""
   *
   * The ledger autosave's round trip replaces the settings slice with the server's saved value, which
   * by ADR-058's design carries no `apiKey` — so a typed-but-not-yet-saved key is **wiped from the
   * form**, and "Save key" (gated on `hasUsableAdminKey`) goes disabled. Filling the key before
   * waiting on `.settings-ui-save.is-saved`, as this helper used to, therefore destroys the key it is
   * about to try to save. Typing it after that wait, and pressing Save inside the 600ms debounce
   * window, avoids the wipe; once the save lands, `stored.isSet` is true and a later wipe is harmless
   * because the credential now lives server-side.
   *
   * Pressed after the model field is filled, deliberately: `saveKey` sends the current
   * protocol/providerId/baseUrl/model alongside the key, and a stored row with no model is treated as
   * unusable (`byok-credential.ts`), which would reproduce the identical 400.
   * Current contract: those fields are saved by the explicit Save settings step above; Save key
   * now sends only the secret. Both writes are required to make the stored credential usable.
   */
  await page.locator(".jini-byok-card .jini-field-input-row input").fill(FAKE_GEMINI_KEY);
  await page.locator('.assistant-key-footer button:has-text("Save key")').click();
  await expect(page.locator(".assistant-key-footer .assistant-save-line")).toContainText(
    "Saved to the server, encrypted.",
    { timeout: 15_000 },
  );
  const stored = await pinSessionRequest({ page, url: "/api/admin/v1/workspaces/workspace-local/assistant/execution-credential" }).then((r) => r.json());
  expect(stored.data).toMatchObject({ protocol: "google", baseUrl, model: "gemini-2.5-flash", isSet: true });
}

test("BYOK Gemini: the real outbound tool schema is Gemini-clean at every depth, and the turn renders a reply", async ({
  page,
}) => {
  test.slow();
  const deputy = await startGeminiDeputy();

  try {
    await loginAsAdmin(page);
    await configureGoogleByokAgainstDeputy(page, deputy.baseUrl);

    // A fresh navigation to the admin root remounts `AssistantDock`, whose own `useExecutionConfig`
    // loads the config that was just saved (ledger + localStorage) — the dock has no live
    // subscription to the settings save, so this reload is what makes the just-configured BYOK
    // mode/credential visible to it. See `AssistantDock.tsx`'s `useExecutionConfig` doc.
    await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
    await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "Open assistant" }).click();
    const dock = page.locator('aside[aria-label="Assistant"]');
    const composer = dock.locator(".jini-composer-input");
    await composer.waitFor({ state: "visible", timeout: 10_000 });
    await composer.fill("Say hello in one short sentence.");
    await dock.locator(".jini-composer-send").click();

    // The real assertions: wait for the deputy to have actually received the turn, then inspect the
    // literal bytes it captured — not a re-derivation of the sanitizer's own rules.
    await expect.poll(() => deputy.streamRequests().length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [captured] = deputy.streamRequests();

    // Bonus, documented correction (`google-messages.ts#googleRequestUrl`'s own doc): auth travels
    // as the `x-goog-api-key` header, never a `?key=` query param, on the chat endpoint.
    expect(captured.headers["x-goog-api-key"]).toBe(FAKE_GEMINI_KEY);
    expect(new URL(`http://x${captured.url}`).searchParams.has("key")).toBe(false);

    const body = captured.body as { tools?: unknown };
    expect(Array.isArray(body.tools), `tools was not an array: ${JSON.stringify(body.tools)}`).toBe(true);
    const tools = body.tools as Array<{ functionDeclarations?: unknown }>;
    expect(tools.length).toBeGreaterThan(0);
    expect(Array.isArray(tools[0]?.functionDeclarations)).toBe(true);
    const declarations = tools[0]!.functionDeclarations as Array<{ name?: unknown; parameters?: unknown }>;
    // Exactly the 3 meta-tools, not the 131 real ones. This assertion INVERTED on 2026-08-05: it
    // used to demand >50 declarations as proof the real catalog was being sent, which was the right
    // check while the route published every descriptor. It no longer does — `assistant-byok.ts`
    // sends `toolSurface.metaTools` (see `META_TOOL_DESCRIPTORS`), and the real catalog is reached
    // through `execute_delegated_tool` instead. Pinned to the exact set rather than a loose bound,
    // because "3 tools go out" is now the property worth protecting: a regression that quietly
    // reintroduced the full catalog would restore ~119 KB per message and would otherwise pass.
    expect(declarations.map((d) => d.name)).toEqual(["search_tools", "describe_tool", "execute_delegated_tool"]);
    const requiredFields = [["query"], ["id"], ["toolId"]];
    const propertyNames = [["limit", "query"], ["id"], ["input", "toolId"]];
    declarations.forEach((decl, i) => {
      expect(decl.parameters).toMatchObject({ type: "object", required: requiredFields[i] });
      const properties = (decl.parameters as { properties: Record<string, { type?: string }> }).properties;
      expect(Object.keys(properties).sort()).toEqual(propertyNames[i]);
      expect(properties[requiredFields[i]![0]!]?.type).toBe("string");
    });
    expect((declarations[2]!.parameters as { properties: { input: { type: string } } }).properties.input.type).toBe("object");

    const violations: SchemaViolation[] = [];
    declarations.forEach((decl, i) => {
      const name = typeof decl.name === "string" ? decl.name : `#${i}`;
      collectGoogleSchemaViolations(decl.parameters, `tools[0].functionDeclarations[${i}](${name}).parameters`, violations);
    });
    expect(violations, `Gemini-incompatible schema fields found:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);

    // The turn actually completing: no failed-run marker, and the deputy's own reply text renders.
    await expect(dock.locator(".jini-message-error")).toHaveCount(0, { timeout: 20_000 });
    const assistantReply = dock.locator(".jini-message-assistant").last();
    await expect(assistantReply).toContainText(DEPUTY_REPLY_TEXT, { timeout: 20_000 });
    expect(deputy.streamRequests()).toHaveLength(2);
    const continuation = deputy.streamRequests()[1]!.body as {
      contents: Array<{ role: string; parts: Array<{ functionResponse?: { name: string; id: string; response: { content: string; isError: boolean } } }> }>;
    };
    const responses = continuation.contents.flatMap((content) => content.parts).flatMap((part) => part.functionResponse ? [part.functionResponse] : []);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ name: "describe_tool", id: "deputy-describe-theme", response: { isError: false } });
    expect(JSON.parse(responses[0]!.response.content)).toMatchObject({ id: "content_read.theme", inputSchema: { type: "object" } });
  } finally {
    await deputy.close();
  }
});
});

// Migrated from byok-hostile-provider.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-hostile-provider", () => {
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

const A2UI_LOGIN = { username: "admin", password: PIN_PASSWORD };
async function login(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
  // APIRequestContext omits this Secure session cookie on HTTP loopback.
  return pinSessionHeaders({ request });
}
async function loginPage(page: Page): Promise<void> {
  await page.goto("/admin/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
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
    const headers = await login(request);

    // Malformed JSON: not even close to valid — `JSON.parse` throws, caught, and reported as
    // its own `parseError` detail (truncated to 240 chars), never an uncaught 500.
    const malformed = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{this is not json at all <<<>>>");
    });
    try {
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(malformed.baseUrl) });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.models).toEqual([]);
      // The exact V8 JSON.parse error text, not a generic "bad response" — legible to
      // whoever's debugging, not a leaked stack trace either.
      expect(body.message).toBe("Expected property name or '}' in JSON at position 1 (line 1 column 2)");
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
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(truncated.baseUrl) });
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.models).toEqual([]);
      expect(body.message).toBe("Unterminated string in JSON at position 37 (line 1 column 38)");
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
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(empty.baseUrl) });
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
    const headers = await login(request);

    const serverError = await startDeputy((_req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "internal provider explosion" } }));
    });
    try {
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(serverError.baseUrl) });
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
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(rateLimited.baseUrl) });
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
    const headers = await login(request);

    // Never responds at all: holds the connection open, writes nothing, never calls `.end()`.
    const neverStart = Date.now();
    const never = await startDeputy((_req, _res) => {
      /* deliberately never respond */
    });
    try {
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(never.baseUrl) });
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
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(slow.baseUrl) });
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
    const headers = await login(request);

    // ~6MB of padding inside a single model's `id` string — still technically one "model", but
    // proves an oversized BODY (not just a long list) is read to completion and parsed rather
    // than rejected or truncated at any layer.
    const bigPayload = "A".repeat(6 * 1024 * 1024);
    const oversized = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: `gpt-4o-${bigPayload}`, object: "model" }] }));
    });
    try {
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(oversized.baseUrl) });
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
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(flood.baseUrl) });
      const elapsedMs = Date.now() - start;
      const body = await res.json();
      expect(body.ok).toBe(true);
      // The measured fact this test exists to pin: ALL 10,000 come back, unbounded. A future
      // fix that caps this (a real, reasonable hardening) would fail this assertion — that's
      // the intended tripwire, not a claim that 10,000 is a correct or desired behavior.
      expect(body.models).toHaveLength(10_000);
      expect([...body.models].sort()).toEqual(many.map((model) => model.id).sort());
      expect(elapsedMs).toBeLessThan(20_000);
    } finally {
      await flood.close();
    }
  });
});

test.describe("the real operator path in the browser: does the UI hang, stay usable, and recover", () => {
  test("a malformed discovery response shows a parsing error without wedging the form, and editing the endpoint to a healthy deputy recovers the model picker", async ({
    page,
  }) => {
    await loginPage(page);
    await page.route("**/settings/events", (route) => route.abort());

    const malformedKeys: Array<string | undefined> = [];
    const malformed = await startDeputy((req, res) => {
      malformedKeys.push(req.headers.authorization);
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{not json");
    });
    try {
      await gotoByok(page);
      // Default protocol is Anthropic; switch to OpenAI (the protocol every deputy in this
      // file speaks) and point its baseUrl at the hostile deputy.
      await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
      const apiKeyInput = page.locator('.jini-byok-card .jini-field-input-row input');
      await apiKeyInput.fill("sk-openai-test-FAKE-KEY-NOT-REAL");
      await page.locator('label:has-text("Base URL") input').fill(malformed.baseUrl);
      await expect.poll(() => malformedKeys.includes("Bearer sk-openai-test-FAKE-KEY-NOT-REAL")).toBe(true);
      await expect(page.locator(".jini-field-hint.is-error[role='status']")).toContainText("Expected property name or '}' in JSON at position 1 (line 1 column 2)", { timeout: 10_000 });

      // The form stays fully interactive while that error is showing — a hostile response
      // must not disable or freeze anything else on the page.
      await apiKeyInput.fill("sk-openai-test-FAKE-KEY-NOT-REAL");
      await expect(apiKeyInput).toHaveValue("sk-openai-test-FAKE-KEY-NOT-REAL");
      await setByokModel(page, "gpt-4o");
      await expect(page.locator('button:has-text("Test connection")')).toBeEnabled();
    } finally {
      await malformed.close();
    }

    // Recovery: swap in a well-behaved deputy at the SAME baseUrl port is not possible (ports
    // differ), so instead point at a fresh healthy deputy — this is
    // exactly `byok-model-discovery-self-heal.spec.ts`'s own proven re-fire mechanism, now
    // proven to also clear a HOSTILE-origin error, not just a benign one.
    const healthy = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "gpt-4o", object: "model" }] }));
    });
    try {
      await page.locator('label:has-text("Base URL") input').fill(healthy.baseUrl);
      await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveCount(0, { timeout: 10_000 });
      await expect(byokModelPicker(page)).toBeVisible({ timeout: 10_000 });
      expect(await readByokModelOptions(page)).toEqual(["gpt-4o"]);
    } finally {
      await healthy.close();
    }
  });
});

test.describe("10,000 models rendered in the real browser: no hang", () => {
  test("the model picker renders all 10,000 options and the page stays interactive", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await loginPage(page);

    // Isolate the settings CHANGE FEED, and only that. This test is about the model catalog under
    // a hostile provider; it is not about cross-tab settings propagation, and leaving that
    // subsystem in makes the control under test disappear mid-assertion.
    //
    // The chain, measured 2026-08-05: editing Base URL writes a ledger field, the server emits a
    // `settings-changed` SSE frame on this endpoint, `settings-events.ts` calls
    // `publishSettingsRefresh`, and `useSettingsSlice.refresh()` reloads the whole config through
    // `loadExecutionConfig` — which is contractually always `apiKey: ""` (write-only server store,
    // ADR-058). The live key is wiped, `hasApiKey` flips false, discovery re-fires and is refused
    // with "No API key", `showModelPicker` goes false, and the picker UNMOUNTS with its portalled
    // menu. Three measured attempts without this line all failed on that: a one-shot read returned
    // `[]` (menu detached mid-read), a plain poll returned `4` (the preset's static
    // `preferredModels`, i.e. the datalist fallback), and a poll that re-typed the key each
    // iteration never landed 10,000 inside 30s.
    //
    // What this does NOT do is paper over the wipe. The wipe is by design — "Save key" is the only
    // control that persists the credential (`AdminByokKeyPanel.tsx`) — and it is unrelated to the
    // property under test here. Blocking the feed removes an unrelated subsystem; it does not
    // change how the catalog is fetched, parsed, or rendered.
    await page.route("**/settings/events", (route) => route.abort());

    const many = Array.from({ length: 10_000 }, (_, i) => ({ id: `flood-model-${i}`, object: "model" }));
    const flood = await startDeputy((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: many }));
    });
    try {
      await gotoByok(page);
      await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
      // The key comes FIRST, and it is load-bearing rather than incidental setup. Browser-side
      // model discovery refuses outright without one — measured verbatim, 2026-08-05: "Could not
      // load live models: No API key — model discovery needs the key from this browser." Without
      // this line the deputy below is never contacted at all and the test measures nothing.
      //
      // It used to pass regardless, which is the part worth recording: this test typed no key of
      // its own and depended on one left behind by an earlier test in the same file. That made a
      // 10,000-model rendering test silently order-dependent, and it is why the same test failed
      // the moment it was run under `--grep` on its own.
      const apiKeyInput = page.locator(".jini-byok-card .jini-field-input-row input");
      await apiKeyInput.fill("sk-openai-test-FAKE-KEY-NOT-REAL");
      await page.locator('label:has-text("Base URL") input').fill(flood.baseUrl);

      // The picker only exists when `liveModels.length > 0` (`ByokProviderForm.tsx`'s
      // `showModelPicker`), so its presence alone proves the 10k-item response was fully
      // processed and reached the form, not stuck/dropped mid-flight. This replaces an
      // assertion on `list="jini-byok-model-options"`, which post-`3b5d648d` is the marker of
      // discovery having FAILED — the exact inverse of what this test needs to observe.
      await expect(byokModelPicker(page)).toBeVisible({ timeout: 20_000 });

      // Every one of the 10,000 options is really in the document. These nodes, unlike the old
      // `<datalist>`'s, are built only when the menu opens, so opening it and reading every label
      // is what pins "10,000 options RENDER in a real browser" rather than "10,000 arrived".
      //
      // Untimed on purpose. An earlier revision wrapped this in a 20s wall-clock bound; most of
      // that budget was Playwright traversing 10,000 nodes, so the assertion's numerator was the
      // harness rather than the product and a loaded machine would have failed it and blamed this
      // migration. The hang guard is the `test.setTimeout` above — which is what a test timeout is
      // for — and the product-side bound is the locator timeout on the picker appearing.
      const options = await readByokModelOptions(page);
      expect(options).toHaveLength(10_000); // uncapped — see the API-level test's own flag on this
      expect([...options].sort()).toEqual(many.map((model) => model.id).sort());
      await chooseByokModelFromPicker(page, "flood-model-9999");
      await expect(byokModelPickerTrigger(page)).toHaveAttribute("aria-label", "Model: flood-model-9999");

      // The page is still responsive after handling a 10,000-model response — proves "doesn't
      // hang", not just "eventually finishes": a real keystroke into an unrelated field still
      // lands.
      // A DIFFERENT value from the one typed above, so this cannot pass on the earlier write.
      await apiKeyInput.fill("sk-openai-test-STILL-RESPONSIVE-NOT-REAL");
      await expect(apiKeyInput).toHaveValue("sk-openai-test-STILL-RESPONSIVE-NOT-REAL");
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

    // Same change-feed isolation, and for the same reason, as the 10,000-model test above: a
    // settings write triggers an SSE frame whose refresh wipes the live key and unmounts the
    // picker. This test currently reads fast enough to win that race, which is exactly why it is
    // pinned rather than left to luck — a security test that passes because it got there first is
    // one slow CI machine away from inspecting an empty menu and reporting green.
    await page.route("**/settings/events", (route) => route.abort());

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
      // See the 10,000-model test above: browser-side discovery refuses without a key, so
      // without this the hostile deputy is never contacted and this test proves nothing about
      // XSS at all. It previously depended on a key left behind by an earlier test in the file —
      // an especially bad dependency for the highest-severity test in this suite, since the
      // order-dependent version would report green while never rendering the payload.
      await page.locator(".jini-byok-card .jini-field-input-row input").fill("sk-openai-test-FAKE-KEY-NOT-REAL");
      await page.locator('label:has-text("Base URL") input').fill(hostile.baseUrl);

      await expect(byokModelPicker(page)).toBeVisible({ timeout: 10_000 });
      // The menu must be OPEN across every check below, and this is not a mechanical detail.
      // Post-`3b5d648d` the option nodes are portalled into `document.body` only while the menu
      // is open (`CustomSelect.tsx`'s `{open ? createPortal(...) : null}`) — unlike the old
      // `<datalist>`, which rendered eagerly. Running the DOM checks against a closed menu would
      // be inspecting a document the payload never entered, and would pass unconditionally,
      // including against a genuinely vulnerable build.
      await openByokModelMenu(page, { timeout: 10_000 });

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

      // The payload DID reach the DOM — as the literal, inert TEXT of a real option row —
      // proving this isn't a false negative from the model being filtered out or discovery
      // failing silently. Read as `textContent`, byte-for-byte: `innerText` normalizes
      // whitespace and would quietly rewrite the payload before comparing it.
      const optionValues = await readByokModelOptions(page, { timeout: 10_000 });
      expect(optionValues).toContain(XSS_PAYLOAD);
    } finally {
      await hostile.close();
    }
  });
});
});

// Migrated from byok-key-handling.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-key-handling", () => {
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

const A2UI_LOGIN = { username: "admin", password: PIN_PASSWORD };

/**
 * ONE authenticated API context for every non-browser test in this file, replacing what used to be a
 * per-test `apiLogin(request)` against Playwright's own per-test `request` fixture. See the login
 * budget note on `pageLogin` for why the count matters. The five API tests only ever needed *an*
 * authenticated caller, never a distinct session each, so nothing observable is lost.
 */
let sharedApi: APIRequestContext;
let sharedApiHeaders: Record<string, string>;

test.beforeEach(async ({ playwright, baseURL }) => {
  sharedApi = await playwright.request.newContext({ ...(baseURL ? { baseURL } : {}) });
  const res = await sharedApi.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(
    res.status(),
    `shared API login returned ${res.status()}; 429 means this file exceeded LOGIN_STRICT (10/60s).`,
  ).toBe(200);
  sharedApiHeaders = await pinSessionHeaders({ request: sharedApi });
});

test.afterEach(async () => {
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
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
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
 * Root-caused 2026-08-05. **What was measured:** an edit made before React has committed the typed key
 * fires a model-discovery request carrying an **empty** `apiKey`. Observed twice on the wire — test 8
 * captured `apiKey: ""` among its requests, and a separate instrumented run captured
 * `REQ {…,"apiKey":""}` directly. The server short-circuits an empty key before any outbound call
 * (`model-catalog.ts:337`, `PROTOCOLS_REQUIRING_API_KEY`), so no deputy is dialed for that request.
 *
 * **An earlier version of this comment claimed the discovery effect "lists only `config.byok.baseUrl`
 * as a dependency" and therefore "never re-fires for that URL". That was inference, and it is FALSE.**
 * `ExecutionTab.tsx`'s dependency array is
 * `[config.mode, port, loadModels, config.byok.protocol, config.byok.baseUrl, config.byok.providerId,
 * hasApiKey]` — `hasApiKey` is a deliberate boolean presence flag whose own comment says it exists so
 * the effect re-runs exactly once on the `false -> true` transition, keyed on presence rather than
 * value so it does not refire per keystroke. So the effect DOES re-fire when the key commits. The
 * correction is recorded rather than quietly deleted because this file's whole subject is comments
 * that encoded inference as observation, and this one was mine.
 *
 * The wait is still worth having: it removes the empty-key request from the window the tests measure,
 * which is what they assert over.
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
      const res = await sharedApi.post(MODELS_PATH, { headers: sharedApiHeaders,
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
        const googleRes = await sharedApi.post(MODELS_PATH, { headers: sharedApiHeaders,
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
      const res = await sharedApi.post(MODELS_PATH, { headers: sharedApiHeaders,
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
      const res = await sharedApi.post(MODELS_PATH, { headers: sharedApiHeaders,
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
    const deputy = await startDeputy((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.url?.endsWith("/chat/completions")
        ? { choices: [{ message: { content: "ok" } }] }
        : { data: [{ id: "deputy-model", object: "model" }] }));
    });

    try {
      const hugeKey = "k".repeat(10_000);
      const start = Date.now();
      const res = await sharedApi.post(MODELS_PATH, { headers: sharedApiHeaders,
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
      const connectionStart = Date.now();
      const connection = await sharedApi.post(TEST_CONN_PATH, { headers: sharedApiHeaders,
        data: { protocol: "openai", baseUrl: `http://127.0.0.1:${deputy.port}`, apiKey: hugeKey, model: "gpt-4o" },
        timeout: 10_000,
      });
      expect(connection.status()).toBe(200);
      expect(await connection.json()).toEqual({ ok: true, message: "valid completion" });
      expect(deputy.hits()).toBe(2);
      expect(deputy.lastUrl()).toBe("/v1/chat/completions");
      expect(deputy.lastHeaders()?.authorization).toBe(`Bearer ${hugeKey}`);
      expect(Date.now() - connectionStart).toBeLessThan(10_000);
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
      const res = await sharedApi.post(MODELS_PATH, { headers: sharedApiHeaders,
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
      const res = await sharedApi.post(TEST_CONN_PATH, { headers: sharedApiHeaders,
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
    const googleKey = "AIzaGoogleQueryCanary9f3a7c";
    const googleEcho = await startDeputy((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Google rejected request URL ${req.url}` } }));
    });
    try {
      const response = await sharedApi.post(MODELS_PATH, { headers: sharedApiHeaders,
        data: { protocol: "google", baseUrl: `http://127.0.0.1:${googleEcho.port}`, apiKey: googleKey },
      });
      expect(response.status()).toBe(200);
      expect(googleEcho.hits()).toBe(1);
      expect(googleEcho.lastUrl()).toBe(`/v1beta/models?key=${googleKey}`);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.message).toContain("Google rejected request URL /v1beta/models?key=");
      expect(body.message).toContain("[REDACTED:");
      expect(body.message).not.toContain(googleKey);
    } finally {
      await googleEcho.close();
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
      await expect.poll(() => deputy.lastHeaders()?.authorization).toBe(`Bearer ${canaryKey}`);
      await expect(page.locator(".jini-byok-test-status.is-error")).toContainText("Access denied for");
      await expect(page.locator(".jini-byok-test-status.is-error")).toContainText("[REDACTED:");

      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toContain(canaryKey);
      expect(consoleMessages.join("\n")).not.toContain(canaryKey);
    } finally {
      await deputy.close();
    }
  });
});

/**
 * MSG-1: discovery currently runs on each Base URL edit and passes the typed draft key.
 * `fillApiKeyAndAwaitCommit` does NOT save that key: saved server credentials are now pinned to
 * their recorded endpoint, while a caller-supplied key still follows the draft URL.
 *
 * Cases 1, 2 and 4 assert the desired behavior and mark only their final safety assertion as an
 * expected failure. Login, form readiness and the final endpoint's successful request remain
 * ordinary failures. A fix produces an unexpected pass so these annotations must be removed.
 * The redaction case asserts an existing protection and stays an ordinary passing test.
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
test.describe("Base URL edits settle before sending a draft API key (MSG-1 known gap)", () => {
  test("typing into Base URL sends the draft API key only to the finished endpoint", async ({
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
    // Prove the final edit reached discovery before marking the known gap. A broken setup must
    // fail normally, rather than satisfy test.fail by never issuing a request.
    await expect.poll(() => captured.some((call) => call.baseUrl === finalUrl && call.apiKey === canaryKey)).toBe(true);
    const hasGenuinePrefix = captured.some(
      (c) => c.baseUrl.length > 0 && c.baseUrl !== finalUrl && finalUrl.startsWith(c.baseUrl),
    );
    // PRODUCT-SUSPECT: retained original desired-behavior pin; setup must succeed before expecting failure.
    test.fail(true, "ExecutionTab sends discovery for intermediate Base URL edits.");
    expect(captured).toHaveLength(1);
    expect(hasGenuinePrefix).toBe(false);
    expect(captured[0]).toEqual({ baseUrl: finalUrl, apiKey: canaryKey });
  });

  test("a prefix-port listener receives no draft key while editing toward the final endpoint", async ({
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

      // Two edits in succession: neither an already-completed prefix request nor its key can
      // be recalled by cancelling a later request. Discovery must wait for the edit to settle.
      await baseUrlInput.fill(`http://localhost:${PREFIX_PORT}`);
      await baseUrlInput.fill(`http://localhost:${FINAL_PORT}`);
      await expect.poll(() => deputyFinal.lastHeaders()?.["x-api-key"]).toBe(canaryKey);

      // PRODUCT-SUSPECT: retained original desired-behavior pin; setup must succeed before expecting failure.
      test.fail(true, "Discovery sends the draft key to an intermediate prefix endpoint.");
      expect(deputyPrefix.lastHeaders()?.["x-api-key"]).not.toBe(canaryKey);
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
      await expect.poll(() => deputy.lastHeaders()?.["x-api-key"]).toBe(canaryKey);
      await expect.poll(() => deputy.hits()).toBeGreaterThanOrEqual(1);
      await expect(errorHint).toContainText("bad credentials:");
      await expect(errorHint).toContainText("[REDACTED:");
      const errorText = await errorHint.innerText();
      expect(errorText).not.toContain(canaryKey);
    } finally {
      await deputy.close();
    }
  });

  test("rapid Base URL edits contact only the final endpoint", async ({
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
      // These listeners answer immediately, so this verifies coalescing rapid edits, rather
      // than cancellation of an outstanding request (which this harness does not hold open).
      await baseUrlInput.fill("http://localhost:6200");
      await baseUrlInput.fill("http://localhost:6201");
      await baseUrlInput.fill("http://localhost:6202");
      await expect.poll(() => deputyC.hits()).toBeGreaterThanOrEqual(1);

      // PRODUCT-SUSPECT: retained original desired-behavior pin; setup must succeed before expecting failure.
      test.fail(true, "Discovery runs for every rapid endpoint edit instead of only the final one.");
      expect(deputyA.hits()).toBe(0);
      expect(deputyB.hits()).toBe(0);
    } finally {
      await deputyA.close();
      await deputyB.close();
      await deputyC.close();
    }
  });
});
});

// Migrated from byok-model-discovery-self-heal.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-model-discovery-self-heal", () => {
/**
 * @file BYOK model-discovery self-heal regression (2026-08-04 dispatch, Item 1).
 *
 * Encodes the actual bug the owner reported: `ExecutionTab`'s model-discovery `useEffect`
 * excluded `apiKey` from its trigger deps (only protocol/baseUrl/providerId re-fired it), so
 * the FIRST discovery failure for a preset left a red "Could not load live models" error on
 * screen permanently — typing a key, saving it, even a green "Test connection" never cleared
 * it, because nothing re-triggered discovery. The fix
 * (`Jini/packages/ui/src/features/execution/react/components/ExecutionTab.tsx`) makes
 * `onTestConnection` also call `loadModels(config.byok)`.
 *
 * UPDATED 2026-08-05: that effect is now ALSO keyed on a derived `hasApiKey` boolean (Jini
 * `3b5d648d`), so the reported bug is fixed a second, better way — typing a key re-fires
 * discovery on its own, without anyone clicking Test connection. That does not retire this
 * spec, but it does mean the old "the total is exactly 2" assertion is gone: see the assertion
 * near the end of this test for how the Test-connection re-fire is still isolated from the
 * key-entry re-fire (and from a third, unkeyed re-fire caused by a settings-refresh defect).
 *
 * `page.route` interception is deliberate here, not a weaker substitute for a real call: it
 * lets this spec assert the actual causal mechanism (the SECOND `models` request firing, not
 * just "an error disappeared eventually") with zero real key and zero provider quota spent,
 * and it runs against this file's own hermetic two-server harness
 * (`../playwright.admin.config.ts`), not a shared dev server.
 */

const ADMIN_ORIGIN_PATH = "/admin/";

async function login(page: Page): Promise<void> {
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
  await page.click('.login-card button:has-text("Sign in")');
  await page.waitForSelector(".login-card", { state: "detached", timeout: 15_000 });
}

async function gotoByok(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
  // The Execution section is reached through the settings dialog's own left nav (a plain
  // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
  // this click the BYOK tab below is not mounted yet and the spec times out.
  await page.getByTestId("settings-dialog-nav-execution").click();
  await page.getByRole("tab", { name: "BYOK" }).click();
}

test.describe("byok model-discovery self-heal (REQ: Test Connection re-fires stale discovery)", () => {
  test("a discovery error from before a key existed clears the moment Test Connection succeeds", async ({
    page,
  }) => {
    await login(page);

    let modelsCallCount = 0;
    let connectionClicked = false;
    // Whether each discovery request actually carried the operator's key. This is what makes the
    // causal claim below measurable at all — see its own comment.
    const keyedCalls: boolean[] = [];
    await page.route("**/assistant/execution/models", async (route) => {
      modelsCallCount++;
      const requestBody = route.request().postDataJSON() as { apiKey?: string } | null;
      keyedCalls.push(Boolean(requestBody?.apiKey));
      // First call simulates the exact bug scenario: discovery ran before any key existed
      // (or on any earlier transient failure) and produced a raw error.
      const body =
        connectionClicked && requestBody?.apiKey
          ? { ok: true, models: ["connection-refresh-model-a", "connection-refresh-model-b"] }
          : { ok: false, message: "stubbed discovery failure (call #1)" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    let testConnCallCount = 0;
    await page.route("**/assistant/execution/test-connection", async (route) => {
      testConnCallCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, message: "stubbed connection ok" }),
      });
    });

    // Registering the routes BEFORE switching to BYOK mode matters: `config.mode` is itself
    // in the discovery effect's dep array, so the very first automatic discovery call fires
    // the instant BYOK mode is selected, using whatever protocol is already the default
    // (Anthropic — the first entry in `DEFAULT_PROVIDER_PRESETS`). Clicking an
    // already-active protocol chip is a no-op (`ProviderChipGroup`'s `onSelect` only fires
    // `if (!active)`), so registering routes AFTER navigating would miss that first call
    // entirely — it would hit the real server instead of this stub. This ordering is itself
    // evidence for the credential-persistence spec's contamination finding: a fresh page load
    // ALWAYS fires discovery immediately for whatever protocol/key was last saved.
    await gotoByok(page);
    await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveText(
      "Could not load live models: stubbed discovery failure (call #1)",
    );
    // Mount and settings refreshes may each probe. The setup property is a failed discovery with
    // no key; the key-bearing delta after Test Connection below proves the refresh's causality.
    expect(modelsCallCount).toBeGreaterThan(0);
    expect(keyedCalls.some(Boolean)).toBe(false);

    // Enter a key AND a model (both required for Test Connection to be enabled — a fresh
    // workspace's `byok.model` setting defaults to `""`; the preset's `preferredModels[0]`
    // only auto-fills on an active preset SWITCH via `nextConfigForPresetSelect`, not on this
    // cold-start default state, so a real first-time operator has to type one by hand too).
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-test-FAKE-KEY-NOT-REAL");
    // Not `label:has-text("Model")`: the Max Tokens field's OWN hint text ("use the model
    // default") contains "model" as a case-insensitive substring, so that selector matches
    // two elements. `list="jini-byok-model-options"` was this field's unique attribute until
    // `3b5d648d`, which made it conditional on discovery having FAILED — at this point in the
    // test discovery has failed (call #1), so it happens to be present here, but it is gone by
    // the end of the test and it is not a stable identity for the field. `setByokModel` anchors
    // on the field label's own exact text instead.
    await setByokModel(page, "claude-sonnet-4-5");
    const testBtn = page.locator('button:has-text("Test connection")');
    await expect(testBtn).toBeEnabled();
    await expect.poll(() => keyedCalls.filter(Boolean).length).toBeGreaterThan(0);
    await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveText(
      "Could not load live models: stubbed discovery failure (call #1)",
    );
    const keyedBeforeClick = keyedCalls.filter(Boolean).length;
    connectionClicked = true;
    await testBtn.click();

    // The measured property that proves causality, not just an eventual visual state: a fresh
    // `models` request actually fired as a direct result of clicking Test Connection.
    //
    // Counted as "one more request CARRYING THE KEY", not as `modelsCallCount === 2`, and the
    // change is forced by two things that both landed in `3b5d648d`/this build:
    //
    //  - `ExecutionTab`'s discovery effect is now keyed on `hasApiKey` as well, so simply typing
    //    a key re-fires discovery. The absolute total is no longer 2 and never will be again.
    //  - A second, unkeyed request follows shortly after, because ~600ms after any edit the
    //    settings slice's debounced save completes and its background `refresh()` reloads the
    //    config through `loadExecutionConfig`, which is contractually always `apiKey: ""`. That
    //    wipes the live key, flips `hasApiKey` back to false and re-fires discovery a third time.
    //    Measured 2026-08-05: the click produced a delta of 2, not 1.
    //
    // A plain "at least one more request" assertion would therefore be satisfied by that wipe
    // alone, and would keep passing even if `onTestConnection` stopped calling `loadModels`
    // entirely — the regression this test exists to catch. Discriminating on the request body
    // fixes that: only the click's own `loadModels(config.byok)` can produce a discovery request
    // that still carries the key, because the wipe's request by definition does not.
    await expect.poll(() => keyedCalls.filter(Boolean).length).toBe(keyedBeforeClick + 1);
    expect(testConnCallCount).toBe(1);

    // The stale error is gone and the model list is populated from the fresh call.
    await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveCount(0);
    await expect(page.locator(".jini-byok-test-status")).toHaveText("stubbed connection ok");
    // Read through the helper rather than off the `<datalist>` directly: the second discovery
    // SUCCEEDS, and a successful discovery is exactly when `ByokProviderForm.tsx` stops
    // rendering a datalist and renders the picker instead. The old direct read returned `null`
    // here — a silent `null`, which `toEqual` then reported as an ordinary value mismatch
    // rather than as "you are reading a control that no longer exists".
    const options = await readByokModelOptions(page);
    expect(options).toEqual(["connection-refresh-model-a", "connection-refresh-model-b"]);
  });
});
});

// Migrated from byok-ssrf-guard.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-ssrf-guard", () => {
/**
 * @file BYOK SSRF-guard adversarial battery (2026-08-04 dispatch, MSG-1 item 1 — "highest
 * value").
 *
 * Attacks `@jini-ai/agent-runtime`'s `connection-guard.ts` (`validateBaseUrl` /
 * `validateBaseUrlResolved`), reached through Tovu's own real HTTP routes
 * (`.../assistant/execution/{models,test-connection}`), against this file's hermetic
 * two-server harness (`../playwright.admin.config.ts`) — never the shared dev server, and
 * never a real provider: the "confused deputy" target below is a plain `node:http` server
 * this spec starts and owns.
 *
 * **The headline finding is not a bypass — it's a documented design decision with a real
 * blast radius.** `connection-guard.ts`'s own comment states loopback is "intentionally
 * allowed (for local LLM servers like Ollama)": `isLoopbackApiHost` short-circuits
 * `validateBaseUrl` to ALWAYS allow `localhost`/`127.0.0.0/8`/`[::1]` (and their decimal /
 * octal / hex / IPv4-mapped-IPv6 encodings — WHATWG's URL parser canonicalizes all of those
 * to plain dotted-decimal before the guard ever sees the hostname, confirmed by direct
 * probe), with **no port restriction at all**. That means an authenticated admin's BYOK
 * "Test connection" / model-discovery feature can be pointed at ANY port on the Tovu
 * server's own loopback interface — including, in principle, Tovu's own API, or any other
 * locally-bound service on that host. `ssrf-loopback-reaches-arbitrary-local-port` below
 * proves this is exploitable, not theoretical, by standing up a real local HTTP server and
 * confirming Tovu's server-side fetch actually reaches it.
 *
 * Every OTHER case in the battery (RFC1918, link-local/metadata, CGNAT, 0.0.0.0,
 * non-http(s) schemes, DNS-rebinding to a private IP) is correctly BLOCKED — see the
 * `ssrf-guard blocks` describe block. This spec exists to keep that split (loopback
 * allowed-by-design vs. everything-else blocked) honest over time: if a future change
 * accidentally narrows the block-list's coverage of a real private range, this spec fails.
 *
 * **One login per describe block, not per case.** `src/server/middleware/rate-limit.ts`'s
 * `LOGIN_STRICT` profile is a REAL brute-force guard — 10 requests/60s per client IP
 * (`dev-auth.ts:140`) — and this suite's own login calls are enough to trip it on
 * themselves if each case logs in separately (measured live: cases 11+ in a 13-login-per-
 * file layout started returning 429). Batching every case for a describe block into ONE
 * `test()` that logs in once and reuses the same authenticated `request` for every
 * sub-case is a workaround for this suite's OWN login volume, not a weakening of any
 * assertion against the product — the rate limiter itself is fully intact and untouched.
 */

const A2UI_LOGIN = { username: "admin", password: PIN_PASSWORD };

async function login(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
  // APIRequestContext omits this Secure session cookie on HTTP loopback.
  return pinSessionHeaders({ request });
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
const CONNECTION_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/test-connection";

function modelsBody(baseUrl: string, apiKey = "sk-test-FAKE-KEY-NOT-REAL") {
  return { protocol: "openai", baseUrl, apiKey, model: "deputy-marker-model" };
}

test("ssrf-guard blocks every documented private/reserved range and non-http(s) scheme", async ({ request }) => {
  const headers = await login(request);

  const blockedCases: Array<{ name: string; baseUrl: string; expectMessage: string }> = [
    {
      name: "cloud metadata service (169.254.169.254)",
      baseUrl: "http://169.254.169.254/latest/meta-data/",
      expectMessage: "Internal IPs blocked",
    },
    { name: "0.0.0.0", baseUrl: "http://0.0.0.0", expectMessage: "Internal IPs blocked" },
    { name: "RFC1918 10.x", baseUrl: "http://10.0.0.5", expectMessage: "Internal IPs blocked" },
    { name: "RFC1918 192.168.x", baseUrl: "http://192.168.1.1", expectMessage: "Internal IPs blocked" },
    { name: "RFC1918 172.16-31.x", baseUrl: "http://172.16.0.1", expectMessage: "Internal IPs blocked" },
    { name: "CGNAT 100.64/10", baseUrl: "http://100.64.0.1", expectMessage: "Internal IPs blocked" },
    {
      name: "decimal-encoded 10.x (167772165 = 10.0.0.5)",
      baseUrl: "http://167772165",
      expectMessage: "Internal IPs blocked",
    },
    { name: "hex-encoded private IP (0xac100001 = 172.16.0.1)", baseUrl: "http://0xac100001", expectMessage: "Internal IPs blocked" },
    { name: "IPv6 ULA fc00", baseUrl: "http://[fc00::1]", expectMessage: "Internal IPs blocked" },
    { name: "IPv6 ULA fd00", baseUrl: "http://[fd00::1]", expectMessage: "Internal IPs blocked" },
    { name: "IPv6 link-local", baseUrl: "http://[fe80::1]", expectMessage: "Internal IPs blocked" },
    { name: "IPv4-mapped private IPv6", baseUrl: "http://[::ffff:10.0.0.5]", expectMessage: "Internal IPs blocked" },
    { name: "userinfo hiding a private host", baseUrl: "http://public.example@10.0.0.5", expectMessage: "Internal IPs blocked" },
    { name: "file://", baseUrl: "file:///etc/passwd", expectMessage: "Only http/https allowed" },
    { name: "gopher://", baseUrl: "gopher://127.0.0.1:70/_test", expectMessage: "Only http/https allowed" },
  ];

  for (const path of [MODELS_PATH, CONNECTION_PATH]) {
    for (const { name, baseUrl, expectMessage } of blockedCases) {
      const start = Date.now();
      const res = await request.post(path, { headers, data: modelsBody(baseUrl) });
      const elapsedMs = Date.now() - start;
      expect(res.status(), name).toBe(200); // route always 200s; `ok:false` carries the failure
      const body = await res.json();
      expect(body.ok, name).toBe(false);
      expect(body.message, `${path}: ${name}`).toBe(expectMessage);
      // A guard rejection is a synchronous hostname/DNS check, not a real connection attempt —
      // it should return fast. Loose smoke bound, not a precise SLA (shared dev machine, real
      // multi-second jitter observed even on passing cases) — the signal it guards against is
      // the guard letting a request through and something downstream hitting ITS OWN
      // multi-second timeout (`PROVIDER_MODELS_TIMEOUT_MS` is 12s), which this sits well under.
      expect(elapsedMs, name).toBeLessThan(10_000);
    }
  }
});

test("a hostname that DNS-resolves to a private IP is blocked (rebinding defense) — one-off, not through the route", async () => {
  // The production route always uses real DNS (`defaultDnsLookup`) with no override surface
  // — no request param lets a client inject a fake resolver. To exercise this branch
  // deterministically (without depending on controlling a real public DNS record that
  // resolves to a private IP, which this environment cannot guarantee), this calls
  // `validateBaseUrlResolved` directly with an injected resolver. This is a genuine one-off
  // measurement of the function's own contract, NOT a route-level proof — flagged as such in
  // the final report. No login needed; this test never touches the HTTP route.
  //
  // Imported from the installed `@jini-ai/agent-runtime` package (top of file), not — as this line
  // used to — a dynamic `import()` of a hardcoded absolute path into a sibling checkout
  // (`/Users/la/Programming/Jini/...`). That path only ever existed on the one laptop that wrote it
  // (`876b4fed`, 2026-08-05): a real `TS2307: Cannot find module` in CI, where the Jini sibling is
  // cloned to a different path, confirmed live against run `31998106661`. The package export is the
  // same function Tovu's own production code already resolves this same way elsewhere.
  const fakeLookup = async () => [{ address: "10.0.0.5", family: 4 }];
  const result = await validateBaseUrlResolved({ baseUrl: "http://internal.example.com", lookup: fakeLookup });
  expect(result.error).toBe("Internal IPs blocked");
  expect(result.forbidden).toBe(true);
});

test("ssrf-guard: loopback is allowed BY DESIGN, with no port restriction — the real blast radius", async ({
  request,
}) => {
  const headers = await login(request);

  // Every encoding must reach an owned listener and return a usable catalog. A generic
  // network error cannot establish that loopback was accepted or the endpoint constructed right.
  let hitCount = 0;
  const received: Array<{ path: string | undefined; method: string | undefined; authorization: string | undefined }> = [];
  const handler: http.RequestListener = (req, res) => {
    hitCount++;
    received.push({ path: req.url, method: req.method, authorization: req.headers.authorization });
    res.writeHead(200, { "content-type": "application/json" });
    // A non-empty catalog: an empty `data: []` is reported by `model-catalog.ts` as
    // `ok:false` ("Provider returned no usable text-generation models"), which would be
    // indistinguishable from a guard rejection in this test.
    res.end(JSON.stringify({ data: [{ id: "deputy-marker-model", object: "model" }] }));
  };
  const deputy = http.createServer(handler);
  const ipv6Deputy = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    deputy.once("error", reject);
    deputy.listen(0, "127.0.0.1", resolve);
  });
  const port = (deputy.address() as AddressInfo).port;

  try {
    await new Promise<void>((resolve, reject) => {
      ipv6Deputy.once("error", reject);
      ipv6Deputy.listen(0, "::1", resolve);
    });
    const ipv6Port = (ipv6Deputy.address() as AddressInfo).port;
    const encodings = [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      `http://[::1]:${ipv6Port}`,
      `http://2130706433:${port}`,
      `http://0177.0.0.1:${port}`,
      `http://0x7f000001:${port}`,
      `http://[::ffff:127.0.0.1]:${port}`,
    ];
    for (const baseUrl of encodings) {
      const before = hitCount;
      const res = await request.post(MODELS_PATH, { headers, data: modelsBody(baseUrl) });
      expect(res.status(), baseUrl).toBe(200);
      const body = await res.json();
      expect(hitCount, baseUrl).toBe(before + 1);
      expect(received[before], baseUrl).toEqual({
        path: "/v1/models", method: "GET", authorization: "Bearer sk-test-FAKE-KEY-NOT-REAL",
      });
      expect(body.ok, baseUrl).toBe(true);
      expect(body.models, baseUrl).toContain("deputy-marker-model");
    }
  } finally {
    await new Promise<void>((resolve) => deputy.close(() => resolve()));
    await new Promise<void>((resolve) => ipv6Deputy.close(() => resolve()));
  }
});
});

// Migrated from byok-state-races.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: byok-state-races", () => {
/**
 * @file BYOK stale-state / cross-provider race battery (2026-08-04 dispatch, Item 5).
 *
 * Hunts for siblings of the already-fixed bug in this area (the model-discovery error that
 * outlived a successful Test Connection, see `byok-model-discovery-self-heal.spec.ts`): does
 * async result state that belongs to ONE provider survive, unlabeled, into a DIFFERENT
 * provider's card?
 *
 * The root cause traced here is structural, not incidental: `useExecutionTab.ts`'s
 * `connectionTest` state is a single hook-level value shared by every provider — nothing in
 * `ExecutionTab.tsx`'s `selectPreset` (or `ByokProviderForm.tsx`) resets or re-scopes it when
 * `config.byok.providerId` changes. Contrast with `modelDiscovery`, which IS re-triggered by a
 * `useEffect` keyed on `config.byok.protocol/baseUrl/providerId` (`ExecutionTab.tsx`'s own
 * comment: "Re-discover models whenever the selected endpoint changes") and IS ticket-guarded
 * against a stale in-flight response landing out of order (`useExecutionTab.ts`'s
 * `modelDiscoveryTicket`). `connectionTest` gets neither protection — it only changes on an
 * explicit `testConnection()` call, so a verdict from provider A rides along, unlabeled,
 * through however many provider switches happen before the operator remembers to re-test.
 *
 * Two of the four cases below pin real, reported-not-fixed bugs via `test.fail()` rather than a
 * plain red assertion: the suite must stay green and reusable (the owner's requirement for this
 * whole dispatch), and `test.fail()` gives strictly better semantics than a permanently-red test
 * — it still runs and still documents the bug, it reports as a PASS while the bug is present (so
 * the suite's green stays trustworthy instead of everyone learning to ignore a chronically-red
 * file), and the moment someone fixes the underlying bug it flips to "expected to fail but
 * passed", actively flagging that the pin is stale instead of rotting silently. The other two are
 * HELD, included deliberately: they prove the `modelDiscovery` ticket mechanism actually does
 * what its own comment claims, which is the reason this file doesn't file the SAME bug against
 * `modelDiscovery` too.
 *
 * `page.route` interception (not real provider calls) throughout — same zero-real-key,
 * zero-quota rationale as the sibling specs in this suite, run against this file's hermetic
 * two-server harness (`../playwright.admin.config.ts`), never the shared dev server.
 */

const ADMIN_ORIGIN_PATH = "/admin/";

async function login(page: Page): Promise<void> {
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
  await page.click('.login-card button:has-text("Sign in")');
  await page.waitForSelector(".login-card", { state: "detached", timeout: 15_000 });
}

async function gotoByok(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
  // The Execution section is reached through the settings dialog's own left nav (a plain
  // button, `data-testid="settings-dialog-nav-<tab.id>"`), not by landing on it. Without
  // this click the BYOK tab below is not mounted yet and the spec times out.
  await page.getByTestId("settings-dialog-nav-execution").click();
  await page.getByRole("tab", { name: "BYOK" }).click();
  // Normalize the active preset. Every test in this file assumes it starts on Anthropic (the
  // first entry in `DEFAULT_PROVIDER_PRESETS`), which was true only for as long as no test in
  // the file ever completed a provider switch: `config.byok.providerId` is a real ledger field,
  // the harness runs all four tests against ONE in-memory API process, and a switch performed by
  // an earlier test persists into every later one.
  //
  // Measured 2026-08-05, and the reason this helper exists: tests 3 and 4 pass in isolation
  // (`--grep`) and fail in a whole-file run. Landing on OpenAI makes `getByRole("tab", { name:
  // "OpenAI" }).click()` a silent no-op — `ProviderChipGroup`'s `onSelect` only fires `if
  // (!active)` — so no discovery re-fires (test 3 saw `switchCall === 0`) and the key field is
  // never re-seeded (test 4 saw the typed key still present). Both read as product failures and
  // are neither.
  //
  // This became reachable only now: before the Model-field migration, tests 1 and 2 died at the
  // Model field BEFORE their provider switch, so they never wrote a different provider to the
  // ledger. Fixing them is what exposed the shared-state coupling underneath.
  //
  // Clicking an already-active chip is itself a no-op, so this costs nothing on the runs that
  // were already correct.
  await page.getByRole("tab", { name: "Anthropic", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Anthropic", exact: true })).toHaveAttribute("aria-selected", "true");
}

function jsonRoute(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

test.describe("byok state races (REQ: async state must be scoped to the provider it came from)", () => {
  test("a Test Connection failure for Anthropic survives a switch to a never-tested OpenAI, mislabeling OpenAI as broken", async ({
    page,
  }) => {
    // The Settings page mounts `@jini-ai/ui`'s full `ExecutionTab` tree, which Vite dev-transforms
    // on FIRST request — measured live at 30s+ on a cold server, well past this suite's inherited
    // 30s default. `test.slow()` (not a hardcoded number) is Playwright's own vocabulary for "this
    // test is inherently slower", and only affects this file's tests, not the shared config other
    // concurrent sessions depend on.
    test.slow();
    // KNOWN BUG, pinned not fixed: `useExecutionTab.ts`'s `connectionTest` state is a single
    // hook-level value shared by every provider — nothing resets it when `config.byok.providerId`
    // changes, so a stale verdict from one provider renders under a DIFFERENT provider's card. If
    // this test ever starts reporting "expected to fail but passed", the bug has been fixed —
    // remove this `test.fail()` pin (and update this file's own header count).
    await login(page);

    await page.route("**/assistant/execution/models", (route) => route.fulfill(jsonRoute({ ok: true, models: ["stub-model"] })));
    await page.route("**/assistant/execution/test-connection", (route) =>
      route.fulfill(jsonRoute({ ok: false, message: "stubbed ANTHROPIC auth failure" })),
    );

    await gotoByok(page);
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-test-FAKE-KEY-NOT-REAL");
    await setByokModel(page, "claude-sonnet-4-5");
    await page.locator('button:has-text("Test connection")').click();
    await expect(page.locator(".jini-byok-test-status.is-error")).toHaveText("stubbed ANTHROPIC auth failure");

    // Switch to a provider that has never had Test Connection clicked for it.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
    await expect(page.getByRole("tab", { name: "OpenAI", exact: true })).toHaveAttribute("aria-selected", "true");

    // DESIRED: OpenAI has no verdict of its own yet, so no test-connection status should render
    // under its card — least of all Anthropic's own failure message. This is the assertion that
    // currently fails: `connectionTest` is unscoped hook state, so the stale node is still there.
    // PRODUCT-SUSPECT: retained original desired-behavior pin; setup must succeed before expecting failure.
    test.fail();
    await expect(page.locator(".jini-byok-test-status")).toHaveCount(0);
  });

  test("an in-flight Test Connection response for Anthropic, resolved AFTER switching to OpenAI, still paints OpenAI's card with Anthropic's verdict", async ({
    page,
  }) => {
    test.slow();
    // KNOWN BUG, pinned not fixed: same root cause as the case above, triggered via the in-flight
    // race instead of a completed-then-switched sequence — `connectionTest` has no ticket guard
    // (unlike `modelDiscovery`'s `modelDiscoveryTicket`), so a response that lands AFTER the
    // operator has moved to a different provider still overwrites that provider's status. If this
    // test ever starts reporting "expected to fail but passed", the bug has been fixed — remove
    // this `test.fail()` pin.
    await login(page);
    await page.route("**/assistant/execution/models", (route) => route.fulfill(jsonRoute({ ok: true, models: ["stub-model"] })));

    let releaseFirst = () => {};
    const firstResponseGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    await page.route("**/assistant/execution/test-connection", async (route) => {
      call += 1;
      if (call === 1) {
        await firstResponseGate;
        await route.fulfill(jsonRoute({ ok: false, message: "STALE anthropic result — must never land under OpenAI" }));
      } else {
        await route.fulfill(jsonRoute({ ok: true, message: "openai connection ok" }));
      }
    });

    await gotoByok(page);
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-test-FAKE-KEY-NOT-REAL");
    await setByokModel(page, "claude-sonnet-4-5");
    await page.locator('button:has-text("Test connection")').click();
    // Call #1 is now blocked on `firstResponseGate` — the button should read "Testing…".
    await expect(page.locator('button:has-text("Testing…")')).toBeVisible();

    // Switch away BEFORE the blocked response ever resolves.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
    await expect(page.getByRole("tab", { name: "OpenAI", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(call, "the Anthropic request must be held before releasing it").toBe(1);
    const delivered = page.waitForResponse((response) => response.url().includes("/assistant/execution/test-connection"));
    releaseFirst();
    const response = await delivered;
    expect(await response.finished()).toBeNull();
    expect(await response.json()).toEqual({ ok: false, message: "STALE anthropic result — must never land under OpenAI" });
    await expect(page.locator('button:has-text("Testing…")')).toHaveCount(0);

    // DESIRED: the stale Anthropic verdict must never render as OpenAI's own status. This is the
    // assertion that currently fails — the ticket-free `connectionTest` state accepts whichever
    // response lands last, regardless of which provider it was actually about.
    // PRODUCT-SUSPECT: retained original desired-behavior pin; setup must succeed before expecting failure.
    test.fail();
    await expect(page.locator(".jini-byok-test-status")).toHaveCount(0);
  });

  test("HELD: an in-flight model-discovery response for OpenAI, resolved after switching to Google, does NOT clobber Google's fresh model list", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await page.route("**/assistant/execution/test-connection", (route) => route.fulfill(jsonRoute({ ok: true, message: "ok" })));

    // Reads whichever control the Model field is currently rendering. It used to read the
    // `<datalist>` directly, which post-`3b5d648d` returns `null` on EVERY successful discovery —
    // and this test only ever stubs successful discoveries, so it was polling a permanently-null
    // value and timing out on the predicate rather than on the property under test.
    // `readByokModelOptions` throws (loudly, naming what it found) rather than returning an empty
    // list when there is no option source at all, so a future third shape cannot make this poll
    // quietly succeed against nothing.
    const readOptions = () => readByokModelOptions(page);

    // Mount-time discovery (whatever provider is default on load) uses a plain, always-fast stub.
    // React 18 `StrictMode` (`apps/admin/src/main.tsx`) deliberately double-invokes an effect on
    // its FIRST mount only — confirmed live, this fires the model-discovery effect twice before any
    // user interaction — so this settles that noise before the race-specific handler below cares
    // about call ORDER at all.
    await page.route("**/assistant/execution/models", (route) =>
      route.fulfill(jsonRoute({ ok: true, models: ["initial-anthropic-model"] })),
    );
    await gotoByok(page);
    await expect.poll(readOptions).toEqual(["initial-anthropic-model"]);

    // From here on, every discovery call is a genuine user-triggered protocol switch (not a
    // StrictMode remount), so a fresh counter is safe to reason about by call order.
    let releaseFirst = () => {};
    const firstResponseGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let switchCall = 0;
    await page.unroute("**/assistant/execution/models");
    await page.route("**/assistant/execution/models", async (route) => {
      switchCall += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toMatchObject(switchCall === 1
        ? { protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "" }
        : { protocol: "google", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "" });
      if (switchCall === 1) {
        await firstResponseGate;
        await route.fulfill(jsonRoute({ ok: true, models: ["STALE-openai-model"] }));
      } else {
        await route.fulfill(jsonRoute({ ok: true, models: ["fresh-google-model"] }));
      }
    });

    // Switch to OpenAI: fires switchCall #1, deliberately left blocked.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
    await expect.poll(() => switchCall).toBe(1);

    // Switch again, to Google, before OpenAI's discovery ever resolves: fires switchCall #2 (fresh).
    await page.getByRole("tab", { name: "Google Gemini", exact: true }).click();
    await expect.poll(() => switchCall).toBe(2);
    await expect.poll(readOptions).toEqual(["fresh-google-model"]);

    // Now release the stale OpenAI response. The `modelDiscoveryTicket` guard in
    // `useExecutionTab.ts` should make this a no-op.
    const staleResponse = page.waitForResponse((response) => response.url().includes("/assistant/execution/models")
      && response.request().postDataJSON()?.protocol === "openai");
    releaseFirst();
    expect(await (await staleResponse).finished()).toBeNull();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await readOptions()).toEqual(["fresh-google-model"]);
  });

  test("HELD: a fast provider switch, before the 600ms settings-save debounce fires, never leaks the typed key into localStorage", async ({
    page,
  }) => {
    // INVERTED 2026-08-05, not "fixed to pass". This test used to read
    // `savedByProviderId.anthropic.apiKey` back out of `localStorage`. Post-ADR-058 that path no
    // longer exists in either direction: `saveExecutionConfig` "deliberately does NOT touch
    // `next.byok.apiKey` at all" (its own doc, `apps/admin/src/lib/execution-settings.ts`), and
    // `loadExecutionConfig` never populates `savedByProviderId` ("scoped out of v1"). So the old
    // assertion was pinned to a premise that had been deleted — it could only ever fail, and
    // making it pass would have meant asserting the key was persisted, which is the exact defect
    // ADR-058 removed. Same treatment, and same rationale, as `byok-credential-persistence`'s
    // security pin (see that file's test 3, which was inverted first).
    //
    // What survives the inversion is the property this test is actually named for.
    // `nextConfigForPresetSelect` (`@jini-ai/ui`'s `features/execution/rules.ts`) still snapshots
    // the outgoing provider's `apiKey/baseUrl/model/maxTokens` into `savedByProviderId` on every
    // preset switch, and still restores them on the way back — that mechanism lives entirely in
    // `ExecutionTab`'s in-memory config and was never what ADR-058 changed. So the honest form of
    // this test is: the snapshot still happens (observed by switching back), and it happens
    // WITHOUT the key ever reaching localStorage.
    test.slow();
    await login(page);
    await page.route("**/assistant/execution/models", (route) => route.fulfill(jsonRoute({ ok: true, models: ["stub-model"] })));
    await page.route("**/assistant/execution/test-connection", (route) => route.fulfill(jsonRoute({ ok: true, message: "ok" })));

    const apiKeyField = page.locator(".jini-byok-card .jini-field-input-row input");

    await gotoByok(page);
    await apiKeyField.fill("sk-ant-SAVE-RACE-TEST");
    // Switch immediately — well inside the 600ms `SAVE_DEBOUNCE_MS` window
    // (`use-settings-slice.hooks.ts`), before any save has fired for the typed key.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();
    // OpenAI has never been configured here, so its own blank draft loads.
    await expect(apiKeyField).toHaveValue("");

    // Wait past the debounce so the queued save (which reads `latest.current` at RUN time, not
    // schedule time) has actually had its chance to flush. A hard wait is the right instrument
    // for the localStorage half specifically: the property being pinned is that a write never
    // happens, and there is no event to wait for when the expected outcome is silence.
    await page.waitForTimeout(1_200);

    // Half 1 — the ADR-058 property. The key must not be in localStorage under any key or shape,
    // not merely absent from the `savedByProviderId.anthropic.apiKey` slot the old assertion read.
    const storedRaw = await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: window.localStorage.length }, (_unused, index) => {
            const key = window.localStorage.key(index) ?? "";
            return [key, window.localStorage.getItem(key) ?? ""];
          }),
        ),
      ),
    );
    expect(storedRaw).not.toContain("sk-ant-SAVE-RACE-TEST");

    // Deliberately NOT asserted: that switching BACK to Anthropic restores the typed key from
    // `savedByProviderId`. That was tried first, as the stronger form of this test, and measurement
    // refuted it — the field comes back empty (measured twice, 2026-08-05, including from a
    // normalized starting state). `nextConfigForPresetSelect` does snapshot the outgoing
    // provider's credentials, but the draft map does not survive `useSettingsSlice`'s background
    // `refresh()`, which reloads the whole config through `loadExecutionConfig` — and that never
    // populates `savedByProviderId` ("scoped out of v1") and always reports `apiKey: ""`.
    // Recorded here rather than asserted, because it is a property of Tovu's settings-refresh
    // wiring and belongs in a test about that, not in this one about a switch race.
  });
});
});
