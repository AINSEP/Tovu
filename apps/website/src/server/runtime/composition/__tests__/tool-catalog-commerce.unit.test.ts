import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { createCommerceServer, type CheckoutDeps, type PayOrderDeps } from "@jini-ai/commerce";
import { buildRegistrations, buildCommerceCatalogRegistrations } from "@jini-ai/commerce/tools";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

function commerceContributor() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find(candidate => candidate.domain === "commerce");
  assert.ok(contributor);
  return contributor;
}
const authorize = async () => ({ allowed: true, reason: "matched" });
const context = { executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal };

test("commerce has no tool registrations when the host composes no commerce runtime", () => {
  assert.deepEqual(commerceContributor().build({ authorize } as never, {} as never), []);
});

test("a composed disabled runtime offers readiness but refuses setup before schema or catalog I/O", async () => {
  let storageCalls = 0;
  const neverStorage = async () => { storageCalls++; throw new Error("disabled commerce touched storage"); };
  const clock = { nowMs: () => 0 }, idGen = { newId: () => "id" };
  const products = { findById: neverStorage, findBySlug: neverStorage, listActive: neverStorage, save: neverStorage };
  const prices = { findById: neverStorage, listByProduct: neverStorage, save: neverStorage };
  const server = createCommerceServer({ scope: { workspaceId: "ws", siteId: "site", providerId: "stripe", providerAccountId: "acct", mode: "test" },
    publicOrigin: "https://shop.example", isActive: async () => false, ensureSchema: neverStorage, warn: () => {},
    checkoutDeps: { products, prices, orders: {} as CheckoutDeps["orders"], clock, idGen }, payOrderDeps: {} as PayOrderDeps });
  const commerce = { toolRegistrations: ({ authorize: authorizeTool }: { authorize: typeof authorize }) => [
    ...buildRegistrations({ workspaceId: "ws", authorize: authorizeTool, commerce: server }),
    ...buildCommerceCatalogRegistrations({ workspaceId: "ws", authorize: authorizeTool, commerce: server, products, prices, clock, idGen }),
  ] };
  const registrations = commerceContributor().build({ authorize, commerce } as never, {} as never);
  assert.deepEqual(registrations.map(registration => registration.descriptor.id), ["commerce_get_status", "commerce_create_product", "commerce_create_price"]);
  const status = await registrations[0]!.handler({ ...context, input: {} });
  assert.equal((status as { checkout: { ready: boolean } }).checkout.ready, false);
  await assert.rejects(() => registrations[1]!.handler({ ...context, input: { name: "Notebook", slug: "notebook" } }), /Commerce is disabled/);
  await assert.rejects(() => registrations[2]!.handler({ ...context, input: { productId: "product", amount: { minorUnits: 1, currency: "JPY" } } }), /Commerce is disabled/);
  assert.equal(storageCalls, 0);
});
