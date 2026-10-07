// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";

import { attemptLoginAsAdmin, logoutAsAdmin } from "../auth-fixtures.js";
import { ADMIN_URL, API, WS_API, expect, expectStatus, test, uniqSlug } from "./_fixtures.js";

/**
 * Users and roles journeys (SCOPE.md W8, second half): an admin creates an operator, grants the
 * built-in `editor` role, and that operator logs in with their own session.
 *
 * Built-in editor grants (`@jini-ai/cms` `identity/seed.js` `BUILTIN_EDITOR_PERMISSIONS`): content
 * read/write/publish/delete, media read/upload/update/delete, `theme.set`. No `user.manage` and no
 * `member.manage`, so `GET .../users` answers 403 FORBIDDEN (`routes/users/list.ts`).
 *
 * Each editor login runs in its OWN browser context with an empty storageState, so the shared admin
 * session in the journeys storageState is never touched. Logins count against `LOGIN_STRICT`
 * (10 / 60 s / IP): globalSetup 1, smoke 3, this file 3 (one is a refused login).
 *
 * Cleanup deletes the editor (moves it to the user Trash) so later journeys see no extra operator.
 */
const EDITOR_PASSWORD = "journey-editor-pass-0001";

interface Editor {
  username: string;
  principalId: string;
}

