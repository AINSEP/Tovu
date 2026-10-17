import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createAssistantSettingsModule } from "../runtime/composition/modules/assistant-settings.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { registerAdminSettingsSetRoute } from "../inbound/admin-http/routes/settings/set.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../inbound/admin-http/routes/settings/register-definitions.js";
import { registerSiteRoutes, resolveSiteAssistantWidgetForRequest } from "../inbound/public-http/routes/site/pages.js";
import { InMemoryPostRepo } from "#src/features/post/index";
import { setSiteAssistantCredential, deleteSiteAssistantCredential } from "#src/assistant/index";
import { set as setLedgerValue } from "@jini-ai/core/settings";
import type { DiscoveredTheme } from "#src/features/theme/index";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated } from "./helpers/http-test-server.js";
import { startStubProviderServer } from "./helpers/stub-provider-server.js";
import { useSiteChatBuild } from "../inbound/public-http/http/site/__tests__/site-chat.fixture.js";

const BASE = "/api/admin/v1/workspaces/workspace-local";
const allow = async () => ({ allowed: true, reason: "test_grant" });

async function saveCredential({ deps, patch = {} }: { deps: RouteDeps; patch?: { apiKey?: string; model?: string; provider?: string } }, _options = {}) {
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
  { workspaceId: deps.workspaceId, apiKey: "visitorai-test-key", provider: "google", model: "saved-model", ...patch });
}

/** Reproduce legacy or imported invalid state through the platform ledger, bypassing host policy.
 * Production routes and tools must never use this unbound platform writer. */
async function legacyEnabled({ deps }: { deps: RouteDeps }, _options = {}) {
  await setLedgerValue({ deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen,
    principals: deps.principalRepo, authorize: allow }, input: { namespace: "site.assistant", key: "public_enabled",
    scope: "workspace", workspaceId: deps.workspaceId, authWorkspaceId: deps.workspaceId,
    callerPrincipalId: "user-local", value: true } });
}

