import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultPageEditorPort } from "@/features/pages/hooks/page-editor-dependencies.hooks";
import { defaultPostEditorPort } from "@/features/posts/hooks/post-editor-dependencies.hooks";
import { editorTemplateOptions } from "../editor-template-options.rules";

afterEach(() => vi.unstubAllGlobals());

describe("templateFor — editor adapters request their own kind", () => {
  it("pages receive page templates and posts receive post templates from the server", async () => {
    const calls: string[] = [];
    // Transport fake returns different catalogs, proving the real adapters select the right one.
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      const kind = new URL(url, "https://fixture.test").searchParams.get("kind");
      return new Response(JSON.stringify({
        settings: { activeThemeId: "fixture" },
        availableThemes: [{ id: "fixture", tier: "static", apiVersion: 2 }],
        activeThemeTemplates: kind ? [`${kind}.html`] : ["unfiltered.html"],
        activeThemeStaticPageIds: [],
      }), { headers: { "content-type": "application/json" } });
    });
    expect((await defaultPageEditorPort.getPresentation()).activeThemeTemplates).toEqual(["page.html"]);
    expect((await defaultPostEditorPort.getPresentation()).activeThemeTemplates).toEqual(["post.html"]);
    expect(calls.map((url) => new URL(url, "https://fixture.test").searchParams.get("kind"))).toEqual(["page", "post"]);
  });
});

describe("templateFor — current options", () => {
  it("appends a filtered-out saved choice after the default without mutating the catalog", () => {
    const templates = ["post.html", "shared.html"];
    expect(editorTemplateOptions({ templates, savedTemplate: "page.html" })).toEqual(["post.html", "shared.html", "page.html"]);
    expect(templates).toEqual(["post.html", "shared.html"]);
    expect(editorTemplateOptions({ templates: [], savedTemplate: "page.html" })).toEqual(["page.html"]);
  });

  it("preserves explicit no-template and avoids duplicate current options", () => {
    for (const savedTemplate of [null, undefined, "", "post.html"]) {
      expect(editorTemplateOptions({ templates: ["post.html"], savedTemplate })).toEqual(["post.html"]);
    }
  });
});
