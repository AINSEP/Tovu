import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * @file The form-delivery bindings `composeOutboundConnections` hands the plugin connections: a plugin destination
 * screen saves its bindings through the site settings and asks the site's id generator for each new binding id.
 */

const seen: { required?: Record<string, unknown>; optional?: Record<string, unknown> } = {};
const connections = await import("../../agent-plugin-connections.js");
mock.module(new URL("../../agent-plugin-connections.js", import.meta.url).href, { namedExports: { ...connections,
  composeAgentPluginConnections: (required: Record<string, unknown>, optional: Record<string, unknown>) => { Object.assign(seen, { required, optional }); return { connections: "composed" }; } } });
mock.module(new URL("../../outbound-http.js", import.meta.url).href, { namedExports: { composeOutboundHttp: () => ({ externalMcpOAuthHttpPorts: { oauth: 1 }, guardedOutboundHttpClient: { http: 1 } }) } });
const { composeOutboundConnections } = await import("../outbound-connections.js");
type Required = Parameters<typeof composeOutboundConnections>[0];

test("each new form-delivery binding id comes fresh from the site's id generator, and bindings save through the site settings", () => {
  let next = 0;
  const idGen = { newId: () => `binding-${++next}` };
  const settingsRepo = { settings: 1 };
  const authorize = () => true;
  const forms = { forms: 1 };
  const clock = { nowIso: () => "2026-11-20T00:00:00.000Z" };
  const result = composeOutboundConnections({
    devCapabilityScheme: "http", workspaceId: "ws-c", agentPluginLifecycle: { loadPluginContributions: async () => [] }, kernel: {},
    siteAssistantSecretKeyring: {}, siteAssistantSecretSealer: {}, customCredentialSetRepo: {}, clock,
    projectStore: undefined, projectSiteId: undefined, resolvedSiteBinding: { name: "site-c" }, identity: { ownerPrincipalId: "owner-1", authorize },
    siteReferenceRepo: {}, settingsRepo, idGen, settingsPrincipals: { principals: 1 }, formDefinitionRepo: forms,
  } as unknown as Required);
  const delivery = seen.optional?.deliveryBindings as { settings: Record<string, unknown>; forms: unknown; newBindingId: () => string };
  assert.equal(next, 0);
  assert.deepEqual([delivery.newBindingId(), delivery.newBindingId()], ["binding-1", "binding-2"]);
  assert.deepEqual(delivery.settings, { repo: settingsRepo, clock, ids: idGen, authorize, principals: { principals: 1 } });
  assert.equal(delivery.forms, forms);
  assert.deepEqual(result.agentPluginConnections, { connections: "composed" });
});
