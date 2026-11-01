/** The editor's existing authenticated render route excludes consent; public flags cannot do so.
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
import { applySiteConsent } from "#src/server/inbound/public-http/middleware/site-consent";
import { registerSiteRoutes } from "#src/server/inbound/public-http/routes/site/pages";
import { registerAdminPostTemplatePreviewRoute } from "../template-preview.js";
import { bareDeps, barePost } from "./preview-fixtures.js";

const video = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const note = "Cookie banner hidden in preview. Embedded videos may not play here; open the page to check.";

test("authenticated preview leaves YouTube live while public delivery stays gated despite preview query/header claims", async t => {
  const consent = consentFixture({ t });
  const saved = await consent.service.saveDraft({ principalId: "owner", config: consent.config, expectedDraftId: null });
  await consent.service.publish({ principalId: "owner", draftId: saved.revision.id, expectedPublishedId: null });
  const post = { ...barePost, status: "published" as const, slug: "video", bodyHtml: `<!doctype html><html><head></head><body><iframe src="${video}"></iframe></body></html>` };
  const { deps } = bareDeps([post]);
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
  applySiteConsent({ app, deps });
  registerAdminPostTemplatePreviewRoute(app, deps);
  registerSiteRoutes(app, deps);
  const previewPath = `/api/admin/v1/workspaces/w/posts/${post.id}/template-preview?templateChoice=`;

  assert.deepEqual(await dispatchJsonRequest(app, "GET", "/api/site-consent/status"), { status: 200, body: { ready: true } });
  const rejectedChoice = await dispatchHttpRequest({ app, method: "POST", url: "/api/site-consent", headers: { origin: "null" }, body: { action: "accept", policyVersion: "1" } });
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

  // No request flag grants the exclusion: it belongs to the authenticated route, not its query.
  for (const url of ["/video", "/video?templateChoice=&__tovu_preview=claimed&preview=true&skipConsent=true"]) {
    const response = await dispatchHttpRequest({ app, method: "GET", url, headers: { "x-tovu-preview": "true" } });
    assert.equal(response.status, 200);
    const dom = new JSDOM(response.body);
    try {
      const document = dom.window.document;
      assert.equal(document.querySelector("iframe[src]"), null, "public video cannot load before consent");
      const gate = document.querySelector("template[data-jini-consent-resource]") as HTMLTemplateElement | null;
      assert.equal(gate?.content.querySelector("iframe")?.getAttribute("src"), video);
      assert.ok(document.querySelector("#jini-consent"));
      assert.ok(!response.body.includes(note), "the note belongs only to the admin preview UI");
    } finally { dom.window.close(); }
  }
});
