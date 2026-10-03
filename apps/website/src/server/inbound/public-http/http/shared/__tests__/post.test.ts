import assert from "node:assert/strict";
import test from "node:test";
import type { PostRecord } from "#src/features/post/index";
import { toHeadlessPost, toHeadlessContentPost } from "../post.js";

const post: PostRecord = {
  id: "page-7", workspaceId: "ws-7", kind: "page", title: "About Ada", slug: "about-ada",
  status: "draft", updatedAt: "2026-09-17T12:34:56Z", version: 9,
  bodyFormat: "doc", bodyHtml: null,
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ada's story" }] }] },
};
// F4.1/F6.2: branch inversion, lost ext, manufactured override, or swallowed corruption must fail.
test("HTML admin DTO carries HTML only and retains plugin data and explicit template choices", () => {
  assert.deepEqual(toHeadlessPost({ ...post, bodyFormat: "html", bodyHtml: "<main>Ada &amp; team</main>",
    templateChoice: "landing", overridesThemePage: true, ext: { catalog: { sku: "ADA-7" } } }), {
    id: "page-7", workspaceId: "ws-7", kind: "page", title: "About Ada", slug: "about-ada",
    status: "draft", updatedAt: "2026-09-17T12:34:56Z", version: 9,
    bodyFormat: "html", bodyHtml: "<main>Ada &amp; team</main>", bodyJson: null,
    templateChoice: "landing", overridesThemePage: true, ext: { catalog: { sku: "ADA-7" } },
  });
});
test("document DTO preserves content and distinguishes false from an undecided override", () => {
  for (const [input, expected] of [[undefined, null], [null, null], [false, false], [true, true]] as const) {
    const result = toHeadlessPost({ ...post, overridesThemePage: input });
    assert.deepEqual(result, {
      id: "page-7", workspaceId: "ws-7", kind: "page", title: "About Ada", slug: "about-ada",
      status: "draft", updatedAt: "2026-09-17T12:34:56Z", version: 9,
      bodyFormat: "doc", bodyHtml: null,
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ada's story" }] }] },
      templateChoice: null, overridesThemePage: expected,
    });
  }
});
test("HTML with a null body fails loudly instead of returning an empty body", () => {
  assert.throws(() => toHeadlessPost({ ...post, bodyFormat: "html", bodyHtml: null }), {
    message: "post 'page-7' is body_format 'html' with a null body_html — data integrity violation",
  });
  assert.equal(toHeadlessPost({ ...post, bodyFormat: "html", bodyHtml: "" }).bodyHtml, "");
});
test("content DTO includes document content and excludes admin metadata and extensions", () => {
  assert.deepEqual(toHeadlessContentPost({ ...post, ext: { private: { secret: "hidden" } }, overridesThemePage: true }), {
    id: "page-7", kind: "page", title: "About Ada", slug: "about-ada", updatedAt: "2026-09-17T12:34:56Z",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ada's story" }] }] },
  });
});
