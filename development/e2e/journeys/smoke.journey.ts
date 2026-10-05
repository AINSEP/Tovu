// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { attemptLoginAsAdmin, logoutAsAdmin } from "../auth-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD, JOURNEY_ADMIN_USER, PUBLIC_URL, expect, hasHorizontalScroll, test } from "./_fixtures.js";

/**
 * Smoke journeys (SCOPE.md W1, W11, W12): login/logout, every seeded public route, and every admin
 * panel route loading without an uncaught error, a 5xx, or a kick back to the login card.
 *
 * W12 reads panel ids from `apps/admin/src/panels.tsx` with the TS parser (same approach as
 * `admin-visual-regression.spec.ts`), so a new panel becomes a new test automatically.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SEEDED_PUBLIC_ROUTES = ["/", "/welcome", "/blog"];

function readPanelIds(): string[] {
  const filename = path.join(REPO_ROOT, "apps/admin/src/panels.tsx");
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let ids: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "ADMIN_PANELS" && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      ids = node.initializer.elements.flatMap((element) => {
        if (!ts.isObjectLiteralExpression(element)) return [];
        const id = element.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === "id");
        return id && ts.isPropertyAssignment(id) && ts.isStringLiteral(id.initializer) ? [id.initializer.text] : [];
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (ids.length === 0) throw new Error("ADMIN_PANELS not found or empty; refusing to silently test nothing.");
  return ids;
}

test.describe("W1 login and session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("wrong password keeps the login card and shows an error", { tag: ["@unrun"] }, async ({ page }) => {
    await attemptLoginAsAdmin(page, { username: JOURNEY_ADMIN_USER, password: "definitely-wrong" });
    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.locator(".admin-layout")).toHaveCount(0);
  });

  test("login, reload keeps the session, logout returns to the login card", { tag: ["@unrun"] }, async ({ page }) => {
    await attemptLoginAsAdmin(page, { username: JOURNEY_ADMIN_USER, password: JOURNEY_ADMIN_PASSWORD });
    await expect(page.locator(".admin-layout")).toBeVisible();
    await page.reload();
    await expect(page.locator(".admin-layout")).toBeVisible();
    await expect(page.locator(".login-card")).toHaveCount(0);
    await logoutAsAdmin(page);
    // Back/forward after logout must not resurrect the authenticated shell from history.
    await page.goBack();
    await page.goForward();
    await expect(page.locator(".admin-layout")).toHaveCount(0);
  });

  test("login screen baseline", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/");
    await expect(page.locator(".login-card")).toBeVisible();
    await expect(page).toHaveScreenshot("login-card.png");
  });

  test("login form is usable with the keyboard alone", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/");
    await expect(page.locator(".login-card")).toBeVisible();
    await page.getByLabel("Username").focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(JOURNEY_ADMIN_USER);
    await page.keyboard.press("Tab");
    await page.keyboard.type(JOURNEY_ADMIN_PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page.locator(".admin-layout")).toBeVisible();
  });
});

test.describe("W11 public rendering smoke", () => {
  for (const route of SEEDED_PUBLIC_ROUTES) {
    test(`public ${route} answers 200 with no page error and no failed same-origin request`, { tag: ["@unrun"] }, async ({ page }) => {
      const failed: string[] = [];
      page.on("response", (response) => {
        if (response.url().startsWith(PUBLIC_URL) && response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
      });
      page.on("requestfailed", (request) => {
        if (request.url().startsWith(PUBLIC_URL)) failed.push(`failed ${request.url()}`);
      });
      const response = await page.goto(`${PUBLIC_URL}${route}`, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      expect(failed).toEqual([]);
    });
  }

  test("public home at phone width has no horizontal scroll", { tag: ["@unrun"] }, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${PUBLIC_URL}/`, { waitUntil: "load" });
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});

test.describe("W12 every admin panel loads", () => {
  for (const id of readPanelIds()) {
    test(`/admin/${id} renders inside the shell with no 5xx`, { tag: ["@unrun"] }, async ({ page }) => {
      const serverErrors: string[] = [];
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(`/admin/${id}`);
      await expect(page.locator(".admin-layout")).toBeVisible();
      await expect(page.locator(".login-card")).toHaveCount(0);
      await expect(page.locator("main, [role=main]").first()).not.toBeEmpty();
      expect(serverErrors).toEqual([]);
    });
  }
});
