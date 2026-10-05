// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { APIRequestContext, Page } from "@playwright/test";

import { API, PUBLIC_URL, createPublishedPageWithHtml, expect, fetchPublic, test, uniq, uniqSlug } from "./_fixtures.js";

/**
 * Collections journeys (SCOPE.md W6, first half): define a content type in the admin, add an entry,
 * publish it, see it rendered by a `{"type":"collection"}` page marker, plus the stress cases from
 * the 2026-10-04 ideas report (two-tab entry version conflict, double Publish, duplicate slug,
 * required-field validation, unicode field values).
 *
 * Selectors come from `apps/admin/src/features/collections/` (`Collections.tsx` modal `#ct-label` /
 * `#ct-key`, `CollectionEntryEditor.tsx` "Entry title" / "Entry slug" / `entry-field-<name>`,
 * `.save-ok` / `.save-error`). Content types and entries are NOT workspace-scoped in the API
 * (`/api/admin/v1/content-types`, `/api/admin/v1/entries`), unlike posts.
 *
 * Content-type keys must match `^[a-z][a-z0-9_]*$`, so keys here use `_`, never `-`.
 */
const ENTRY_ITEM = /\/api\/admin\/v1\/entries\/[^/?]+$/;

function typeKey(prefix: string): string {
  return uniqSlug(prefix).replace(/-/g, "_");
}

/** Registers a content type through the API; the UI path has its own test below. */
async function createType(request: APIRequestContext, key: string, label: string): Promise<void> {
  const res = await request.post(`${API}/content-types`, {
    data: {
      key,
      label,
      fields: [
        { name: "summary", kind: "text", required: true },
        { name: "servings", kind: "integer", queryable: true },
      ],
    },
  });
  expect(res.status(), await res.text()).toBe(201);
}

