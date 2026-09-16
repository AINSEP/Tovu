import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { PostEditor } from "../PostEditor";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";
import { api, type AdminPost } from "@/lib/api";

/**
 * @file Proves §3 of `ADS-memory/.local-artifacts/handoffs/2026-09-15-preview-fullscreen-PLAN.md`
 * — the assistant needs no new tool to drive the Preview tab or the expand toggle; an `agentHandle`
 * on each closes the entire gap — by actually driving them through the real `page.*` capability
 * pipeline, not by asserting the markup and reasoning about it from there.
 *
 * Sibling of `posts-agent-drive.unit.test.tsx` (that file is `Posts.tsx`-scoped — the row-list
 * screen; this one is `PostEditor.tsx`-scoped — the screen that row's own agentHandle'd link opens).
 * Same convention: drive the REAL `executePageCapability` and the REAL `createDomPageDriver`, not
 * `userEvent` alone, and scope the driver to `root: container` (standing in for `contentEl`, the
 * real bridge's own scope — `App.hooks.tsx`) rather than `document.body` — see that sibling file's
 * own "KNOWN GAP" doc header for why a broader root can hide exactly this kind of unreachable-handle
 * defect.
 *
 * Fixture duplicated from `PostEditor.unit.test.tsx`'s own `postController` rather than imported —
 * matching that sibling file's precedent of each agent-drive test owning its fixture independently,
 * so this file's assertions never depend on an unrelated test file's own upkeep.
 */

