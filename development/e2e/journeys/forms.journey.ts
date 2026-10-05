// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { APIRequestContext, Browser, BrowserContext } from "@playwright/test";

import { PUBLIC_URL, WS_API, createPublishedPageWithHtml, expect, test, uniq, uniqSlug } from "./_fixtures.js";

/**
 * Forms journeys (SCOPE.md W6, second half): build a form in the admin, embed it on a published
 * page, submit it as an anonymous visitor, and read the submission back in the admin.
 *
 * Public, no-login submission is INTENDED (owner, 2026-10-04): a form on a public page must accept
 * strangers. So the stress cases here are the abuse ones: honeypot spam, the per-(IP, form) rate
 * limit (5 / 60 s, burst 0, `features/forms/rate-limit-profile.ts`), a spoofed X-Forwarded-For not
 * resetting it, double submit, oversized and unknown fields, markup in answers, and an anonymous
 * caller never reading submissions back.
 *
 * Every test uses its OWN form, because the rate limiter keys on (source IP, form id) and every
 * request in this suite comes from the same loopback IP.
 *
 * Public markup comes from `apps/website/src/features/forms/html-render.ts`; the submit route is
 * `server/inbound/public-http/routes/site/forms-submit.ts` (JSON for fetch callers, a 303 PRG for a
 * real `Accept: text/html` form post).
 */
interface FieldSpec {
  id: string;
  label: string;
  type: "text" | "email" | "textarea" | "checkbox";
  required?: boolean;
  maxLength?: number;
}

const DEFAULT_FIELDS: FieldSpec[] = [
  { id: "email", label: "Email", type: "email", required: true },
  { id: "message", label: "Message", type: "textarea", required: true, maxLength: 500 },
];

async function createForm(request: APIRequestContext, slug: string, fields: FieldSpec[] = DEFAULT_FIELDS): Promise<{ id: string; slug: string }> {
  const res = await request.post(`${WS_API}/forms`, { data: { name: `Form ${slug}`, slug, fields } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data;
}

/** Publishes a page that embeds the form, returning its public path. */
async function embedForm(request: APIRequestContext, slug: string): Promise<string> {
  const pageSlug = uniqSlug("contact");
  await createPublishedPageWithHtml(request, {
    title: `Contact ${slug}`,
    slug: pageSlug,
    html: `<main><h1>Contact</h1><div data-embed-config='{"type":"form","id":"${slug}","mode":"html"}'></div></main>`,
  });
  return `/${pageSlug}`;
}

async function listSubmissions(request: APIRequestContext, slug: string): Promise<Array<{ data: Record<string, unknown> }>> {
  const res = await request.get(`${WS_API}/forms/${slug}/submissions`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).data;
}

/** A visitor context with no admin cookie: public submission must work without a login. */
async function visitorContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: PUBLIC_URL });
}

function submitJson(request: APIRequestContext, slug: string, data: Record<string, unknown>, headers: Record<string, string> = {}) {
  return request.post(`${PUBLIC_URL}/forms/${slug}/submit`, { data, headers: { accept: "application/json", ...headers }, maxRedirects: 0 });
}

