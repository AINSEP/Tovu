import { test, expect, type Page } from "@playwright/test";

/**
 * @file BYOK model-discovery self-heal regression (2026-08-04 dispatch, Item 1).
 *
 * Encodes the actual bug the owner reported: `ExecutionTab`'s model-discovery `useEffect`
 * deliberately excludes `apiKey` from its trigger deps (only protocol/baseUrl/providerId
 * re-fire it), so the FIRST discovery failure for a preset left a red "Could not load live
 * models" error on screen permanently — typing a key, saving it, even a green "Test
 * connection" never cleared it, because nothing re-triggered discovery. The fix
 * (`Jini/packages/ui/src/features/execution/react/components/ExecutionTab.tsx`) makes
 * `onTestConnection` also call `loadModels(config.byok)`.
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

test.describe("byok model-discovery self-heal (REQ: Test Connection re-fires stale discovery)", () => {
  test("a discovery error from before a key existed clears the moment Test Connection succeeds", async ({
    page,
  }) => {
    await login(page);

    let modelsCallCount = 0;
    await page.route("**/assistant/execution/models", async (route) => {
      modelsCallCount++;
      // First call simulates the exact bug scenario: discovery ran before any key existed
      // (or on any earlier transient failure) and produced a raw error.
      const body =
        modelsCallCount === 1
          ? { ok: false, message: "stubbed discovery failure (call #1)" }
          : { ok: true, models: ["stub-model-a", "stub-model-b"] };
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
    expect(modelsCallCount).toBe(1);

    // Enter a key AND a model (both required for Test Connection to be enabled — a fresh
    // workspace's `byok.model` setting defaults to `""`; the preset's `preferredModels[0]`
    // only auto-fills on an active preset SWITCH via `nextConfigForPresetSelect`, not on this
    // cold-start default state, so a real first-time operator has to type one by hand too).
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-test-FAKE-KEY-NOT-REAL");
    // Not `label:has-text("Model")`: the Max Tokens field's OWN hint text ("use the model
    // default") contains "model" as a case-insensitive substring, so that selector matches
    // two elements. `list="jini-byok-model-options"` is the Model field's unique attribute.
    await page.locator('input[list="jini-byok-model-options"]').fill("claude-sonnet-4-5");
    const testBtn = page.locator('button:has-text("Test connection")');
    await expect(testBtn).toBeEnabled();
    await testBtn.click();

    // The measured property that proves causality, not just an eventual visual state: a SECOND
    // `models` request actually fired as a direct result of clicking Test Connection.
    await expect.poll(() => modelsCallCount).toBe(2);
    expect(testConnCallCount).toBe(1);

    // The stale error is gone and the model list is populated from the fresh call.
    await expect(page.locator(".jini-field-hint.is-error[role='status']")).toHaveCount(0);
    await expect(page.locator(".jini-byok-test-status")).toHaveText("stubbed connection ok");
    const options = await page.evaluate(() => {
      const dl = document.getElementById("jini-byok-model-options");
      return dl ? Array.from(dl.querySelectorAll("option")).map((o) => o.getAttribute("value")) : null;
    });
    expect(options).toEqual(["stub-model-a", "stub-model-b"]);
  });
});