async function createEntry(request: APIRequestContext, key: string, slug: string, title: string): Promise<{ id: string; version: number }> {
  const res = await request.post(`${API}/entries`, { data: { type: key, slug, title } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).entry;
}

/** There is no GET-by-id entry route; read back through the typed list (`GET /entries?type=`). */
async function readEntry(request: APIRequestContext, key: string, id: string): Promise<{ title: string; status: string }> {
  const res = await request.get(`${API}/entries?type=${key}`);
  expect(res.status()).toBe(200);
  const entry = ((await res.json()).items as Array<{ id: string; title: string; status: string }>).find((e) => e.id === id);
  if (!entry) throw new Error(`entry ${id} not in the ${key} list`);
  return entry;
}

async function openEntry(page: Page, key: string, slug: string): Promise<void> {
  await page.goto(`/admin/collections/${key}/${slug}`);
  await expect(page.getByRole("textbox", { name: "Entry title" })).toBeVisible();
}

test.describe("W6 collections", () => {
  test("define a content type in the modal, add an entry, publish it, and a page marker renders it publicly", { tag: ["@unrun"] }, async ({ page, request }) => {
    const key = typeKey("recipe");
    const label = uniq("Recipes");
    await page.goto("/admin/collections");
    await page.getByRole("button", { name: "New content type" }).click();
    const dialog = page.getByRole("dialog", { name: "New content type" });
    await dialog.locator("#ct-label").fill(label);
    await dialog.locator("#ct-key").fill(key);
    await dialog.getByRole("button", { name: "Add field" }).click();
    await dialog.getByLabel("Name").last().fill("summary");
    await dialog.getByLabel("Required").last().check();
    await dialog.getByRole("button", { name: "Create content type" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(label)).toBeVisible();

    await page.goto(`/admin/collections/${key}`);
    await page.getByRole("button", { name: "New entry" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/collections/${key}/new$`));
    const title = uniq("Shakshuka");
    const slug = uniqSlug("shakshuka");
    await page.getByRole("textbox", { name: "Entry title" }).fill(title);
    await page.getByRole("textbox", { name: "Entry slug" }).fill(slug);
    await page.locator("#entry-field-summary").fill("Eggs poached in spiced tomato.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();

    const pageSlug = uniqSlug("recipes-page");
    await createPublishedPageWithHtml(request, {
      title: "Recipes page",
      slug: pageSlug,
      html: `<main><div data-embed-config='{"type":"collection","id":"${key}","fields":["summary"]}'><p>fallback</p></div></main>`,
    });
    const live = await fetchPublic(request, `/${pageSlug}`);
    expect(live.status).toBe(200);
    expect(live.html).toContain("data-tovu-entry-list");
    expect(live.html).toContain(title);
    expect(live.html).toContain("Eggs poached in spiced tomato.");
    expect(live.html, "the authored fallback is replaced once a published entry exists").not.toContain("<p>fallback</p>");

    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    const hidden = await fetchPublic(request, `/${pageSlug}`);
    expect(hidden.html, "an unpublished entry must leave the public list").not.toContain(title);
  });

  test("collections list, entries list and entry editor baselines", { tag: ["@unrun"] }, async ({ page, request }) => {
    const key = typeKey("baseline");
    await createType(request, key, "Baseline Type");
    await createEntry(request, key, "baseline-entry", "Baseline entry");
    await page.goto("/admin/collections");
    await expect(page.getByText("Baseline Type")).toBeVisible();
    await expect(page).toHaveScreenshot("collections-list.png", { mask: [page.locator("time, [data-relative-time]")] });
    await page.goto(`/admin/collections/${key}`);
    await expect(page.getByText("Baseline entry")).toBeVisible();
    await expect(page).toHaveScreenshot("collection-entries.png", { mask: [page.locator("time, [data-relative-time]")] });
    await openEntry(page, key, "baseline-entry");
    await expect(page).toHaveScreenshot("collection-entry-editor.png");
  });
});

test.describe("collections stress", () => {
  test("two tabs save the same entry: one wins, the other gets dedicated conflict copy (not the raw server message) and keeps its text", { tag: ["@unrun"] }, async ({ page, context, request }) => {
    const key = typeKey("conflict");
    await createType(request, key, "Conflict Type");
    const slug = uniqSlug("contested");
    const { id } = await createEntry(request, key, slug, "Contested");
    await openEntry(page, key, slug);
    const other = await context.newPage();
    await openEntry(other, key, slug);

    const statuses: number[] = [];
    for (const p of [page, other]) {
      p.on("response", (r) => {
        if (r.request().method() === "PUT" && ENTRY_ITEM.test(new URL(r.url()).pathname)) statuses.push(r.status());
      });
    }
    const titleB = uniq("Tab B loses");
    await page.getByRole("textbox", { name: "Entry title" }).fill(uniq("Tab A wins"));
    await page.locator("#entry-field-summary").fill("A");
    await other.getByRole("textbox", { name: "Entry title" }).fill(titleB);
    await other.locator("#entry-field-summary").fill("B");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    await other.getByRole("button", { name: "Save" }).click();

    const error = other.locator(".save-error");
    await expect(error).toBeVisible();
    // INTENDED behaviour (likely bug today): posts have dedicated copy; an entry 409 shows the raw
    // server message from `describeApiError`. The ideas report tracks this.
    await expect(error).toContainText(/saved this while you were editing/i);
    await expect(error).not.toContainText(/expected ?version|VERSION_CONFLICT/i);
    await expect(other.getByRole("textbox", { name: "Entry title" })).toHaveValue(titleB);
    expect(statuses.sort()).toEqual([200, 409]);
    expect((await readEntry(request, key, id)).title).toMatch(/^Tab A wins/);
    await other.close();
  });

  test("double-clicking Publish sends one lifecycle call and leaves no error", { tag: ["@unrun"] }, async ({ page, request }) => {
    const key = typeKey("dblpub");
    await createType(request, key, "Double Publish Type");
    const slug = uniqSlug("double");
    await createEntry(request, key, slug, "Double publish");
    await openEntry(page, key, slug);
    await page.locator("#entry-field-summary").fill("Required summary present.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    let lifecycleCalls = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/entries\/[^/]+\/lifecycle$/.test(new URL(r.url()).pathname)) lifecycleCalls += 1;
    });
    await page.locator('[data-agent-element="entry-publish"]').dblclick();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
    await expect(page.locator(".save-error")).toHaveCount(0);
    expect(lifecycleCalls, "a double click must not send a second, version-stale publish").toBe(1);
  });

  test("a duplicate entry slug is refused with a readable message and nothing is overwritten", { tag: ["@unrun"] }, async ({ page, request }) => {
    const key = typeKey("dupslug");
    await createType(request, key, "Dup Slug Type");
    const slug = uniqSlug("taken");
    const { id } = await createEntry(request, key, slug, "Original owner");
    await page.goto(`/admin/collections/${key}/new`);
    await page.getByRole("textbox", { name: "Entry title" }).fill("Impostor");
    await page.getByRole("textbox", { name: "Entry slug" }).fill(slug);
    await page.locator("#entry-field-summary").fill("x");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".save-error")).toContainText(/slug/i);
    await expect(page).toHaveURL(new RegExp(`/admin/collections/${key}/new$`));
    expect((await readEntry(request, key, id)).title).toBe("Original owner");
  });

  test("publishing with a required field empty is refused and names the field", { tag: ["@unrun"] }, async ({ page, request }) => {
    const key = typeKey("required");
    await createType(request, key, "Required Type");
    const slug = uniqSlug("empty-summary");
    await createEntry(request, key, slug, "Missing summary");
    await openEntry(page, key, slug);
    await expect(page.getByText("summary *")).toBeVisible();
    await page.locator('[data-agent-element="entry-publish"]').click();
    await expect(page.locator(".save-error, [role=alert]").first()).toContainText(/summary/i);
    await expect(page.getByRole("button", { name: "Unpublish" })).toHaveCount(0);
  });

  test("unicode and markup in field values round-trip through the editor and render escaped publicly", { tag: ["@unrun"] }, async ({ page, request }) => {
    const key = typeKey("unicode");
    await createType(request, key, "Unicode Type");
    const slug = uniqSlug("unicode");
    await createEntry(request, key, slug, "Ünïcødé 🚀 مرحبا");
    await openEntry(page, key, slug);
    const summary = `Grüße 漢字 <script>alert(1)</script> & "quotes" ${"é".repeat(2000)}`;
    await page.locator("#entry-field-summary").fill(summary);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    await page.reload();
    await expect(page.locator("#entry-field-summary")).toHaveValue(summary);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();

    const pageSlug = uniqSlug("unicode-page");
    await createPublishedPageWithHtml(request, {
      title: "Unicode list",
      slug: pageSlug,
      html: `<div data-embed-config='{"type":"collection","id":"${key}","fields":["summary"]}'></div>`,
    });
    const live = await fetchPublic(request, `/${pageSlug}`);
    expect(live.html).toContain("Ünïcødé 🚀 مرحبا");
    expect(live.html, "field values must be escaped, never parsed as markup").not.toContain("<script>alert(1)</script>");
    const visitor = await page.context().newPage();
    let dialogs = 0;
    visitor.on("dialog", async (d) => {
      dialogs += 1;
      await d.dismiss();
    });
    await visitor.goto(`${PUBLIC_URL}/${pageSlug}`);
    await expect(visitor.getByText("<script>alert(1)</script>", { exact: false })).toBeVisible();
    expect(dialogs).toBe(0);
    await visitor.close();
  });
});
