import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRouteDeps } from "../app.js";
import { foldPageHead } from "@jini-ai/cms/presentation/page-head";
import type { PageHeadContext, PageHeadHook } from "@jini-ai/cms/seo";

const ctx: PageHeadContext = { workspaceId: "workspace-1", route: "home", siteTitle: "Test", canonicalUrl: "/" };

test("createApp keeps explicitly supplied contributors with their own render and leaves no global SEO state", async () => {
  const hook: PageHeadHook = { priority: 100, handle: async () => [{ kind: "title", text: "First app", priority: 100 }] };
  const first = createRouteDeps(); first.pageHeadContributors = [hook];
  createApp(first);
  const second = createRouteDeps();
  second.pageHeadContributors = [{ priority: 100, handle: async () => [{ kind: "title", text: "Second app", priority: 100 }] }];
  createApp(second);
  assert.deepEqual(await foldPageHead({ context: ctx }), []);
  assert.deepEqual(await foldPageHead({ context: ctx }, { contributors: second.pageHeadContributors }), [{ kind: "title", text: "Second app", priority: 100 }]);
  assert.deepEqual(await foldPageHead({ context: ctx }, { contributors: first.pageHeadContributors }), [{ kind: "title", text: "First app", priority: 100 }]);
});
