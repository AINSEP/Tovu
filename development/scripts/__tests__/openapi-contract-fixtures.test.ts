import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { buildContractProbeRequest, seedContractProbeForm, type ContractProbeType } from "../lib/openapi-contract-fixtures.js";
import { loadOpenApiOperations } from "../lib/openapi-operations.js";
import { loginBarePrincipal, loginOwner, startTovuServer } from "../lib/tovu-test-server.js";

type ProbeCase = readonly [string, string, Exclude<ContractProbeType, "RESOURCE_EMPTY_200" | "IDEMPOTENCY_409">, number];

// Each formerly failing request must reach its intended condition on the real composed server.
// Literal expected statuses are independent of the fixture builder (including the valid empty 200).
const CASES: readonly ProbeCase[] = [
  ["002-content-entry-authoring.yaml", "create_post", "VALIDATION_400", 400],
  ["002-content-entry-authoring.yaml", "create_page", "VALIDATION_400", 400],
  ["005-plugin-system.yaml", "set_plugin_enabled", "PERM_403", 403],
  ["005-plugin-system.yaml", "set_plugin_enabled", "RESOURCE_404", 404],
  ["006-identity-and-authorization.yaml", "write_policy_permission", "RESOURCE_404", 404],
  ["007-settings-core-ledger.yaml", "set_setting_value", "PERM_403", 403],
  ["007-settings-core-ledger.yaml", "clear_setting_value", "PERM_403", 403],
  ["007-settings-core-ledger.yaml", "reset_settings_namespace", "PERM_403", 403],
  ["009-redirects.yaml", "create_redirect", "PERM_403", 403],
  ["009-redirects.yaml", "import_redirects", "PERM_403", 403],
  ["010-forms.yaml", "create_form_definition", "PERM_403", 403],
  ["010-forms.yaml", "update_form_definition", "PERM_403", 403],
  ["010-forms.yaml", "submit_form", "VALIDATION_400", 400],
  ["011-newsletter.yaml", "create_newsletter_campaign", "PERM_403", 403],
  ["011-newsletter.yaml", "send_test_newsletter_campaign", "PERM_403", 403],
  ["011-newsletter.yaml", "send_test_newsletter_campaign", "RESOURCE_404", 404],
  ["011-newsletter.yaml", "create_newsletter_list", "PERM_403", 403],
  ["011-newsletter.yaml", "list_newsletter_subscriptions", "RESOURCE_404", 200],
  ["011-newsletter.yaml", "create_newsletter_subscription", "PERM_403", 403],
  ["011-newsletter.yaml", "create_newsletter_subscription", "RESOURCE_404", 404],
  ["011-newsletter.yaml", "import_newsletter_subscriptions", "PERM_403", 403],
  ["011-newsletter.yaml", "import_newsletter_subscriptions", "RESOURCE_404", 404],
  ["012-menus.yaml", "update_menu_tree", "PERM_403", 403],
  ["012-menus.yaml", "update_menu_tree", "RESOURCE_404", 404],
  ["012-menus.yaml", "assign_menu_location", "PERM_403", 403],
  ["012-menus.yaml", "assign_menu_location", "RESOURCE_404", 404],
  ["021-media-assets.yaml", "upload_media", "PERM_403", 403],
  ["021-media-assets.yaml", "replace_media_providers", "VALIDATION_400", 400],
  ["021-media-assets.yaml", "get_media_rendition", "RESOURCE_404", 404],
];

test("OpenAPI contract: all 29 original mismatches reach the documented condition with real HTTP inputs", async (t) => {
  const server = await startTovuServer();
  t.after(() => server.close());
  const ownerCookie = await loginOwner(server.baseUrl);
  const bareCookie = await loginBarePrincipal(server.routeDeps, server.baseUrl);
  const formSlug = await seedContractProbeForm({ request: fetch, baseUrl: server.baseUrl, ownerCookie, workspaceId: "workspace-local" });
  const operations = loadOpenApiOperations(path.resolve(import.meta.dirname, "..", "..", "..", "openapi"));

  for (const [file, operationId, probeType, expectedStatus] of CASES) {
    const operation = operations.find((op) => op.file === file && op.operationId === operationId);
    assert.ok(operation, `${file}#${operationId} is documented`);
    assert.ok(operation.statusCodes.includes(String(expectedStatus)), `${operationId} documents ${expectedStatus}`);
    const cookie = probeType === "PERM_403" ? bareCookie : ownerCookie;
    const input = buildContractProbeRequest({
      operation, probeType, workspaceId: "workspace-local", headers: operation.requiresAuth ? { cookie } : {},
    }, { formSlug });
    assert.equal(input.expectedStatus, String(expectedStatus), `${operationId}: ${probeType}`);
    const response = await fetch(`${server.baseUrl}${input.url}`, {
      method: operation.method.toUpperCase(), headers: input.headers, body: input.body,
    });
    const bodyText = await response.text();
    assert.equal(response.status, expectedStatus, `${operationId}: ${probeType}: ${bodyText}`);
    if (expectedStatus === 200) assert.deepEqual(JSON.parse(bodyText), { data: [] });
    if (probeType === "PERM_403") assert.equal(JSON.parse(bodyText).code, "FORBIDDEN");
  }
});

test("OpenAPI contract form setup refuses failed or inactive fixtures", async () => {
  for (const response of [
    new Response("{}", { status: 400 }),
    new Response(JSON.stringify({ data: { slug: "probe", status: "disabled" } }), { status: 201 }),
    new Response(JSON.stringify({ data: { slug: "wrong", status: "active" } }), { status: 201 }),
  ]) {
    await assert.rejects(seedContractProbeForm({
      request: async () => response, baseUrl: "http://unused.invalid", ownerCookie: "owner", workspaceId: "workspace-local",
    }, { slug: "probe" }), /contract form setup/);
  }
});
