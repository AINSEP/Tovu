import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request } from "express";
import { builtinVisitorToolsCatalog, composeVisitorToolsManagement } from "../visitor-tools-management.js";
import { visitorSettingsFixture, ws } from "#src/features/settings/__tests__/visitor-tools.fixture";
import { createAssistantSettingsModule } from "../modules/assistant-settings.js";
import type { AssistantSettingsRouteDeps } from "#src/server/inbound/admin-http/routes/assistant/deps";
import { ADMIN_VISITOR_TOOLS_PATH } from "#src/server/inbound/admin-http/routes/assistant/visitor-tools";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

test("the production catalog is the reviewed CMS reads and seven page capabilities, independent of the admin registry", async () => {
  const catalog = builtinVisitorToolsCatalog({});
  assert.deepEqual(catalog.map(t => t.id), ['page.find_elements', 'page.highlight', 'page.scroll_to', 'page.click', 'page.fill', 'page.select_option', 'page.navigate', 'search_published_entries', 'get_published_entry', 'list_categories', 'site_guide']);
  const writes = new Set(['page.click', 'page.fill', 'page.select_option', 'page.navigate']);
  assert.ok(catalog.every(t => t.source === 'builtin' && t.effect === (writes.has(t.id) ? 'write' : 'read') && t.availability.available));
  assert.ok(catalog.every(t => t.title && t.description && t.sourceRevision && t.displayTitle && t.displayDescription));
  assert.deepEqual(catalog.find(t => t.id === 'page.navigate')?.displayTitle, 'Open a post or page');
  const f = await visitorSettingsFixture();
  const service = composeVisitorToolsManagement({ workspaceId: ws, settings: f.deps, ready: Promise.resolve() });
  const view = await service.list({ callerPrincipalId: "owner" });
  assert.equal(view.tools.length, 11);
  assert.equal(view.tools.filter(t => t.mode === 'auto').length, 7);
  assert.equal(view.tools.filter(t => t.mode === 'off').length, 4);
  const prepared = await service.prepare({ callerPrincipalId: "owner", input: { toolId: "site", expectedRevisionSeq: 0, mode: "off" } });
  assert.equal(prepared.requiresApproval, false);
  const changed = await service.apply({ callerPrincipalId: "owner", prepared });
  assert.ok(changed.tools.every(t => t.mode === "off"));
});

test("the existing assistant-settings module mounts both visitor routes over the injected management owner", async () => {
  const f = await visitorSettingsFixture();
  const service = composeVisitorToolsManagement({ workspaceId: ws, settings: f.deps, ready: Promise.resolve() });
  const app = express();
  const module = createAssistantSettingsModule({ ...createRouteDeps(), workspaceId: ws, visitorToolsManagement: service });
  assert.ok(module.registerRoutes);
  module.registerRoutes(app);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, "get", ADMIN_VISITOR_TOOLS_PATH)({ params: { workspaceId: ws } } as unknown as Request, res);
  assert.deepEqual(capture.jsonBody, { data: await service.list({ callerPrincipalId: "owner" }) });
  const tools = (capture.jsonBody as { data: Awaited<ReturnType<typeof service.list>> }).data.tools;
  assert.equal(tools.length, 11);
  assert.deepEqual(tools.find(tool => tool.id === "list_categories"), {
    id: "list_categories", title: "list categories",
    description: "List this site's live taxonomy category names, not content types or tags. An empty list means this site has no categories.",
    displayTitle: "List categories", displayDescription: "Lets visitors see your post categories.",
    source: "builtin", sourceRevision: "builtin-v2-page", effect: "read", availability: { available: true },
    mode: "auto", limits: { perIpPerHour: 30, perSitePerDay: 1000 },
  });
  assert.equal(typeof extractRouteHandler(app, "put", ADMIN_VISITOR_TOOLS_PATH), "function");
});

test("overlapping memory-composed HTTP writers return one success and one 409 reload, never 500", async () => {
  const f = await visitorSettingsFixture();
  const service = composeVisitorToolsManagement({ workspaceId: ws, settings: f.deps, ready: Promise.resolve() });
  const prepared = await service.prepare({ callerPrincipalId: "owner", input: { toolId: "site", expectedRevisionSeq: 0, mode: "off" } });
  const before = await f.repo.maxRevisionSeq();
  const app = express();
  const module = createAssistantSettingsModule({ ...createRouteDeps(), workspaceId: ws, visitorToolsManagement: { ...service, prepare: async () => prepared } });
  module.registerRoutes!(app);
  const request = async () => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "owner" };
    await extractRouteHandler(app, "put", ADMIN_VISITOR_TOOLS_PATH)({ params: { workspaceId: ws }, body: {} } as unknown as Request, res);
    return capture;
  };
  const settled = await Promise.allSettled([request(), request()]);
  const responses = settled.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  assert.equal(responses.length, 2, "both HTTP requests must resolve to responses");
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
  assert.equal((responses.find(r => r.statusCode === 409)!.jsonBody as { reload: boolean }).reload, true);
  assert.deepEqual(await f.read(), prepared.policy);
  assert.equal(await f.repo.maxRevisionSeq(), before + 1);
  assert.equal((await f.repo.listRevisionsSince({ sinceSeq: before, workspaceId: ws, limit: 10 })).length, 1);
});