async function editorRoleId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${WS_API}/roles`);
  await expectStatus(res, 200, "roles list");
  const roles = (await res.json()).roles as Array<{ id: string; name: string }>;
  const editor = roles.find((r) => r.name === "editor");
  expect(editor, "built-in editor role missing").toBeDefined();
  return editor!.id;
}

async function createEditorViaApi(request: APIRequestContext): Promise<Editor> {
  const username = uniqSlug("journey-editor");
  const created = await request.post(`${WS_API}/users`, { data: { username, password: EDITOR_PASSWORD } });
  await expectStatus(created, 201, "user create");
  const principalId = (await created.json()).user.principalId as string;
  const assigned = await request.post(`${WS_API}/users/${principalId}/roles`, { data: { roleId: await editorRoleId(request) } });
  await expectStatus(assigned, 201, "editor role assign");
  return { username, principalId };
}

async function deleteUser(request: APIRequestContext, principalId: string): Promise<void> {
  const res = await request.delete(`${WS_API}/users/${principalId}`);
  expect([204, 404], "user cleanup").toContain(res.status());
}

/** A fresh, logged-out browser context on the admin origin; the caller closes it. */
async function freshContext(browser: Browser): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: ADMIN_URL });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}

/**
 * GET from inside the page, so the browser's own cookie rules apply. A packaged (production) server
 * marks the session cookie `Secure`; Chromium sends it to http://127.0.0.1, but Playwright's
 * `page.request` withholds `Secure` cookies from any http URL, so it would read as logged out.
 */
async function browserGet(page: Page, url: string): Promise<{ status(): number; text(): Promise<string>; json(): Promise<any> }> {
  const { status, body } = await page.evaluate(async (target) => {
    const res = await fetch(target, { credentials: "same-origin" });
    return { status: res.status, body: await res.text() };
  }, url);
  return { status: () => status, text: async () => body, json: async () => JSON.parse(body) };
}

async function loginAs(page: Page, username: string): Promise<void> {
  await attemptLoginAsAdmin(page, { username, password: EDITOR_PASSWORD });
  await expect(page.locator(".admin-layout")).toBeVisible();
  await expect(page.locator(".login-card")).toHaveCount(0);
}

test.describe("W8 users and roles", () => {
  test("admin creates a user in the UI, grants editor, and the editor works with their own session but cannot manage users", { tag: ["@unrun"] }, async ({ page, browser, request }) => {
    const username = uniqSlug("journey-editor");
    let principalId: string | undefined;
    const editorSide = await freshContext(browser);
    try {
      await page.goto("/admin/users");
      await page.getByRole("button", { name: "New user" }).click();
      await page.getByLabel("Username").fill(username);
      await page.getByLabel("Password", { exact: true }).fill(EDITOR_PASSWORD);
      const createdResponse = page.waitForResponse((r) => r.url().endsWith(`${WS_API}/users`) && r.request().method() === "POST");
      await page.getByRole("button", { name: "Create user" }).click();
      const created = await createdResponse;
      expect(created.status()).toBe(201);
      principalId = (await created.json()).user.principalId;

      // The username cell is the Manage toggle (`Users.tsx` `UserRow`).
      await page.getByRole("button", { name: username, exact: true }).click();
      await page.getByLabel("Assign role").selectOption({ label: "editor (built-in)" });
      const assigned = page.waitForResponse((r) => r.url().endsWith(`/users/${principalId}/roles`) && r.request().method() === "POST");
      await page.getByRole("button", { name: "Assign", exact: true }).click();
      expect((await assigned).status()).toBe(201);
      await expect(page.getByRole("row").filter({ hasText: username })).toContainText("editor");

      await loginAs(editorSide.page, username);
      const me = await browserGet(editorSide.page, `${API}/auth/me`);
      await expectStatus(me, 200, "editor auth/me");
      const perms = (await me.json()).effectivePermissions as string[];
      expect(perms).toContain("content.write");
      expect(perms).not.toContain("*");
      expect(perms).not.toContain("member.manage");

      // The server gate is the real enforcement, whatever the nav shows.
      const users = await browserGet(editorSide.page, `${WS_API}/users`);
      expect(users.status(), "an editor must not list operators").toBe(403);
      expect((await users.json()).code).toBe("FORBIDDEN");

      // And the editor can do the work the role is for: write a post through the editor UI.
      await editorSide.page.goto("/admin/posts");
      await editorSide.page.getByRole("button", { name: "New Post" }).click();
      await expect(editorSide.page).toHaveURL(/\/admin\/posts\/[^/]+$/);
      const postId = editorSide.page.url().split("/").pop()!;
      const post = await browserGet(editorSide.page, `${WS_API}/posts/${postId}`);
      await expectStatus(post, 200, "editor-created post read");

      // Opening the Users screen directly must not crash the shell or kick the editor out.
      await editorSide.page.goto("/admin/users");
      await expect(editorSide.page.locator(".admin-layout")).toBeVisible();
      await expect(editorSide.page.locator(".login-card")).toHaveCount(0);

      await logoutAsAdmin(editorSide.page);
      // The editor's logout revoked only the editor's session; the admin's still works.
      const adminMe = await request.get(`${API}/auth/me`);
      expect(adminMe.status()).toBe(200);
      expect(editorSide.errors, "uncaught page errors in the editor's session").toEqual([]);
    } finally {
      await editorSide.context.close();
      if (principalId) await deleteUser(request, principalId);
    }
  });

  // Asserts the INTENDED behaviour. The admin nav is not filtered by permission today (`panels.tsx`
  // carries no permission per panel; `AdminModulesProvider` only scopes the media module), so this
  // likely fails until the nav learns the session's grants.
  test("an editor's nav hides Users and Roles & Permissions but keeps Posts and Media", { tag: ["@unrun"] }, async ({ browser, request }) => {
    const editor = await createEditorViaApi(request);
    const editorSide = await freshContext(browser);
    try {
      await loginAs(editorSide.page, editor.username);
      const nav = editorSide.page.getByRole("navigation", { name: "Admin" });
      await expect(nav.getByRole("link", { name: "Posts", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Media", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Roles & Permissions", exact: true })).toHaveCount(0);
      await expect(editorSide.page).toHaveScreenshot("editor-nav.png", { mask: [editorSide.page.locator("main")] });
      expect(editorSide.errors).toEqual([]);
    } finally {
      await editorSide.context.close();
      await deleteUser(request, editor.principalId);
    }
  });

  test("a disabled editor cannot log in and gets a readable error", { tag: ["@unrun"] }, async ({ browser, request }) => {
    const editor = await createEditorViaApi(request);
    const editorSide = await freshContext(browser);
    try {
      const disabled = await request.post(`${WS_API}/users/${editor.principalId}/disable`);
      await expectStatus(disabled, 200, "user disable");
      await attemptLoginAsAdmin(editorSide.page, { username: editor.username, password: EDITOR_PASSWORD });
      await expect(editorSide.page.locator(".login-error")).toBeVisible();
      await expect(editorSide.page.locator(".admin-layout")).toHaveCount(0);
      expect(editorSide.errors).toEqual([]);
    } finally {
      await editorSide.context.close();
      await deleteUser(request, editor.principalId);
    }
  });
});
