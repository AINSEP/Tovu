import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { siteConsentPorts } from "../site-consent.js";

/** The consent service's site-bound ports: consent readiness, region trust, receipt-storage health
 * and the local published-page render, each driven with a hand-built deps object. */

function tempDir(t: test.TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "site-consent-ports-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function portsFor(deps: Record<string, unknown>) {
  return siteConsentPorts({ deps: { workspaceId: "ws-1", postRepo: { findBySlug: async () => null }, observability: createNoopObservabilityPort({}), ...deps } as never });
}

test("readiness uses the required consent gate; region trust follows the configured header", () => {
  const siteTitleReady = Promise.resolve();
  const settingsReady = Promise.resolve();
  const siteConsentReady = Promise.resolve();
  assert.equal(portsFor({ siteConsentReady, siteTitleReady, settingsReady }).ready, siteConsentReady);
  const ports = portsFor({ siteConsentReady });
  assert.equal(ports.trustedRegion, false);
  assert.equal(portsFor({ siteConsentReady, consentTrustedRegionHeader: "x-region" }).trustedRegion, true);
  assert.equal(ports.workspaceId, "ws-1");
  assert.equal("cookieConsent" in ports, false);
  assert.equal("cookieConsent" in portsFor({ cookieConsent: {} }), false);
});

test("receipt storage reports the site's receipt directory health, creating it on first check", async (t) => {
  const dir = tempDir(t);
  writeFileSync(path.join(dir, "not-a-receipt.txt"), "");
  const health = await portsFor({ siteBinding: { dir } }).receiptStorage({});
  assert.deepEqual(health, { writable: true, count: 0 });
});

