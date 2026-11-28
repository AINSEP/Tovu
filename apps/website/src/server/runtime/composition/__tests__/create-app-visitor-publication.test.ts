import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { set as setLegacySetting } from "@jini-ai/core/settings";
import { setPublicAssistantSettings, setSiteAssistantCredential } from "#src/assistant/index";
import { createApp, createRouteDeps } from "../app.js";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { useSiteChatBuild } from "../../../inbound/public-http/http/site/__tests__/site-chat.fixture.js";

/**
 * @file `createApp`'s published-WebMCP wiring (`applyPublicMiddleware`): a rendered page that carries
 * the visitor assistant gets its visitor-page publication only while the visitor tools policy is on,
 * the public assistant is enabled and ready, and the requested path is one of the site's visitor page targets.
 * Real in-memory composition and HTTP; only the env switch and the assistant setting change.
 */

const PUBLICATION = 'id="tovu-visitor-publication"';

async function servedSite(t: TestContext) {
  useSiteChatBuild({ test: t, ready: true });
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await deps.assistantSettingsReady;
  await setPublicAssistantSettings({
    settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, principals: deps.principalRepo,
    authorize: async () => ({ allowed: true, reason: "test" }),
  }, { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  // The widget renders only for a ready assistant; no provider call is made while serving a page.
  await setSiteAssistantCredential({
    repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock,
  }, { workspaceId: deps.workspaceId, apiKey: "fake-one", model: "model-a", baseUrl: "http://127.0.0.1:9" });
  return await startTestServer(createApp(deps), t);
}

function withPolicy(t: TestContext, value: string | undefined): void {
  const previous = process.env.TOVU_VISITOR_TOOLS_POLICY;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_VISITOR_TOOLS_POLICY; else process.env.TOVU_VISITOR_TOOLS_POLICY = previous; });
  if (value === undefined) delete process.env.TOVU_VISITOR_TOOLS_POLICY; else process.env.TOVU_VISITOR_TOOLS_POLICY = value;
}

test("a visitor page with the public assistant on is served with its visitor-page publication", async (t) => {
  withPolicy(t, undefined);
  const baseUrl = await servedSite(t);
  const html = await (await fetch(`${baseUrl}/`)).text();
  assert.match(html, /id="tovu-site-assistant-root"/);
  assert.ok(html.includes(PUBLICATION), "the home page is a visitor page target");
});

test("the visitor tools policy switched off serves the same page without a publication", async (t) => {
  withPolicy(t, "off");
  const baseUrl = await servedSite(t);
  const html = await (await fetch(`${baseUrl}/`)).text();
  assert.match(html, /id="tovu-site-assistant-root"/);
  assert.equal(html.includes(PUBLICATION), false);
});

test("a rendered page that is not a visitor page target keeps the assistant but gets no publication", async (t) => {
  withPolicy(t, undefined);
  const baseUrl = await servedSite(t);
  const response = await fetch(`${baseUrl}/signin`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /id="tovu-site-assistant-root"/);
  assert.equal(html.includes(PUBLICATION), false, "sign-in is never a visitor page target");
});
