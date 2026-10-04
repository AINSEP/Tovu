import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { registerStoreRoutes } from "../store.js";

test("a purchase preserves existing return query parameters and places the message before the fragment", async () => {
  const app = express();
  registerStoreRoutes(app, { store: {
    listProducts: () => [],
    checkout: (id: string, quantity: number) => {
      assert.equal(id, "product-1");
      assert.equal(quantity, 1);
      return { ok: true, orderId: "order-1", remainingStock: 4, retries: 0 };
    },
  } } as RouteDeps);
  const handler = extractRouteHandler(app, "get", "/store/buy");
  for (const returnTo of ["/store?x=1", "/store?x=1#receipt"]) {
    const { res } = createCapturingResponse();
    let location: string | undefined;
    res.redirect = ((url: string) => { location = url; return res; }) as typeof res.redirect;
    await handler({ query: { productId: "product-1", returnTo } }, res);
    assert.ok(location, "a completed purchase must redirect");
    const parsed = new URL(location, "https://store.example");
    assert.equal(parsed.pathname, "/store");
    assert.deepEqual([...parsed.searchParams], [["x", "1"], ["msg", "Purchased — order order-1, 4 left."]]);
    assert.equal(parsed.hash, returnTo.endsWith("#receipt") ? "#receipt" : "");
  }
});