test("a receipt-storage fault is logged without detail and rethrown unchanged", async (t) => {
  const dir = tempDir(t);
  const blocker = path.join(dir, "a-file");
  writeFileSync(blocker, "");
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  await assert.rejects(portsFor({ siteBinding: { dir: blocker } }).receiptStorage({}), { code: "ENOTDIR" });
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

test('privacy defaults wait for the dependency literal, then bind title, owner, settings and outbox', async () => {
  const { InMemorySettingsRepo } = await import('@jini-ai/core/settings');
  const { ensureSiteConsentDefinitions, createSiteConsentReadiness } = await import('#src/features/consent/settings');
  const { InMemoryOutbox } = await import('#src/contracts/core/events/index');
  const { ensureSiteConsentPrivacy } = await import('../site-consent.js');
  const { InMemoryPostRepo } = await import('#src/features/post/repo.memory');
  const { InMemorySiteTitlePreservationStore } = await import('#src/features/settings/site-title');
  const { ensureSiteTitleSettingDefinition } = await import('#src/features/settings/site-title');
  const settingsRepo = new InMemorySettingsRepo(); const postRepo = new InMemoryPostRepo();
  let count = 0; const ids = { newId: () => `binding-${++count}` };
  const clock = { nowMs: () => Date.parse('2026-10-22T00:00:00.000Z'), nowIso: () => '2026-10-22T00:00:00.000Z' };
  const principals = { findActiveById: async ({ id }: { id: string }) => ({ id }) };
  const settingDeps = { settingsRepo, clock, ids, principals };
  await ensureSiteTitleSettingDefinition(settingDeps, { systemPrincipalId: 'system' });
  await ensureSiteConsentDefinitions(settingDeps, { systemPrincipalId: 'system' });
  const users: unknown[] = []; const html: string[] = [];
  const outbox = new InMemoryOutbox();
  let resolveDeps!: (deps: import('#src/server/routes/types').RouteDeps) => void;
  const routeDepsBuilt = new Promise<import('#src/server/routes/types').RouteDeps>(resolve => { resolveDeps = resolve; });
  let attempted = false, settled = false;
  const ready = createSiteConsentReadiness({ ...settingDeps, after: Promise.resolve(), systemPrincipalId: 'system' }, {
    ensurePrivacyDefaults: () => { attempted = true; return ensureSiteConsentPrivacy({ deps: routeDepsBuilt }); },
  });
  void ready.then(() => { settled = true; });
  // Reproduce boot settings finishing while the composition literal is suspended on plugin I/O.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempted, true); assert.equal(settled, false);
  assert.deepEqual(await postRepo.list({ workspaceId: 'site-a' }), []);
  const deps = { workspaceId: 'site-a', settingsRepo, postRepo, idGen: ids, clock,
    outbox,
    principalRepo: principals, authorize: async () => ({ allowed: true, reason: 'test owner' }),
    ownerPrincipalId: Promise.resolve('owner'), userRepo: { findByPrincipalId: async (input: unknown) => {
      users.push(input); return { username: 'owner', email: 'owner@example.test' };
    } },
    siteTitlePreservationStore: new InMemorySiteTitlePreservationStore(),
    workspaceRepo: await Promise.resolve({ findById: async () => ({ name: 'Fallback' }) }), siteDisplayName: { read: () => 'Resolved & Site' },
    pagesHtmlStore: () => ({ ensureHtmlFormat: async (value: string) => { html.push(value); } }),
  } as never;
  resolveDeps(deps);
  await ready;
  assert.equal(settled, true);
  assert.match(html[0], /Resolved &amp; Site/); assert.match(html[0], /owner@example.test/);
  assert.ok(users.every(input => JSON.stringify(input) === JSON.stringify({ workspaceId: 'site-a', principalId: 'owner' })));
  assert.equal((await siteConsentPorts({ deps }).readLegacy({})).privacyPolicyUrl, '/privacy');
  await ensureSiteConsentPrivacy({ deps: Promise.resolve(deps) }); assert.equal(html.length, 1);
});

test('declaration evidence merges active theme and plugin declarations and preserves refusal diagnostics', async () => {
  const scripts = [{ src: '/theme-assets/site/stats.js', consent: ['analytics'] }];
  const ports = portsFor({ themes: [{ status: 'valid', manifest: { id: 'site', tier: 'static', scripts } }],
    resolveActiveThemeId: async () => 'site',
    cookieConsent: { scriptDeclarations: async () => ({ scripts: [{ src: '/plugin-menu.js' }], problems: ['Plugin declaration was refused.'] }) } });
  assert.deepEqual(await ports.declarationEvidence!({ path: '/' }), {
    scripts: [...scripts, { src: '/plugin-menu.js' }], runtimeSlot: true, problems: ['Plugin declaration was refused.'],
  });
});

test('a failed plugin declaration load stays a readiness problem, not a thrown check', async () => {
  const ports = portsFor({ themes: [], resolveActiveThemeId: async () => null,
    cookieConsent: { scriptDeclarations: async () => { throw new Error('fixture contribution failure'); } } });
  const evidence = await ports.declarationEvidence!({ path: '/' });
  assert.deepEqual(evidence.scripts, []);
  assert.deepEqual(evidence.problems, ['Active plugin script declarations could not be read; optional plugin scripts will remain stopped.']);
});

test('theme-off declarations use the managed shell and publication refresh is forwarded', async () => {
  let refreshed = 0;
  const ports = portsFor({ themes: [], resolveActiveThemeId: async () => 'none',
    cookieConsent: { refresh: async () => { refreshed++; } } });
  assert.deepEqual(await ports.declarationEvidence!({ path: '/' }), { scripts: [], problems: [], runtimeSlot: true });
  await ports.published!();
  assert.equal(refreshed, 1);
});

test('a full-document published bare Page reports a missing runtime slot with theme off; a fragment remains supported', async () => {
  const { consentDeclarationReadiness } = await import('#src/features/consent/readiness');
  let reads = 0;
  let bodyHtml = '<!doctype html><html><body><iframe src="/frame"></iframe></body></html>';
  let themeId = 'none';
  const ports = portsFor({ themes: [{ status: 'valid', manifest: { id: 'static-theme', tier: 'static' } }], resolveActiveThemeId: async () => themeId,
    postRepo: { findBySlug: async ({ workspaceId, slug }: { workspaceId: string; slug: string }) => {
      reads++;
      assert.equal(workspaceId, 'ws-1'); assert.equal(slug, 'full-page');
      return { id: 'page-1', workspaceId, slug, kind: 'page', status: 'published', templateChoice: '', bodyFormat: 'html', bodyHtml };
    } },
  });
  const full = await ports.declarationEvidence!({ path: '/full-page?view=public' });
  assert.equal(full.runtimeSlot, false);
  assert.ok(consentDeclarationReadiness({ html: bodyHtml, ...full }).warnings.some(warning => warning.code === 'MISSING_RUNTIME_SLOT'));
  bodyHtml = '<iframe src="/frame"></iframe>';
  assert.equal((await ports.declarationEvidence!({ path: '/full-page' })).runtimeSlot, true);
  themeId = 'static-theme';
  assert.equal((await ports.declarationEvidence!({ path: '/full-page' })).runtimeSlot, true, 'bare fragment construction does not depend on theme slots');
  bodyHtml = '<html><body>Authored full document</body></html>';
  assert.equal((await ports.declarationEvidence!({ path: '/full-page' })).runtimeSlot, false);
  assert.equal(reads, 4, 'one published row lookup per admin evidence request');
});

test('generated routes keep theme eligibility; unavailable entry storage is explicit failed evidence', async () => {
  const generated = portsFor({ themes: [], resolveActiveThemeId: async () => 'none', postRepo: { findBySlug: async () => null } });
  assert.deepEqual(await generated.declarationEvidence!({ path: '/' }), { scripts: [], problems: [], runtimeSlot: true });
  const failed = portsFor({ themes: [], resolveActiveThemeId: async () => 'none', postRepo: { findBySlug: async () => { throw new Error('private repository path'); } } });
  const result = await failed.declarationEvidence!({ path: '/' });
  assert.equal(result.runtimeSlot, false);
  assert.deepEqual(result.problems?.map(problem => typeof problem === 'string' ? problem : problem.code), ['PUBLISHED_ENTRY_UNAVAILABLE']);
  assert.ok(!JSON.stringify(result).includes('private repository path'));
  const unavailable = portsFor({ themes: [], resolveActiveThemeId: async () => 'none', postRepo: undefined });
  assert.equal((await unavailable.declarationEvidence!({ path: '/' })).runtimeSlot, false);
});

test('an actual published bare Page with unavailable body format never claims a runtime slot', async () => {
  const ports = portsFor({ themes: [], resolveActiveThemeId: async () => 'none',
    postRepo: { findBySlug: async () => ({ kind: 'page', status: 'published', templateChoice: '', bodyFormat: 'html', bodyHtml: null }) },
  });
  const result = await ports.declarationEvidence!({ path: '/page' });
  assert.equal(result.runtimeSlot, false);
  assert.deepEqual(result.problems?.map(problem => typeof problem === 'string' ? problem : problem.code), ['PUBLISHED_PAGE_FORMAT_UNAVAILABLE']);
});

test('static theme loading is server-owned for copies with or without an authored tag', async () => {
  const ports = portsFor({ themes: [{ status: 'valid', manifest: { id: 'tagged', tier: 'static' }, pages: { index: '<html><head><script src="/_consent/load.js" defer data-jini-consent-loader></script></head><body>Page</body></html>' } }], resolveActiveThemeId: async () => 'tagged' });
  assert.equal((await ports.declarationEvidence!({ path: '/' })).runtimeSlot, true);
  const untagged = portsFor({ themes: [{ status: 'valid', manifest: { id: 'untagged', tier: 'static' }, pages: { index: '<html><head></head><body>Page</body></html>' } }], resolveActiveThemeId: async () => 'untagged' });
  assert.equal((await untagged.declarationEvidence!({ path: '/' })).runtimeSlot, true);
});

test('static loading eligibility does not inspect comments, templates or authored URLs', async () => {
  for (const html of ['<!-- data-jini-consent-loader -->', '<template><script src="/_consent/load.js" data-jini-consent-loader></script></template>', '<script src="/different.js" data-jini-consent-loader></script>']) {
    const ports = portsFor({ themes: [{ status: 'valid', manifest: { id: 'invalid-slot', tier: 'static' }, pages: { index: html } }], resolveActiveThemeId: async () => 'invalid-slot' });
    assert.equal((await ports.declarationEvidence!({ path: '/' })).runtimeSlot, true);
  }
});
