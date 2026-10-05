import assert from "node:assert/strict";
import test from "node:test";

import { listRoutes, mountPathOf, resolveRoute, type RouterLayer } from "../lib/admin-route-walk.js";
import {
  classifyParity,
  hasProblems,
  isValidChatlessReason,
  routeTokens,
  seedParity,
  suggestChatless,
  suggestTools,
  type ParityFile,
  type ParityTool,
} from "../lib/route-tool-parity.js";

/**
 * @file The route <-> chat-tool parity classifier and seeder (`lib/route-tool-parity.ts`) on a fake
 * route list and a fake tool list, plus the shared router walk (`lib/admin-route-walk.ts`) on a fake
 * Express 4 stack. No app boot: the gate script is the only thing that touches the real app.
 */

const WS = "/api/admin/v1/workspaces/:workspaceId";
const ROUTES = [
  { method: "GET", path: `${WS}/forms` },
  { method: "DELETE", path: `${WS}/forms/:formId` },
  { method: "POST", path: `${WS}/change-sets/:changeSetId/revert` },
  { method: "POST", path: "/api/admin/v1/auth/boot-session" },
  { method: "GET", path: `${WS}/posts` },
];
const TOOLS: ParityTool[] = [
  { id: "forms_list_submissions", readOnly: true },
  { id: "forms_create_definition", readOnly: false },
  { id: "forms_set_definition_status", readOnly: false },
  { id: "change_sets_list", readOnly: true },
  { id: "change_sets_revert", readOnly: false },
  { id: "content_post_search", readOnly: true },
  { id: "trash_item", readOnly: false },
  { id: "taxonomy_create_term", readOnly: false },
  { id: "sites_list", readOnly: true },
  { id: "system_get_mail_status", readOnly: true },
];
const TOOL_IDS = new Set(TOOLS.map((t) => t.id));

test("classifyParity buckets each live route by its entry shape", () => {
  const file: ParityFile = {
    routes: {
      [`GET ${WS}/forms`]: { tools: ["forms_list_submissions"] },
      [`DELETE ${WS}/forms/:formId`]: { gap: "no forms delete tool" },
      "POST /api/admin/v1/auth/boot-session": { chatless: "auth-session" },
      [`POST ${WS}/change-sets/:changeSetId/revert`]: { tools: [], suggested: ["change_sets_revert"] },
    },
  };
  const report = classifyParity({ routes: ROUTES, toolIds: TOOL_IDS, file });
  assert.equal(report.routes, 5);
  assert.deepEqual(report.covered, [`GET ${WS}/forms`]);
  assert.deepEqual(report.gaps, [`DELETE ${WS}/forms/:formId`]);
  assert.deepEqual(report.chatless, ["POST /api/admin/v1/auth/boot-session"]);
  assert.deepEqual(report.untriaged, [`POST ${WS}/change-sets/:changeSetId/revert`]);
  assert.deepEqual(report.unknownRoutes, [`GET ${WS}/posts`]);
  assert.equal(hasProblems(report), true, "an unclassified live route is a problem");
});

test("classifyParity reports stale entries, unknown tool ids, bad reasons and malformed entries", () => {
  const file: ParityFile = {
    routes: {
      [`GET ${WS}/forms`]: { tools: ["forms_list_submissions", "forms_delete_definition"] },
      [`DELETE ${WS}/forms/:formId`]: { chatless: "because" },
      "POST /api/admin/v1/auth/boot-session": { chatless: "covered-by-generic:no_such_tool" },
      [`POST ${WS}/change-sets/:changeSetId/revert`]: { tools: ["change_sets_revert"], gap: "both" },
      [`GET ${WS}/posts`]: { note: "no shape" },
      "GET /api/admin/v1/gone": { tools: ["trash_item"] },
    },
  };
  const report = classifyParity({ routes: ROUTES, toolIds: TOOL_IDS, file });
  assert.deepEqual(report.staleEntries, ["GET /api/admin/v1/gone"]);
  assert.deepEqual(report.unknownToolIds, [
    { route: `GET ${WS}/forms`, toolId: "forms_delete_definition" },
    { route: "POST /api/admin/v1/auth/boot-session", toolId: "no_such_tool" },
  ]);
  assert.deepEqual(report.badReasons, [{ route: `DELETE ${WS}/forms/:formId`, reason: "because" }]);
  assert.deepEqual(report.malformed.map((m) => m.route), [`POST ${WS}/change-sets/:changeSetId/revert`, `GET ${WS}/posts`]);
  assert.deepEqual(report.unknownRoutes, []);
});

