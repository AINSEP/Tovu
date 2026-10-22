import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { siteConsentPorts } from "../site-consent.js";

/** The consent service's site-bound ports: readiness fallback, region trust, receipt-storage health
 * and the local published-page render, each driven with a hand-built deps object. */

function tempDir(t: test.TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "site-consent-ports-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function portsFor(deps: Record<string, unknown>) {
  return siteConsentPorts({ deps: { workspaceId: "ws-1", observability: createNoopObservabilityPort({}), ...deps } as never });
}

test("readiness prefers the site-title gate and falls back to the settings gate; region trust follows the configured header", () => {
  const siteTitleReady = Promise.resolve();
  const settingsReady = Promise.resolve();
  assert.equal(portsFor({ siteTitleReady, settingsReady }).ready, siteTitleReady);
  const fallback = portsFor({ settingsReady });
  assert.equal(fallback.ready, settingsReady);
  assert.equal(fallback.trustedRegion, false);
  assert.equal(portsFor({ settingsReady, consentTrustedRegionHeader: "x-region" }).trustedRegion, true);
  assert.equal(fallback.workspaceId, "ws-1");
});

test("receipt storage reports the site's receipt directory health, creating it on first check", async (t) => {
  const dir = tempDir(t);
  writeFileSync(path.join(dir, "not-a-receipt.txt"), "");
  const health = await portsFor({ siteBinding: { dir } }).receiptStorage();
  assert.deepEqual(health, { writable: true, count: 0 });
});

test("a receipt-storage fault is logged without detail and rethrown unchanged", async (t) => {
  const dir = tempDir(t);
  const blocker = path.join(dir, "a-file");
  writeFileSync(blocker, "");
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  await assert.rejects(portsFor({ siteBinding: { dir: blocker } }).receiptStorage(), { code: "ENOTDIR" });
  assert.deepEqual(logged, [["[consent] receipt storage check failed"]]);
});

test("renderPage renders the same-origin path through a consent-audit site app", async () => {
  const seen: unknown[] = [];
  const ports = portsFor({
    createSiteApp: (options: unknown) => {
      seen.push(options);
      return (req: { url?: string }, res: { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void }) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<p>${req.url}</p>`);
      };
    },
  });
  assert.deepEqual(await ports.renderPage({ path: "/privacy" }), { html: "<p>/privacy</p>", ok: true, truncated: false });
  assert.deepEqual(seen, [{ consentAudit: true }]);
});
