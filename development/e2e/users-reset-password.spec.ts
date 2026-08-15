import { test, expect, type Locator, type Page } from "@playwright/test";

import { attemptLoginAsAdmin, loginAsAdmin, logoutAsAdmin } from "./auth-fixtures";

/**
 * @file Reset-password confirm+reveal, proved end to end (`../playwright.users-reset-password.config.ts`'s
 * hermetic two-server harness — real Chromium via the normal Playwright runner, never the
 * Playwright MCP tool, which drives a real human's own browser and is unusable for an unattended
 * suite).
 *
 * The unit tests in `apps/admin/src/features/users/__tests__/` already pin the dialog's own logic
 * (mismatch blocks submit, matching values allow it, each toggle reveals only its own field, reveal
 * resets on reopen) against a mocked `fetch`. What they cannot prove is that any of this survives
 * contact with the REAL request/response round trip: that the confirm field really never reaches
 * the wire, that the server really accepts the new password, and — the assertion that actually
 * matters — that a human can no longer sign in with the OLD password and CAN sign in with the new
 * one. This file is that proof, driven entirely through the real `Users.tsx` screen and the real
 * `Login.tsx` screen, against a real (hermetic, in-memory) Tovu API.
 *
 * Deliberately ONE continuous `test(...)`, not several: every step after user creation depends on
 * the previous step's server-side state (the created principal, its current password), so splitting
 * this into independent tests would mean re-creating a user per test for no added coverage — the
 * mismatch/toggle checks below are waypoints in one journey, not separable scenarios.
 *
 * A fresh, timestamp-suffixed username is used even though the API boots a brand-new in-memory DB
 * per run (`reuseExistingServer: false` in the config) — defensive against exactly the "zombie
 * webServer" trap this suite's own brief called out: if a prior run's server process was left
 * bound to this port (e.g. a `kill -9` on the Playwright runner rather than a clean stop), a fixed
 * username would collide with that stale process's already-seeded user and fail with a confusing
 * `RESOURCE_CONFLICT`, not a real product bug.
 */

const CREATE_PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "sunrise-tiger-violin-plateau";
const MISMATCHED_PASSWORD = "sunrise-tiger-violin-WRONG";
const USERNAME = `e2e-reset-pw-${Date.now()}`;

/** The reset-password `<dialog>`, scoped by its own accessible name (native `<dialog>` is not in
 *  the accessibility tree at all while it lacks the `open` attribute, so this locator only ever
 *  matches the open one — no need to disambiguate against the Disable dialog also mounted on this
 *  screen, the way the unit tests' `dialogFor` helper has to). */
function resetPasswordDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: /reset password\?/i });
}

/**
 * One password field's own `.field` wrapper, given that field's already-resolved input locator —
 * the same reason the unit tests' `fieldFor` helper exists: two fields share the accessible name
 * "Show password"/"Hide password" until one is toggled, so asserting a toggle affects only ITS OWN
 * field requires scoping into that field's own subtree rather than trusting button order.
 *
 * XPath ancestor traversal FROM the input, not `dialog.locator(".field").filter({ has: ... })`:
 * measured live against a real Chromium run, `.filter({ has })` built from a locator that was
 * itself scoped to `dialog` (rather than relative to each `.field` candidate) silently matched
 * ZERO elements — no error, just every downstream `.click()` inside it retrying for the full
 * timeout. `getByLabel(...)` used directly (not through `.filter()`) resolved correctly in the
 * same run (confirmed via the failure's own accessibility-tree snapshot: both fields filled with
 * the right values), so the fix is to stop routing the field lookup through `.filter({ has })` at
 * all and instead walk up from the proven-working input locator.
 */
function fieldWrapperOf(input: Locator): Locator {
  return input.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' field ')][1]");
}

