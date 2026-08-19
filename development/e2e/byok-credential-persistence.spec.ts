import { test, expect, type Page } from "@playwright/test";

import { setByokModel } from "./byok-model-field.js";

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
  await page.fill('.login-card label:has-text("Password") input', "tovu-dev");
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
    expect(pageErrors.join("\n")).not.toMatch(/\.trim is not a function/);
  });

  test("DEFENSE-IN-DEPTH: non-JSON garbage in legacy localStorage falls back to an empty field instead of crashing the settings page", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await stubExecutionRoutes(page);

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
  });

  test("SECURITY PIN: a typed API key never reaches localStorage, checked under the exact two-tab race that used to leak it pre-ADR-058", async ({
    context,
  }) => {
    test.slow();
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
    await tabA.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-FROM-TAB-A");
    await tabA.waitForTimeout(1_200);
    const afterTabASave = await tabA.evaluate(
      (key) => window.localStorage.getItem(key),
      CREDENTIALS_KEY,
    );
    expect(afterTabASave).toBeNull();

    // Tab B edits an unrelated field and lets its own debounce flush — the exact trigger that used
    // to race tab A's save and silently wipe it. There is no key in localStorage left to wipe now,
    // so this is checking the same race produces the same (empty) outcome, not a different one.
    await setByokModel(tabB, "claude-sonnet-4-5");
    await tabB.waitForTimeout(1_200);

    const afterTabBSave = await tabA.evaluate(
      (key) => window.localStorage.getItem(key),
      CREDENTIALS_KEY,
    );
    expect(afterTabBSave).toBeNull();
    // Belt-and-suspenders: even if some future, unrelated change starts writing SOMETHING to this
    // localStorage key again, the raw key material itself must never appear in it.
    expect(afterTabBSave ?? "").not.toContain("FROM-TAB-A");

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