const POST: AdminPost = {
  id: "p1",
  workspaceId: "w1",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
  status: "draft",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

function controller(overrides: Partial<PostEditorController> = {}): PostEditorController {
  const post = overrides.post ?? POST;
  const save = vi.fn();
  const setConfirmingDelete = vi.fn();
  const setShowTemplateModal = vi.fn();
  return {
    onPublish: () => save("published"),
    onSave: () => save(),
    onDeleteClick: () => setConfirmingDelete(true),
    onDeleteCancel: () => setConfirmingDelete(false),
    onViewTemplateClick: () => setShowTemplateModal(true),
    onCloseTemplateModal: () => setShowTemplateModal(false),
    post,
    editor: null,
    title: "Hello world",
    setTitle: vi.fn(),
    slug: "hello-world",
    setSlug: vi.fn(),
    status: "draft",
    setStatus: vi.fn(),
    templateChoice: null,
    setTemplateChoice: vi.fn(),
    availableTemplates: [],
    mentionablePosts: [],
    activeThemeId: null,
    activeThemeTier: null,
    activeThemeApiVersion: undefined,
    overridesThemePage: false,
    setOverridesThemePage: vi.fn(),
    hasSlugCollision: false,
    view: "edit",
    setView: vi.fn(),
    previewExpanded: false,
    togglePreviewExpanded: vi.fn(),
    message: null,
    error: null,
    confirmingDelete: false,
    setConfirmingDelete,
    deleting: false,
    confirmLeave: () => true,
    dirty: false,
    contentDirty: false,
    templatePreviewUrl: api.templatePreviewUrl(post.id, null),
    bodyJson: null,
    showTemplateModal: false,
    setShowTemplateModal,
    previewFormRef: { current: null },
    previewFormTarget: `post-preview-pending-${post.id}`,
    save,
    recoverableDraft: null,
    restoreRecoveredDraft: vi.fn(),
    discardRecoveredDraft: vi.fn(),
    autosaveStaleBasis: null,
    saveConflict: null,
    saveOverwritingConflict: vi.fn(),
    dismissSaveConflict: vi.fn(),
    remove: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  };
}

function renderPostEditor(overrides: Partial<PostEditorController> = {}) {
  const ctrl = controller(overrides);
  const { container } = render(<PostEditor postId="p1" usePostEditorHook={() => ctrl} />);
  return { ctrl, container };
}

interface FoundElement {
  handle: string;
  role?: string;
  label: string;
}

async function findElements(
  driver: ReturnType<typeof createDomPageDriver>,
  query?: string,
): Promise<FoundElement[]> {
  // Omit `query` entirely rather than passing `undefined` — `page.find_elements`'s input schema is
  // `additionalProperties: false` and the executor only forwards a `string`, so an explicit
  // `undefined` would be silently dropped and quietly turn a filtered probe into an unfiltered one.
  const input = query === undefined ? {} : { query };
  const result = (await executePageCapability(driver, "page.find_elements", input)) as { elements: FoundElement[] };
  return result.elements;
}

async function handlesOf(driver: ReturnType<typeof createDomPageDriver>) {
  return (await findElements(driver)).map((element) => element.handle);
}

describe("driving the post editor's Editor/Preview tabs and expand toggle through page.* verbs", () => {
  it("reports post-view-edit and post-view-preview — the exact gap the plan names, closed", async () => {
    const { container } = renderPostEditor({ view: "edit" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver);
    expect(handles).toContain("post-view-edit");
    expect(handles).toContain("post-view-preview");
  });

  it("page.click on post-view-preview's handle actually switches the view — reachable AND clickable, not merely tagged", async () => {
    const { container, ctrl } = renderPostEditor({ view: "edit" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.click", { handle: "post-view-preview" });
    await driver.settle?.();

    expect(ctrl.setView).toHaveBeenCalledWith("preview");
  });

  it("post-preview-expand is reachable and clickable once the Preview tab is open", async () => {
    const { container, ctrl } = renderPostEditor({ view: "preview", previewExpanded: false });
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver);
    expect(handles).toContain("post-preview-expand");

    await executePageCapability(driver, "page.click", { handle: "post-preview-expand" });
    await driver.settle?.();

    expect(ctrl.togglePreviewExpanded).toHaveBeenCalledTimes(1);
  });

  // Since `a380c716` there is ONE control carrying this handle (`.post-preview-fab`), rendered in the
  // same place collapsed and expanded rather than two mutually-exclusive buttons. This proves the
  // handle stays reachable on the other side of the toggle AND that the single element did not become
  // two — a duplicate handle would make `page.click` ambiguous for the assistant.
  it("post-preview-expand stays reachable once already expanded — same single handle, now on the preview itself", async () => {
    const { container, ctrl } = renderPostEditor({ view: "preview", previewExpanded: true });
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver);
    expect(handles).toContain("post-preview-expand");
    expect(handles.filter((handle) => handle === "post-preview-expand")).toHaveLength(1);

    await executePageCapability(driver, "page.click", { handle: "post-preview-expand" });
    await driver.settle?.();

    expect(ctrl.togglePreviewExpanded).toHaveBeenCalledTimes(1);
  });

  it("post-view-edit switches back to the editor view", async () => {
    const { container, ctrl } = renderPostEditor({ view: "preview" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.click", { handle: "post-view-edit" });
    await driver.settle?.();

    expect(ctrl.setView).toHaveBeenCalledWith("edit");
  });
});

/**
 * Retrieval, not just reachability (2026-09-15). Being tagged is necessary and not sufficient: a
 * model asked "make it fullscreen" narrows with `page.find_elements`'s `query` before it reads 16
 * labels, and `query` is a plain case-insensitive SUBSTRING match over handle and label — no
 * stemming, no scoring, no ranking (`@jini-ai/agentic`'s `dom-page-driver.ts`, `findElements`). A
 * word that is not literally in the handle or the label retrieves NOTHING.
 *
 * Measured against the real 16-element catalog this screen publishes, `post-preview-expand`'s label
 * used to read "Show the preview big, filling the admin content area" while the button itself said
 * "Show full screen". Every word an operator or model would actually reach for missed:
 *
 *   query        before          after
 *   "fullscreen"  0 hits (MISS)  1 hit, rank 0  (both collapsed and expanded)
 *   "full screen" 0 hits (MISS)  1 hit, rank 0  (both)
 *   "full"        0 hits (MISS)  1 hit, rank 0  (both)
 *   "screen"      0 hits (MISS)  1 hit, rank 0  (both)
 *   "big"         1 hit, rank 0  unchanged      (collapsed only, by design)
 *   "preview"     rank 1 of 2    unchanged      (behind post-view-preview, which is correct)
 *
 * Still missing on purpose: "large", "wide", "maximize" — none of them is a word this control shows
 * anyone, and the rule kept here is the honest one rather than open-ended keyword stuffing: the
 * published label carries the words the control's own `aria-label` uses. Whole-phrase queries ("show
 * it big") can never match under substring semantics no matter what the label says; a model that
 * gets zero hits falls back to an unfiltered `page.find_elements`, which is the first test below.
 */
describe("the fullscreen control is retrievable by the words it shows an operator", () => {
  async function labelOf(container: HTMLElement, handle: string, query?: string) {
    const driver = createDomPageDriver({ root: container, pages: {} });
    const elements = await findElements(driver, query);
    return { elements, index: elements.findIndex((element) => element.handle === handle) };
  }

  it("is in the unfiltered catalog — the fallback when a model's query returns nothing", async () => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
    const { index } = await labelOf(container, "post-preview-expand");
    expect(index).toBeGreaterThanOrEqual(0);
  });

  // Asserts the RANK, not merely presence. Sole hit = rank 0: the model has nothing to choose
  // between. If one of these ever returns 0 hits again, the control is dead to a model that narrows.
  it.each(["fullscreen", "full screen", "full", "screen"])(
    "query %o returns the control as the only hit while collapsed",
    async (query) => {
      const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
      const { elements, index } = await labelOf(container, "post-preview-expand", query);
      expect(elements.map((element) => element.handle)).toEqual(["post-preview-expand"]);
      expect(index).toBe(0);
    },
  );

  it.each(["fullscreen", "full screen", "full", "screen"])(
    "query %o returns the control as the only hit while expanded — the way out is findable too",
    async (query) => {
      const { container } = renderPostEditor({ view: "preview", previewExpanded: true });
      const { elements, index } = await labelOf(container, "post-preview-expand", query);
      expect(elements.map((element) => element.handle)).toEqual(["post-preview-expand"]);
      expect(index).toBe(0);
    },
  );

  it("query 'big' reaches it while collapsed — the owner's own phrasing, \"show it big\"", async () => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
    const { index } = await labelOf(container, "post-preview-expand", "big");
    expect(index).toBe(0);
  });

  // Direction matters: "show it big" must NOT retrieve the control that would close an already-open
  // panel. The two labels are deliberately not interchangeable.
  it("query 'big' does NOT reach it while expanded — that direction is 'exit', not 'show'", async () => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: true });
    const { index } = await labelOf(container, "post-preview-expand", "big");
    expect(index).toBe(-1);
  });

  it("query 'preview' reaches the Preview TAB first and the fullscreen control second", async () => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
    const { elements } = await labelOf(container, "post-preview-expand", "preview");
    expect(elements.map((element) => element.handle)).toEqual(["post-view-preview", "post-preview-expand"]);
  });

  /**
   * The durable invariant behind every case above, and the one that survives a copy change: whatever
   * the button says to a human, the agent label says too. Rename the control to "Maximize" and this
   * fails until the published label learns the word — which is exactly the drift that made
   * `query: "fullscreen"` return nothing in the first place.
   */
  it.each<[string, boolean]>([
    ["collapsed", false],
    ["expanded", true],
  ])("publishes every word of the button's own aria-label to agents (%s)", async (_state, previewExpanded) => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded });
    const ariaLabel = container.querySelector(".post-preview-fab")?.getAttribute("aria-label") ?? "";
    expect(ariaLabel).not.toBe("");

    const { elements, index } = await labelOf(container, "post-preview-expand");
    const published = elements[index]!.label.toLowerCase();
    for (const word of ariaLabel.toLowerCase().split(/\s+/)) {
      expect(published).toContain(word);
    }
  });
});
