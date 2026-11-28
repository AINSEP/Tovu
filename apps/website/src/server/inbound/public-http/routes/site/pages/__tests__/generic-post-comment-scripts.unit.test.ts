import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import { createCommentsProviderRegistry } from "@jini-ai/capability-providers/comments";
import type { CommentsProviderAdapter, CommentsProviderDefinition } from "@jini-ai/core/contracts/site/comments-providers";
import type { DeclaredScript } from "@jini-ai/core/contracts/site/cookie-consent";
import type { PublicPostRecord } from "@jini-ai/cms/posts/post";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { renderGenericPostPage } from "../handlers/post.js";

/**
 * @file On the generic (no theme template) post page, a comments provider's optional scripts must be
 * declared onto the request's `declaredScripts` (where the document-asset owner gates them by consent
 * category), never dropped. The template path has its own coverage; this is the theme-off path.
 */

const MARKER = `<div class="thread" data-embed-config='{"type":"comments"}'>fallback</div>`;

function providersWithScripts() {
  const definition: CommentsProviderDefinition = { id: "comments", label: "Comments", kind: "embedded", consentCategory: "marketing",
    csp: { scriptSrc: [], frameSrc: [], connectSrc: [], styleSrc: [] }, settingsSchema: [], implementation: "adapter" };
  const adapter: CommentsProviderAdapter = { kind: "embedded", dashboardUrl: "/admin/comments", renderer: {
    renderThread: async () => ({ html: "<p>Approved generic comment</p>", scripts: [{ src: "/comments-widget.js" }] }),
  } };
  const providers = createCommentsProviderRegistry({ selections: { read: async () => ({ providerId: "comments", revision: 1 }), compareAndSet: async () => false } });
  providers.register({ definition, resolve: async () => adapter });
  return providers;
}

function htmlPost(): PublicPostRecord {
  return {
    id: "post-generic", workspaceId: "workspace-local", title: "Generic post", slug: "generic-post",
    bodyJson: { type: "doc", content: [] }, bodyFormat: "html", bodyHtml: `<p>Body</p>${MARKER}`,
    status: "published", kind: "post", updatedAt: "2026-08-17T00:00:00.000Z", version: 1,
  } as PublicPostRecord;
}

test("generic post page renders the provider thread and declares its scripts with the provider's consent category", async () => {
  const declaredScripts: DeclaredScript[] = [];
  const deps = { ...createRouteDeps(), commentsProviders: providersWithScripts(), declaredScripts };

  const html = await renderGenericPostPage({ deps, theme: null, post: htmlPost(), posts: [], siteAssistantEnabled: false });

  assert.match(html, /<div data-comments-surface><p>Approved generic comment<\/p><\/div>/);
  assert.ok(!html.includes("comments-widget.js"), "scripts are declarations, not tags in the body");
  assert.deepEqual(declaredScripts, [{ src: "/comments-widget.js", consent: ["marketing"] }]);
});
