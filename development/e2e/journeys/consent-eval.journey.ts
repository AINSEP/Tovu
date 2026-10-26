// @unrun: authored 2026-10-25 under the owner's no-tests/no-servers instruction.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConsentConfig } from "@jini-ai/cms/consent";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "../support/bug-pin-fixtures.js";
import { createJourneyContentCleanup } from "../support/journey-content-cleanup.js";
import { WS_API, createPublishedPageWithHtml, expectStatus, uniqSlug } from "./_fixtures.js";

/** Binding consent-alpine-exception-OPUS-REVIEW.md T2: one Chromium journey through the
 * real page, draft/publish APIs, admin switch and visitor choices. The existing isolated-site
 * owner supplies a disposable fake test site, never an operator's site, and deletes its entire
 * runtime (including immutable policies and receipts) even on failure. No new server harness.
 * F3.1/F3.4: new Function executes in a self-hosted script, never in Playwright evaluate.
 * F5.2: Accept is the positive control for the otherwise-gated external script.
 * Mutations this must reject: always allow eval; ignore the flag; apply drafts before Publish;
 * drop the flag after Reject; release an external script without consent; remove the warning.
 */
const CONSENT_API = `${WS_API}/consent`;
const EXTERNAL_SCRIPT = "https://consent-eval.example.test/optional.js";
const WARNING = "Some themes need this. It weakens the site's script protection. Optional scripts still wait for consent.";

// Catch the expected EvalError so the journey's uncaught-error guard can remain strict. The
// independent CSP event distinguishes policy enforcement from a broken/missing fixture script.
const LOCAL_SCRIPT = String.raw`(() => {
  const result = document.querySelector('[data-testid="consent-eval-result"]');
  const violation = document.querySelector('[data-testid="consent-eval-csp"]');
  document.addEventListener('securitypolicyviolation', event => {
    if (event.blockedURI === 'eval') violation.textContent = event.effectiveDirective + ':eval';
  });
  try { result.textContent = new Function('return "eval-ran"')(); }
  catch (error) { result.textContent = 'blocked:' + error.name; }
})();`;

async function publishRestrictivePolicy(
  { request, privacyPath }: { request: APIRequestContext; privacyPath: string }, _options = {},
): Promise<void> {
  const response = await request.get(`${CONSENT_API}/settings`);
  await expectStatus(response, 200, "read initial consent policy");
  const before = await response.json() as {
    effective: ConsentConfig; draft: { id: string } | null; published: { id: string } | null;
  };
  const saved = await request.put(`${CONSENT_API}/settings`, { data: {
    config: { ...before.effective, enabled: true, regionMode: "opt-in", allowUnsafeEval: false,
      privacyPolicyUrl: privacyPath, acceptLabel: "Accept all", rejectLabel: "Reject non-essential" },
    expectedDraftId: before.draft?.id ?? null,
  } });
  await expectStatus(saved, 200, "save restrictive consent policy");
  const draft = await saved.json();
  expect(draft.blockingProblems).toEqual([]);
  const published = await request.post(`${CONSENT_API}/publish`, { data: {
    draftId: draft.revision.id, expectedPublishedId: before.published?.id ?? null,
  } });
  await expectStatus(published, 200, "publish restrictive consent policy");
  expect(await published.json()).toEqual({ published: true, revisionId: draft.revision.id });
}

async function visitProbe(
  { page, url, scriptUrl, allowed }: { page: Page; url: string; scriptUrl: string; allowed: boolean }, _options = {},
): Promise<void> {
  const script = page.waitForResponse(response => response.url() === scriptUrl);
  const response = await page.goto(url, { waitUntil: "load" });
  expect(response?.status(), "published fixture page").toBe(200);
  expect((await script).status(), "self-hosted fixture script loaded through the real asset route").toBe(200);
  await expect(page.getByTestId("consent-eval-result")).toHaveText(allowed ? "eval-ran" : "blocked:EvalError");
  await expect(page.getByTestId("consent-eval-csp")).toHaveText(allowed ? "" : "script-src:eval");
  await expect(page.getByTestId("consent-eval-external")).toHaveText("not-run");
  await expect(page.locator(`script[src="${EXTERNAL_SCRIPT}"]`)).toHaveCount(0);
}

