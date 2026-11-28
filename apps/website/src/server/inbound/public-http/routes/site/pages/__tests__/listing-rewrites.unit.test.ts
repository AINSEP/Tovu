import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { dispatchHttpRequest } from "#src/server/__tests__/helpers/in-process-http";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import type { RouteDeps } from "#src/server/routes/types";
import { registerListingRewrites } from "../handlers/listing.js";

function appWithRewrites() {
  const app = express();
  registerListingRewrites({ app, deps: portFake<RouteDeps>({}) });
  app.use((req, res) => { res.json({ url: req.url, originalUrl: req.originalUrl }); });
  return app;
}

test("a numbered listing page is rewritten to its page, keeping the query", async () => {
  const response = await dispatchHttpRequest({ app: appWithRewrites(), method: "get", url: "/blog/page/2?tag=news" });
  assert.deepEqual(JSON.parse(String(response.body)), { url: "/blog?tag=news", originalUrl: "/blog/page/2?tag=news" });
});

test("a /page/<segment> that is not a listing page number falls through untouched", async () => {
  const response = await dispatchHttpRequest({ app: appWithRewrites(), method: "get", url: "/blog/page/about-us" });
  assert.deepEqual(JSON.parse(String(response.body)), { url: "/blog/page/about-us", originalUrl: "/blog/page/about-us" });
});
