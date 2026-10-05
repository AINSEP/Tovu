// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page } from "@playwright/test";

import { attemptLoginAsAdmin } from "../auth-fixtures.js";
import { API, JOURNEY_ADMIN_PASSWORD, JOURNEY_ADMIN_USER, PUBLIC_URL, WS_API, expect, fetchPublic, stubPostsListForBaseline, test, uniq, uniqSlug } from "./_fixtures.js";

/**
 * Posts journeys (SCOPE.md W2) plus the stress cases from the 2026-10-04 ideas report: two-tab
 * version conflict, double submit, refresh mid-save, session expiry mid-edit, long unicode content,
 * many posts, the Content analysis card (AW-7 Tier 2) and the preview iframe sandbox.
 *
 * Selectors come from `apps/admin/src/features/posts/PostEditor.tsx` and the proven
 * `post-editor-preview-branches.spec.ts` (title placeholder "Post title", `.save-ok`/`.save-error`,
 * `[data-agent-element=post-body] .ProseMirror`, the status `<select>` handle `post-status`).
 * A published post is served at `/<slug>` on the public origin.
 */
const POSTS_COLLECTION = new RegExp(`${WS_API}/posts$`);
const POST_ITEM = new RegExp(`${WS_API}/posts/[^/?]+$`);

async function newPost(page: Page): Promise<{ id: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  return { id: page.url().split("/").pop()! };
}

async function typeBody(page: Page, text: string): Promise<void> {
  await page.locator('[data-agent-element="post-body"] .ProseMirror').click();
  await page.keyboard.insertText(text);
}

function titleInput(page: Page) {
  return page.getByRole("textbox", { name: "Post title" });
}

async function readPost(page: Page, id: string): Promise<{ title: string; status: string; slug: string; version: number }> {
  const res = await page.request.get(`${WS_API}/posts/${id}`);
  expect(res.status()).toBe(200);
  return (await res.json()).post;
}