test("T2: eval is blocked off, runs only after Publish and survives Reject; warning and external gating remain",
  { tag: ["@unrun", "@isolated-site"] }, async ({ page, browser, request, journeySite }) => {
    const cleanup = createJourneyContentCleanup({ request, workspaceApi: WS_API });
    const slug = uniqSlug("consent-eval");
    const staticRoot = path.join(journeySite.siteDir, "themes", "static");
    await mkdir(staticRoot, { recursive: true });
    const assetDir = await mkdtemp(path.join(staticRoot, "consent-eval-"));
    // A fresh context shares no admin/previous visitor cookies. Block all real external
    // egress below, including model vendors; only the exact optional-script fake may answer.
    const visitorContext = await browser.newContext({ storageState: { cookies: [], origins: [] },
      locale: "en-US", serviceWorkers: "block" });
    const visitor = await visitorContext.newPage();
    const publicErrors: string[] = [];
    visitor.on("pageerror", error => publicErrors.push(error.message));
    const externalRequests: string[] = [];
    const unexpectedRequests: string[] = [];
    try {
      await visitorContext.route(url => url.origin !== journeySite.apiURL, async route => {
        if (route.request().url() !== EXTERNAL_SCRIPT) {
          unexpectedRequests.push(route.request().url());
          await route.abort("blockedbyclient");
          return;
        }
        externalRequests.push(route.request().url());
        expect(route.request().method()).toBe("GET");
        await route.fulfill({ contentType: "application/javascript", body:
          'document.querySelector(\'[data-testid="consent-eval-external"]\').textContent = "external-ran";' });
      });
      await writeFile(path.join(assetDir, "probe.js"), LOCAL_SCRIPT, "utf8");
      const scriptPath = `/theme-assets/${path.basename(assetDir)}/probe.js`;
      const url = `${journeySite.apiURL}/${slug}`;
      await createPublishedPageWithHtml(request, { title: "Consent eval fixture and privacy policy", slug,
        html: `<!doctype html><html><head><title>Consent eval fixture</title></head><body>
          <main><h1>Consent eval fixture</h1><p>This test page collects no personal data.</p>
          <output data-testid="consent-eval-result">not-run</output>
          <output data-testid="consent-eval-csp"></output>
          <output data-testid="consent-eval-external">not-run</output></main>
          <script src="${scriptPath}"></script><script src="${EXTERNAL_SCRIPT}"></script>
          </body></html>` }, { onCreated: row => cleanup.track({ type: "page", id: row.id }) });
      await publishRestrictivePolicy({ request, privacyPath: `/${slug}` });
      const probe = { page: visitor, url, scriptUrl: `${journeySite.apiURL}${scriptPath}` };
      await visitProbe({ ...probe, allowed: false });
      await expect(visitor.getByRole("button", { name: "Reject non-essential", exact: true }).first()).toBeVisible();
      expect(externalRequests).toEqual([]);

      await page.goto("/admin/consent?tab=rules");
      const toggle = page.getByRole("switch", { name: "Allow dynamic code (unsafe-eval)", exact: true });
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await page.getByRole("button", { name: "About dynamic code", exact: true }).focus();
      await expect(page.getByText(WARNING, { exact: true }).filter({ visible: true })).toBeVisible();
      await toggle.focus();
      const saved = page.waitForResponse(response => new URL(response.url()).pathname === `${CONSENT_API}/settings`
        && response.request().method() === "PUT");
      await toggle.press("Space");
      const draftResponse = await saved;
      await expectStatus(draftResponse, 200, "autosave unsafe-eval draft");
      const draft = await draftResponse.json();
      expect(draft.revision.config.allowUnsafeEval).toBe(true);
      expect(draft.blockingProblems).toEqual([]);
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("status").filter({ hasText: "Draft saved. Not live yet." })).toBeVisible();
      await visitProbe({ ...probe, allowed: false });
      expect(externalRequests).toEqual([]);

      const published = page.waitForResponse(response => new URL(response.url()).pathname === `${CONSENT_API}/publish`
        && response.request().method() === "POST");
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      const publishedResponse = await published;
      await expectStatus(publishedResponse, 200, "publish unsafe-eval draft through admin");
      expect(await publishedResponse.json()).toEqual({ published: true, revisionId: draft.revision.id });
      await visitProbe({ ...probe, allowed: true });
      expect(externalRequests).toEqual([]);

      const choice = visitor.waitForResponse(response => new URL(response.url()).pathname === "/api/site-consent"
        && response.request().method() === "POST");
      await Promise.all([
        visitor.waitForEvent("load"),
        visitor.getByRole("button", { name: "Reject non-essential", exact: true }).first().click(),
      ]);
      const rejected = await choice;
      await expectStatus(rejected, 200, "save visitor rejection");
      expect((await rejected.json()).record.choices).toEqual({ necessary: true, functional: false, analytics: false, marketing: false });
      await expect(visitor.getByTestId("consent-eval-result")).toHaveText("eval-ran");
      await expect(visitor.getByTestId("consent-eval-csp")).toHaveText("");
      await expect(visitor.getByTestId("consent-eval-external")).toHaveText("not-run");
      expect(externalRequests).toEqual([]);

      // A fresh visitor's Accept proves the external fixture is reachable and executable;
      // zero pre-consent requests cannot pass merely because the URL/fixture is broken.
      await visitorContext.clearCookies();
      await visitor.reload({ waitUntil: "load" });
      await Promise.all([
        visitor.waitForEvent("load"),
        visitor.getByRole("button", { name: "Accept all", exact: true }).click(),
      ]);
      await expect(visitor.getByTestId("consent-eval-external")).toHaveText("external-ran");
      expect(externalRequests).toEqual([EXTERNAL_SCRIPT]);
      expect(unexpectedRequests, "visitor must never reach real external services").toEqual([]);
      expect(publicErrors).toEqual([]);
    } finally {
      await visitorContext.close();
      // Content cleanup purges Trash; isolated-site teardown also removes policy/receipt rows.
      try { await cleanup.cleanup({}); }
      finally { await rm(assetDir, { recursive: true, force: true }); }
    }
  });
