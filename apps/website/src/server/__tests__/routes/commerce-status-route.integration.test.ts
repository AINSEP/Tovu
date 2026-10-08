import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor, DerivedToolContributor } from "#src/assistant/tool-contribution-registry";
import { installFirstPartyToolContributors } from "../../runtime/composition/tool-catalog-manifest.js";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";
/** Phase 12: off means no registered HTTP or agent-tool entry, even for an authenticated owner. */
test("commerce off: no store, products, webhook or status route is registered", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const paths: string[] = [];
  type Layer = { route?: { path: string }; handle?: { stack?: Layer[] } };
  const walk = (stack: Layer[]): void => {
    for (const layer of stack) {
      if (layer.route) paths.push(layer.route.path);
      if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk(app._router.stack);
  for (const path of ["/store", "/store/buy", "/products", "/products/:id", "/payments/webhook/:providerId", "/api/admin/v1/workspaces/:workspaceId/commerce/status"]) {
    assert.equal(paths.includes(path), false, `off runtime must not register ${path}`);
  }
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/commerce/status`, { headers: { cookie } });
  assert.equal(status.status, 404);
  const webhook = await fetch(`${baseUrl}/payments/webhook/lipay`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(webhook.status, 404);
});

test("commerce off: first-party and legacy catalogs expose no commerce tools", () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  assert.equal(contributions.contributors.list({}).some(entry => entry.domain === "commerce-get-status"), false);
  const registrations = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: createRouteDeps() }), undefined, { contributions });
  assert.deepEqual(registrations.filter(entry => /^(commerce_|payments_|lipay_|store_)/.test(entry.descriptor.id)).map(entry => entry.descriptor.id), []);
});
