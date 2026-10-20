import { describe, expect, it } from "vitest";

import type { AdminPost } from "@/lib/api";
import {
  authorFieldsPatch,
  buildPostUpdatePatch,
  keepNewerEdit,
  savedPostFields,
  scheduleFieldsPatch,
  withEverPublished,
  type PostSaveWorkingCopy,
} from "../hooks/post-editor-save.rules";
import type { PostFormState } from "../hooks/use-post-editor.hooks";

/**
 * @file Pure pieces of `usePostEditor`'s save (`post-editor-save.rules.ts`). The hook's own use of
 * them — the PUT it sends and how the response lands — is covered in
 * `use-post-editor.hooks.unit.test.tsx`.
 */

const POST: AdminPost = {
  id: "p1",
  workspaceId: "ws1",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [] },
  bodyFormat: "doc",
  status: "draft",
  templateChoice: null,
  overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 3,
};

const ORIGINAL: PostFormState = {
  title: "Hello World",
  slug: "hello-world",
  status: "draft",
  bodyJson: { type: "doc" },
  templateChoice: null,
  overridesThemePage: false,
  publishAt: "2026-11-01T10:00:00.000Z",
  featuredMediaId: "m1",
  author: "Ada",
  showAuthor: true,
  hideCoverImageInBody: true,
};

const WORKING: PostSaveWorkingCopy = {
  title: "Hello World",
  slug: "hello-world",
  followsTitle: false,
  status: "published",
  bodyJson: { type: "doc" },
  templateChoice: "a.html",
  overridesThemePage: null,
  publishAt: "2026-11-01T10:00:00.000Z",
  featuredMediaId: "m1",
  author: "Ada",
  showAuthor: true,
  hideCoverImageInBody: true,
};

describe("scheduleFieldsPatch", () => {
  it("sends neither key when both match the baseline", () => {
    expect(scheduleFieldsPatch(ORIGINAL, { publishAt: ORIGINAL.publishAt, featuredMediaId: "m1" })).toEqual({});
  });

  it("sends an explicit null to clear a stored value", () => {
    expect(scheduleFieldsPatch(ORIGINAL, { publishAt: null, featuredMediaId: null })).toEqual({ publishAt: null, featuredMediaId: null });
  });

  it("treats a missing baseline as nothing stored", () => {
    expect(scheduleFieldsPatch(null, { publishAt: null, featuredMediaId: "m2" })).toEqual({ featuredMediaId: "m2" });
  });
});

describe("authorFieldsPatch", () => {
  it("sends neither byline key when both match the baseline", () => {
    expect(authorFieldsPatch({ original: ORIGINAL, author: "Ada", showAuthor: true })).toEqual({});
  });

  it("trims a changed name", () => {
    expect(authorFieldsPatch({ original: ORIGINAL, author: "  Grace  ", showAuthor: true })).toEqual({ author: "Grace" });
  });

  it("sends a blanked name as null to clear the credit", () => {
    expect(authorFieldsPatch({ original: ORIGINAL, author: "   ", showAuthor: true })).toEqual({ author: null });
  });

  it("treats a missing baseline as an empty, hidden byline", () => {
    expect(authorFieldsPatch({ original: null, author: "", showAuthor: true })).toEqual({ showAuthor: true });
  });
});

describe("buildPostUpdatePatch", () => {
  it("sends the explicit slug and only the changed optional fields", () => {
    const patch = buildPostUpdatePatch({ working: WORKING, original: ORIGINAL, expectedVersion: 3 });

    expect(patch).toEqual({
      title: "Hello World", slug: "hello-world", status: "published", bodyJson: { type: "doc" },
      templateChoice: "a.html", overridesThemePage: null, expectedVersion: 3,
    });
  });

  it("asks the server to derive the slug while it still follows the title", () => {
    const patch = buildPostUpdatePatch({ working: { ...WORKING, followsTitle: true }, original: ORIGINAL, expectedVersion: 3 });

    expect(patch).toMatchObject({ slugFromTitle: true });
    expect(patch).not.toHaveProperty("slug");
  });

  it("sends the cover toggle, schedule and byline once they differ from the baseline", () => {
    const working = { ...WORKING, hideCoverImageInBody: false, publishAt: null, author: "Grace", showAuthor: false };

    expect(buildPostUpdatePatch({ working, original: ORIGINAL, expectedVersion: undefined })).toMatchObject({
      hideCoverImageInBody: false, publishAt: null, author: "Grace", showAuthor: false, expectedVersion: undefined,
    });
  });

  it("sends the cover toggle when there is no baseline yet", () => {
    expect(buildPostUpdatePatch({ working: WORKING, original: null, expectedVersion: undefined })).toMatchObject({ hideCoverImageInBody: true });
  });
});

describe("savedPostFields", () => {
  it("normalizes an absent byline and cover setting to the load defaults", () => {
    expect(savedPostFields({ ...POST, slug: "saved-slug" })).toEqual({ slug: "saved-slug", author: "", showAuthor: false, hideCoverImageInBody: true });
  });

  it("carries the saved byline and an explicit cover opt-out", () => {
    const saved = { ...POST, author: "Ada", showAuthor: true, ext: { "post-presentation": { hideCoverImageInBody: false } } };

    expect(savedPostFields(saved)).toEqual({ slug: "hello-world", author: "Ada", showAuthor: true, hideCoverImageInBody: false });
  });
});

describe("withEverPublished", () => {
  it("is false for a draft saved as a draft with no publish history", () => {
    expect(withEverPublished({ previous: POST, saved: POST }).everPublished).toBe(false);
  });

  it("keeps the loaded row's publish history", () => {
    expect(withEverPublished({ previous: { ...POST, everPublished: true }, saved: POST }).everPublished).toBe(true);
  });

  it("counts a loaded row that was published at load", () => {
    expect(withEverPublished({ previous: { ...POST, status: "published" }, saved: POST }).everPublished).toBe(true);
  });

  it("counts this save publishing the row, even before anything loaded", () => {
    expect(withEverPublished({ previous: null, saved: { ...POST, status: "published" } }).everPublished).toBe(true);
  });
});

describe("keepNewerEdit", () => {
  it("adopts the saved value while the field still holds what was sent", () => {
    expect(keepNewerEdit("sent", "from-server")("sent")).toBe("from-server");
  });

  it("keeps a value the operator typed after the save was sent", () => {
    expect(keepNewerEdit("sent", "from-server")("newer")).toBe("newer");
  });
});
