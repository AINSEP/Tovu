import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { routeDepsChatAgents } from "../route-deps-content-chat.js";

/**
 * B224 composition pin: the real `pagesHtmlStore` factory the site root exposes gives a slug-only widget
 * marker its widget id at write, because the composition threads the entry repo in as the slug lookup.
 */
const WS = "ws-b224";
const WIDGET_ID = "11111111-1111-4111-8111-111111111111";
const SLUG_MARKER = `<div data-embed-config='{"type":"widget","slug":"contact-form"}'></div>`;
const entryRepo = { findBySlug: async ({ slug, type }: { slug: string; type: string }) => (slug === "contact-form" && type === "widget" ? { id: WIDGET_ID } : null) };

async function insertHtmlPage(db: ContentKernel): Promise<void> {
  await db.run((q) =>
    q.insertInto("posts").values({ workspace_id: WS, id: "page-1", title: "About", slug: "about", body_json: null, body_format: "html", body_html: "<p>old</p>", status: "draft", kind: "page", updated_at: "2026-08-01T00:00:00.000Z", version: 1, ext: "{}" }).execute()
  );
}

describeEachDialect("routeDepsChatAgents.pagesHtmlStore (B224)", { tables: ["posts", "post_revisions"], make: (kernel) => kernel }, (makeKernel) => {
  test("a slug-only widget marker is stored with the widget id through the composed factory", async () => {
    const kernel = makeKernel();
    await insertHtmlPage(kernel);
    const deps = routeDepsChatAgents({ kernel, chat: kernel as never, clock: createFakeClock({ startIso: "2026-08-04T00:00:00.000Z" }), outbox: undefined as never, entryRefsRepo: undefined as never, tracker: {} as never, postRepo: undefined as never, pluginExports: { validateHtml: async () => [] } as never, entryRepo } as never);
    const store = deps.pagesHtmlStore({ workspaceId: WS, postId: "page-1" });
    await store.read();
    await store.write({ html: SLUG_MARKER });
    const row = await kernel.run((q) => q.selectFrom("posts").select("body_html").where("id", "=", "page-1").executeTakeFirstOrThrow());
    assert.ok((row.body_html ?? "").includes(WIDGET_ID), `expected the widget id in ${row.body_html}`);
    assert.ok((row.body_html ?? "").includes("contact-form"), "the author's slug is kept");
  });
});
