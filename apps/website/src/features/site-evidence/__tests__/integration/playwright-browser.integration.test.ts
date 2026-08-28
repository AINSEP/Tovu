import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { UUID } from "@jini-ai/cms/core";

import type { OriginRegistryPort, VerifiedOrigin } from "#src/features/origin/index";
import { collectPageEvidence } from "../../collect-page-evidence.js";
import { openPlaywrightSiteEvidenceBrowser } from "../../playwright-browser.js";

/**
 * @file The Playwright adapter against a REAL browser and a REAL server.
 *
 * SKIPS, loudly, when Chromium is not installed — which is the same condition production degrades
 * under, so a skip here is not a hole in the evidence: it means this machine is in the "browser
 * unavailable" state that `collect-page-evidence.unit.test.ts` covers directly. Run
 * `npx playwright install chromium` to make it execute.
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

function startFixtureServer(): Promise<{ server: Server; port: number; posts: string[] }> {
  const posts: string[] = [];
  const server = createServer((req, res) => {
    if (req.method === "POST") {
      posts.push(req.url ?? "");
      res.writeHead(204).end();
      return;
    }
    if (req.url === "/offsite") {
      res.writeHead(302, { location: "https://example.invalid/landing?token=SECRET" }).end();
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

const availability = await openPlaywrightSiteEvidenceBrowser();
if (availability.available) await availability.browser.close();
const skip = availability.available ? false : `no headless browser on this machine: ${availability.reason}`;

test("observes real rendered evidence from a real page", { skip }, async () => {
  const { server, port, posts } = await startFixtureServer();
  try {
    const result = await collectPageEvidence(
      { workspaceId: WORKSPACE_ID, originRegistry: originRegistry(port), openBrowser: openPlaywrightSiteEvidenceBrowser },
      { paths: ["/"], consentAcceptSelector: "#go" },
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

    const accessibility = page.observation.accessibility;
    assert.ok(accessibility);
    assert.ok(accessibility.landmarks.some((landmark) => landmark.role === "main"));
    assert.deepEqual(
      accessibility.headings.map((heading) => heading.level),
      [1, 3],
      "the raw outline (including the h1 -> h3 skip) is reported as observed, not judged",
    );
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

    assert.ok(accessibility.contrastSamples.some((sample) => sample.ratio < 4.5), "the low-contrast paragraph must be sampled");
  } finally {
    server.close();
  }
});

test("a server-side redirect off the origin is refused after navigation, with the target redacted to its origin", { skip }, async () => {
  const { server, port } = await startFixtureServer();
  try {
    const result = await collectPageEvidence(
      { workspaceId: WORKSPACE_ID, originRegistry: originRegistry(port), openBrowser: openPlaywrightSiteEvidenceBrowser },
      { paths: ["/offsite"] },
    );

    assert.deepEqual(result.pages, []);
    const skipped = result.skipped.find((entry) => entry.path === "/offsite");
    // Either the navigation itself failed (the host does not resolve) or the redirect was caught by
    // the post-navigation same-origin check — both are correct refusals, and the assertion accepts
    // either rather than pinning behaviour that depends on the machine's DNS.
    assert.ok(skipped, "an off-origin redirect must never produce an inspected page");
    assert.ok(skipped.reason === "off-origin-redirect" || skipped.reason === "navigation-failed");
    assert.ok(!JSON.stringify(result).includes("SECRET"), "the redirect target's query must not be echoed back");
  } finally {
    server.close();
  }
});
