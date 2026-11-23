/**
 * Pins the HOST's generated admin-screen roster as `buildSiteCapabilities` reports it. The service's
 * own behaviour is tested beside it in `@jini-ai/cms/site-inspection`; these two cases stay here
 * because `admin-screens.generated.ts` is host data generated from the admin app's panels.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildSiteCapabilities, type SiteCapabilitiesDeps } from "@jini-ai/cms/site-inspection/site-capabilities";

const PRINCIPAL_ID = "principal-under-test";

function hostDeps(): SiteCapabilitiesDeps {
  return {
    workspaceId: "ws-site-capabilities",
    clock: { nowIso: () => "2026-09-15T00:00:00.000Z" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    listCatalogTools: () => [],
    listAdminScreens: () => [],
    listContentTypes: async () => [],
    reportSectionFailure: () => {},
  };
}

test("admin screens expose each panel purpose and its entity/query contract to the assistant", async () => {
  const { ADMIN_SCREENS: published } = await import("../admin-screens.generated.js");
  const deps = { ...hostDeps(), listAdminScreens: () => published };
  const result = await buildSiteCapabilities({ deps, input: { principalId: PRINCIPAL_ID } });
  const screen = result.sections.adminScreens?.data?.screens.find(row => row.id === "agent-plugins");
  assert.ok(screen);
  assert.equal(screen.description, "Manage agent plugins: install, view details, turn on/off.");
  assert.equal(screen.path, "/addons/agent-plugins");
  assert.deepEqual(screen.entityTargets, [{ type: "agent-plugin", routeTemplate: "/addons/agent-plugins" }]);
  assert.deepEqual(screen.allowedQueryParams?.tab, ["installed", "downloaded", "add", "marketplace"]);
});

test("admin screens expose the unsaved-post route without reserving a post slug", async () => {
  const { ADMIN_SCREENS: published } = await import("../admin-screens.generated.js");
  const result = await buildSiteCapabilities({ deps: { ...hostDeps(), listAdminScreens: () => published }, input: { principalId: PRINCIPAL_ID } });
  const screen = result.sections.adminScreens?.data?.screens.find(row => row.id === "posts");
  assert.ok(screen, "the posts screen must be exposed to the assistant");
  assert.deepEqual(screen.allowedQueryParams?.create, ["1"]);
  assert.ok(screen.routeTemplates?.includes("/posts/:postId"), "the create query must preserve the ordinary post-id/slug route");
});
