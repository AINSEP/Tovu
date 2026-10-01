import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

test("logout initially focuses Cancel and real Escape keeps the session authenticated", async ({ page }) => {
  await loginAsAdmin(page);
  const logout = page.locator(".cms-logout");
  await logout.click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Are you sure you want to log out?" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(logout).toBeFocused();
  await expect(page.locator(".admin-layout")).toBeVisible();
  await expect(page.locator(".login-card")).toHaveCount(0);
  // Reload checks the surviving server session as well as the current SPA's UI state.
  await page.reload();
  await expect(page.locator(".admin-layout")).toBeVisible();
});