test("a fully classified, in-step file has no problems even with gaps and untriaged entries", () => {
  const file: ParityFile = {
    routes: Object.fromEntries(ROUTES.map((r) => [`${r.method} ${r.path}`, { tools: [] }])),
  };
  const report = classifyParity({ routes: ROUTES, toolIds: TOOL_IDS, file });
  assert.equal(report.untriaged.length, 5);
  assert.equal(hasProblems(report), false);
});

test("isValidChatlessReason accepts the fixed list and the two prefixed forms only", () => {
  for (const ok of ["auth-session", "ui-only-asset", "streaming-transport", "internal-health", "covered-by-generic:trash_item", "intentional:owner-only"]) {
    assert.equal(isValidChatlessReason(ok), true, ok);
  }
  for (const bad of ["", "auth", "intentional:", "covered-by-generic:"]) assert.equal(isValidChatlessReason(bad), false, bad);
});

test("routeTokens drops noise and params, splits kebab segments, stems plurals", () => {
  assert.deepEqual(routeTokens(`${WS}/change-sets/:changeSetId/revert`), ["change", "set", "revert"]);
  assert.deepEqual(routeTokens("/api/admin/v1/taxonomy/:taxonomyId/terms"), ["taxonomy", "term"]);
  assert.deepEqual(routeTokens(`${WS}/entries`), ["entry"]);
});

test("suggestTools stays inside the route's feature and prefers the verb-matching tool", () => {
  assert.deepEqual(suggestTools({ method: "POST", path: `${WS}/change-sets/:changeSetId/revert` }, TOOLS), ["change_sets_revert"]);
  assert.deepEqual(suggestTools({ method: "GET", path: `${WS}/forms` }, TOOLS), ["forms_list_submissions"]);
  assert.deepEqual(suggestTools({ method: "DELETE", path: `${WS}/forms/:formId` }, TOOLS), [], "no forms delete tool, and trash_item is another feature");
  assert.deepEqual(suggestTools({ method: "GET", path: `${WS}/widgets` }, TOOLS), []);
});

test("suggestTools never offers a non-delete tool for a delete, and treats system/ as a namespace", () => {
  assert.deepEqual(suggestTools({ method: "DELETE", path: "/api/admin/v1/taxonomy/terms/:id" }, TOOLS), []);
  assert.deepEqual(suggestTools({ method: "POST", path: "/api/admin/v1/taxonomy/terms/:id/delete" }, TOOLS), []);
  assert.deepEqual(suggestTools({ method: "GET", path: `${WS}/system/sites` }, TOOLS), ["sites_list"]);
  assert.deepEqual(suggestTools({ method: "GET", path: `${WS}/system/mail-status` }, TOOLS), ["system_get_mail_status"]);
});

test("suggestTools needs a word past the feature segment when the path has one, and follows feature aliases", () => {
  // `change-sets` is one feature segment; the GET picks the read-only tool, not the revert.
  assert.deepEqual(suggestTools({ method: "GET", path: `${WS}/change-sets` }, TOOLS), ["change_sets_list"]);
  assert.deepEqual(suggestTools({ method: "GET", path: `${WS}/forms/:formId/schema` }, TOOLS), []);
  const webhooks = [{ id: "webhooks_create_subscription", readOnly: false }];
  assert.deepEqual(suggestTools({ method: "POST", path: `${WS}/integrations/subscriptions` }, webhooks), ["webhooks_create_subscription"]);
});