async function boot({ t }: { t: import("node:test").TestContext }, _options = {}) {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  let providerCalls = 0;
  const endpoint = await startStubProviderServer(t, () => {
    providerCalls++;
    return { status: 200, body: 'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"configured reply"}]},"finishReason":"STOP","index":0}]}\n\n' };
  });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createAssistantSettingsModule(deps).registerRoutes?.(app);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  createSiteAssistantModule(deps, { GEMINI_API_KEY: "env-key-must-not-rescue-missing-saved-key",
    TOVU_SITE_ASSISTANT_MODEL: "env-model", TOVU_SITE_ASSISTANT_BASE_URL: endpoint }).registerRoutes?.(app);
  // A real declarative renderer with no disk theme/build dependency; homepage content proves
  // the negative markup assertions reached a successful page, rather than an error response.
  deps.postRepo = new InMemoryPostRepo([]);
  const themes: DiscoveredTheme[] = [{ manifest: { id: "tovu-official", name: "Visitor test", version: "1.0.0", tier: "declarative", engine: 1 },
    tokens: {}, tokensLight: {}, pages: {}, partials: {}, templates: { home: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Visitor readiness page" }] }] } },
    liquidTemplates: {}, handlebarsTemplates: {}, dir: "/nonexistent/visitorai-test", css: "", source: "site", status: "valid", errors: [] }];
  deps.themes = themes;
  registerSiteRoutes(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  return { deps, baseUrl, cookie, providerCalls: () => providerCalls };
}

function put({ baseUrl, cookie, path, body }: { baseUrl: string; cookie: string; path: string; body: unknown }, _options = {}) {
  return fetch(baseUrl + BASE + path, { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
}

for (const missing of ["key", "model", "unreadable-key", "unsupported-provider"] as const) {
  test(`visitorai: both admin write APIs refuse enabling with ${missing} and persist neither field`, async t => {
    useSiteChatBuild({ test: t, ready: true });
    const f = await boot({ t });
    if (missing !== "key") await saveCredential({ deps: f.deps, patch: { model: missing === "model" ? " " : "saved-model",
      provider: missing === "unsupported-provider" ? "cohere" : "google" } });
    if (missing === "unreadable-key") {
      const row = await f.deps.siteAssistantCredentialRepo.findByWorkspaceId(f.deps.workspaceId);
      assert.ok(row?.sealed);
      await f.deps.siteAssistantCredentialRepo.upsert({ ...row, sealed: { ...row.sealed, keyId: "missing-key" } });
    }
    const dedicated = await put({ ...f, path: "/assistant/settings", body: { publicEnabled: true, widget: "vanilla" } });
    assert.equal(dedicated.status, 400);
    assert.deepEqual(await dedicated.json(), { code: "ASSISTANT_SETTINGS_VALIDATION_ERROR",
      error: "Save a usable provider key and a model in AI Assistant before enabling the public assistant." });
    const generic = await put({ ...f, path: "/settings/value", body: { namespace: "site.assistant", key: "public_enabled", scope: "workspace", valueJson: true } });
    assert.equal(generic.status, 400);
    assert.match((await generic.json()).error, /usable provider key and a model/);
    const read = await fetch(f.baseUrl + BASE + "/assistant/settings", { headers: { cookie: f.cookie } });
    assert.deepEqual((await read.json()).data, { publicEnabled: false, widget: "react" });
    await legacyEnabled({ deps: f.deps });
    const page = await fetch(f.baseUrl + "/");
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Visitor readiness page/);
    assert.doesNotMatch(html, /tovu-site-assistant-root|data-jini-chat-loader|\/site-chat\//);
    const chat = await fetch(f.baseUrl + "/api/site-assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hello" }) });
    assert.equal(chat.status, 503);
    assert.equal((await chat.json()).code, missing === "model" ? "MODEL_NOT_CONFIGURED" : missing === "unsupported-provider" ? "PROVIDER_UNSUPPORTED" : "NOT_CONFIGURED");
    assert.equal(f.providerCalls(), 0);
  });
}

for (const variant of ["react", "vanilla"] as const) {
  for (const removed of ["key", "model"] as const) {
    test(`visitorai: ${variant} widget and chat stop after saved ${removed} removal despite flag and env defaults`, async t => {
      useSiteChatBuild({ test: t, ready: true });
      const f = await boot({ t });
      await saveCredential({ deps: f.deps });
      const enabled = await put({ ...f, path: "/assistant/settings", body: { publicEnabled: true, widget: variant } });
      assert.equal(enabled.status, 200);
      const configured = await fetch(f.baseUrl + "/");
      assert.equal(configured.status, 200);
      assert.match(await configured.text(), /data-jini-chat-loader/);
      if (removed === "key") {
        const deleted = await fetch(f.baseUrl + BASE + "/assistant/site-credential", { method: "DELETE", headers: { cookie: f.cookie } });
        assert.equal(deleted.status, 200);
      } else {
        const cleared = await put({ ...f, path: "/assistant/site-credential", body: { model: "" } });
        assert.equal(cleared.status, 200);
      }
      const settings = await fetch(f.baseUrl + BASE + "/assistant/settings", { headers: { cookie: f.cookie } });
      assert.equal((await settings.json()).data.publicEnabled, true, "legacy flag remains on; readiness must decide server-side");
      const page = await fetch(f.baseUrl + "/");
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /Visitor readiness page/);
      assert.doesNotMatch(html, /tovu-site-assistant-root|data-jini-chat-loader|\/site-chat\//);
      const chat = await fetch(f.baseUrl + "/api/site-assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hello" }) });
      assert.equal(chat.status, 503);
      assert.match(chat.headers.get("content-type") ?? "", /application\/json/);
      const error = await chat.json();
      assert.equal(error.code, removed === "key" ? "NOT_CONFIGURED" : "MODEL_NOT_CONFIGURED");
      assert.match(error.error, /^The assistant couldn't answer right now/);
      assert.ok(error.errorId);
      assert.doesNotMatch(error.error, /provider|model|key/i);
      assert.equal(f.providerCalls(), 0, "unusable requests never open a stream or call the provider");
      assert.equal(await resolveSiteAssistantWidgetForRequest({ request: { header: () => undefined }, deps: f.deps }), false);
    });
  }
}

