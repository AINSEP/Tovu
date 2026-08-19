import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect } from "@playwright/test";

import { loginAsAdmin } from "./auth-fixtures.js";
import { setByokModel } from "./byok-model-field.js";

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
 * API key briefly lives in a real `<input type="password">` in this test. No assertion anywhere in
 * this file reads, logs, or compares against the key's value.
 *
 * **One turn, short prompt** — this hits a real paid API per the dispatch's own constraint.
 */

function ensureGeminiKeyLoaded(): void {
  if (process.env.GEMINI_API_KEY) return;
  const envPath = path.resolve(__dirname, "../../.env");
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
ensureGeminiKeyLoaded();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN_PATH = "/admin/";
/** The exact model the owner reported using live — not substituted for a guess. */
const LIVE_MODEL = "gemini-3.6-flash";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("real Gemini BYOK turn: the admin chat actually completes and renders a reply", async ({ page }) => {
  test.skip(!GEMINI_API_KEY, "GEMINI_API_KEY not set (checked process.env and repo-root .env) — skipping the live Gemini smoke test");
  test.setTimeout(90_000);

  await loginAsAdmin(page);

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
  await page.locator('.jini-byok-card .jini-field-input-row input').fill(GEMINI_API_KEY!);
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

  // Reload so `AssistantDock`'s own `useExecutionConfig` (no live subscription to the settings
  // save) picks up the just-persisted BYOK mode/credential — same reasoning as the deputy spec.
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 15_000 });

  await page.getByRole("button", { name: "Open assistant" }).click();
  const dock = page.locator('aside[aria-label="Assistant"]');
  const composer = dock.locator(".jini-composer-input");
  await composer.waitFor({ state: "visible", timeout: 10_000 });
  await composer.fill("Reply with exactly one short sentence confirming you can hear me.");
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

  await expect(assistantReply).toBeVisible({ timeout: 5_000 });
  const replyText = await assistantReply.locator(".jini-message-content").first().innerText();
  expect(replyText.trim().length).toBeGreaterThan(0);
});
