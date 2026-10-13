import assert from "node:assert/strict";
import test from "node:test";
import { createJourneyContentCleanup } from "../support/journey-content-cleanup.js";

const W = "/api/admin/v1/workspaces/workspace-local";
const reply = (body: unknown, status = 200) => ({ status: () => status, json: async () => body, text: async () => JSON.stringify(body) });

function harness({ refusePurge = false } = {}) {
  const calls: string[] = [];
  const purges: string[][] = [];
  const request = {
    delete: async (url: string) => { calls.push(`DELETE ${url}`); return reply({}); },
    get: async (url: string) => {
      calls.push(`GET ${url}`);
      if (!url.includes("cursor=")) return reply({ items: [
        { id: "seed-trash", entityType: "menu", entityId: "seed-menu" },
        { id: "page-trash", entityType: "post", entityId: "created-page" },
        { id: "menu-trash", entityType: "menu", entityId: "created-menu" },
      ], nextCursor: "next" });
      return reply({ items: [
        { id: "form-trash", entityType: "form", entityId: "created-form" },
        { id: "widget-trash", entityType: "widget", entityId: "created-widget" },
      ], nextCursor: null });
    },
    post: async (url: string, options?: { data?: unknown }) => {
      calls.push(url.endsWith("/trash/items") ? `POST ${url} ${JSON.stringify(options?.data)}` : `POST ${url}`);
      if (url.endsWith("/trash") || url.endsWith("/trash/items")) return reply({});
      const { ids } = options!.data as { ids: string[] };
      purges.push(ids);
      return reply({ purged: refusePurge ? 0 : ids.length, results: ids.map(id => ({ id, outcome: refusePurge ? "version-changed" : "purged" })) });
    },
  };
  return { request, calls, purges, cleanup: createJourneyContentCleanup({ request, workspaceApi: W }) };
}

test("cleanup removes created content in dependency order and protects pre-existing Trash across pages", async () => {
  const h = harness();
  for (const type of ["form", "menu", "widget", "page"] as const) h.cleanup.track({ type, id: `created-${type}` });
  await h.cleanup.cleanup({});
  assert.deepEqual(h.calls.slice(0, 4), [
    `DELETE ${W}/pages/created-page`, `POST ${W}/widgets/created-widget/trash`,
    `DELETE ${W}/menus/created-menu`, `POST ${W}/trash/items {"type":"form","id":"created-form"}`,
  ]);
  assert.deepEqual(h.purges, [["page-trash", "menu-trash", "form-trash", "widget-trash"]]);
  assert.deepEqual(h.calls.slice(4), [`GET ${W}/trash?limit=200`, `GET ${W}/trash?limit=200&cursor=next`, `POST ${W}/trash/purge`]);
});

test("cleanup awaits successful UI creates before a failed journey tears down and ignores other responses", async () => {
  const h = harness();
  let resolve!: (value: unknown) => void;
  const response = {
    ...reply({}, 201), url: () => `http://journey.test${W}/forms`, request: () => ({ method: () => "POST" }),
    json: () => new Promise<unknown>(done => { resolve = done; }),
  };
  h.cleanup.capture({ response });
  h.cleanup.capture({ response: { ...response, status: () => 400 } });
  h.cleanup.capture({ response: { ...response, url: () => `http://journey.test${W}/forms/created-form/submissions` } });
  h.cleanup.capture({ response: { ...response, request: () => ({ method: () => "GET" }) } });
  const teardown = h.cleanup.cleanup({});
  assert.deepEqual(h.calls, []);
  resolve({ data: { id: "created-form" } });
  await teardown;
  assert.equal(h.calls[0], `POST ${W}/trash/items {"type":"form","id":"created-form"}`);
  assert.deepEqual(h.purges, [["form-trash"]]);
});

test("cleanup refuses to claim success when purge stands down", async () => {
  const h = harness({ refusePurge: true });
  h.cleanup.track({ type: "form", id: "created-form" });
  await assert.rejects(h.cleanup.cleanup({}), { message: "every selected row must be physically removed\n\n0 !== 1\n" });
});

test("cleanup batches selections at the admin route's 200-row ceiling", async () => {
  const rows = Array.from({ length: 201 }, (_, i) => ({ id: `trash-${i}`, entityType: "menu", entityId: `menu-${i}` }));
  const batches: number[] = [];
  const cleanup = createJourneyContentCleanup({ workspaceApi: W, request: {
    delete: async () => reply({}),
    get: async url => reply({ items: url.includes("cursor=") ? rows.slice(200) : rows.slice(0, 200), nextCursor: url.includes("cursor=") ? null : "next" }),
    post: async (_url, options) => {
      const { ids } = options!.data as { ids: string[] };
      batches.push(ids.length);
      return reply({ purged: ids.length, results: ids.map(id => ({ id, outcome: "purged" })) });
    },
  } });
  for (const row of rows) cleanup.track({ type: "menu", id: row.entityId });
  await cleanup.cleanup({});
  assert.deepEqual(batches, [200, 1]);
});
