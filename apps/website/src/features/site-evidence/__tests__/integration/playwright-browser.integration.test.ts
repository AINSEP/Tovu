import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { UUID } from "@jini-ai/core/primitives";

import type { OriginRegistryPort, VerifiedOrigin } from "#src/features/origin/index";
import { collectPageEvidence } from "../../collect-page-evidence.js";
import { openPlaywrightSiteEvidenceBrowser as openDiagnosticBrowser } from "@jini-ai/diagnostics/web-evidence/playwright";

const openPlaywrightSiteEvidenceBrowser = (required: Record<string, never>) => openDiagnosticBrowser(required, {
  moduleLoader: { load: async () => await import("playwright") },
  launchOptions: { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] },
});

/**
 * @file The Playwright adapter against a REAL browser and a REAL server.
 *
 * Optional local runs skip when Chromium is unavailable. Browser-required runs must set
 * TOVU_SITE_EVIDENCE_BROWSER_REQUIRED=1: adapter startup failures then fail this file.
 * Intentional unavailability is covered by `collect-page-evidence.unit.test.ts`.
 *
 * What only a real browser can prove, and is therefore what this file asserts:
 * - a cookie set by a `<script>` after load is actually observed (the whole point of render-truth);
 * - a non-GET request is aborted rather than sent (the "never submits a form" guarantee);
 * - the rendered accessibility structure comes back with usable selectors;
 * - cookie VALUES never appear in the returned evidence.
 */

const WORKSPACE_ID = "77777777-7777-4777-8777-777777777777" as UUID;

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head><title>Evidence Fixture</title></head>
<body>
  <header><h1>Fixture</h1></header>
  <main>
    <h3>Skipped level</h3>
    <p style="color:#bbbbbb;background:#ffffff">low contrast text</p>
    <img src="/decorative.png" alt="">
    <img src="/unlabelled.png">
    <form id="signup" method="post" action="/subscribe">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" required>
      <input name="unlabelled" type="text">
      <button type="submit" id="go">Subscribe</button>
    </form>
  </main>
  <div style="display:none"><span id="hidden-descendant">invisible text</span></div>
  <footer><p>footer</p></footer>
  <script>
    document.cookie = "tracker_id=SUPERSECRETVALUE; path=/";
    document.getElementById("go").addEventListener("click", function (event) {
      event.preventDefault();
      fetch("/subscribe", { method: "POST", body: "email=someone@example.test" });
    });
  </script>