test("visitorai: imported enabled state with no credential emits no widget and cannot consume an env key", async t => {
  useSiteChatBuild({ test: t, ready: true });
  const f = await boot({ t });
  await legacyEnabled({ deps: f.deps });
  const page = await fetch(f.baseUrl + "/");
  assert.equal(page.status, 200);
  assert.doesNotMatch(await page.text(), /tovu-site-assistant-root|data-jini-chat-loader|\/site-chat\//);
  const chat = await fetch(f.baseUrl + "/api/site-assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hello" }) });
  assert.equal(chat.status, 503);
  const publicError = await chat.json();
  assert.match(publicError.error, /^The assistant couldn't answer right now/);
  assert.ok(publicError.errorId);
  assert.equal(f.providerCalls(), 0);
  await deleteSiteAssistantCredential({ repo: f.deps.siteAssistantCredentialRepo, clock: f.deps.clock }, { workspaceId: f.deps.workspaceId });
  const off = await put({ ...f, path: "/assistant/settings", body: { publicEnabled: false } });
  assert.equal(off.status, 200, "an operator can always turn the stale flag off");
  const disabled = await fetch(f.baseUrl + "/api/site-assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hello" }) });
  assert.equal(disabled.status, 404);
  const disabledError = await disabled.json();
  assert.equal(disabledError.code, "ASSISTANT_DISABLED");
  assert.ok(disabledError.errorId);
  assert.match(disabledError.error, /^The assistant couldn't answer right now/);
});

test("visitorai: an alias cannot bypass credential validation on the generic write API", async t => {
  const f = await boot({ t });
  const definition = await f.deps.settingsRepo.findActiveDefinition({ workspaceId: f.deps.workspaceId, namespace: "site.assistant", key: "public_enabled" });
  assert.ok(definition);
  await f.deps.settingsRepo.saveDefinition({ ...definition, settingId: "visitorai-alias", namespace: "site.legacy", key: "chat",
    status: "alias", aliasOfNamespace: "site.assistant", aliasOfKey: "public_enabled" });
  const response = await put({ ...f, path: "/settings/value", body: { namespace: "site.legacy", key: "chat", scope: "workspace", valueJson: true } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /usable provider key and a model/);
  assert.equal(await f.deps.settingsRepo.getWorkspaceValue({ workspaceId: f.deps.workspaceId, settingId: definition.settingId }), null);
});

test("visitorai: generic definition batches cannot replace the code-owned off default", async t => {
  const f = await boot({ t });
  const before = await f.deps.settingsRepo.listActiveDefinitions({ workspaceId: f.deps.workspaceId });
  const response = await fetch(f.baseUrl + BASE + "/settings/definitions", { method: "POST", headers: { "content-type": "application/json", cookie: f.cookie },
    body: JSON.stringify({ definitions: [
      { namespace: "site.visitorai", key: "unrelated", ownerKind: "site", schemaJson: { type: "boolean" }, defaultJson: false, scopes: 6 },
      { namespace: "site.assistant", key: "public_enabled", ownerKind: "site", schemaJson: { type: "boolean" }, defaultJson: true, scopes: 6 },
    ] }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /definitions are code-owned/);
  assert.deepEqual(await f.deps.settingsRepo.listActiveDefinitions({ workspaceId: f.deps.workspaceId }), before, "the whole batch is refused before unrelated items write");
});
