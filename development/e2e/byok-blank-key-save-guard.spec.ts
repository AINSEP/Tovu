import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * @file "Save must not offer to write a key that isn't there" — on BOTH panels of
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
 *   browser genuinely cannot render it and shows a `••••<last 4>` PLACEHOLDER instead. Here Save
 *   must stay enabled and must leave the stored key untouched, updating only the non-secret fields.
 *
 * Collapsing those two into "empty field ⇒ block the save" would be the worse bug: it would strand
 * an operator who wants to change their model or endpoint without re-pasting a key they cannot read
 * back. Collapsing them the other way — treating an empty field as a key — would overwrite a working
 * credential with nothing. This file pins both directions, because a fix for either one alone is
 * exactly how the other regresses.
 *
 * ## Why the panels are asserted independently
 *
 * They do NOT share a code path. The visitor form's Save is gated in `AiAssistant.tsx`'s
 * `VisitorCredentialKeyFooter` (`!dirty || saving || (!apiKey.trim() && !hasStoredKey)`) and writes
 * through `saveVisitorCredential`; the admin form's "Save key" is gated by `canSaveKey`
 * (`hasUsableAdminKey`) in `use-admin-execution-credential.hooks.ts` and writes through `saveKey`.
 * Two guards, two buttons, two labels ("Save" vs "Save key"), two credential rows. A single fix
 * cannot cover both, so a single test must not be trusted to cover both either.
 *
 * ## The `dirty` nuance, and why the blank cases TYPE THEN CLEAR
 *
 * The visitor Save is also disabled while the form is pristine. A test that merely loads the page
 * and asserts "Save is disabled" would pass without exercising the emptiness guard at all — it
 * would be measuring `!dirty`. So the blank cases here type a key and then clear it: that leaves the
 * form dirty with an empty field, which is both the operator's actual situation and the only state
 * in which the guard under test is the thing doing the disabling.
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

/** `exact` on both: "Save" is a SUBSTRING of "Save key", so a loose match would silently assert
 *  against the wrong panel's button if the tabs ever rendered together. */
function saveButton(page: Page, label: "Save" | "Save key") {
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

  test("VISITOR panel, nothing stored: Save is disabled for an empty field and for whitespace, enabled for a real key", async () => {
    // Asserted independently of the admin panel above: different guard, different button, different
    // credential row. See this file's header.
    await openVisitorPanel(page);
    const save = saveButton(page, "Save");

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

    // Enabled, NOT disabled — the field is empty on purpose and the operator may still want to save
    // a model or endpoint change. Blocking here would strand them behind a key they cannot read back.
    await expect(
      saveButton(page, "Save key"),
      "an empty field with a key ALREADY STORED must stay saveable — this is the placeholder state, not a missing value",
    ).toBeEnabled();

    await saveButton(page, "Save key").click();
    await expect(keySaveLine(page)).toHaveText(/Saved to the server, encrypted\./, {
      timeout: 15_000,
    });

    const afterBlankSave = await page.request.get(CREDENTIAL_PATH).then((r) => r.json());
    expect(afterBlankSave.data.isSet, "saving with an empty field must not clear the stored key").toBe(true);
    expect(
      afterBlankSave.data.masked,
      "saving with an empty field must leave the SAME key in place — a changed mask means it was overwritten",
    ).toBe(maskBefore);
  });

  test("ADMIN panel, key already stored: a whitespace-only field never reaches the server as the new key", async () => {
    // The narrowest case, and the one a future refactor is most likely to break.
    //
    // `saveKey` trims the field ONCE, at the top, and both decisions below read that same trimmed
    // value: the `hasUsableAdminKey` gate AND the `...(apiKey ? { apiKey } : {})` that decides
    // whether the patch carries a key at all. Those two reading the same value is the whole
    // property. Split them — gate on the trimmed value, send the raw one — and a whitespace-only
    // field with a key already stored puts "   " on the wire as the REPLACEMENT credential. Today
    // that would still be caught, but only by the server's own
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
    await saveButton(page, "Save key").click();

    // Success, not a validation error: the whitespace must be omitted from the patch entirely,
    // exactly as an empty field is.
    await expect(keySaveLine(page)).toHaveText(/Saved to the server, encrypted\./, {
      timeout: 15_000,
    });
    await expect(page.locator(".save-error")).toHaveCount(0);

    const after = await page.request.get(CREDENTIAL_PATH).then((r) => r.json());
    expect(after.data.masked, "a whitespace-only field must never replace the stored key").toBe(before.data.masked);
  });
});