test.describe("W2 post lifecycle", () => {
  test("create, publish, see it public, unpublish hides it, trash and restore bring it back", { tag: ["@unrun"] }, async ({ page, request }) => {
    const title = uniq("Journey post");
    const body = `Body for ${title}`;
    const { id } = await newPost(page);
    await titleInput(page).fill(title);
    await typeBody(page, body);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator(".save-ok")).toContainText("Published");
    const slug = await page.getByLabel("URL slug").inputValue();

    const live = await fetchPublic(request, `/${slug}`);
    expect(live.status).toBe(200);
    expect(live.html).toContain(title);
    expect(live.html).toContain(body);

    await page.locator('[data-agent-element="post-status"]').selectOption("draft");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    const hidden = await fetchPublic(request, `/${slug}`);
    expect(hidden.status, "an unpublished post must not be served publicly").toBe(404);
    expect(hidden.html).not.toContain(body);

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Move to trash" }).click();
    await expect(page).toHaveURL(/\/admin\/posts$/);
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto("/admin/trash");
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await row.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Restored.")).toBeVisible();
    await page.goto("/admin/posts");
    await expect(page.getByText(title)).toBeVisible();
    expect((await readPost(page, id)).title).toBe(title);
  });

  test("posts list and editor baselines", { tag: ["@unrun"] }, async ({ page }) => {
    await stubPostsListForBaseline(page);
    await page.goto("/admin/posts");
    await expect(page.getByRole("button", { name: "New Post" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Baseline draft post", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot("posts-list.png");
    await newPost(page);
    await expect(titleInput(page)).toBeVisible();
    await expect(page).toHaveScreenshot("post-editor-empty.png", { mask: [page.getByLabel("URL slug")] });
  });
});

test.describe("posts stress", () => {
  test("two tabs save the same post: exactly one wins, the other sees the version-conflict banner and keeps its text", { tag: ["@unrun"] }, async ({ page, context }) => {
    const { id } = await newPost(page);
    await titleInput(page).fill(uniq("Conflict base"));
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".save-ok")).toBeVisible();

    const other = await context.newPage();
    await other.goto(page.url());
    await expect(titleInput(other)).toHaveValue(/Conflict base/);

    const titleA = uniq("Tab A wins");
    const titleB = uniq("Tab B loses");
    await titleInput(page).fill(titleA);
    await titleInput(other).fill(titleB);

    const statuses: number[] = [];
    for (const p of [page, other]) {
      p.on("response", (r) => {
        if (r.request().method() === "PUT" && POST_ITEM.test(new URL(r.url()).pathname)) statuses.push(r.status());
      });
    }
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    await other.getByRole("button", { name: /^Save/ }).click();

    const banner = other.locator('[data-agent-element="post-version-conflict"]');
    await expect(banner).toContainText("Someone else saved this while you were editing");
    await expect(titleInput(other), "the losing tab keeps its own unsaved text").toHaveValue(titleB);
    expect(statuses.sort()).toEqual([200, 409]);
    expect((await readPost(page, id)).title).toBe(titleA);

    await other.getByRole("button", { name: "Save anyway" }).click();
    await expect(banner).toHaveCount(0);
    expect((await readPost(page, id)).title).toBe(titleB);
    await other.close();
  });

  test("simultaneous saves from two tabs: one 200, one 409, never two silent overwrites", { tag: ["@unrun"] }, async ({ page, context }) => {
    await newPost(page);
    await titleInput(page).fill(uniq("Race base"));
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    const other = await context.newPage();
    await other.goto(page.url());
    await titleInput(page).fill(uniq("Race A"));
    await titleInput(other).fill(uniq("Race B"));
    const waitPut = (p: Page) => p.waitForResponse((r) => r.request().method() === "PUT" && POST_ITEM.test(new URL(r.url()).pathname));
    const [a, b] = await Promise.all([
      waitPut(page),
      waitPut(other),
      page.getByRole("button", { name: /^Save/ }).click(),
      other.getByRole("button", { name: /^Save/ }).click(),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([200, 409]);
    await other.close();
  });

  test("double-clicking New Post creates exactly one post", { tag: ["@unrun"] }, async ({ page }) => {
    let creates = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && POSTS_COLLECTION.test(new URL(r.url()).pathname)) creates += 1;
    });
    await page.goto("/admin/posts");
    await page.getByRole("button", { name: "New Post" }).dblclick();
    await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
    await expect(titleInput(page)).toBeVisible();
    expect(creates).toBe(1);
  });

  test("double-clicking Publish publishes once and leaves one Published notice", { tag: ["@unrun"] }, async ({ page }) => {
    await newPost(page);
    await titleInput(page).fill(uniq("Double publish"));
    let puts = 0;
    page.on("request", (r) => {
      if (r.method() === "PUT" && POST_ITEM.test(new URL(r.url()).pathname)) puts += 1;
    });
    await page.getByRole("button", { name: "Publish" }).dblclick();
    await expect(page.locator(".save-ok")).toContainText("Published");
    await expect(page.locator(".save-error")).toHaveCount(0);
    expect(puts, "a double click must not send a second, version-stale save").toBe(1);
  });

  test("reload while a save is in flight never silently loses the typed title", { tag: ["@unrun"] }, async ({ page }) => {
    const { id } = await newPost(page);
    const title = uniq("Mid-save reload");
    await titleInput(page).fill(title);
    await page.route(POST_ITEM, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 3_000)); // slow network, not a test wait
      await route.continue().catch(() => undefined);
    });
    await page.getByRole("button", { name: /^Save/ }).click();
    await page.reload();
    await page.unroute(POST_ITEM);
    const restore = page.locator('[data-agent-element="post-autosave-restore"]');
    await expect
      .poll(async () => (await readPost(page, id)).title === title || (await restore.isVisible()), { timeout: 15_000 })
      .toBe(true);
  });

  test("offline save shows an error and keeps the text in the editor", { tag: ["@unrun"] }, async ({ page, context }) => {
    await newPost(page);
    const title = uniq("Offline save");
    await titleInput(page).fill(title);
    await context.setOffline(true);
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".save-error")).toBeVisible();
    await expect(titleInput(page)).toHaveValue(title);
    await context.setOffline(false);
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
  });

  test("long unicode title and a very long body publish and render publicly intact", { tag: ["@unrun"] }, async ({ page, request }) => {
    const title = `Ünïcødé 🚀 مرحبا 漢字 Ελληνικά — ${uniq("long")}`;
    const paragraph = "Grüße, naïve café, 😀👍🏽, שלום, ✓ <not-a-tag> & ampersand. ";
    const body = paragraph.repeat(400); // ~25k characters
    await newPost(page);
    await titleInput(page).fill(title);
    await typeBody(page, body);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator(".save-ok")).toContainText("Published");
    const slug = await page.getByLabel("URL slug").inputValue();
    expect(slug.length).toBeGreaterThan(0);
    const live = await page.context().newPage();
    const response = await live.goto(`${PUBLIC_URL}/${encodeURI(slug)}`);
    expect(response?.status()).toBe(200);
    await expect(live.getByText(title).first()).toBeVisible();
    await expect(live.getByText("<not-a-tag>").first(), "user text must be escaped, not parsed as markup").toBeVisible();
    const fetched = await fetchPublic(request, `/${encodeURI(slug)}`);
    expect(fetched.html).not.toContain("<not-a-tag>");
    await live.close();
  });

  test("60 posts: every one is reachable from the posts list", { tag: ["@unrun"] }, async ({ page }) => {
    const prefix = uniqSlug("bulk");
    for (let i = 0; i < 60; i++) {
      const res = await page.request.post(`${WS_API}/posts`, { data: { title: `${prefix} ${String(i).padStart(2, "0")}`, slug: `${prefix}-${i}`, status: "draft" } });
      expect(res.status()).toBe(201);
    }
    await page.goto("/admin/posts");
    const loadMore = page.getByRole("button", { name: /load more|next/i });
    for (let guard = 0; guard < 10 && (await page.getByText(`${prefix} 00`).count()) === 0; guard++) {
      if (!(await loadMore.isVisible())) break;
      await loadMore.click();
    }
    for (const n of ["00", "30", "59"]) await expect(page.getByText(`${prefix} ${n}`)).toBeVisible();
  });
});

