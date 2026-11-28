import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSiteRouteDeps } from "../../deps.js";
import type { SiteStore } from "../../open-site-store.js";

/**
 * @file What `assembleRouteDepsPhase` / `finishRouteDepsPhase` give a really booted site: the approval-memory and
 * run-identity overrides, the outbound test origins and the trimmed trusted consent-region header on the assembled
 * deps; the late-bound ports (static-copy label, active theme, published posts, saved-key lookup) read the finished
 * deps; and closing the store waits for site-app boot work started after boot.
 */

type Overrides = NonNullable<NonNullable<Parameters<typeof createSiteRouteDeps>[1]>["overrides"]>;
type Deps = Awaited<ReturnType<typeof createSiteRouteDeps>>;

/** Boots a site in its own temp folder (`<tmp>/<site>/content.db`); teardown settles boot work and closes the store once. */
async function bootSite(t: test.TestContext, overrides: Partial<Overrides> = {}): Promise<{ deps: Deps; store: SiteStore; site: string }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assembly-phases-"));
  const site = "site-asm";
  let store: SiteStore | undefined;
  let closed = false;
  const deps = await createSiteRouteDeps({}, { dbPath: path.join(root, site, "content.db"), overrides: { ...overrides, onStoreOpened: ({ store: opened }) => { store = opened; } } });
  const close = async () => { if (!closed) { closed = true; await store?.close(); } };
  t.after(async () => {
    await Promise.allSettled(Object.entries(deps).filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise).map(([, value]) => value));
    await close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  assert.ok(store !== undefined, "onStoreOpened must hand over the opened store");
  return { deps, store: { ...store, close }, site };
}

function withConsentHeader(t: test.TestContext, value: string | undefined): void {
  const previous = process.env.TOVU_CONSENT_REGION_HEADER;
  if (value === undefined) delete process.env.TOVU_CONSENT_REGION_HEADER; else process.env.TOVU_CONSENT_REGION_HEADER = value;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_CONSENT_REGION_HEADER; else process.env.TOVU_CONSENT_REGION_HEADER = previous; });
}

test("a booted site's route deps carry the approval overrides, the outbound test origins and the trimmed consent region header", async t => {
  withConsentHeader(t, "  X-Geo-Region  ");
  const nativeApprovalMemory = { remember: async () => undefined } as unknown as Overrides["nativeApprovalMemory"];
  const approvalIdentityForRun = (async () => undefined) as unknown as Overrides["approvalIdentityForRun"];
  const { deps } = await bootSite(t, { nativeApprovalMemory, approvalIdentityForRun, outboundTestOrigins: ["http://127.0.0.1:4555"] });
  assert.equal(deps.nativeApprovalMemory, nativeApprovalMemory);
  assert.equal(deps.approvalIdentityForRun, approvalIdentityForRun);
  assert.deepEqual(deps.outboundTestOrigins, ["http://127.0.0.1:4555"]);
  assert.equal(deps.consentTrustedRegionHeader, "X-Geo-Region");
});

test("without those overrides, and with a blank consent region header, the route deps carry none of them", async t => {
  withConsentHeader(t, "   ");
  const { deps } = await bootSite(t, { outboundTestOrigins: [] });
  for (const key of ["nativeApprovalMemory", "approvalIdentityForRun", "outboundTestOrigins", "consentTrustedRegionHeader"] as const) assert.equal(deps[key], undefined, key);
});

test("the late-bound ports read the finished deps: static-copy label, active theme, published posts and saved keys", async t => {
  const { deps, site } = await bootSite(t);
  assert.equal(await deps.resolveActiveThemeId(), "tovu-starter");
  assert.deepEqual(await deps.staticSiteContext(), { name: site, slug: site, theme: "Tovu Starter", themeId: "tovu-starter" });
  // The label reads the deps when it runs, so a display name replaced in place after boot is honoured.
  deps.siteDisplayName = { ...deps.siteDisplayName, read: () => "Renamed Site" };
  assert.deepEqual(await deps.staticSiteContext(), { name: "Renamed Site", slug: site, theme: "Tovu Starter", themeId: "tovu-starter" });
  const { posts } = await deps.listPublishedPosts();
  assert.ok(posts.some(post => post.id === "post-home"), posts.map(post => post.id).join(", "));
  assert.deepEqual([...new Set(posts.map(post => `${post.workspaceId}/${post.status}`))], [`${deps.workspaceId}/published`]);
  assert.equal(await deps.sourceControlSavedKeys.describeByLabel({ workspaceId: deps.workspaceId, label: "source-control:none" }), null);
});

test("closing the store waits for site-app boot work started after boot", async t => {
  const { deps, store } = await bootSite(t);
  const pending = deps.siteAppBootWork;
  assert.ok(pending !== undefined);
  deps.createSiteApp();
  assert.equal(pending.size, 1, "creating a site app registers its boot work");
  await store.close();
  assert.equal(pending.size, 0, "the store closed while site-app boot work was still running");
});

test("the bound site export always uses the site's own route deps, even when the caller forwards a routeDeps key", async t => {
  const { deps } = await bootSite(t);
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembly-phases-export-"));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  // A non-literal bag, so the stray `routeDeps` key passes excess-property checks exactly as a forwarded options object would.
  const forwarded = { outputDir, clean: true, routeDeps: { bogus: "not-route-deps" } };
  const report = await deps.exportSiteBound(forwarded);
  assert.deepEqual(report.routes.failed, []);
  const exported = report.routes.succeeded.map(route => route.path);
  assert.ok(exported.includes("/"), exported.join(", "));
  assert.ok(fs.existsSync(path.join(outputDir, "index.html")), "the home page was written to the output folder");
});

type ProofRequest = Parameters<NonNullable<Deps["visitorAnalyticsProof"]>>[0]["request"];

test("visitor analytics proof: analytics off or an excluded visitor never reads the consent cookie; an included visitor's cookie is read", async t => {
  const { deps } = await bootSite(t);
  const real = deps.analyticsConfig;
  const stored = await real.get({ workspaceId: deps.workspaceId });
  const asked: unknown[] = [];
  let enabled = false;
  // Replaced in place after boot: the gate reads the finished deps' analytics config on every visit.
  deps.analyticsConfig = { ...real, get: async (query) => { asked.push(query); return { ...stored, enabled, honorDoNotTrack: true }; } };
  const visit = async (headers: Record<string, string>) => {
    const read: string[] = [];
    const request = { hostname: "example.test", path: "/about", ip: "203.0.113.5", socket: { remoteAddress: "203.0.113.5" }, headers,
      get: (name: string) => { read.push(name.toLowerCase()); return headers[name.toLowerCase()]; } } as unknown as ProofRequest;
    const proof = await deps.visitorAnalyticsProof?.({ request });
    return { proof, cookieRead: read.includes("cookie") };
  };
  assert.deepEqual(await visit({}), { proof: undefined, cookieRead: false }, "analytics off");
  enabled = true;
  assert.deepEqual(await visit({ dnt: "1" }), { proof: undefined, cookieRead: false }, "Do Not Track visitor excluded");
  // No consent cookie was sent, so the included visitor still has no proof; reading the cookie is what tells the outcomes apart.
  assert.deepEqual(await visit({ dnt: "0" }), { proof: undefined, cookieRead: true }, "included visitor");
  assert.deepEqual(asked, [{ workspaceId: deps.workspaceId }, { workspaceId: deps.workspaceId }, { workspaceId: deps.workspaceId }]);
});
