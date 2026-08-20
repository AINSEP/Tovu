import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Regression coverage for the `safeHref` open-redirect fix (`src/server/http/site/render.ts`,
 * 2026-08-20 — audit finding "safeHref accepts protocol-relative URLs").
 *
 * `safeHref` used to allow any href starting with a single `/` through unchanged, which admits a
 * PROTOCOL-RELATIVE url like `"//evil.example"`: a browser resolves that against the current page's
 * own scheme (`https://evil.example`), not against this site's own origin — an open-redirect/
 * phishing primitive dressed up as an ordinary on-site link. This is reachable through the SAME
 * "Link" toolbar button and `window.prompt` flow `post-editor-toolbar.spec.ts`'s own "full chain"
 * test already exercises for an ordinary `https://` link (this suite copies its helpers rather than
 * importing them — see that file's own header for why this directory duplicates small scenario
 * setup instead of sharing it).
 *
 * Unlike the unit-level coverage in `render.test.ts`/`tiptap-render-contract.test.ts` (which feeds
 * hand-authored `bodyJson` straight into the renderer), this test proves the WHOLE path: a real
 * browser typing into the real editor, through the real "Link" prompt, through a real publish, onto
 * the real served public HTML — the same "click it, assert what got PERSISTED and SERVED" discipline
 * `post-editor-toolbar.spec.ts`'s own header states for itself.
 */

const API_BASE_URL = "http://localhost:7851"; // must match playwright.post-editor.config.ts's API_PORT

/** Copied from `post-editor-toolbar.spec.ts` — see that file's own header for why. */
async function openFreshPost(page: Page): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const slug = await page.getByLabel("URL slug").inputValue();
  return { id, slug };
}

/** Copied from `post-editor-toolbar.spec.ts` — see that file's own header for why. */
function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

/** Copied from `post-editor-toolbar.spec.ts` — see that file's own header for why. */
async function saveAndWaitForConfirmation(page: Page, label: "Saved" | "Published" = "Saved"): Promise<void> {
  await page.getByRole("button", { name: label === "Published" ? "Publish" : /^Save/ }).click();
  await expect(page.locator(".save-ok")).toContainText(label, { timeout: 10_000 });
}

test.describe("Post editor Link toolbar — open-redirect fix (2026-08-20)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("a protocol-relative link URL is neutralized to '#' on the real published public page, never left pointing off-site", async ({
    page,
    request,
  }) => {
    const { slug } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("click me");

    // Select the whole (one-word... well, two-word) paragraph and drive the real "Link" toolbar
    // button, same triple-click + native-dialog pattern `post-editor-toolbar.spec.ts`'s own
    // `selectWordAndToggleMark`/full-chain test already establishes for this exact control — the
    // prompt is a real `window.prompt`, not a fillable in-app dialog, so it can only be answered via
    // Playwright's `page.on('dialog')` API, not a locator.
    await page.getByText("click me", { exact: true }).click({ clickCount: 3 });
    page.once("dialog", (dialog) => dialog.accept("//evil.example"));
    await page.getByTitle("Link", { exact: true }).click();

    // Publish (not Save): the public site only serves published posts.
    await saveAndWaitForConfirmation(page, "Published");

    // Fetched via `request` (Playwright's own HTTP client, not `page.evaluate`/`fetch`): the public
    // site is served by the API process directly, a different origin from the admin SPA's Vite dev
    // server in this config — same reasoning `post-editor-toolbar.spec.ts`'s own full-chain test
    // states for itself.
    const publicUrl = `${API_BASE_URL}/${slug}`;
    const res = await request.get(publicUrl);
    expect(res.status(), `expected the published post to be publicly reachable at ${publicUrl}`).toBe(200);
    const html = await res.text();

    // FIX target: the rendered anchor's href must never be the raw attacker-chosen protocol-relative
    // string — safeHref collapses it to "#" (in-page, inert) rather than emitting it unchanged.
    expect(html, `served HTML must not contain the raw protocol-relative href, got: ${html}`).not.toContain(
      'href="//evil.example"'
    );
    expect(html).toContain('<a href="#">click me</a>');

    // Belt-and-braces: load the REAL public page in the browser and read the DOM property a browser
    // would actually navigate on click, not just the serialized attribute string — `HTMLAnchorElement
    // .href` is the browser's OWN fully-resolved interpretation, so this proves the fix from the
    // reader's actual point of view, not just from the HTML source text.
    await page.goto(publicUrl);
    const resolvedHref = await page.locator('a:has-text("click me")').first().evaluate((el) => (el as HTMLAnchorElement).href);
    expect(new URL(resolvedHref).hostname, `the rendered link must resolve on-site, not to evil.example — resolved to: ${resolvedHref}`).not.toBe(
      "evil.example"
    );
  });
});
