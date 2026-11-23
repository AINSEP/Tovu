import { describe, expect, it } from "vitest";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { PageBodyWriteError, writePage } from "../hooks/page-editor-save";
import type { AdminPost } from "@jini-ai/admin/posts/api/posts-api.types";
import type { PageSavePlan } from "../rules";

const page: AdminPost = {
  id: "pg-html", workspaceId: "workspace-local", kind: "page", title: "Landing", slug: "landing",
  bodyJson: {}, bodyFormat: "html", bodyHtml: "<p>Original</p>", status: "draft",
  updatedAt: "2026-08-01T00:00:00.000Z", version: 2,
};
const plan: PageSavePlan = {
  canSaveHtml: true, statusToWrite: "draft",
  updatePostPayload: { title: "Renamed", slug: page.slug, status: "draft", templateChoice: null, expectedVersion: page.version },
};

describe("S7b: the HTML save carries the successful metadata save's version", () => {
  for (const metadataChanged of [false, true]) {
    it(`sends the returned basis when metadata ${metadataChanged ? "changed" : "was unchanged"}`, async () => {
      const port = createFakePageEditorPort({ page });
      const version = metadataChanged ? page.version + 1 : page.version;
      port.updatePost = async () => ({ post: { ...page, version } });
      const received: unknown[] = [];
      port.updatePageHtml = async input => {
        received.push(input);
        return { post: { ...page, bodyHtml: input.html, version: version + 1 } };
      };
      await writePage({ port, pageId: page.id, plan, html: "<p>Edited</p>" });
      expect(received).toEqual([{ id: page.id, html: "<p>Edited</p>", expectedVersion: version }]);
    });
  }

  it("preserves an edit that finishes between the metadata and HTML saves", async () => {
    const port = createFakePageEditorPort({ page });
    const updateMetadata = port.updatePost;
    port.updatePost = async input => {
      const saved = await updateMetadata(input);
      port.simulateExternalWrite({ patch: { bodyHtml: "<p>Other editor</p>" } });
      return saved;
    };
    await expect(writePage({ port, pageId: page.id, plan, html: "<p>Delayed</p>" })).rejects.toBeInstanceOf(PageBodyWriteError);
    expect(port.current.bodyHtml).toBe("<p>Other editor</p>");
    expect(port.current.version).toBe(page.version + 2);
  });
});