test("suggestChatless flags only auth and streaming shapes", () => {
  assert.equal(suggestChatless({ method: "POST", path: "/api/admin/v1/auth/boot-session" }), "auth-session");
  assert.equal(suggestChatless({ method: "GET", path: `${WS}/runs/:runId/events` }), "streaming-transport");
  assert.equal(suggestChatless({ method: "GET", path: `${WS}/forms` }), undefined);
});

test("seedParity adds missing routes, refreshes untriaged ones, keeps classified and stale entries, sorts keys", () => {
  const file: ParityFile = {
    _about: "kept",
    routes: {
      [`GET ${WS}/forms`]: { chatless: "intentional:test" },
      [`POST ${WS}/change-sets/:changeSetId/revert`]: { tools: [], suggested: ["old"], note: "keep me" },
      "GET /api/admin/v1/gone": { tools: ["trash_item"] },
    },
  };
  const seeded = seedParity({ routes: ROUTES, tools: TOOLS, file });
  assert.equal(seeded._about, "kept");
  assert.deepEqual(seeded.routes[`GET ${WS}/forms`], { chatless: "intentional:test" });
  assert.deepEqual(seeded.routes[`POST ${WS}/change-sets/:changeSetId/revert`], { tools: [], suggested: ["change_sets_revert"], note: "keep me" });
  assert.deepEqual(seeded.routes["POST /api/admin/v1/auth/boot-session"], { tools: [], suggestedChatless: "auth-session" });
  assert.deepEqual(seeded.routes["GET /api/admin/v1/gone"], { tools: ["trash_item"] });
  assert.deepEqual(Object.keys(seeded.routes), [
    "POST /api/admin/v1/auth/boot-session",
    "GET /api/admin/v1/gone",
    `POST ${WS}/change-sets/:changeSetId/revert`,
    `GET ${WS}/forms`,
    `DELETE ${WS}/forms/:formId`,
    `GET ${WS}/posts`,
  ]);
  const report = classifyParity({ routes: ROUTES, toolIds: TOOL_IDS, file: seeded });
  assert.deepEqual(report.unknownRoutes, []);
});

// --- shared router walk on a fake Express 4 stack -----------------------------------------------

function routeLayer(path: string, methods: Record<string, boolean>): RouterLayer {
  return { match: (p) => p === path, route: { path, methods }, handle: {} };
}

test("listRoutes flattens routes and nested routers with their mount path", () => {
  const nested: RouterLayer = {
    match: (p) => p.startsWith("/api/x/"),
    regexp: /^\/api\/x\/(?:([^\/]+?))\/?(?=\/|$)/i,
    keys: [{ name: "ws" }],
    handle: { stack: [routeLayer("/items", { get: true, post: true })] },
  };
  const stack: RouterLayer[] = [
    { match: () => true, handle: {} },
    routeLayer("/api/admin/v1/a", { get: true }),
    routeLayer("/api/admin/v1/b", { _all: true }),
    nested,
  ];
  assert.deepEqual(listRoutes(stack), [
    { method: "GET", path: "/api/admin/v1/a" },
    { method: "ALL", path: "/api/admin/v1/b" },
    { method: "GET", path: "/api/x/:ws/items" },
    { method: "POST", path: "/api/x/:ws/items" },
  ]);
  assert.equal(mountPathOf({ match: () => true, regexp: /^\/?(?=\/|$)/i, handle: {} }), "");
});

test("resolveRoute tells ok, wrong-method and no-route apart", () => {
  const stack = [routeLayer("/a", { get: true })];
  assert.equal(resolveRoute(stack, "GET", "/a"), "ok");
  assert.equal(resolveRoute(stack, "POST", "/a"), "wrong-method");
  assert.equal(resolveRoute(stack, "GET", "/b"), "no-route");
});
