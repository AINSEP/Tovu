import { act, render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/features/posts/api/posts-api.types";
import { PostEditor } from "../PostEditor";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor, type PostEditorController } from "../hooks/use-post-editor.hooks";
import { TOOLBAR_PRIMARY_RANKS } from "../hooks/use-post-editor-ui.hooks";
import { FONT_FAMILY_OPTIONS, FONT_SIZE_OPTIONS, LINE_HEIGHT_OPTIONS } from "../rules";
import { TOOLBAR_DEFAULTS } from "../editor/toolbar/toolbar-state";

/**
 * @file Characterization pins for the `PostEditor` screen, written BEFORE `PostEditor.tsx` is split
 * into its feature-sliced folder (size design 05, step 0). Everything here goes through the public
 * `PostEditor` export and the port fake, so the same file must stay green, unedited, through every
 * move-only commit that follows.
 *
 * What it pins, and why an `innerHTML` snapshot alone is not enough:
 * - DOM snapshots (generated ids normalised, association between id and referrer kept) for the
 *   states the screen can be in. A wrapper element added by an extracted component shows up here.
 * - DOM ORDER of the screen's regions (header, notices, view bar, actions, settings dialog, slug
 *   warning, body/preview, saved panels, confirm dialogs, template modal) as asserted positions, not
 *   a snapshot, so a re-ordered root fails with a readable message.
 * - The loading / error contract and that the hook order is stable across loading → ready.
 * - Mount lifetime: the URL dialog lives in the body, so switching to Preview and back resets it.
 * - Toolbar overflow with controlled geometry (stubbed widths + a fake `ResizeObserver` the test
 *   triggers), which a snapshot cannot see.
 * - One toolbar snapshot per `TOOLBAR_PROBES` entry made active, pinning probe → control mapping.
 */

vi.mock("../../taxonomy/TermPicker", () => ({
  TermPicker: (props: { contentType: string; contentId: string }) => (
    <div data-testid="term-picker">{`${props.contentType}/${props.contentId}`}</div>
  ),
}));
vi.mock("@jini-ai/admin/screens/content-analysis/ContentAnalysisCard", () => ({
  ContentAnalysisCard: (props: { post: { id: string } }) => <div data-testid="content-analysis">{props.post.id}</div>,
}));
vi.mock("../../../components/TemplateSource/TemplateSourceModal", () => ({
  TemplateSourceModal: (props: { themeId: string; templateFilename: string }) => (
    <div data-testid="template-source-modal">{`${props.themeId}/${props.templateFilename}`}</div>
  ),
}));

// Probe-override seam: when `probeOverride.current` is set, `useEditorState` returns the real
// selector result merged with it. Both Toolbar and BubbleFormattingMenu go through this one hook.
const probeOverride: { current: Record<string, unknown> | null } = { current: null };
vi.mock("@tiptap/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditorState: ((options: Parameters<typeof actual.useEditorState>[0]) => {
      const real = actual.useEditorState(options) as Record<string, unknown>;
      return probeOverride.current ? { ...real, ...probeOverride.current } : real;
    }) as typeof actual.useEditorState,
  };
});

if (typeof Range.prototype.getClientRects !== "function") {
  // @ts-expect-error jsdom omission — same shim `PostEditor.unit.test.tsx` documents
  Range.prototype.getClientRects = function () {
    return [];
  };
}
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} };
  };
}

const t = (key: string): string => key;
const navigate = (): void => {};

const SAVED_POST: AdminPost = {
  id: "p1",
  workspaceId: "w1",
  kind: "post",
  title: "Hello world",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body text here" }] }] },
  bodyFormat: "doc",
  status: "draft",
  templateChoice: null,
  overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const OTHER_POST: AdminPost = { ...SAVED_POST, id: "p2", title: "Other Post", slug: "other-post" };

/** Generated-id shapes React/react-aria emit; anything else is real markup and stays verbatim. */
const GENERATED_ID = /^(?::r[0-9a-z]+:|_r_[0-9a-z]+_|«.+»|react-aria\d*-.+|radix-.+)$/;

/**
 * Serialises the DOM with generated ids replaced by `ID<n>` in first-seen order, so two ids that
 * must match (label→control, describedby→error) still match in the snapshot and two that must differ
 * still differ, while the run-to-run counter value is gone.
 */
function normalizedHtml(root: Element): string {
  const seen = new Map<string, string>();
  const rename = (value: string): string => {
    if (!GENERATED_ID.test(value)) return value;
    if (!seen.has(value)) seen.set(value, `ID${seen.size + 1}`);
    return seen.get(value)!;
  };
  // `useThemePreviewFrame` appends a fresh `__tovu_preview=<uuid>` cache-buster per mount.
  const html = root.innerHTML.replace(/__tovu_preview=[0-9a-f-]{36}/g, "__tovu_preview=UUID");
  return html.replace(
    /\b(id|for|aria-labelledby|aria-describedby|aria-controls|aria-owns|aria-activedescendant)="([^"]*)"/g,
    (_m, attr: string, value: string) => `${attr}="${value.split(" ").map(rename).join(" ")}"`,
  );
}

