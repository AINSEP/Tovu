import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRouteDeps } from "../app.js";
import { foldPageHead, type PageHeadContext, type PageHeadHook } from "../../../inbound/public-http/http/site/page-head.js";

const ctx: PageHeadContext = { workspaceId: "workspace-1", route: "home", siteTitle: "Test", canonicalUrl: "/" };

test("createApp keeps explicitly supplied contributors with their own render and leaves no global SEO state", async () => {
  const hook: PageHeadHook = { priority: 100, handle: async () => [{ kind: "title", text: "First app", priority: 100 }] };
  const first = createRouteDeps(); first.pageHeadContributors = [hook];
  createApp(first);
  createApp(createRouteDeps());
  assert.deepEqual(await foldPageHead(ctx), []);
  assert.deepEqual(await foldPageHead(ctx, { contributors: first.pageHeadContributors }), [{ kind: "title", text: "First app", priority: 100 }]);
});
