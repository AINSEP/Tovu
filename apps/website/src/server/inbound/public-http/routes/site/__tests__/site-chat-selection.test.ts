/** wcmp: real site settings resolved for public pages and static exports. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { setPublicAssistantSettings, setSiteAssistantCredential } from "#src/assistant/index";
import { resolveSiteAssistantWidgetForRequest } from "../pages.js";

test("wcmp: page selection reads the site choice, retains off, and leaves static exports widget-free", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  await deps.siteTitleReady;
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
  { workspaceId: deps.workspaceId, apiKey: "visitorai-test-key", model: "saved-model" });
  const writer = {
    settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: deps.set, clock: deps.clock,
    ids: deps.idGen, authorize: async () => ({ allowed: true, reason: "test_grant" }), principals: deps.principalRepo,
  };
  const request = { header: () => undefined };
  assert.equal(await resolveSiteAssistantWidgetForRequest({ request, deps }), false);
  await setPublicAssistantSettings(writer, { workspaceId: deps.workspaceId, callerPrincipalId: "user-local", patch: { publicEnabled: true } });
  assert.equal(await resolveSiteAssistantWidgetForRequest({ request, deps }), "react");
  await setPublicAssistantSettings(writer, { workspaceId: deps.workspaceId, callerPrincipalId: "user-local", patch: { widget: "vanilla" } });
  assert.equal(await resolveSiteAssistantWidgetForRequest({ request, deps }), "vanilla");
  function exportedHeader(name: "set-cookie"): string[] | undefined;
  function exportedHeader(name: string): string | undefined;
  function exportedHeader(name: string): string | string[] | undefined {
    return name === "x-tovu-static-export" ? "1" : undefined;
  }
  const exported = { header: exportedHeader };
  assert.equal(await resolveSiteAssistantWidgetForRequest({ request: exported, deps }), false);
  await setPublicAssistantSettings(writer, { workspaceId: deps.workspaceId, callerPrincipalId: "user-local", patch: { publicEnabled: false } });
  assert.equal(await resolveSiteAssistantWidgetForRequest({ request, deps }), false);
});
