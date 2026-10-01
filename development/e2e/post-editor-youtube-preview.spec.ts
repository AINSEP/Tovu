import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * The historical raw sandboxed draft preview could not initialize YouTube storage. Drafts now
 * use a navigated server-rendered preview, as published pages do. Exercise both current paths
 * with a controlled embed response that requires origin storage, avoiding external player traffic.
 */

const API_BASE_URL = "http://localhost:7851";

/** Copied (not imported) from `post-editor-preview-branches.spec.ts` — see that file's own header
 *  for why this directory duplicates small scenario setup instead of sharing it. */
async function openFreshPost(page: Page): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const slug = await page.getByLabel("URL slug").inputValue();
  return { id, slug };
}

function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

async function publishAndWaitForConfirmation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".save-ok")).toContainText("Published", { timeout: 10_000 });
}

test.describe("Post editor Preview tab — YouTube embed regression (2026-08-12)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Exercise browser restrictions using a deterministic embed that needs origin storage,
    // without depending on YouTube's network or player rollout.
    await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><script>try { localStorage.setItem("player-probe", "ready"); document.body.textContent = "Player ready"; } catch (error) { document.body.textContent = "Player blocked"; }</script></body></html>',
    }));
  });

  test("a draft's server-rendered preview initializes its YouTube embed without sandbox restrictions", async ({
    page,
  }) => {
    await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("hello world");

    page.once("dialog", (dialog) => dialog.accept("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    await page.click('button[title="Insert YouTube video"]');
    // Click back into plain text — collapses the atom's NodeSelection before anything else touches
    // the doc, matching the isolated repro this test locks in (a separate, still-open interaction
    // finding — inserting a mention immediately after an atom is still node-selected can replace
    // it — is out of THIS bug's scope; see this suite's own report for that disclosure).
    await page.getByText("hello world").click();

    await page.getByRole("tab", { name: "Preview" }).click();
    const iframe = page.getByTitle("Post preview", { exact: true });
    await expect(iframe).toBeVisible();
    expect(await iframe.getAttribute("sandbox")).toBeNull();
    expect(await iframe.getAttribute("srcdoc")).toBeNull();
    const preview = iframe.contentFrame();
    await expect(preview.locator("body")).toContainText("hello world");
    await expect(preview.locator(".embed-preview-unavailable")).toHaveCount(0);
    const player = preview.locator(".youtube-embed iframe");
    await expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(await player.getAttribute("sandbox")).toBeNull();
    await player.scrollIntoViewIfNeeded();
    await expect(player.contentFrame().locator("body")).toHaveText("Player ready");
  });

  test("published YouTube iframe retains its complete attributes and initializes a controlled player", async ({
    page,
  }) => {
    const { slug } = await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("hello world");
    page.once("dialog", (dialog) => dialog.accept("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    await page.click('button[title="Insert YouTube video"]');
    await page.getByText("hello world").click();
    await publishAndWaitForConfirmation(page);

    const res = await page.request.get(`${API_BASE_URL}/${slug}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div class="youtube-embed"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).not.toContain("embed-preview-unavailable");
    await page.goto(`${API_BASE_URL}/${slug}`);
    const player = page.locator(".youtube-embed iframe");
    await expect(player).toHaveCount(1);
    await expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(await player.getAttribute("sandbox")).toBeNull();
    await expect(player).toHaveAttribute("allowfullscreen", "");
    expect(await player.evaluate((element) => Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value])))).toEqual({
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      title: "YouTube video",
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
      allowfullscreen: "", loading: "lazy",
    });
    await player.scrollIntoViewIfNeeded();
    await expect(player.contentFrame().locator("body")).toHaveText("Player ready");
  });
});