test.describe("W6 forms", () => {
  test("build a form in the admin, embed it, a logged-out visitor submits, the admin sees the answer", { tag: ["@unrun"] }, async ({ page, request, browser }) => {
    const slug = uniqSlug("contact-form");
    await page.goto("/admin/forms");
    await page.getByRole("link", { name: "New form" }).click();
    await expect(page).toHaveURL(/\/admin\/forms\/new$/);
    await page.locator("#form-name").fill(uniq("Contact form"));
    await page.locator("#form-slug").fill(slug);
    await page.getByLabel("Field 1 id").fill("email");
    await page.getByLabel("Field 1 label").fill("Your email");
    await page.getByLabel("Field 1 type").selectOption("email");
    await page.getByLabel("Field 1 required").check();
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByLabel("Field 2 id").fill("message");
    await page.getByLabel("Field 2 label").fill("Message");
    await page.getByLabel("Field 2 type").selectOption("textarea");
    await page.getByRole("button", { name: "Create form" }).click();
    await expect(page.getByRole("tab", { name: "Submissions" })).toBeVisible();

    const pagePath = await embedForm(request, slug);
    const visitor = await visitorContext(browser);
    const v = await visitor.newPage();
    await v.goto(pagePath);
    const form = v.locator(`form[data-tovu-form="${slug}"]`);
    await expect(form).toBeVisible();
    await form.getByLabel("Your email").fill("visitor@example.test");
    await form.getByLabel("Message").fill("Hello from a stranger");
    await form.getByRole("button", { name: "Send" }).click();
    await expect(v.locator(`[data-tovu-form-success][data-form-slug="${slug}"]`)).toHaveText("Thanks — your message has been sent.");
    await expect(v.locator(`[data-tovu-form-error][data-form-slug="${slug}"]`)).toBeHidden();
    await visitor.close();

    await page.goto(`/admin/forms/${slug}/submissions`);
    await expect(page.getByRole("tab", { name: "Submissions", selected: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "visitor@example.test" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Hello from a stranger" })).toBeVisible();
  });

  test("forms list, builder and submissions baselines", { tag: ["@unrun"] }, async ({ page, request }) => {
    const slug = uniqSlug("baseline-form");
    await createForm(request, slug);
    await submitJson(request, slug, { email: "a@example.test", message: "baseline" });
    await page.goto("/admin/forms");
    await expect(page.getByText(slug)).toBeVisible();
    await expect(page).toHaveScreenshot("forms-list.png", { mask: [page.locator("time, [data-relative-time]")] });
    await page.goto(`/admin/forms/${slug}`);
    await expect(page.getByLabel("Field 1 id")).toHaveValue("email");
    await expect(page).toHaveScreenshot("form-builder.png");
    await page.goto(`/admin/forms/${slug}/submissions`);
    await expect(page.getByRole("cell", { name: "a@example.test" })).toBeVisible();
    await expect(page).toHaveScreenshot("form-submissions.png", { mask: [page.getByRole("cell", { name: /^\d{4}-\d{2}-\d{2}T/ })] });
  });
});

test.describe("forms abuse and stress (public, no login)", () => {
  test("a filled honeypot looks like success to the bot but stores nothing", { tag: ["@unrun"] }, async ({ request, browser }) => {
    const slug = uniqSlug("honeypot");
    await createForm(request, slug);
    const pagePath = await embedForm(request, slug);
    const visitor = await visitorContext(browser);
    const v = await visitor.newPage();
    await v.goto(pagePath);
    const form = v.locator(`form[data-tovu-form="${slug}"]`);
    await form.getByLabel("Email").fill("bot@example.test");
    await form.getByLabel("Message").fill("cheap pills");
    // A bot fills every input it finds, including the hidden one a human never sees.
    await form.locator('input[name="_hp"]').evaluate((el: HTMLInputElement) => (el.value = "http://spam.example"));
    await form.getByRole("button", { name: "Send" }).click();
    await expect(v.locator(`[data-tovu-form-success][data-form-slug="${slug}"]`)).toBeVisible();
    await visitor.close();
    expect(await listSubmissions(request, slug), "a honeypot hit must be discarded").toEqual([]);
  });

  test("the sixth submission inside a minute is refused with 429 and a retry hint; the first five are stored", { tag: ["@unrun"] }, async ({ request }) => {
    const slug = uniqSlug("ratelimit");
    await createForm(request, slug);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await submitJson(request, slug, { email: `r${i}@example.test`, message: `try ${i}` });
      statuses.push(res.status());
      if (i === 5) {
        const body = await res.json();
        expect(body.code).toBe("FORMS_RATE_LIMIT_EXCEEDED");
        expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
      }
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(await listSubmissions(request, slug)).toHaveLength(5);
  });

  test("a spoofed X-Forwarded-For does not reset the rate limit (no trusted proxy configured)", { tag: ["@unrun"] }, async ({ request }) => {
    const slug = uniqSlug("xff");
    await createForm(request, slug);
    for (let i = 0; i < 5; i++) {
      expect((await submitJson(request, slug, { email: `x${i}@example.test`, message: "m" })).status()).toBe(201);
    }
    const spoofed = await submitJson(request, slug, { email: "x6@example.test", message: "m" }, { "x-forwarded-for": "203.0.113.77" });
    expect(spoofed.status(), "a client-supplied forwarding header must not mint a fresh rate-limit bucket").toBe(429);
  });

  test("a rate-limited browser submission shows the error alert, not the success notice", { tag: ["@unrun"] }, async ({ request, browser }) => {
    const slug = uniqSlug("ratelimit-ui");
    await createForm(request, slug);
    const pagePath = await embedForm(request, slug);
    for (let i = 0; i < 5; i++) await submitJson(request, slug, { email: `u${i}@example.test`, message: "m" });
    const visitor = await visitorContext(browser);
    const v = await visitor.newPage();
    await v.goto(pagePath);
    const form = v.locator(`form[data-tovu-form="${slug}"]`);
    await form.getByLabel("Email").fill("late@example.test");
    await form.getByLabel("Message").fill("one too many");
    await form.getByRole("button", { name: "Send" }).click();
    await expect(v.locator(`[data-tovu-form-error][data-form-slug="${slug}"]`)).toBeVisible();
    await expect(v.locator(`[data-tovu-form-success][data-form-slug="${slug}"]`)).toBeHidden();
    await visitor.close();
  });

  test("double-clicking Send stores exactly one submission", { tag: ["@unrun"] }, async ({ request, browser }) => {
    const slug = uniqSlug("double-submit");
    await createForm(request, slug);
    const pagePath = await embedForm(request, slug);
    const visitor = await visitorContext(browser);
    const v = await visitor.newPage();
    await v.goto(pagePath);
    const form = v.locator(`form[data-tovu-form="${slug}"]`);
    await form.getByLabel("Email").fill("double@example.test");
    await form.getByLabel("Message").fill("only once please");
    await form.getByRole("button", { name: "Send" }).dblclick();
    await expect(v.locator(`[data-tovu-form-success][data-form-slug="${slug}"]`)).toBeVisible();
    await visitor.close();
    expect(await listSubmissions(request, slug), "a double click must not store the same message twice").toHaveLength(1);
  });

  test("required and maxLength are enforced server-side even when the browser's checks are bypassed", { tag: ["@unrun"] }, async ({ request }) => {
    const slug = uniqSlug("validation");
    await createForm(request, slug);
    const missing = await submitJson(request, slug, { message: "no email" });
    expect(missing.status()).toBe(400);
    const tooLong = await submitJson(request, slug, { email: "long@example.test", message: "x".repeat(501) });
    expect(tooLong.status()).toBe(400);
    const notEmail = await submitJson(request, slug, { email: "not-an-email", message: "m" });
    expect(notEmail.status()).toBe(400);
    expect(await listSubmissions(request, slug)).toEqual([]);
  });

  test("unknown fields, prototype keys and oversized values never reach the stored answer", { tag: ["@unrun"] }, async ({ request }) => {
    const slug = uniqSlug("unknown-fields");
    await createForm(request, slug, [{ id: "message", label: "Message", type: "textarea" }]);
    // Raw JSON text: an object literal's `__proto__` key sets the prototype instead of an own key.
    const res = await request.post(`${PUBLIC_URL}/forms/${slug}/submit`, {
      headers: { "content-type": "application/json", accept: "application/json" },
      data: `{"message":"${"y".repeat(20_000)}","is_admin":"true","__proto__":{"polluted":"yes"},"constructor":"x"}`,
      maxRedirects: 0,
    });
    expect([201, 400]).toContain(res.status());
    const after = await submitJson(request, slug, { message: "still healthy" });
    expect(after.status(), "the server must keep answering normally after a hostile body").toBe(201);
    const stored = await listSubmissions(request, slug);
    for (const s of stored) {
      expect(Object.keys(s.data)).toEqual(["message"]);
      expect(String(s.data.message).length).toBeLessThanOrEqual(5_000);
    }
  });

  test("markup in an answer renders as text in the admin submissions table", { tag: ["@unrun"] }, async ({ page, request }) => {
    const slug = uniqSlug("xss");
    await createForm(request, slug);
    const payload = `<img src=x onerror="window.__pwned=1">`;
    expect((await submitJson(request, slug, { email: "xss@example.test", message: payload })).status()).toBe(201);
    let dialogs = 0;
    page.on("dialog", async (d) => {
      dialogs += 1;
      await d.dismiss();
    });
    await page.goto(`/admin/forms/${slug}/submissions`);
    await expect(page.getByRole("cell", { name: payload })).toBeVisible();
    await page.getByRole("button", { name: "View" }).first().click();
    await expect(page.getByRole("cell", { name: payload })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialogs).toBe(0);
  });

  test("an anonymous caller can submit but can never list or read submissions", { tag: ["@unrun"] }, async ({ request, browser }) => {
    const slug = uniqSlug("private-answers");
    await createForm(request, slug);
    await submitJson(request, slug, { email: "secret@example.test", message: "private" });
    const visitor = await visitorContext(browser);
    const list = await visitor.request.get(`${PUBLIC_URL}${WS_API}/forms/${slug}/submissions`);
    expect(list.status()).toBe(401);
    expect(await list.text()).not.toContain("secret@example.test");
    await visitor.close();
  });

  test("an unknown form slug answers 404 and does not echo the slug as HTML", { tag: ["@unrun"] }, async ({ request }) => {
    const res = await submitJson(request, encodeURIComponent("<b>nope</b>"), { message: "m" });
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain("<b>");
  });
});