test.describe("session expiry mid-edit", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a revoked session kicks to login on save, and the typed draft is offered back after re-login", { tag: ["@unrun"] }, async ({ page }) => {
    await attemptLoginAsAdmin(page, { username: JOURNEY_ADMIN_USER, password: JOURNEY_ADMIN_PASSWORD });
    await expect(page.locator(".admin-layout")).toBeVisible();
    const { id } = await newPost(page);
    const editorUrl = page.url();
    const typed = uniq("Typed before expiry");
    await typeBody(page, typed);
    // Revokes ONLY this test's own session (fresh context), never the shared storageState one.
    expect((await page.request.post(`${API}/auth/logout`)).ok()).toBe(true);
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".login-card")).toBeVisible();

    await attemptLoginAsAdmin(page, { username: JOURNEY_ADMIN_USER, password: JOURNEY_ADMIN_PASSWORD });
    await expect(page.locator(".admin-layout")).toBeVisible();
    await page.goto(editorUrl);
    const restore = page.locator('[data-agent-element="post-autosave-restore"]');
    const body = page.locator('[data-agent-element="post-body"]');
    await expect
      .poll(async () => (await restore.isVisible()) || (await body.textContent())?.includes(typed), { timeout: 15_000 })
      .toBe(true);
    if (await restore.isVisible()) await restore.click();
    await expect(body).toContainText(typed);
    expect(id).toBeTruthy();
  });
});

test.describe.serial("Content analysis card (AW-7 Tier 2)", () => {
  test("with the analyzer off, the editor shows no Content analysis card", { tag: ["@unrun"] }, async ({ page }) => {
    // `ContentAnalysisCard` returns null unless the plugin list says the analyzer is enabled, so
    // "off" means no card and no Analyze now button (the server's refusal is only reachable from a
    // card that was already open when the plugin went off — `plugins.journey.ts` covers that).
    // Wait for the plugin list first: before it arrives the card is hidden too.
    const pluginList = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === `${WS_API}/plugins` && r.ok());
    await newPost(page);
    await pluginList;
    await expect(titleInput(page)).toBeVisible();
    await expect(page.locator("section.content-analysis")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Analyze now" })).toHaveCount(0);
  });

  test("enabled from Plugins, a saved post shows score, words, TOC and checks; Analyze now covers unsaved edits", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/plugins?tab=downloaded");
    await page.getByRole("button", { name: "Enable Content Analyzer" }).click();
    await page.goto("/admin/plugins?tab=installed");
    await expect(page.getByRole("listitem", { name: "Content Analyzer" })).toBeVisible();

    await newPost(page);
    await titleInput(page).fill("A title long enough to pass the length check nicely");
    await page.locator('[data-agent-element="post-body"] .ProseMirror').click();
    await page.keyboard.type("Intro paragraph with a few words.");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Heading 2" }).click();
    await page.keyboard.type("Second section");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".save-ok")).toBeVisible();

    const card = page.locator("section.content-analysis");
    await expect(card).toContainText("From the last save.");
    await expect(card).toContainText("Score");
    await expect(card).toContainText("out of 100");
    await expect(card.getByRole("list", { name: "Table of contents" })).toContainText("Second section");
    await expect(card.getByRole("list", { name: "Checks" })).toContainText("Title length");

    await page.keyboard.type(" more unsaved words");
    await page.getByRole("button", { name: "Analyze now" }).click();
    await expect(card).toContainText("From your current draft, including unsaved changes.");
    await expect(card).toHaveScreenshot("content-analysis-card.png");
  });
});

test.describe("post preview sandbox", () => {
  test("every post preview iframe is sandboxed without top navigation", { tag: ["@unrun"] }, async ({ page }) => {
    await newPost(page);
    await typeBody(page, "Preview sandbox body");
    await page.getByRole("tab", { name: "Preview" }).click();
    const frame = page.getByTitle("Post preview", { exact: true });
    await expect(frame).toBeVisible();
    const sandbox = (await frame.getAttribute("sandbox")) ?? "";
    expect(sandbox.split(/\s+/)).toEqual(expect.arrayContaining(["allow-scripts"]));
    expect(sandbox).not.toContain("allow-top-navigation");
    expect(sandbox).not.toContain("allow-popups-to-escape-sandbox");
    await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  });
});