test.describe("Reset password — confirm field + reveal toggles, end to end", () => {
  let pageErrors: string[];

  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${err.stack ?? ""}`));
  });

  test.afterEach(() => {
    expect(pageErrors, "no uncaught page error during this test").toEqual([]);
  });

  test("mismatch blocks submit, each toggle reveals only its own field, and the new password really works while the old one is rejected", async ({
    page,
  }) => {
    // 1. Log in as the owner.
    await loginAsAdmin(page);

    // 2. Create a non-admin user with a known password. A user created here gets no role/policy
    //    grants at all (those are a separate "Manage" panel action this flow never touches), so it
    //    is non-admin by construction — never testing against the owner account, whose password
    //    resetting mid-suite would leave every later run starting from different credentials.
    await page.goto("/admin/users", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New user" }).click();
    await page.getByLabel("Username").fill(USERNAME);
    await page.getByLabel("Password", { exact: true }).fill(CREATE_PASSWORD);
    await page.getByRole("button", { name: "Create user" }).click();

    const rowMenuTrigger = page.getByRole("button", { name: `Actions for user "${USERNAME}"` });
    await expect(rowMenuTrigger).toBeVisible({ timeout: 10_000 });

    // 3. Open that row's menu, then "Reset password".
    await rowMenuTrigger.click();
    await page.getByRole("menuitem", { name: "Reset password" }).click();

    const dialog = resetPasswordDialog(page);
    await expect(dialog).toBeVisible();

    // `exact: true` — Playwright's default label matching is a case-insensitive SUBSTRING search
    // (unlike RTL's `getByLabelText`, which is exact by default), and "New password" is literally
    // a substring of "Confirm new password". Without `exact`, this would resolve to 2 elements and
    // every `.fill()`/`.toHaveAttribute()` call below would throw a strict-mode violation instead
    // of targeting the intended single field.
    const newInput = dialog.getByLabel("New password", { exact: true });
    const confirmInput = dialog.getByLabel("Confirm new password", { exact: true });
    const newField = fieldWrapperOf(newInput);
    const confirmField = fieldWrapperOf(confirmInput);
    const submitButton = dialog.getByRole("button", { name: /^reset password$/i });

    // 4. Mismatch case FIRST: different values in the two fields must block submit and show the
    //    inline message.
    await newInput.fill(NEW_PASSWORD);
    await confirmInput.fill(MISMATCHED_PASSWORD);
    await expect(dialog.getByText("Passwords do not match.")).toBeVisible();
    await submitButton.click();
    // Still open — the mismatch never reached `confirmResetPassword`/the network at all.
    await expect(dialog).toBeVisible();

    // 5. Each eye toggle independently reveals only its own field — asserted as real `type`
    //    attribute behavior, not by which icon is rendered.
    await expect(newInput).toHaveAttribute("type", "password");
    await expect(confirmInput).toHaveAttribute("type", "password");

    await newField.getByRole("button", { name: "Show password" }).click();
    await expect(newInput).toHaveAttribute("type", "text");
    await expect(confirmInput).toHaveAttribute("type", "password");
    await expect(newField.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    // The confirm field's own toggle is untouched — still "Show password", still unpressed.
    await expect(confirmField.getByRole("button", { name: "Show password" })).toHaveAttribute("aria-pressed", "false");

    await confirmField.getByRole("button", { name: "Show password" }).click();
    await expect(newInput).toHaveAttribute("type", "text");
    await expect(confirmInput).toHaveAttribute("type", "text");

    // Hiding the new-password field again must not touch the confirm field's own state.
    await newField.getByRole("button", { name: "Hide password" }).click();
    await expect(newInput).toHaveAttribute("type", "password");
    await expect(confirmInput).toHaveAttribute("type", "text");

    // 6. Correct the mismatch (both fields now readable in the DOM since Confirm is still
    //    revealed) and submit for real.
    await confirmInput.fill(NEW_PASSWORD);
    await expect(dialog.getByText("Passwords do not match.")).not.toBeVisible();
    await submitButton.click();

    await expect(page.getByText(new RegExp(`password reset for "${USERNAME}"`, "i"))).toBeVisible({ timeout: 10_000 });
    await expect(dialog).not.toBeVisible();

    // 7. Log out, then log back in AS THAT USER with the NEW password — the assertion that
    //    actually matters: this can only pass if the reset really took effect server-side.
    await logoutAsAdmin(page);
    await loginAsAdmin(page, { username: USERNAME, password: NEW_PASSWORD });
    await expect(page.locator(".admin-layout")).toBeVisible();
    await logoutAsAdmin(page);

    // 8. Control: the OLD (pre-reset) password must now be rejected for this user — proves the
    //    passing state above is attributable to the new password actually working, not to a stale
    //    session, a redirect that lands on the admin regardless, or a form that silently no-ops.
    await attemptLoginAsAdmin(page, { username: USERNAME, password: CREATE_PASSWORD });
    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.locator(".admin-layout")).toHaveCount(0);
  });
});