interface Harness {
  /** `true` when the screen opens on the Preview tab (there is no toolbar to wait for). */
  preview: boolean;
  ctrl: { current: PostEditorController | null };
  hook: (input: { postId: string }) => PostEditorController;
}

/** The real `usePostEditor` over the port fake, with `overrides` laid over what it returns. */
function harness(
  options: { post?: AdminPost; mentionable?: AdminPost[]; templates?: string[]; overrides?: Partial<PostEditorController> } = {},
): Harness {
  const port = createFakePostEditorPort({
    ...(options.post ? { post: options.post } : {}),
    mentionablePosts: options.mentionable ?? [],
    presentation: { activeThemeTemplates: options.templates ?? [] },
  });
  const ctrl: Harness["ctrl"] = { current: null };
  const hook = ({ postId }: { postId: string }): PostEditorController => {
    const real = usePostEditor({ postId, deps: { port, navigate, t } });
    ctrl.current = real;
    return { ...real, ...options.overrides };
  };
  return { preview: options.overrides?.view === "preview", ctrl, hook };
}

async function renderScreen(h: Harness, postId = "p1") {
  const utils = render(<PostEditor postId={postId} usePostEditorHook={h.hook} />);
  if (h.preview) await screen.findByTitle("Post settings");
  else await screen.findByTitle("Bold (⌘B)");
  return utils;
}