</body>
</html>`;

function startFixtureServer(offsiteLocation = "https://example.invalid/landing?token=SECRET"): Promise<{ server: Server; port: number; posts: string[] }> {
  const posts: string[] = [];
  const server = createServer((req, res) => {
    if (req.method === "POST") {
      posts.push(req.url ?? "");
      res.writeHead(204).end();
      return;
    }
    if (req.url === "/offsite") {
      res.writeHead(302, { location: offsiteLocation }).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-fixture": "yes" }).end(PAGE_HTML);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, posts }));
  });
}

function originRegistry(port: number): OriginRegistryPort {
  const origin: VerifiedOrigin = {
    scheme: "http",
    host: "127.0.0.1",
    port,
    verifiedAt: new Date().toISOString(),
    source: "dev-capability",
  };
  return {
    async canonicalOrigin() {
      return origin;
    },
    async isAllowedRedirectTarget() {
      return false;
    },
    async isAllowedEgressTarget() {
      return false;
    },
  };
}

const availability = await openPlaywrightSiteEvidenceBrowser({});
if (availability.available) await availability.browser.close({});
if (process.env.TOVU_SITE_EVIDENCE_BROWSER_REQUIRED === "1") {
  assert.equal(availability.available, true, availability.available ? undefined : `required browser unavailable: ${availability.reason}`);
}
const skip = availability.available ? false : `no headless browser on this machine: ${availability.reason}`;

test("observes real rendered evidence from a real page", { skip }, async () => {
  const { server, port, posts } = await startFixtureServer();
  try {
    const result = await collectPageEvidence({ ...{ workspaceId: WORKSPACE_ID, originRegistry: originRegistry(port), openBrowser: openPlaywrightSiteEvidenceBrowser }, paths: ["/"] }, { consentAcceptSelector: "#go" }
    );

    assert.equal(result.browser.status, "available");
    assert.equal(result.pages.length, 1, `expected one page, skipped: ${JSON.stringify(result.skipped)}`);

    const page = result.pages[0];
    assert.ok(page);
    assert.equal(page.observation.document.httpStatus, 200);
    assert.equal(page.observation.document.title, "Evidence Fixture");
    assert.equal(page.observation.document.lang, "en");
    assert.ok(page.observation.document.headers.some((header) => header.name === "x-fixture"));

    // Render-truth: this cookie exists only because a script ran. No config snapshot could see it.
    const tracker = page.observation.cookies.find((cookie) => cookie.name === "tracker_id");
    assert.ok(tracker, "a script-set cookie must be observed");
    assert.equal(tracker.firstParty, true);
    assert.equal(tracker.phase, "after");

    // The privacy guarantee, asserted over the whole serialized result rather than one field.
    assert.ok(
      !JSON.stringify(result).includes("SUPERSECRETVALUE"),
      "a cookie's VALUE must never appear in returned evidence — browser-port.ts has no field for it",
    );

    // The "never submits a form" guarantee, proven at the server rather than by reading the code.
    assert.deepEqual(posts, [], "no POST may reach the origin server");
    const blocked = page.observation.requests.filter((request) => request.blockedReason !== undefined);
    assert.ok(blocked.length > 0, "the aborted POST must still be recorded — the attempt IS the evidence");
    assert.ok(blocked.every((request) => request.method !== "GET"));
    const subscribe = blocked.find((request) => request.method === "POST" && request.pathname === "/subscribe");
    assert.ok(subscribe, "the consent click's subscribe attempt must be observed");
    assert.equal(subscribe.phase, "after");
    assert.ok(page.observation.requests.some((request) => request.method === "GET" && request.phase === "before"));

    const withoutConsent = await collectPageEvidence({ ...{ workspaceId: WORKSPACE_ID, originRegistry: originRegistry(port), openBrowser: openPlaywrightSiteEvidenceBrowser }, paths: ["/"] }
    );
    assert.equal(withoutConsent.pages.length, 1);
    const before = withoutConsent.pages[0].observation;
    assert.ok(before.requests.length > 0);
    assert.ok(before.requests.every((request) => request.phase === "before"));
    assert.equal(before.cookies.find((cookie) => cookie.name === "tracker_id")?.phase, "before");
    assert.ok(!before.requests.some((request) => request.pathname === "/subscribe"));
    assert.deepEqual(posts, []);

    const accessibility = page.observation.accessibility;
    assert.ok(accessibility);
    assert.ok(accessibility.landmarks.some((landmark) => landmark.role === "main"));
    assert.deepEqual(
      accessibility.headings.map((heading) => heading.level),
      [1, 3],
      "the raw outline (including the h1 -> h3 skip) is reported as observed, not judged",
    );
    assert.deepEqual(accessibility.headings.map(({ level, text }) => ({ level, text })), [
      { level: 1, text: "Fixture" }, { level: 3, text: "Skipped level" },
    ]);
    const unlabelledImage = accessibility.images.find((image) => image.src === "/unlabelled.png");
    assert.equal(unlabelledImage?.alt, null, "a missing alt attribute is null");
    assert.equal(accessibility.images.find((image) => image.src === "/decorative.png")?.alt, "", "an empty alt is not a missing one");

    const labelled = accessibility.formControls.find((control) => control.name === "email");
    assert.equal(labelled?.accessibleName, "Email address");
    assert.equal(labelled?.labelSource, "label-for");
    assert.equal(labelled?.required, true);
    const unlabelled = accessibility.formControls.find((control) => control.name === "unlabelled");
    assert.equal(unlabelled?.accessibleName, null);
    assert.equal(unlabelled?.labelSource, "none");
    assert.ok(unlabelled?.selector && unlabelled.selector.length > 0, "every finding needs a citable selector");

    // Resolve the adapter's selectors in Chromium against the same fixture DOM.
    const { chromium } = await import("playwright");
    const selectorBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const dom = await selectorBrowser.newPage();
      await dom.setContent(PAGE_HTML);
      for (const heading of accessibility.headings) {
        const element = dom.locator(heading.selector);
        assert.equal(await element.count(), 1);
        assert.equal(await element.evaluate((node) => node.tagName.toLowerCase()), `h${heading.level}`);
        assert.equal((await element.textContent())?.trim(), heading.text);
      }
      assert.equal(accessibility.images.length, 2);
      for (const image of accessibility.images) {
        const element = dom.locator(image.selector);
        assert.equal(await element.count(), 1);
        assert.equal(await element.evaluate((node) => node.tagName.toLowerCase()), "img");
        assert.equal(await element.getAttribute("src"), image.src);
        assert.equal(await element.getAttribute("alt"), image.alt);
      }
      const main = accessibility.landmarks.find((landmark) => landmark.role === "main");
      assert.ok(main);
      assert.equal(await dom.locator(main.selector).count(), 1);
      assert.equal(await dom.locator(main.selector).evaluate((node) => node.tagName.toLowerCase()), "main");
      assert.ok(labelled);
      assert.ok(unlabelled);
      assert.equal(await dom.locator(labelled.selector).count(), 1);
      assert.equal(await dom.locator(labelled.selector).getAttribute("id"), "email");
      assert.equal(await dom.locator(unlabelled.selector).count(), 1);
      assert.equal(await dom.locator(unlabelled.selector).getAttribute("name"), "unlabelled");
    } finally {
      await selectorBrowser.close();
    }

    assert.ok(!accessibility.contrastSamples.some((sample) => sample.selector === "#hidden-descendant"));
    assert.ok(accessibility.contrastSamples.some((sample) => sample.ratio < 4.5), "the low-contrast paragraph must be sampled");
  } finally {
    server.close();
  }
});

test("a server-side redirect off the origin is refused after navigation, with the target redacted to its origin", { skip }, async () => {
  const landing = await startFixtureServer();
  const { server, port } = await startFixtureServer(`http://127.0.0.1:${landing.port}/landing?token=SECRET`);
  try {
    const result = await collectPageEvidence({ ...{ workspaceId: WORKSPACE_ID, originRegistry: originRegistry(port), openBrowser: openPlaywrightSiteEvidenceBrowser }, paths: ["/offsite"] }
    );

    assert.deepEqual(result.pages, []);
    const skipped = result.skipped.find((entry) => entry.path === "/offsite");
    assert.ok(skipped, "an off-origin redirect must never produce an inspected page");
    assert.equal(skipped.reason, "off-origin-redirect");
    assert.ok(!JSON.stringify(result).includes("SECRET"), "the redirect target's query must not be echoed back");
  } finally {
    server.close();
    landing.server.close();
  }
});
