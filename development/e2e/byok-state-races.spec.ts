import { test, expect, type Page } from "@playwright/test";

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
    test.fail();
    await login(page);

    await page.route("**/assistant/execution/models", (route) => route.fulfill(jsonRoute({ ok: true, models: ["stub-model"] })));
    await page.route("**/assistant/execution/test-connection", (route) =>
      route.fulfill(jsonRoute({ ok: false, message: "stubbed ANTHROPIC auth failure" })),
    );

    await gotoByok(page);
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-test-FAKE-KEY-NOT-REAL");
    await page.locator('input[list="jini-byok-model-options"]').fill("claude-sonnet-4-5");
    await page.locator('button:has-text("Test connection")').click();
    await expect(page.locator(".jini-byok-test-status.is-error")).toHaveText("stubbed ANTHROPIC auth failure");

    // Switch to a provider that has never had Test Connection clicked for it.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();

    // DESIRED: OpenAI has no verdict of its own yet, so no test-connection status should render
    // under its card — least of all Anthropic's own failure message. This is the assertion that
    // currently fails: `connectionTest` is unscoped hook state, so the stale node is still there.
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
    test.fail();
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
    await page.locator('input[list="jini-byok-model-options"]').fill("claude-sonnet-4-5");
    await page.locator('button:has-text("Test connection")').click();
    // Call #1 is now blocked on `firstResponseGate` — the button should read "Testing…".
    await expect(page.locator('button:has-text("Testing…")')).toBeVisible();

    // Switch away BEFORE the blocked response ever resolves.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();

    let responseCount = 0;
    page.on("response", (response) => {
      if (response.url().includes("/assistant/execution/test-connection")) responseCount += 1;
    });
    releaseFirst();
    await expect.poll(() => responseCount).toBeGreaterThanOrEqual(1);

    // DESIRED: the stale Anthropic verdict must never render as OpenAI's own status. This is the
    // assertion that currently fails — the ticket-free `connectionTest` state accepts whichever
    // response lands last, regardless of which provider it was actually about.
    await expect(page.locator(".jini-byok-test-status")).not.toHaveText(/STALE anthropic result/, {
      timeout: 3_000,
    });
  });

  test("HELD: an in-flight model-discovery response for OpenAI, resolved after switching to Google, does NOT clobber Google's fresh model list", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await page.route("**/assistant/execution/test-connection", (route) => route.fulfill(jsonRoute({ ok: true, message: "ok" })));

    const readOptions = () =>
      page.evaluate(() => {
        const dl = document.getElementById("jini-byok-model-options");
        return dl ? Array.from(dl.querySelectorAll("option")).map((o) => o.getAttribute("value")) : null;
      });

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
    releaseFirst();
    await page.waitForTimeout(300);
    expect(await readOptions()).toEqual(["fresh-google-model"]);
  });

  test("HELD: a fast provider switch, before the 600ms settings-save debounce fires, still snapshots the typed key into the OUTGOING provider's saved draft", async ({
    page,
  }) => {
    test.slow();
    await login(page);
    await page.route("**/assistant/execution/models", (route) => route.fulfill(jsonRoute({ ok: true, models: ["stub-model"] })));
    await page.route("**/assistant/execution/test-connection", (route) => route.fulfill(jsonRoute({ ok: true, message: "ok" })));

    await gotoByok(page);
    await page.locator('.jini-byok-card .jini-field-input-row input').fill("sk-ant-SAVE-RACE-TEST");
    // Switch immediately — well inside the 600ms `SAVE_DEBOUNCE_MS` window
    // (`use-settings-slice.hooks.ts`), before any save has fired for the typed key.
    await page.getByRole("tab", { name: "OpenAI", exact: true }).click();

    // Wait past the debounce so the queued save (which reads `latest.current` at RUN time, not
    // schedule time) has a chance to flush.
    await page.waitForTimeout(1_200);

    const stored = await page.evaluate(() => window.localStorage.getItem("tovu:execution-credentials:v1"));
    const parsed = JSON.parse(stored ?? "{}") as { savedByProviderId?: Record<string, { apiKey?: string }> };
    expect(parsed.savedByProviderId?.anthropic?.apiKey).toBe("sk-ant-SAVE-RACE-TEST");
  });
});
