/** Authenticated preview is separate from declared-script loading; public flags cannot suppress its runtime.
 * Real middleware, auth, renderers and native HTTP run in memory without opening a server. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { JSDOM } from "jsdom";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { NO_THEME_ID } from "#src/features/theme/index";
import { consentFixture } from "#src/features/consent/__tests__/fixture";
import { dispatchHttpRequest, dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { applySiteCookieConsent } from "#src/server/inbound/public-http/middleware/site-cookie-consent";
import { registerSiteRoutes } from "#src/server/inbound/public-http/routes/site/pages";
import { registerAdminPostTemplatePreviewRoute } from "../template-preview.js";
import { bareDeps, barePost } from "./preview-fixtures.js";

const video = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const note = "Cookie banner hidden in preview. Embedded videos may not play here; open the page to check.";

test("authenticated preview leaves authored HTML intact; public flags cannot disable managed declared-script loading", async t => {
  const consent = consentFixture({ t });
  const saved = await consent.service.saveDraft({ principalId: "owner", config: consent.config, expectedDraftId: null });
  await consent.service.publish({ principalId: "owner", draftId: saved.revision.id, expectedPublishedId: null });
  const post = { ...barePost, status: "published" as const, slug: "video", bodyHtml: `<!doctype html><html><head></head><body><iframe src="${video}"></iframe></body></html>` };
  const managedPost = { ...post, id: "managed-video", slug: "managed-video", bodyHtml: `<iframe src="${video}"></iframe>` };
  const { deps } = bareDeps([post, managedPost]);
  deps.consentStore = consent.store;
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, {
    initialRows: [{ workspaceId: "w", activeThemeId: NO_THEME_ID, updatedAt: post.updatedAt }],
  });
  await deps.identityReady;
  // This fixture uses workspace w; the default dev owner belongs to workspace-local.
  await deps.principalRepo.save({ id: "preview-owner", workspaceId: "w", kind: "user", displayName: "Preview owner", status: "active", createdAt: deps.clock.nowIso() });
  await deps.userRepo.save({ principalId: "preview-owner", workspaceId: "w", username: "preview-owner", passwordHash: await deps.passwordHasher.hash({ password: "preview-test" }) });
  const app = express();
  // Preserve the real auth mount and consent placement; only transport is replaced.
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  deps.cookieConsent = { regionResolvers: async () => [], scriptDeclarations: async () => ({
    scripts: [{ src: '/scripts/optional-preview-fixture.js', consent: ['functional'] }], problems: [],
  }) };
  applySiteCookieConsent({ app, deps, consent: deps.cookieConsent });
  await deps.cookieConsent.refresh?.();
  registerAdminPostTemplatePreviewRoute(app, deps);
  registerSiteRoutes(app, deps);
  const previewPath = `/api/admin/v1/workspaces/w/posts/${post.id}/template-preview?templateChoice=`;

  const context = await dispatchJsonRequest(app, "GET", "/_consent/context");
  assert.equal(context.status, 200);
  assert.equal((context.body as { enabled: boolean }).enabled, true);
  const rejectedChoice = await dispatchHttpRequest({ app, method: "POST", url: "/_consent", headers: { origin: "null" }, body: { action: "accept", policy: "1" } });
  assert.equal(rejectedChoice.status, 403, "opaque preview origins must still fail the receipt origin check");
  assert.equal(rejectedChoice.headers["set-cookie"], undefined);

  const anonymous = await dispatchHttpRequest({ app, method: "GET", url: previewPath });
  assert.equal(anonymous.status, 401, "the ungated render path requires an admin session");
  const login = await dispatchHttpRequest({ app, method: "POST", url: "/api/admin/v1/auth/login", body: { username: "preview-owner", password: "preview-test" } });
  assert.equal(login.status, 200, login.body);
  const issued = login.headers["set-cookie"];
  const cookie = (Array.isArray(issued) ? issued[0]! : String(issued)).split(";")[0]!;
  assert.ok(cookie.startsWith("tovu_session="), "login must issue a session cookie");

  for (const method of ["GET", "POST"]) {
    const preview = await dispatchHttpRequest({ app, method, url: previewPath, headers: { cookie }, body: method === "POST" ? { bodyHtml: post.bodyHtml } : undefined });
    assert.equal(preview.status, 200, preview.body);
    assert.equal(preview.headers["content-security-policy"], "sandbox allow-scripts allow-forms allow-popups");
    assert.equal(preview.headers["cache-control"], "no-store");
    const dom = new JSDOM(preview.body);
    try {
      const document = dom.window.document;
      assert.equal(document.querySelector("iframe")?.getAttribute("src"), video);
      assert.equal(document.querySelector("template, #jini-consent, [data-jini-consent-runtime]"), null);
    } finally { dom.window.close(); }
  }

  const fullDocument = await dispatchHttpRequest({ app, method: "GET", url: "/video" });
  assert.equal(fullDocument.status, 200);
  assert.equal(fullDocument.body, post.bodyHtml, 'consent never rewrites an authored full document');
  const authored = new JSDOM(fullDocument.body);
  try {
    assert.equal(authored.window.document.querySelector('iframe')?.getAttribute('src'), video);
    assert.equal(authored.window.document.querySelector('template[data-jini-consent-resource], #jini-consent-config'), null, 'full documents are never automatically converted');
  } finally { authored.window.close(); }

  // No request flag grants the exclusion: it belongs to the authenticated route, not its query.
  for (const url of ["/managed-video", "/managed-video?templateChoice=&__tovu_preview=claimed&preview=true&skipConsent=true"]) {
    const response = await dispatchHttpRequest({ app, method: "GET", url, headers: { "x-tovu-preview": "true" } });
    assert.equal(response.status, 200);
    const dom = new JSDOM(response.body);
    try {
      const document = dom.window.document;
      assert.equal(document.querySelector("iframe")?.getAttribute("src"), video, "unmanaged authored embeds are unchanged and need owner review");
      assert.equal(document.querySelector('script[src="/scripts/optional-preview-fixture.js"]'), null, 'optional declarations remain JSON until consent');
      const configNode = document.querySelector('#jini-consent-config');
      assert.ok(configNode, `managed consent runtime must be present for ${url}: ${response.body.slice(0, 240)}`);
      const config = JSON.parse(configNode.textContent!);
      assert.deepEqual(config.scripts, [{ src: '/scripts/optional-preview-fixture.js', consent: ['functional'] }]);
      assert.ok(document.querySelector("#jini-consent"));
      assert.ok(document.querySelector('script[src^="/_consent/client-"]'));
      assert.ok(!response.body.includes(note), "the note belongs only to the admin preview UI");
    } finally { dom.window.close(); }
  }

});
