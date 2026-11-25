import { bindPagesToolHost } from "#src/features/pages/tool-host";
import { restoredEntryRefs } from "#src/features/pages/html-inverse";
import { warnUnindexedEntryRef } from "#src/contracts/core/entry-refs/unindexed-ref-warning";
import { pageHtmlChangeTestDeps } from "./page-html-change-test-deps.js";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createPost, InMemoryPostRepo } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "@jini-ai/cms/pages/html-document-store.memory";
import { buildPagesRegistrations } from "@jini-ai/cms/pages/tool-registrations";

const workspaceId = "ws-s7b";
const id = "page-s7b";
const html = '<section data-agent-element="a">A</section><section data-agent-element="b">B</section>';

async function harness() {
  const repo = new InMemoryPostRepo({}, { initialRows: [] });
  const clock = { nowMs: () => 0 };
  await createPost({ deps: { repo, clock }, input: { workspaceId, id, kind: "page", title: "Page" } });
  await new InMemoryPagesHtmlDocumentStore({ scope: { workspaceId, postId: id }, deps: { repo, clock, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs } }).ensureHtmlFormat({ seedHtml: html });
  const registrations = buildPagesRegistrations({ deps: {
    workspaceId, postRepo: repo, authorize: async () => ({ allowed: true, reason: "matched" }),
    ...pageHtmlChangeTestDeps(),
    pagesHtmlStore: scope => new InMemoryPagesHtmlDocumentStore({ scope, deps: { repo, clock, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs } }),
  }, host: bindPagesToolHost({}) });
  const call = (toolId: string, input: Record<string, unknown>) => {
    const registration = registrations.find(entry => entry.descriptor.id === toolId)!;
    return registration.handler({ executionId: crypto.randomUUID(), principal: { id: "editor", kind: "user" }, signal: new AbortController().signal, input } as never);
  };
  return { call, registrations };
}

for (const [toolId, patch] of [
  ["pages_write_html", { html: html.replace(">A<", ">Delayed<") }],
  ["pages_write_region", { regionId: "a", html: "Delayed" }],
  ["pages_move_region", { regionId: "b", before: "a" }],
] as const) {
  test(`S7b: ${toolId} refuses a delayed basis-less edit and an old basis`, async () => {
    const { call, registrations } = await harness();
    const first = await call("pages_read_html", { id }) as { version: number };
    const delayed = await call("pages_read_html", { id }) as { version: number };
    await call("pages_write_html", { id, html: html.replace(">A<", ">First writer<"), expectedVersion: first.version });
    const saved = await call("pages_read_html", { id }) as { version: number };

    await assert.rejects(call(toolId, { id, ...patch }), {
      name: "ToolInputError", message: /expectedVersion.*required.*pages_read_html/,
    });
    await assert.rejects(call(toolId, { id, ...patch, expectedVersion: delayed.version }), {
      name: "ToolInputError", message: new RegExp(`VERSION_CONFLICT:.*version ${saved.version}, not the version ${delayed.version}`),
    });
    assert.deepEqual(await call("pages_read_html", { id }), saved);
    const schema = registrations.find(entry => entry.descriptor.id === toolId)!.descriptor.inputSchema as { required: string[] };
    assert.ok(schema.required.includes("expectedVersion"));
  });
}


test("bound recorder refuses an overlapped edit without claiming undo", async () => {
  const { call } = await harness();
  const before = await call("pages_read_html", { id }) as { version: number };
  const committed = await call("pages_write_html", { id, html: html.replace(">A<", ">Winner<"), expectedVersion: before.version }) as { changeSetId?: string };
  assert.equal(typeof committed.changeSetId, "string");
  const winner = await call("pages_read_html", { id });
  await assert.rejects(call("pages_write_region", { id, regionId: "a", html: "Stale", expectedVersion: before.version }), /VERSION_CONFLICT/);
  assert.deepEqual(await call("pages_read_html", { id }), winner);
});
