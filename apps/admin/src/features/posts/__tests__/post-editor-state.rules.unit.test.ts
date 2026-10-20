import { describe, expect, it } from "vitest";

import type { AdminPost, AdminThemeSummary, PresentationSettings } from "@/lib/api";
import {
  loadedPostForm,
  loadedPostHandles,
  postFormSnapshot,
  resolveActivePostTheme,
  resolveEditorSlug,
  savedHideCoverImageInBody,
} from "../hooks/post-editor-state.rules";
import { isoToLocalDateTimeInput, localDateTimeInputToIso } from "../rules";

/**
 * @file Pure load/render derivations `usePostEditor` reads (`post-editor-state.rules.ts`). The hook's
 * own wiring of these values is covered in `use-post-editor.hooks.unit.test.tsx`.
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

function settings(activeThemeId: string): PresentationSettings {
  return { workspaceId: "ws1", activeThemeId, updatedAt: "2026-08-01T00:00:00.000Z" };
}

describe("resolveActivePostTheme", () => {
  it("reads tier and apiVersion from the theme whose id is active", () => {
    const resolved = resolveActivePostTheme({
      settings: settings("basic"),
      availableThemes: [{ id: "other", tier: "code" }, { id: "basic", tier: "static", apiVersion: 2 }] satisfies AdminThemeSummary[],
    });

    expect(resolved).toEqual({ activeThemeId: "basic", activeThemeTier: "static", activeThemeApiVersion: 2 });
  });

  it("reports an active theme missing from availableThemes as unknown tier and v1", () => {
    const resolved = resolveActivePostTheme({ settings: settings("gone"), availableThemes: [{ id: "basic", tier: "static", apiVersion: 2 }] });

    expect(resolved).toEqual({ activeThemeId: "gone", activeThemeTier: null, activeThemeApiVersion: undefined });
  });
});

describe("savedHideCoverImageInBody", () => {
  it("is true when the row stores no presentation setting", () => {
    expect(savedHideCoverImageInBody({ ext: undefined })).toBe(true);
  });

  it("is true when the presentation extension exists without the flag", () => {
    expect(savedHideCoverImageInBody({ ext: { "post-presentation": {} } })).toBe(true);
  });

  it("is false only when the row explicitly stored false", () => {
    expect(savedHideCoverImageInBody({ ext: { "post-presentation": { hideCoverImageInBody: false } } })).toBe(false);
  });
});

describe("loadedPostForm", () => {
  it("defaults an unset template to the theme's first template", () => {
    expect(loadedPostForm({ post: POST, activeThemeTemplates: ["a.html", "b.html"] }).templateChoice).toBe("a.html");
  });

  it("leaves an unset template unset when the theme offers none", () => {
    expect(loadedPostForm({ post: POST, activeThemeTemplates: [] }).templateChoice).toBeNull();
  });

  it("keeps a saved template choice over the theme default", () => {
    expect(loadedPostForm({ post: { ...POST, templateChoice: "b.html" }, activeThemeTemplates: ["a.html"] }).templateChoice).toBe("b.html");
  });

  it("normalizes absent optional fields to their undecided/empty defaults", () => {
    // A pre-feature fixture: no `overridesThemePage` key at all.
    const { overridesThemePage: _absent, ...legacy } = POST;

    expect(loadedPostForm({ post: legacy, activeThemeTemplates: [] })).toEqual({
      title: "Hello World",
      slug: "hello-world",
      status: "draft",
      templateChoice: null,
      overridesThemePage: null,
      publishAt: null,
      featuredMediaId: null,
      author: "",
      showAuthor: false,
      hideCoverImageInBody: true,
    });
  });

  it("carries stored values and round-trips publishAt through the minute-precision input", () => {
    const stored = {
      ...POST,
      overridesThemePage: true,
      publishAt: "2026-11-01T10:15:42.000Z",
      featuredMediaId: "m1",
      author: "Ada",
      showAuthor: true,
      ext: { "post-presentation": { hideCoverImageInBody: false } },
    };

    expect(loadedPostForm({ post: stored, activeThemeTemplates: [] })).toMatchObject({
      overridesThemePage: true,
      publishAt: localDateTimeInputToIso(isoToLocalDateTimeInput("2026-11-01T10:15:42.000Z")),
      featuredMediaId: "m1",
      author: "Ada",
      showAuthor: true,
      hideCoverImageInBody: false,
    });
  });
});

describe("postFormSnapshot", () => {
  it("emits keys in PostFormState's declared order whatever order the fields arrive in", () => {
    const fields = {
      hideCoverImageInBody: true, showAuthor: false, author: "", featuredMediaId: null, publishAt: null,
      overridesThemePage: null, templateChoice: null, status: "draft" as const, slug: "s", title: "T",
    };

    expect(Object.keys(postFormSnapshot({ fields, bodyJson: { type: "doc" } }))).toEqual([
      "title", "slug", "status", "bodyJson", "templateChoice", "overridesThemePage", "publishAt",
      "featuredMediaId", "author", "showAuthor", "hideCoverImageInBody",
    ]);
  });
});

describe("resolveEditorSlug", () => {
  it("shows the stored slug before any row has loaded", () => {
    expect(resolveEditorSlug({ post: null, title: "New", storedSlug: "", slugEdited: false })).toEqual({ followsTitle: false, slug: "" });
  });

  it("derives the slug from a changed title while the slug still follows it", () => {
    const untitled = { ...POST, title: "", slug: "untitled", everPublished: false };

    expect(resolveEditorSlug({ post: untitled, title: "My First Post", storedSlug: "untitled", slugEdited: false })).toEqual({
      followsTitle: true,
      slug: "my-first-post",
    });
  });

  it("keeps the stored slug while the followed title is unchanged", () => {
    const untitled = { ...POST, title: "", slug: "untitled", everPublished: false };

    expect(resolveEditorSlug({ post: untitled, title: "", storedSlug: "untitled", slugEdited: false })).toEqual({ followsTitle: true, slug: "untitled" });
  });

  it("stops following once the operator edits the slug by hand", () => {
    const untitled = { ...POST, title: "", slug: "untitled", everPublished: false };

    expect(resolveEditorSlug({ post: untitled, title: "Renamed", storedSlug: "manual", slugEdited: true })).toEqual({ followsTitle: false, slug: "manual" });
  });
});

describe("loadedPostHandles", () => {
  const NOW = Date.parse("2026-10-20T00:00:00.000Z");

  it("targets the route segment and has no preview target before a row loads", () => {
    expect(loadedPostHandles({ post: null, postId: "hello-world", nowMs: NOW })).toEqual({
      entryId: "hello-world", loadedId: null, scheduled: false, previewFormTarget: "",
    });
  });

  it("targets the loaded row's id once it has loaded", () => {
    expect(loadedPostHandles({ post: POST, postId: "hello-world", nowMs: NOW })).toEqual({
      entryId: "p1", loadedId: "p1", scheduled: false, previewFormTarget: "post-preview-pending-p1",
    });
  });

  it("reports a published row whose go-live time is still ahead as scheduled", () => {
    const future = { ...POST, status: "published" as const, publishAt: "2026-12-01T00:00:00.000Z" };

    expect(loadedPostHandles({ post: future, postId: "p1", nowMs: NOW }).scheduled).toBe(true);
  });
});
