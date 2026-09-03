import { test, expect, type Browser, type Page } from "@playwright/test";

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

/** Long enough to be a plausible Anthropic key and obviously fake. Never a real credential. */
const FAKE_KEY = "sk-ant-api03-NOT-A-REAL-KEY-FOR-TESTS-ONLY";

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  page = await browser.newPage();
  await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 15_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', "tovu-dev");
  const loginResponse = page.waitForResponse((r) => r.url().includes("/auth/login"));
  await page.click('.login-card button:has-text("Sign in")');
  const status = (await loginResponse).status();
  expect(
    status,
    `login returned ${status}; 429 means the byok suite exceeded LOGIN_STRICT (10 logins / 60s) — `
      + `see this file's one-login-per-file note.`,
  ).toBe(200);
  await page.waitForSelector(".login-card", { state: "detached", timeout: 15_000 });
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
test.afterAll(async () => {
  if (!page) return;
  const cleared = await page.request.delete(CREDENTIAL_PATH);
  expect(
    cleared.ok(),
    "failed to delete the credential this file created — later specs in this suite will inherit it "
      + "and see a stored-key form where they expect an unconfigured one",
  ).toBe(true);
  const after = await page.request.get(CREDENTIAL_PATH).then((r) => r.json());
  expect(after.data.isSet, "the credential must actually be gone, not merely reported deleted").toBe(false);
  await page.close();
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

  test("ADMIN panel, key already stored: an empty field still saves, and leaves the stored key INTACT", async () => {
    // The trap the two tests above could otherwise cause someone to walk into. Everything here is
    // about the OTHER meaning of an empty field.
    await openAdminPanel(page);

    await keyField(page).fill(FAKE_KEY);
    await saveButton(page, "Save key").click();
    await expect(keySaveLine(page)).toHaveText(/Saved to the server, encrypted\./, {
      timeout: 15_000,
    });

    const afterSave = await page.request.get(CREDENTIAL_PATH).then((r) => r.json());
    expect(afterSave.data.isSet, "the fake key should now be stored").toBe(true);
    const maskBefore = afterSave.data.masked;
    expect(maskBefore, "a stored key must come back masked, never in full").toMatch(/^••••/);

    // The field clears itself on a successful save (`saveKey`'s own contract), so this IS the
    // returning-operator state: empty input, masked placeholder, working credential on the server.
    await expect(keyField(page)).toHaveValue("");
    await expect(keyField(page)).toHaveAttribute("placeholder", maskBefore);

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
    const afterBlank = await page.request.get(CREDENTIAL_PATH).then((r) => r.json());
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
    await openAdminPanel(page);

    const before = await page.request.get(CREDENTIAL_PATH).then((r) => r.json());
    expect(before.data.isSet, "this case depends on the previous test having stored a key").toBe(true);

    await keyField(page).fill("   \t   ");
    // Whitespace is not a credential, so this is the blank case: the button must be disabled and the
    // request must never be made. Previously this pressed Save and relied on the client trimming
    // before building the patch; the guard is now in front of the button instead.
    await expect(saveButton(page, "Save key")).toBeDisabled();
    await expect(page.locator(".save-error")).toHaveCount(0);

    const after = await page.request.get(CREDENTIAL_PATH).then((r) => r.json());
    expect(after.data.masked, "a whitespace-only field must never replace the stored key").toBe(before.data.masked);
  });
});