beforeEach(() => {
  probeOverride.current = null;
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } })));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("PostEditor DOM — states", () => {
  it("new post (local working copy, no id)", async () => {
    const { container } = await renderScreen(harness({ post: { ...SAVED_POST, id: "", title: "Untitled", slug: "", version: 0 } }), "");
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("loaded draft", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("loaded published post (no Publish button, Save is primary)", async () => {
    const { container } = await renderScreen(harness({ post: { ...SAVED_POST, status: "published" } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("loaded page (kind-aware copy and back link)", async () => {
    const { container } = await renderScreen(harness({ post: { ...SAVED_POST, kind: "page", id: "pg1", title: "About", slug: "about" } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("dirty after a title edit, with a save message and error", async () => {
    const h = harness({ post: SAVED_POST });
    const { container } = await renderScreen(h);
    act(() => h.ctrl.current!.setTitle({ next: "Changed title" }));
    await waitFor(() => expect(h.ctrl.current!.dirty).toBe(true));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("save message and save error render beside the buttons", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { message: "Saved · version 2", error: "Could not save" } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("autosave recovery banner", async () => {
    const { container } = await renderScreen(harness({
      post: SAVED_POST,
      overrides: {
        recoverableDraft: {
          bodyFormat: "doc",
          bodyJson: { type: "doc", content: [] },
          title: "Parked draft",
          slug: "parked",
          baseVersion: 1,
          savedAt: "2026-08-02T00:00:00.000Z",
          savedByPrincipalId: "principal-1",
        },
      },
    }));
    expect(normalizedHtml(container.querySelector('[data-agent-element="post-autosave-recovery"]')!)).toMatchSnapshot();
    expect(normalizedHtml(container)).toMatchSnapshot("whole screen");
  });

  it("autosave stale-basis banner", async () => {
    const { container } = await renderScreen(harness({
      post: SAVED_POST,
      overrides: { autosaveStaleBasis: { baseVersion: 3, draft: { bodyFormat: "doc", bodyJson: { type: "doc", content: [] }, title: "Still being typed", slug: "hello-world", baseVersion: 3 } } },
    }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("version conflict banner", async () => {
    const { container } = await renderScreen(harness({
      post: SAVED_POST,
      overrides: { saveConflict: { expectedVersion: 1, currentVersion: 2, attemptedStatus: undefined } },
    }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("outside-change banner suppresses the stale-basis banner", async () => {
    const stale = { baseVersion: 3, draft: { bodyFormat: "doc" as const, bodyJson: { type: "doc", content: [] }, title: "x", slug: "hello-world", baseVersion: 3 } };
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { autosaveStaleBasis: stale, pendingExternalVersion: 2 } }));
    expect(container.querySelector('[data-agent-element="post-autosave-stale"]')).toBeNull();
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("slug collision warning", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { hasSlugCollision: true, overridesThemePage: null } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("template picker with templates, one chosen", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { availableTemplates: ["post.html", "wide.html"], templateChoice: "wide.html" } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("template picker for a theme with no templates, and none rendered for an html page", async () => {
    const withNone = await renderScreen(harness({ post: SAVED_POST }));
    expect(withNone.container.querySelector(".editor-template-picker select[disabled]")).not.toBeNull();
    withNone.unmount();
    const htmlPage = await renderScreen(harness({ post: { ...SAVED_POST, bodyFormat: "html" } }));
    expect(htmlPage.container.querySelector(".editor-template-picker")).toBeNull();
  });

  it("template source modal gate", async () => {
    const { container } = await renderScreen(harness({
      post: SAVED_POST,
      overrides: { showTemplateModal: true, templateChoice: "wide.html", activeThemeId: "basic", availableTemplates: ["wide.html"] },
    }));
    expect(screen.getByTestId("template-source-modal")).toHaveTextContent("basic/wide.html");
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it.each([
    ["no template chosen", { showTemplateModal: true, templateChoice: "", activeThemeId: "basic" }],
    ["template never chosen", { showTemplateModal: true, templateChoice: null, activeThemeId: "basic" }],
    ["no active theme id", { showTemplateModal: true, templateChoice: "wide.html", activeThemeId: null }],
    ["modal not requested", { showTemplateModal: false, templateChoice: "wide.html", activeThemeId: "basic" }],
  ] as const)("template source modal stays unmounted when a condition is missing: %s", async (_name, overrides) => {
    await renderScreen(harness({ post: SAVED_POST, overrides }));
    expect(screen.queryByTestId("template-source-modal")).toBeNull();
  });

  it("delete confirm dialog open (saved post)", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { confirmingDelete: true } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("delete confirm dialog open (unsaved local copy says Discard)", async () => {
    const { container } = await renderScreen(harness({ post: { ...SAVED_POST, id: "", version: 0 }, overrides: { confirmingDelete: true } }), "");
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("unchanged-save confirm dialog open", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { confirmingUnchangedSave: true } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("settings dialog open via the gear", async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    await user.click(screen.getByRole("button", { name: "Post settings" }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("mention picker lists other posts but not the current one", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, mentionable: [SAVED_POST, OTHER_POST] }));
    const select = within(container as HTMLElement).getByLabelText("Mention a post");
    expect(Array.from(select.querySelectorAll("option")).map((o) => o.value)).toEqual(["", "other-post"]);
  });
});

describe("PostEditor DOM — preview tab", () => {
  it("saved draft: pending-content preview (hidden POST form + named iframe)", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { view: "preview" } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("published, clean: live-site iframe", async () => {
    const { container } = await renderScreen(harness({ post: { ...SAVED_POST, status: "published" }, overrides: { view: "preview", status: "published" } }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("published, only the template choice pending: template-preview iframe", async () => {
    const { container } = await renderScreen(harness({
      post: { ...SAVED_POST, status: "published" },
      overrides: { view: "preview", status: "published", dirty: true, contentDirty: false },
    }));
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("expanded preview wraps the same pane in the expanded panel and keeps one fab", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { view: "preview", previewExpanded: true } }));
    expect(container.querySelectorAll(".post-preview-fab")).toHaveLength(1);
    expect(normalizedHtml(container)).toMatchSnapshot();
  });

  it("new post: preview asks for a first save", async () => {
    const { container } = await renderScreen(harness({ post: { ...SAVED_POST, id: "", version: 0 }, overrides: { view: "preview" } }), "");
    expect(screen.getByRole("status")).toHaveTextContent("Save this post to preview it.");
    expect(normalizedHtml(container)).toMatchSnapshot();
  });
});

describe("PostEditor — loading / error contract", () => {
  it("renders the error notice, with nothing else, when there is an error and no post", () => {
    const { container } = render(<PostEditor postId="p1" usePostEditorHook={() => stub({ post: null, error: "Failed to load" })} />);
    expect(normalizedHtml(container)).toBe('<div class="notice error">Failed to load</div>');
  });

  it("renders the loading notice when there is no post and no error", () => {
    const { container } = render(<PostEditor postId="p1" usePostEditorHook={() => stub({ post: null })} />);
    expect(normalizedHtml(container)).toBe('<div class="notice">Loading editor…</div>');
  });

  it("an error while a post is on screen does not replace the editor", () => {
    const { container } = render(<PostEditor postId="p1" usePostEditorHook={() => stub({ post: SAVED_POST, error: "Could not save" })} />);
    expect(container.querySelector(".content-editor-header")).not.toBeNull();
    expect(container.querySelector(".save-error")).toHaveTextContent("Could not save");
  });

  it("goes loading → ready without changing the hook order (no 'rendered more hooks')", () => {
    let current: Partial<PostEditorController> = { post: null };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, container } = render(<PostEditor postId="p1" usePostEditorHook={() => stub(current)} />);
    expect(container.textContent).toBe("Loading editor…");
    current = { post: SAVED_POST };
    rerender(<PostEditor postId="p1" usePostEditorHook={() => stub(current)} />);
    expect(container.querySelector(".content-editor-header")).not.toBeNull();
    current = { post: null, error: "gone" };
    rerender(<PostEditor postId="p1" usePostEditorHook={() => stub(current)} />);
    expect(container.textContent).toBe("gone");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("calls the injected hook once per render with the postId", () => {
    const spy = vi.fn((input: { postId: string }) => { void input; return stub({ post: null }); });
    render(<PostEditor postId="abc" usePostEditorHook={spy} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ postId: "abc" });
  });
});

/** A controller with no TipTap and all handlers inert — for the contracts that need no editor. */
function stub(overrides: Partial<PostEditorController>): PostEditorController {
  const post = overrides.post === undefined ? SAVED_POST : overrides.post;
  const noop = () => {};
  return {
    onPublish: noop, onSave: noop, onDeleteClick: noop, onDeleteCancel: noop,
    confirmingUnchangedSave: false, onUnchangedSaveConfirm: noop, onUnchangedSaveCancel: noop,
    onViewTemplateClick: noop, onCloseTemplateModal: noop,
    post, editor: null, title: "Hello world", setTitle: noop, slug: "hello-world", setSlug: noop,
    status: "draft", setStatus: noop, templateChoice: null, setTemplateChoice: noop,
    availableTemplates: [], mentionablePosts: [], activeThemeId: null, activeThemeTier: null, activeThemeApiVersion: undefined,
    overridesThemePage: false, setOverridesThemePage: noop, publishAtInput: "", setPublishAtInput: noop, scheduled: false,
    featuredMediaId: null, setFeaturedMediaId: noop, author: "", setAuthor: noop, showAuthor: false, setShowAuthor: noop,
    hideCoverImageInBody: true, setHideCoverImageInBody: noop, hasSlugCollision: false,
    view: "edit", setView: noop, previewExpanded: false, togglePreviewExpanded: noop,
    message: null, error: null, saving: false, confirmingDelete: false, setConfirmingDelete: noop, deleting: false,
    confirmLeave: () => true, dirty: false, contentDirty: false, templatePreviewUrl: "", bodyJson: null,
    showTemplateModal: false, setShowTemplateModal: noop, previewFormRef: noop, previewFormTarget: "target", save: vi.fn(),
    recoverableDraft: null, restoreRecoveredDraft: noop, discardRecoveredDraft: vi.fn(), autosaveStaleBasis: null,
    pendingExternalVersion: null, loadExternalChange: vi.fn(), dismissExternalChange: noop,
    saveConflict: null, saveOverwritingConflict: vi.fn(), dismissSaveConflict: noop, remove: vi.fn(), t,
    ...overrides,
  } as PostEditorController;
}

/** Region markers in the order the root is documented to mount them (design 05, R1.1). */
const REGION_SELECTORS: ReadonlyArray<readonly [string, string]> = [
  ["header", '[data-agent-element="post-header"]'],
  ["notices", '[data-agent-element="post-autosave-recovery"]'],
  ["view bar", ".page-editor-toolbar"],
  ["actions", '[data-agent-element="post-actions"]'],
  ["slug collision", '[data-agent-element="post-slug-collision-warning"]'],
  ["body", '[data-agent-element="post-editor-shell"]'],
  ["content analysis", '[data-testid="content-analysis"]'],
  ["term picker", '[data-testid="term-picker"]'],
  ["unchanged-save dialog", '[data-agent-element="post-save-unchanged-confirm-confirm"]'],
  ["delete dialog", '[data-agent-element="post-delete-confirm-confirm"]'],
  ["template modal", '[data-testid="template-source-modal"]'],
];

function regionOrder(container: Element): string[] {
  const found = REGION_SELECTORS
    .map(([name, selector]) => ({ name, el: container.querySelector(selector) }))
    .filter((entry): entry is { name: string; el: Element } => entry.el !== null);
  found.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return found.map((entry) => entry.name);
}

describe("PostEditor — DOM order of the regions", () => {
  const everything: Partial<PostEditorController> = {
    recoverableDraft: { bodyFormat: "doc", bodyJson: { type: "doc", content: [] }, title: "p", slug: "p", baseVersion: 1, savedAt: "2026-08-02T00:00:00.000Z", savedByPrincipalId: "x" },
    hasSlugCollision: true,
    templateChoice: "wide.html",
    activeThemeId: "basic",
    showTemplateModal: true,
    confirmingDelete: true,
    confirmingUnchangedSave: true,
  };

  it("saved post, edit view: header → notices → view bar → actions → slug collision → body → saved panels → dialogs → template modal", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: everything }));
    expect(regionOrder(container)).toEqual([
      "header", "notices", "view bar", "actions", "slug collision", "body",
      "content analysis", "term picker", "unchanged-save dialog", "delete dialog", "template modal",
    ]);
  });

  it("saved post, preview view: the preview takes the body's slot and the saved panels still follow it", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST, overrides: { ...everything, view: "preview" } }));
    const order = regionOrder(container);
    expect(order).not.toContain("body");
    expect(order).toEqual([
      "header", "notices", "view bar", "actions", "slug collision",
      "content analysis", "term picker", "unchanged-save dialog", "delete dialog", "template modal",
    ]);
    const previewSurface = container.querySelector(".post-preview-surface")!;
    expect(previewSurface.compareDocumentPosition(container.querySelector('[data-testid="content-analysis"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[data-agent-element="post-actions"]')!.compareDocumentPosition(previewSurface) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("new post: the saved-post panels are absent, everything else keeps its order", async () => {
    const { container } = await renderScreen(harness({ post: { ...SAVED_POST, id: "", version: 0 }, overrides: everything }), "");
    expect(container.querySelector('[data-testid="content-analysis"]')).toBeNull();
    expect(container.querySelector('[data-testid="term-picker"]')).toBeNull();
    expect(regionOrder(container)).toEqual([
      "header", "notices", "view bar", "actions", "slug collision", "body",
      "unchanged-save dialog", "delete dialog", "template modal",
    ]);
  });

  it("the settings dialog renders through a portal: opening it adds nothing inside the screen root", async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    const before = normalizedHtml(container);
    await user.click(screen.getByRole("button", { name: "Post settings" }));
    const done = await screen.findByRole("button", { name: "Done" });
    expect(container.contains(done)).toBe(false);
    expect(document.body.contains(done)).toBe(true);
    // The only in-root change is the gear's own state, never a new node between actions and slug warning.
    expect(container.querySelectorAll("*").length).toBe(new DOMParser().parseFromString(`<div>${before}</div>`, "text/html").body.querySelectorAll("*").length - 1);
  });

  it("the four notices keep their order and the stale-basis notice waits for an outside change", async () => {
    const stale = { baseVersion: 3, draft: { bodyFormat: "doc" as const, bodyJson: { type: "doc", content: [] }, title: "x", slug: "hello-world", baseVersion: 3 } };
    const { container } = await renderScreen(harness({
      post: SAVED_POST,
      overrides: {
        recoverableDraft: everything.recoverableDraft!,
        autosaveStaleBasis: stale,
        saveConflict: { expectedVersion: 1, currentVersion: 2, attemptedStatus: undefined },
      },
    }));
    const handles = Array.from(container.querySelectorAll('.notice[data-agent-element]')).map((el) => el.getAttribute("data-agent-element"));
    // A save conflict hides the stale-basis notice: the conflict banner's Load latest / Replace their
    // version is the one choice left (tv-bugs3b B2).
    expect(handles).toEqual(["post-autosave-recovery", "post-version-conflict"]);
  });
});

describe("PostEditor — URL dialog mount lifetime", () => {
  it("edit → open URL dialog → type → preview → edit shows the dialog closed and its input empty", async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    let view: "edit" | "preview" = "edit";
    const h = harness({ post: SAVED_POST });
    const useHook = ({ postId }: { postId: string }): PostEditorController => ({ ...h.hook({ postId }), view, setView: (next) => { view = next; } });
    const { rerender } = render(<PostEditor postId="p1" usePostEditorHook={useHook} />);
    await screen.findByTitle("Bold (⌘B)");

    await user.click(screen.getByRole("button", { name: "Img by URL" }));
    const input = await screen.findByLabelText("URL");
    await user.type(input, "https://example.com/pic.png");
    expect(input).toHaveValue("https://example.com/pic.png");

    view = "preview";
    rerender(<PostEditor postId="p1" usePostEditorHook={useHook} />);
    await waitFor(() => expect(document.querySelector(".post-preview-surface")).not.toBeNull());
    expect(screen.queryByLabelText("URL")).toBeNull();

    view = "edit";
    rerender(<PostEditor postId="p1" usePostEditorHook={useHook} />);
    await screen.findByTitle("Bold (⌘B)");
    expect(screen.queryByLabelText("URL")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Img by URL" }));
    expect(await screen.findByLabelText("URL")).toHaveValue("");
  });
});

/** ---- toolbar overflow with controlled geometry ---------------------------------------------- */

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) { this.observed.push(target); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
}

const CONTROL_WIDTH = 40;
const MORE_WIDTH = 30;
const GAP = 4;

describe("PostEditor — toolbar overflow geometry", () => {
  let toolbarWidth = 1000;
  let restore: Array<() => void> = [];

  function stubGeometry(): void {
    const descriptor = (name: "offsetWidth" | "clientWidth") => Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
    const originalOffset = descriptor("offsetWidth");
    const originalClient = descriptor("clientWidth");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get(this: HTMLElement) {
        if (this.classList.contains("tb-more")) return MORE_WIDTH;
        if (this.hasAttribute("data-tb-rank")) return CONTROL_WIDTH;
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("editor-toolbar") ? toolbarWidth : 0;
      },
    });
    const realComputed = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element, pseudo?: string | null) => {
      if (element.classList.contains("editor-toolbar")) {
        return { paddingLeft: "0px", paddingRight: "0px", columnGap: `${GAP}px` } as unknown as CSSStyleDeclaration;
      }
      return realComputed(element, pseudo);
    });
    restore.push(() => {
      if (originalOffset) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffset);
      if (originalClient) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClient);
    });
  }

  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    stubGeometry();
  });

  afterEach(() => {
    restore.forEach((fn) => fn());
    restore = [];
  });

  /** Ranks whose control is currently marked as a primary (stays on the phone row). */
  function primaryRanks(container: Element): number[] {
    return Array.from(container.querySelectorAll<HTMLElement>("[data-tb-rank]"))
      .filter((el) => el.getAttribute("data-tb") === "primary")
      .map((el) => Number(el.getAttribute("data-tb-rank")))
      .sort((a, b) => a - b);
  }

  /** The widest row that fits `count` ranked controls plus More, per the hook's own arithmetic. */
  const rowWidth = (count: number) => MORE_WIDTH + count * (GAP + CONTROL_WIDTH);

  async function setWidth(width: number): Promise<void> {
    toolbarWidth = width;
    await act(async () => { FakeResizeObserver.instances.forEach((observer) => observer.callback()); });
  }

  it("six ranked controls exist and all stay primary at a wide width", async () => {
    toolbarWidth = 1000;
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    const ranks = Array.from(container.querySelectorAll("[data-tb-rank]")).map((el) => Number(el.getAttribute("data-tb-rank")));
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(TOOLBAR_PRIMARY_RANKS).toBe(6);
    expect(primaryRanks(container)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps the lowest ranks primary at three widths and More always fits", async () => {
    toolbarWidth = 1000;
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    for (const [width, expected] of [[rowWidth(3) + 2, [0, 1, 2]], [rowWidth(1) + 2, [0]], [rowWidth(5) + 2, [0, 1, 2, 3, 4]]] as const) {
      await setWidth(width);
      expect(primaryRanks(container)).toEqual(expected);
      // "More" fits: the used width of the primaries plus More never exceeds the row (less the 1px slack).
      expect(rowWidth(expected.length)).toBeLessThanOrEqual(width - 1);
    }
  });

  it("a width that fits no control leaves only More and nothing primary", async () => {
    toolbarWidth = 1000;
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    await setWidth(MORE_WIDTH + 1);
    expect(primaryRanks(container)).toEqual([]);
  });

  it("observes the toolbar first, then the ranked controls and More in DOM order (one observer)", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    // Other components (floating-ui's autoUpdate under TipTap's drag handle) own observers too; the
    // toolbar's is the live one whose first target is the toolbar, and there must be exactly one.
    const live = FakeResizeObserver.instances.filter((observer) => !observer.disconnected && observer.observed[0]?.classList.contains("editor-toolbar"));
    expect(live).toHaveLength(1);
    const targets = live[0]!.observed.map((el) => (el.classList.contains("editor-toolbar") ? "toolbar" : el.classList.contains("tb-more") ? "more" : `rank${el.getAttribute("data-tb-rank")}`));
    // `querySelectorAll(".tb-more, [data-tb-rank]")` is document order: the ranked controls sit in
    // the formatting groups, More is the button after the last group.
    expect(targets).toEqual(["toolbar", "rank0", "rank1", "rank2", "rank3", "rank4", "rank5", "more"]);
    expect(container.querySelector(".editor-toolbar")).toBe(live[0]!.observed[0]);
  });

  it("the More toggle flips data-more-open and aria-expanded on the toolbar", async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    const toolbar = container.querySelector(".editor-toolbar")!;
    expect(toolbar.getAttribute("data-more-open")).toBe("false");
    await user.click(screen.getByRole("button", { name: "More formatting" }));
    expect(toolbar.getAttribute("data-more-open")).toBe("true");
    expect(screen.getByRole("button", { name: "More formatting" })).toHaveAttribute("aria-expanded", "true");
    expect(normalizedHtml(toolbar)).toMatchSnapshot("toolbar with More open");
  });
});

/** ---- one toolbar snapshot per probe ----------------------------------------------------------- */

const PROBE_ACTIVE_VALUES: Record<string, unknown> = {
  codeBlockLanguage: "javascript",
  color: "#ff0000",
  backgroundColor: "#00ff00",
  fontFamily: FONT_FAMILY_OPTIONS.find((option) => option.value !== "")!.value,
  fontSize: FONT_SIZE_OPTIONS.find((option) => option.value !== "")!.value,
  lineHeight: LINE_HEIGHT_OPTIONS.find((option) => option.value !== "")!.value,
  characterCount: 1,
};

describe("PostEditor — toolbar with each probe active", () => {
  // `TOOLBAR_PROBES` is module-private; `TOOLBAR_DEFAULTS` has exactly one key per probe
  // (`PostEditor.toolbar-probes.unit.test.ts` pins that), so it is the loop source.
  const keys = Object.keys(TOOLBAR_DEFAULTS) as Array<keyof typeof TOOLBAR_DEFAULTS>;

  it("covers every probe the toolbar declares (the loop cannot silently shrink)", () => {
    expect(keys).toHaveLength(30);
  });

  it("baseline: defaults render the toolbar with nothing active", async () => {
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    expect(normalizedHtml(container.querySelector(".editor-toolbar")!)).toMatchSnapshot();
  });

  it.each(keys)("probe %s active", async (key) => {
    const active = key in PROBE_ACTIVE_VALUES ? PROBE_ACTIVE_VALUES[key] : true;
    probeOverride.current = { [key]: active };
    const { container } = await renderScreen(harness({ post: SAVED_POST }));
    expect(normalizedHtml(container.querySelector(".editor-toolbar")!)).toMatchSnapshot();
  });
});
