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
    saving: false,
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
 * Retrieval, not just reachability (2026-09-15). Being tagged is necessary and not sufficient.
 * `page.find_elements`'s `query` is a plain case-insensitive SUBSTRING match over the handle and the
 * published label — no stemming, no synonyms, no scoring, no ranking (`@jini-ai/agentic`'s
 * `dom-page-driver.ts`, `findElements`). A word that is not literally in one of those two strings
 * retrieves NOTHING, and an assistant handed an empty list abandons the route instead of broadening
 * its query.
 *
 * That is recorded fact, not theory. This label read "Show the preview big, filling the admin
 * content area" while the button said "Show full screen"; on a demo take an assistant asked to show
 * the preview full screen called `page.find_elements({query:"full"})`, got `{"elements":[]}`, and
 * gave up. `post-view-preview` worked first try on `query:"preview"` in the same run, so the
 * mechanism was sound and only this label was dead.
 *
 * Measured against the real 16-element catalog this screen publishes (rank = index in the returned
 * set; "sole" = it was the only element returned):
 *
 *   query               before                    after
 *   "full"              0 hits MISS               rank 0, sole   (both states)
 *   "fullscreen"        0 hits MISS               rank 0, sole   (both)
 *   "full screen"       0 hits MISS               rank 0, sole   (both)
 *   "screen"            0 hits MISS               rank 0, sole   (both)
 *   "maximize"          0 hits MISS               rank 0, sole   (both)
 *   "show it big"       0 hits MISS               rank 0, sole   (both)
 *   "expand"            rank 0, sole              unchanged      (via the handle)
 *   "big"               rank 0 collapsed / MISS expanded   rank 0, sole (both)
 *   "exit", "exit full screen", "exit fullscreen", "collapse", "close", "normal", "smaller":
 *                       0 hits MISS               rank 0, sole   (EXPANDED only)
 *   "preview"           rank 1 of 2               unchanged      (behind post-view-preview, correct)
 *
 * Both directions deliberately carry the whole vocabulary, including the opposite direction's. An
 * earlier revision kept "big" out of the expanded label on the theory that "show it big" should not
 * retrieve the control that CLOSES an open panel. The demo take shows why that reasoning is wrong:
 * the cost of a miss is not a wrong click, it is the assistant concluding the feature does not exist.
 * A model that asks for "fullscreen" while it is already full screen should find this control and
 * read "Exit full screen" off its label — that answers its question. Direction is communicated by
 * what the label SAYS, never by absence from the index.
 *
 * The exit vocabulary is the one asymmetry, and it is truthful rather than an oversight: while
 * collapsed there is nothing to exit, so "collapse"/"close"/"exit" returning zero is the correct
 * answer to a question about an action that is not available.
 */
describe("the fullscreen control is retrievable by the words anyone would reach for", () => {
  async function find(container: HTMLElement, query?: string) {
    const driver = createDomPageDriver({ root: container, pages: {} });
    const elements = await findElements(driver, query);
    return { elements, index: elements.findIndex((element) => element.handle === "post-preview-expand") };
  }

  /** Asserts the RANK, not mere presence: sole hit at index 0 leaves the model nothing to choose. */
  async function expectSoleHit(container: HTMLElement, query: string) {
    const { elements, index } = await find(container, query);
    expect(elements.map((element) => element.handle)).toEqual(["post-preview-expand"]);
    expect(index).toBe(0);
  }

  it("is in the unfiltered catalog — the fallback when a model's query returns nothing", async () => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
    const { index } = await find(container);
    expect(index).toBeGreaterThanOrEqual(0);
  });

  // "full" is the exact query that returned `{"elements":[]}` on the demo take. That emptiness is
  // the regression this whole block exists to catch.
  const BOTH_WAYS = ["full", "fullscreen", "full screen", "screen", "expand", "maximize", "show it big", "big"];

  it.each(BOTH_WAYS)("query %o returns the control as the only hit while collapsed", async (query) => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
    await expectSoleHit(container, query);
  });

  it.each(BOTH_WAYS)("query %o returns the control as the only hit while expanded", async (query) => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: true });
    await expectSoleHit(container, query);
  });

  // The way OUT has to be findable, not just visible — an assistant that cannot find it is the exact
  // failure this control was built to prevent.
  const WAY_OUT = ["exit", "exit full screen", "exit fullscreen", "collapse", "close", "normal", "smaller"];

  it.each(WAY_OUT)("query %o returns the control as the only hit while expanded", async (query) => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: true });
    await expectSoleHit(container, query);
  });

  it.each(WAY_OUT)("query %o finds nothing while collapsed — there is no panel to exit", async (query) => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
    const { index } = await find(container, query);
    expect(index).toBe(-1);
  });

  it("query 'preview' reaches the Preview TAB first and the fullscreen control second", async () => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded: false });
    const { elements } = await find(container, "preview");
    // The Preview-tab width buttons (2026-09-22, "Preview at Mobile width") sit between the two in
    // DOM order — they are genuinely preview controls, so matching "preview" is correct.
    expect(elements.map((element) => element.handle)).toEqual([
      "post-view-preview",
      "post-preview-width-desktop",
      "post-preview-width-tablet",
      "post-preview-width-mobile",
      "post-preview-expand",
    ]);
  });

  /**
   * Filtering runs against the RAW label, but the model only ever SEES the first
   * `MAX_AGENT_LABEL_LENGTH` (200) characters `normalizeAgentLabel` returns. Push past that and words
   * stay matchable while becoming invisible — the control would answer a query with a label whose
   * explanation is cut off mid-sentence. The expanded label is the long one, at 179 characters.
   */
  it.each<[string, boolean]>([
    ["collapsed", false],
    ["expanded", true],
  ])("publishes a label short enough to be read in full (%s)", async (_state, previewExpanded) => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded });
    const { elements, index } = await find(container);
    const element = elements[index]! as FoundElement & { labelTruncated?: boolean };
    expect(element.labelTruncated).toBe(false);
    expect(element.label.length).toBeLessThanOrEqual(200);
  });

  /**
   * The durable invariant behind every case above, and the one that survives a copy change: whatever
   * the button says to a human, the agent label says too. Rename the control to "Maximize" and this
   * fails until the published label learns the word — which is exactly the drift that made
   * `query: "full"` return nothing in the first place.
   */
  it.each<[string, boolean]>([
    ["collapsed", false],
    ["expanded", true],
  ])("publishes every word of the button's own aria-label to agents (%s)", async (_state, previewExpanded) => {
    const { container } = renderPostEditor({ view: "preview", previewExpanded });
    const ariaLabel = container.querySelector(".post-preview-fab")?.getAttribute("aria-label") ?? "";
    expect(ariaLabel).not.toBe("");

    const { elements, index } = await find(container);
    const published = elements[index]!.label.toLowerCase();
    for (const word of ariaLabel.toLowerCase().split(/\s+/)) {
      expect(published).toContain(word);
    }
  });
});
