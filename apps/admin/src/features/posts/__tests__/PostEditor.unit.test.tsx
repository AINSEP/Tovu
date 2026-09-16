import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostEditor } from "../PostEditor";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";
import { api, type AdminPost } from "@/lib/api";

/**
 * jsdom omits `Range.getClientRects`/`Range.getBoundingClientRect` entirely (confirmed against the
 * installed jsdom: `Element.prototype.getClientRects` exists, `Range.prototype.getClientRects` does
 * not). Every describe block below that CLICKS a formatting-toolbar control drives a real TipTap
 * transaction, and TipTap's own `scrollIntoView` (`@tiptap/core`) calls `EditorView.coordsAtPos` →
 * `Range.getClientRects` on every dispatch, throwing `TypeError: target.getClientRects is not a
 * function` asynchronously (after the test's own assertions already ran, so it surfaces as an
 * unhandled rejection with a non-zero process exit, not a failing assertion). No prior suite in this
 * file ever clicked a toolbar control that moves the editor's own selection, which is why this gap
 * went unpolyfilled until now. Scoped to this file only (not the shared `src/__tests__/setup.ts`) —
 * purely additive (`typeof ... !== "function"` guards mean it never overrides a real implementation),
 * and no other suite in this package drives real TipTap transactions the way this file's real-editor
 * tests do.
 */
if (typeof Range.prototype.getClientRects !== "function") {
  // @ts-expect-error jsdom omission — see comment above
  Range.prototype.getClientRects = function () {
    return [];
  };
}
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  // No `@ts-expect-error` here, unlike `getClientRects` above: this stub's return value is
  // structurally a `DOMRect` already, so the assignment typechecks on its own.
  Range.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} };
  };
}

/**
 * @file `PostEditor` — pins three new/fixed user-visible behaviors from the forms/PostEditor deep
 * pass: (1) the one-click Publish action (draft-only, saves and sets status in one request), (2)
 * the Delete confirmation moving from a blocking `window.confirm` to the shared `ConfirmDialog`
 * modal, and (3) the "← Posts" back link's kind-awareness fix (it used to point at `/admin/posts`
 * even while editing a page). Follows the RTL harness `FormEditor.unit.test.tsx` established for
 * this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const DRAFT_POST = {
  id: "p1",
  workspaceId: "w1",
  kind: "post" as const,
  title: "Hello world",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
  status: "draft" as const,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const DRAFT_PAGE = { ...DRAFT_POST, id: "pg1", kind: "page" as const, title: "About", slug: "about" };

/**
 * Real-editor click tests (formatting toolbar) need an actual text paragraph in the body — TipTap's
 * default cursor position on mount lands in the FIRST body block, not the `title` node (confirmed
 * empirically: `PostTitleDocument`'s `"title block+"` content spec keeps `title` out of the `block`
 * group entirely, so `Selection.atStart(doc)` skips past it) — so an empty first paragraph (the
 * shared `DRAFT_POST` above, which every other describe block in this file already asserts against
 * unchanged) works fine for inline marks but leaves nothing for `characterCount` beyond the title.
 * Kept as its OWN fixture rather than changing `DRAFT_POST` itself, since that would shift the
 * existing "CharacterCount readout" test's "11 characters" assertion (title-only) out from under it.
 */
const DRAFT_POST_WITH_BODY_TEXT = {
  ...DRAFT_POST,
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body text here" }] }] },
};

const OTHER_MENTIONABLE_POST = { id: "p2", workspaceId: "w1", kind: "post" as const, title: "Other Post", slug: "other-post" };

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;
/** Per-test override for the active theme's `templates` list; `[]` disables the picker. */
let activeThemeTemplates: string[];
/** Per-test override for the mention picker's own list — `[]` (the default) keeps every pre-existing
 *  assertion in this file unchanged (empty/disabled picker); the new "mention picker" describe block
 *  below overrides it to exercise the populated-list render and insert paths. */
let mentionablePostsFixture: Array<{ id: string; workspaceId: string; kind: "post" | "page"; title: string; slug: string }>;

/** Per-test override for the standing-draft autosave recovery check's GET response — `null` (the
 *  default) keeps every pre-existing assertion in this file unchanged (no banner); the "standing-
 *  draft autosave recovery banner" describe block below seeds one. */
let autosaveFixture: {
  bodyFormat: "doc" | "html";
  bodyJson?: Record<string, unknown>;
  bodyHtml?: string;
  title: string;
  slug: string;
  baseVersion: number;
  savedAt: string;
  savedByPrincipalId: string;
} | null;

/** How many DELETE `.../autosave` calls this test has seen — the discard/post-save-clear proof. */
let autosaveDiscardCalls = 0;

beforeEach(() => {
  fetchMock = vi.fn();
  activeThemeTemplates = [];
  mentionablePostsFixture = [];
  autosaveFixture = null;
  autosaveDiscardCalls = 0;
  // `useWiredPostEditor` (2026-08-11: `useAdminLocale`/`POSTS_DICT` moved out of `PostEditor.tsx`
  // and into the hook, per the standing i18n rule — see `use-post-editor.hooks.ts`'s file header)
  // now reads `core.language.locale` (via `useAdminLocale`) to build its own bound `t`, a real
  // `fetch` call this file's tests never queued for. Routed here, ahead of `fetchMock`, so it never
  // consumes a slot from the post-load/save `mockResolvedValueOnce` sequence every test below still
  // queues on `fetchMock` itself unchanged. An empty settings response resolves `loadLanguage()` to
  // `DEFAULT_LOCALE` ("en"), matching every assertion below, which was already written against the
  // untranslated English strings.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    // Post-template-picker feature — `PostEditor`'s load effect now fetches presentation settings
    // in a `Promise.all` alongside the post. Routed here for the same reason `/settings/effective`
    // is: queued via `mockResolvedValueOnce` it would eat the slot each test below reserved for its
    // own save/publish response, and the post-load would resolve `undefined`. Defaults to an empty
    // template list, which keeps the picker in its disabled "no templates for this theme" state —
    // what every pre-existing assertion in this file was written against.
    if (url.includes("/presentation")) {
      return Promise.resolve(
        jsonResponse({
          settings: { activeThemeId: "basic" },
          availableThemeIds: [],
          availableThemes: [],
          activeThemeTemplates,
          activeThemeStaticPageIds: [],
        })
      );
    }
    // Mention feature (2026-08-11) — `use-post-editor.hooks.ts`'s own load effect now also fires
    // `port.listPosts()` on mount, a real `fetch` call this file's tests never queued for either.
    // Same reasoning as `/settings/effective`/`/presentation` just above: routed here, ahead of
    // `fetchMock`, so it never eats a slot from the post-load/save `mockResolvedValueOnce` sequence
    // every test below still queues on `fetchMock` itself, unchanged. Matched on the BARE
    // `/workspaces/{ws}/posts` URL with no id segment AND no explicit method — `createPost` hits the
    // same bare URL but as a `POST`, and every per-post call (`getPost`/`updatePost`/`deletePost`)
    // always has an `/{id}` suffix, so this cannot accidentally intercept either. Defaults to no
    // other posts, which keeps the mention picker in its empty/disabled state — what every
    // pre-existing assertion in this file was written against.
    if (/\/posts$/.test(url) && (init?.method ?? "GET") === "GET") {
      return Promise.resolve(jsonResponse({ posts: mentionablePostsFixture.map((post) => ({ post })) }));
    }
    // Standing-draft autosave (2026-09-06) — `usePostEditor`'s own mount-time recovery check (a GET)
    // and its post-save clear (a DELETE, fired-and-forgotten — see `use-post-editor.hooks.ts`'s
    // `save()`) are both real `fetch` calls no test below ever queued for. Same reasoning as
    // `/settings/effective`/`/presentation`/the mention list just above: routed here so they never
    // eat a slot from the post-load/save `mockResolvedValueOnce` sequence every test still queues on
    // `fetchMock` itself. Defaults to "nothing to recover"/"cleared ok" — no test in this file
    // exercises the recovery banner itself; that behavior is covered at the hook level
    // (`use-post-editor.hooks.unit.test.tsx`'s own "standing-draft autosave + recovery" block).
    if (url.includes("/autosave")) {
      if ((init?.method ?? "GET") === "GET") return Promise.resolve(jsonResponse({ autosave: autosaveFixture }));
      if (init?.method === "DELETE") autosaveDiscardCalls += 1;
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Added alongside the new "Formatting toolbar" describe blocks below, several of which
  // `vi.spyOn(window, "prompt")` per test — without this, a later test's fresh `vi.spyOn` wraps the
  // PRIOR test's still-active spy instead of the real `window.prompt`, so its own call count includes
  // every earlier test's calls too (confirmed: a "called once" assertion saw 3, then 6, accumulating
  // across tests in file order).
  vi.restoreAllMocks();
});

describe("Publish", () => {
  it("is offered for a draft post, saves and sets status to published in one request, then disappears", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }))
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, status: "published", version: 2 } }));

    render(<PostEditor postId="p1" />);

    const publishButton = await screen.findByRole("button", { name: /^publish$/i });
    await user.click(publishButton);

    expect(await screen.findByText(/published · version 2/i)).toBeInTheDocument();
    // One PUT for the publish, carrying status: "published" — not a second draft-preserving save.
    const publishCall = fetchMock.mock.calls[1];
    expect(publishCall[1]?.method).toBe("PUT");
    expect(JSON.parse(publishCall[1]?.body as string)).toMatchObject({ status: "published" });
    // Nothing left for Publish to do once the post is live.
    expect(screen.queryByRole("button", { name: /^publish$/i })).not.toBeInTheDocument();
  });

  it("is not offered for an already-published post", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, status: "published" } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    expect(screen.queryByRole("button", { name: /^publish$/i })).not.toBeInTheDocument();
  });
});

describe("Delete confirmation", () => {
  it("opens the ConfirmDialog instead of window.confirm, and only deletes on explicit confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    const deleteButton = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(deleteButton);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText(/move to trash\?/i)).toBeInTheDocument();
    // Scoped to the dialog itself (post-title-in-document feature, 2026-08-11): the post's title
    // now ALSO renders inside the canvas as the doc's own title node
    // (`use-post-editor.hooks.ts`/`lib/post-title-extension.ts`), so a page-wide `getByText` for
    // "hello world" is ambiguous — there are legitimately two matches now, not a regression in the
    // dialog's own copy, which is what this assertion actually means to check.
    const dialog = document.querySelector(".confirm-dialog") as HTMLElement;
    expect(within(dialog).getByText(/hello world/i)).toBeInTheDocument();

    // Cancel leaves the post untouched — no DELETE fetched. `ConfirmDialog` stays mounted (its own
    // doc comment: the caller toggles `open`, never conditionally renders it), so "closed" here
    // means the `<dialog>` loses its `open` attribute, not that its text leaves the DOM.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deletes and navigates away only after the dialog's own confirm action", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }))
      .mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await screen.findByText(/move to trash\?/i);
    await user.click(screen.getByRole("button", { name: /move to trash/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall[1]?.method).toBe("DELETE");
  });
});

describe("Title and slug fields — accessible names", () => {
  it("gives the title and slug fields a real accessible name, not just a placeholder", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    const titleInput = await screen.findByLabelText("Post title");
    expect(titleInput).toHaveAttribute("placeholder", "Post title");
    expect(screen.getByLabelText("URL slug")).toHaveValue("hello-world");
  });
});

describe("Formatting toolbar — alignment icons", () => {
  /**
   * Icons replacing the Left/Center/Right/Justify word labels (owner, 2026-08-11: "How come it
   * just doesn't use the icons? ... would be nice to have"). Mounts the REAL editor (not the
   * `editor: null` DI-seam used by the "Edit/Preview toolbar" describe block below) because
   * `Toolbar` only renders once TipTap has mounted — an icon-only button's accessible name comes
   * from `aria-label` alone (a screen reader ignores `title`), so this has to assert against a real
   * rendered button, not a stubbed controller that never renders `Toolbar` at all.
   */
  it("align buttons keep their accessible name via aria-label, with no visible text label left in the button", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    // Waits for the real TipTap editor to mount — `Toolbar` is null-gated on `editor` until then.
    await screen.findByTitle("Bold (⌘B)");

    for (const name of ["Align left", "Align center", "Align right", "Justify"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("title", name);
      expect(button.textContent).toBe(""); // icon only — an <svg aria-hidden>, no word label
    }
  });
});

describe("CharacterCount readout", () => {
  /**
   * Owner's "anything and everything" extension list (2026-08-11) — a live character count in the
   * toolbar. Mounts the real editor (same reasoning as the alignment-icons describe block above):
   * `editor.storage.characterCount` only exists once TipTap has actually mounted with the
   * extension registered. `DRAFT_POST`'s title, "Hello world", is 11 characters — synthesized into
   * the doc's title node by `withTitleNode` on load, with the fixture's own empty paragraph
   * contributing nothing — so this also incidentally proves the count reflects the WHOLE doc
   * (title node included), not just the body paragraphs.
   */
  it("shows the live character count once the editor has mounted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    expect(await screen.findByText("11 characters")).toBeInTheDocument();
  });

  it("uses the singular 'character' when the count is exactly 1", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ post: { ...DRAFT_POST, title: "H", bodyJson: { type: "doc", content: [{ type: "paragraph" }] } } }),
    );

    render(<PostEditor postId="p1" />);

    expect(await screen.findByText("1 character")).toBeInTheDocument();
  });
});

describe("Post load — error and loading states", () => {
  it("shows the error notice, not the loading placeholder, when the load fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    render(<PostEditor postId="p1" />);

    expect(await screen.findByText("network down")).toBeInTheDocument();
    expect(screen.queryByText(/loading editor/i)).not.toBeInTheDocument();
  });

  it("shows the loading placeholder before the post has loaded", () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    expect(screen.getByText(/loading editor/i)).toBeInTheDocument();
  });
});

/**
 * Formatting toolbar — click-driven command coverage. Mounts the REAL editor (same reasoning the
 * pre-existing "alignment icons"/"CharacterCount" blocks above already state) against
 * `DRAFT_POST_WITH_BODY_TEXT` so the default cursor position — the first BODY block, not the `title`
 * node, confirmed empirically — lands somewhere `toggleHeading`/`toggleBulletList`/etc. are
 * structurally valid (the `title` node is deliberately excluded from the `block` group, so a
 * block-level command issued from inside it silently no-ops).
 */
describe("Formatting toolbar — mark and block-type toggles", () => {
  it.each([
    ["Bold (⌘B)", "bold"],
    ["Italic (⌘I)", "italic"],
    ["Strikethrough", "strike"],
    ["Underline (⌘U)", "underline"],
    ["Highlight", "highlight"],
    ["Subscript", "subscript"],
    ["Superscript", "superscript"],
    ["Inline code", "code"],
    ["Heading 1", "h1"],
    ["Heading 2", "h2"],
    ["Heading 3", "h3"],
    ["Bullet list", "bullet"],
    ["Numbered list", "ordered"],
    ["Task list", "taskList"],
    ["Quote", "quote"],
    ["Code block", "codeBlock"],
  ])("clicking '%s' toggles its own aria-pressed state on", async (title) => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);

    const button = await screen.findByTitle(title);
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Formatting toolbar — alignment button clicks", () => {
  it.each(["Align left", "Align center", "Align right", "Justify"])(
    "clicking '%s' sets its own aria-pressed state on",
    async (name) => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
      render(<PostEditor postId="p1" />);

      const button = await screen.findByRole("button", { name });
      expect(button).toHaveAttribute("aria-pressed", "false");
      await user.click(button);
      expect(button).toHaveAttribute("aria-pressed", "true");
    },
  );
});

describe("Formatting toolbar — Link button", () => {
  it("applies a link when the prompt returns a URL", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    const link = await screen.findByTitle("Link");

    vi.spyOn(window, "prompt").mockReturnValueOnce("https://example.com");
    await user.click(link);

    expect(link).toHaveAttribute("aria-pressed", "true");
  });

  it("removes the link on a second click while it is already active", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    const link = await screen.findByTitle("Link");

    vi.spyOn(window, "prompt").mockReturnValueOnce("https://example.com");
    await user.click(link);
    expect(link).toHaveAttribute("aria-pressed", "true");

    await user.click(link);
    expect(link).toHaveAttribute("aria-pressed", "false");
  });

  it("does nothing when the URL prompt is cancelled", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    const link = await screen.findByTitle("Link");

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    await user.click(link);

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(link).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Formatting toolbar — text/background color", () => {
  it("setting a text color shows the clear button; clearing it removes the color and the button", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    const colorInput = screen.getByLabelText("Text color");
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    const clearButton = await screen.findByRole("button", { name: /clear text color/i });

    await user.click(clearButton);
    expect(screen.queryByRole("button", { name: /clear text color/i })).not.toBeInTheDocument();
  });

  it("setting a background color shows the clear button; clearing it removes the color and the button", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    const colorInput = screen.getByLabelText("Background color");
    fireEvent.change(colorInput, { target: { value: "#00ff00" } });
    const clearButton = await screen.findByRole("button", { name: /clear background color/i });

    await user.click(clearButton);
    expect(screen.queryByRole("button", { name: /clear background color/i })).not.toBeInTheDocument();
  });
});

describe("Formatting toolbar — font family/size/line height selects", () => {
  it.each([
    ["Font family", "ui-serif, Georgia, serif"],
    ["Font size", "14px"],
    ["Line height", "1.5"],
  ])("'%s' applies the chosen value, then reverts on 'Default'", async (label, someValue) => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    const select = screen.getByLabelText(label) as HTMLSelectElement;
    // Guard against a preset list change silently dropping this test's chosen option — an explicit
    // failure here is more useful than a false-pass "Default" no-op.
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain(someValue);

    await user.selectOptions(select, someValue);
    expect(select).toHaveValue(someValue);

    await user.selectOptions(select, "");
    expect(select).toHaveValue("");
  });
});

describe("Formatting toolbar — insert image by URL", () => {
  it("inserts a media-image node with the prompted src/alt", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    vi.spyOn(window, "prompt").mockReturnValueOnce("https://example.com/pic.png").mockReturnValueOnce("A picture");
    await user.click(screen.getByRole("button", { name: /img by url/i }));

    const img = await screen.findByRole("img", { name: "A picture" });
    expect(img).toHaveAttribute("src", "https://example.com/pic.png");
  });

  it("inserts nothing when the URL prompt is cancelled", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    await user.click(screen.getByRole("button", { name: /img by url/i }));

    expect(promptSpy).toHaveBeenCalledTimes(1); // never asked for alt text
    expect(document.querySelector(".media-image-node__preview")).not.toBeInTheDocument();
  });
});

describe("Formatting toolbar — insert YouTube video", () => {
  it("inserts a YouTube embed for a recognized URL", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    vi.spyOn(window, "prompt").mockReturnValueOnce("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: /youtube/i }));

    expect(document.querySelector("[data-youtube-video] iframe")).toBeInTheDocument();
  });

  it("inserts nothing when the URL prompt is cancelled", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    await user.click(screen.getByRole("button", { name: /youtube/i }));

    expect(document.querySelector("[data-youtube-video] iframe")).not.toBeInTheDocument();
  });
});

describe("Formatting toolbar — mention picker", () => {
  it("inserts a mention node for the chosen post, excluding the post being edited from the options", async () => {
    mentionablePostsFixture = [OTHER_MENTIONABLE_POST, { ...DRAFT_POST, workspaceId: "w1" }];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    const select = screen.getByLabelText("Mention a post") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "other-post"]); // current post excluded

    fireEvent.change(select, { target: { value: "other-post" } });
    expect(document.querySelector('[data-type="mention"]')).toBeInTheDocument();
  });

  it("does nothing when the selected slug matches no mentionable post", async () => {
    mentionablePostsFixture = [OTHER_MENTIONABLE_POST];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    const select = screen.getByLabelText("Mention a post") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "no-such-slug" } });

    expect(document.querySelector('[data-type="mention"]')).not.toBeInTheDocument();
  });
});

describe("Formatting toolbar — code block language picker", () => {
  it("choosing a language converts the current block to a code block set to that language", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    const codeBlockBtn = await screen.findByTitle("Code block");
    expect(codeBlockBtn).toHaveAttribute("aria-pressed", "false");

    const languageSelect = screen.getByLabelText("Code language") as HTMLSelectElement;
    await user.selectOptions(languageSelect, "python");

    expect(codeBlockBtn).toHaveAttribute("aria-pressed", "true");
    expect(languageSelect).toHaveValue("python");
  });
});

describe("Formatting toolbar — divider and table inserts", () => {
  it("Divider inserts a horizontal rule", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    await user.click(screen.getByTitle("Divider"));
    expect(document.querySelector(".ProseMirror hr")).toBeInTheDocument();
  });

  it("Table inserts a 3x3 table with a header row", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);
    await screen.findByTitle("Bold (⌘B)");

    await user.click(screen.getByTitle("Insert table"));
    expect(document.querySelector(".ProseMirror table")).toBeInTheDocument();
  });
});

describe("Formatting toolbar — Undo/Redo", () => {
  // `canRedo`/`canUndo` are read straight off `editor.can()` (`probeToolbar`), already pinned at the
  // probe level in `PostEditor.toolbar-probes.unit.test.ts` — this only needs to prove the two
  // buttons are wired to the right commands and reflect real history state, not re-verify a mark's
  // exact visual round-trip through a collapsed-cursor toggle (confirmed empirically unreliable to
  // assert on: TipTap's `storedMarks`-based toggle on an empty selection doesn't reliably restore
  // through `redo()` the way a real text-range mark change does — a `history`-plugin/storedMarks
  // interaction, not something this component's own click handlers control).
  it("Undo reverts the toggled mark and enables Redo; clicking Redo does not throw", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST_WITH_BODY_TEXT }));
    render(<PostEditor postId="p1" />);

    const bold = await screen.findByTitle("Bold (⌘B)");
    const redoBtn = screen.getByTitle("Redo (⌘⇧Z)");
    expect(redoBtn).toBeDisabled(); // nothing to redo yet

    await user.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByTitle("Undo (⌘Z)"));
    expect(bold).toHaveAttribute("aria-pressed", "false");
    expect(redoBtn).not.toBeDisabled(); // the undo just made a redo available

    await user.click(redoBtn);
  });
});

describe("Back-to-list link", () => {
  it("points at the Posts list for a post", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    const link = await screen.findByRole("link", { name: /posts/i });
    expect(link).toHaveAttribute("href", "/admin/posts");
  });

  it("points at the Pages list for a page — was hardcoded to Posts regardless of kind", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_PAGE }));

    render(<PostEditor postId="pg1" />);

    const link = await screen.findByRole("link", { name: /pages/i });
    expect(link).toHaveAttribute("href", "/admin/pages");
  });
});

/** The template picker shares the `combobox` role with the status select, so match its agent handle. */
function templateSelect(): HTMLSelectElement {
  const el = document.querySelector('[data-agent-element="post-template-choice"]');
  if (!(el instanceof HTMLSelectElement)) throw new Error("template picker not rendered");
  return el;
}

describe("Template picker", () => {
  /**
   * The picker's two non-obvious behaviors, both load-bearing for the site render:
   * a post with no saved choice must show the theme's FIRST template selected (never "No template
   * chosen"), and picking "No template chosen" must persist as `""` — not `null`. `""` is what the
   * render path reads as a deliberate opt-out; `null` means "never chosen" and falls back. A `||`
   * on the change handler collapses the two, which is how 11 published posts ended up serving a
   * diagnostic page.
   */
  it("defaults an unset post to the theme's first template rather than 'No template chosen'", async () => {
    activeThemeTemplates = ["blog-post.html", "long-form.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: null } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    const select = templateSelect();
    await waitFor(() => expect(select).toHaveValue("blog-post.html"));
  });

  // Characterization test (2026-08-20, `PostEditorToolbarEnd` extraction pass) — pins a branch that
  // had no prior coverage in this file: an `"html"`-format record (a Page routed through this same
  // `/admin/posts/{id}` screen — see `PostEditor.tsx`'s own file header) has nothing to pick a Post
  // template for, so the whole picker must not render at all, not just show empty/disabled.
  it("renders no template picker at all for an html-format record (a Page)", async () => {
    activeThemeTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_PAGE, bodyFormat: "html" } }));

    render(<PostEditor postId="pg1" />);

    await screen.findByRole("button", { name: /^save$/i });
    expect(document.querySelector(".editor-template-picker")).not.toBeInTheDocument();
  });

  it("the View Template button is disabled once 'No template chosen' is selected", async () => {
    const user = userEvent.setup();
    activeThemeTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    expect(screen.getByRole("button", { name: /view template/i })).toBeEnabled();
    await user.selectOptions(templateSelect(), "");
    expect(screen.getByRole("button", { name: /view template/i })).toBeDisabled();
  });

  it("clicking View Template opens the read-only modal for the selected template", async () => {
    const user = userEvent.setup();
    activeThemeTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        // 2026-08-19 architecture audit finding 1: every real static theme (`basic` included) is
        // `apiVersion: 2`, whose page templates live under `render/pages/`, not `pages/` — pinned
        // exactly here (not just `includes("/theme-assets/")`) so this end-to-end test would have
        // caught the original bug (a v1-only fetch URL that 404s for every v2 theme).
        if (url === "/theme-assets/basic/render/pages/blog-post.html") {
          return Promise.resolve(new Response("<p>hi</p>", { status: 200 }));
        }
        if (url.includes("/theme-assets/")) return Promise.resolve(new Response("not found", { status: 404 }));
        if (url.includes("/settings/effective")) return Promise.resolve(jsonResponse({ data: [] }));
        if (url.includes("/presentation")) {
          return Promise.resolve(
            jsonResponse({
              settings: { activeThemeId: "basic" },
              availableThemeIds: [],
              availableThemes: [{ id: "basic", tier: "static", apiVersion: 2 }],
              activeThemeTemplates,
              activeThemeStaticPageIds: [],
            }),
          );
        }
        return fetchMock(input);
      }),
    );

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    await user.click(screen.getByRole("button", { name: /view template/i }));

    // "blog-post.html" also appears as the picker's own <option> text, so scope to the modal's
    // title node specifically rather than a bare `findByText` (which errors on the ambiguity).
    await waitFor(() => expect(document.querySelector("[data-preview-modal-title]")).toHaveTextContent("blog-post.html"));
    expect(await screen.findByText("<p>hi</p>")).toBeInTheDocument();
  });

  it('persists an explicit "No template chosen" as "" so the opt-out is distinguishable from never-chosen', async () => {
    const user = userEvent.setup();
    activeThemeTemplates = ["blog-post.html"];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }))
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "", version: 2 } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    await user.selectOptions(templateSelect(), "");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(body.templateChoice).toBe("");
    expect(body.templateChoice).not.toBeNull();
  });
});

/**
 * Edit/Preview toolbar (2026-08-11) — drives `PostEditor` through the `usePostEditorHook` DI seam
 * rather than `fetch` mocks, same convention `PageEditor.unit.test.tsx` established for its own
 * "view toggle" suite: this is about `PostEditor`'s own tab-switching wiring and preview-eligibility
 * branching, not `usePostEditor`'s internals, and the seam already exists for exactly this. `editor:
 * null` throughout — none of these tests need a mounted TipTap instance (`EditorContent`/`Toolbar`
 * both already null-gate on it), and stubbing it keeps the suite fast, matching `PostEditorProps`'s
 * own doc comment on why the seam exists.
 */
function postController(overrides: Partial<PostEditorController> = {}): PostEditorController {
  const post = overrides.post ?? (DRAFT_POST as AdminPost);
  const templateChoice = overrides.templateChoice ?? null;
  // Computed ahead of the returned object so the derived `onX` handlers below (the UI-subhook
  // fields, `usePostEditorUi`'s own real wiring — see that hook's file header) forward to
  // whichever `save`/`setConfirmingDelete`/`setShowTemplateModal` mock a test actually overrode,
  // same as the real hook composing them from its own live values.
  const save = overrides.save ?? vi.fn();
  const setConfirmingDelete = overrides.setConfirmingDelete ?? vi.fn();
  const setShowTemplateModal = overrides.setShowTemplateModal ?? vi.fn();
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
    templateChoice,
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
    // Preview fullscreen, Level 1 (2026-09-15) — `false`/no-op by default so every pre-existing test
    // in this file (written before this field existed) keeps seeing the collapsed, byte-for-byte
    // unchanged pane. The "Preview fullscreen" describe block below overrides both.
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
    // Defaults to the SAME shape `defaultPostEditorPort.templatePreviewUrl` produces (the real
    // `api.templatePreviewUrl`), so the pre-existing "Edit/Preview toolbar" characterization tests
    // below — written when `PostPreview` called `api.templatePreviewUrl` itself — still see realistic
    // URLs without restating that logic. Mirrors `PageEditor.unit.test.tsx`'s identical fixture.
    templatePreviewUrl: post ? api.templatePreviewUrl(post.id, templateChoice) : "",
    // `null` by default, matching `editor: null` above — see this describe block's own comment on
    // why a `null` `bodyJson` means the debounced auto-submit effect never fires in this DI harness.
    bodyJson: null,
    showTemplateModal: false,
    setShowTemplateModal,
    previewFormRef: { current: null },
    previewFormTarget: post ? `post-preview-pending-${post.id}` : "",
    save,
    // Standing-draft autosave (2026-09-06). Present because `PostEditorController` requires them,
    // not because this DI harness exercises the recovery banner — `recoverableDraft: null` is the
    // "nothing parked", banner-not-rendered case every test in this file wants.
    recoverableDraft: null,
    restoreRecoveredDraft: vi.fn(),
    discardRecoveredDraft: vi.fn(),
    // Stale basis (2026-09-06). `null` is "autosave is healthy", so the notice never renders in the
    // pre-existing tests here — its own suite below overrides it.
    autosaveStaleBasis: null,
    // Optimistic concurrency (2026-09-06) — same reasoning as the autosave three just above:
    // `saveConflict: null` is "no conflict", so `PostVersionConflictBanner` never renders here.
    saveConflict: null,
    saveOverwritingConflict: vi.fn(),
    dismissSaveConflict: vi.fn(),
    remove: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  };
}

function renderPostEditor(overrides: Partial<PostEditorController> = {}) {
  const ctrl = postController(overrides);
  const usePostEditorHook = () => ctrl;
  const utils = render(<PostEditor postId="p1" usePostEditorHook={usePostEditorHook} />);
  return { ctrl, ...utils };
}

describe("Edit/Preview toolbar", () => {
  it("marks the active view tab as selected", () => {
    renderPostEditor({ view: "edit" });
    expect(screen.getByRole("tab", { name: "Editor" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "false");
  });

  it("clicking the Preview tab calls setView('preview')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ view: "edit" });
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(ctrl.setView).toHaveBeenCalledWith("preview");
  });

  it("clicking the Edit tab calls setView('edit')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ view: "preview" });
    await user.click(screen.getByRole("tab", { name: "Editor" }));
    expect(ctrl.setView).toHaveBeenCalledWith("edit");
  });

  it("renders the Tiptap body editor, not the preview iframe, in edit view", () => {
    renderPostEditor({ view: "edit" });
    expect(document.querySelector('[data-agent-element="post-body"]')).toBeInTheDocument();
    expect(screen.queryByTitle("Post preview")).not.toBeInTheDocument();
  });

  it("renders the preview iframe, not the Tiptap body editor, in preview view", () => {
    renderPostEditor({ view: "preview" });
    expect(screen.getByTitle("Post preview")).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="post-body"]')).not.toBeInTheDocument();
  });

  // 2026-08-11: mirrors `PageEditor.tsx`'s own live-vs-fallback preview rule (see `PostPreview`'s
  // doc comment in `PostEditor.tsx`) — a published, un-dirtied post iframes its real public URL;
  // anything else falls back to a rendering of the editor buffer with a notice explaining why.
  it("preview iframes the real public URL when the post is published and has no unsaved changes", () => {
    renderPostEditor({ view: "preview", status: "published", dirty: false, contentDirty: false, slug: "hello-world" });
    const preview = screen.getByTitle("Post preview");
    expect(preview).toHaveAttribute("src", expect.stringContaining("/hello-world"));
    expect(screen.queryByText(/preview them with the theme/i)).not.toBeInTheDocument();
  });

  // Owner-reported bug (2026-09-11): "the preview should always show the css and template and all
  // that properly." `canShowTemplatePreview` still requires `status === "published"` (a draft's own
  // `{"type":"content"}` slot does not survive the shared render pipeline's visibility-filtered
  // "content" resolver on a plain `GET` — confirmed live in `admin-post-template-preview.test.ts`'s
  // own draft case), so a clean draft still can't take branch 2. But it MUST take branch 3 now
  // (POSTed `bodyJson` bypasses that same visibility guard for this one id) rather than fall through
  // to the raw editor-buffer sandbox that branch used to be gated behind `contentDirty` for — this is
  // the exact regression this test used to lock in as "intended" before the fix (see
  // `post-editor-preview-branches.spec.ts`'s own e2e equivalent for the real-browser proof, including
  // that the real media in the body renders too, not just the chrome).
  it("preview shows the themed live-template render, via the POSTed pending-content branch, for a CLEAN draft post — not the raw editor-buffer fallback", () => {
    renderPostEditor({ view: "preview", status: "draft", dirty: false, contentDirty: false });
    const preview = screen.getByTitle("Post preview");
    expect(preview, "a clean draft must not resolve to a real src (branches 1/2 both require different things this scenario lacks)").not.toHaveAttribute("src");
    expect(preview, "and must not fall back to SrcDocSandbox's srcdoc-based raw render either").not.toHaveAttribute("srcdoc");

    const form = document.querySelector("form[method='post']");
    expect(form, "a clean draft must reach the same hidden-form POST branch a dirty draft/post does").not.toBeNull();
    expect(form).toHaveAttribute("action", expect.stringContaining("/p1/template-preview"));
    expect(screen.queryByText(/publish this post to preview it with the theme/i), "the old rough-render notice must never show again").not.toBeInTheDocument();
    expect(screen.getByText(/previewing your unsaved edits through the live template/i)).toBeInTheDocument();
  });

  // Template-preview fix (2026-08-11) — the reported bug's exact repro: picking a DIFFERENT template
  // on an otherwise-untouched published post. `dirty` is correctly `true` (an unsaved `templateChoice`
  // change), but `contentDirty` stays `false` — this must show a real templated render, not the
  // editor-buffer sandbox. Before the fix, `dirty` alone gated the fallback, so switching templates
  // rendered unstyled and looked identical across every template (the fallback never read
  // `templateChoice`).
  it("preview shows a real templated render, with the pending template in the URL, when only the template choice is dirty on a published post", () => {
    renderPostEditor({
      view: "preview",
      status: "published",
      dirty: true,
      contentDirty: false,
      templateChoice: "blog-post.html",
    });
    const preview = screen.getByTitle("Post preview");
    expect(preview).toHaveAttribute("src", expect.stringContaining("/p1/template-preview"));
    expect(preview).toHaveAttribute("src", expect.stringContaining("templateChoice=blog-post.html"));
    expect(screen.getByText(/save to update the live post/i)).toBeInTheDocument();
  });

  // Pending-content preview fix (2026-08-12, the owner's own reported bug) — a published post with
  // unsaved BODY edits (`contentDirty: true`) used to fall all the way to the raw `SrcDocSandbox`
  // fallback (no `src`, a `srcDoc` string instead). It now gets its OWN themed branch: neither `src`
  // nor `srcDoc` is set directly (see `PostPreview`'s own doc, branch 3) — instead a hidden
  // `<form method="post" target="{iframe name}">` is rendered alongside the iframe, ready to carry
  // `bodyJson` into it. `editor: null` in this DI harness means the debounced auto-submit effect
  // never fires (it bails out on a `null` `bodyJson` — see `PostPreview`'s effect), so this only
  // asserts the static markup shape, not a real navigation; `post-editor-preview-branches.spec.ts`
  // covers the real submit+navigate behavior end to end in a browser.
  it("preview shows a themed live-template render, carried via a hidden form POST, when the post body itself has unsaved edits", () => {
    renderPostEditor({ view: "preview", status: "published", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Post preview");
    expect(preview).not.toHaveAttribute("src");
    expect(preview).not.toHaveAttribute("srcdoc");
    const previewName = preview.getAttribute("name");
    expect(previewName).toBeTruthy();

    // The hidden form's `target` must match the iframe's `name` exactly — that's what routes a form
    // submit into it instead of the top-level document.
    const form = document.querySelector("form[method='post']");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("target", previewName as string);
    expect(form).toHaveAttribute("action", expect.stringContaining("/p1/template-preview"));

    expect(screen.getByText(/previewing your unsaved edits through the live template/i)).toBeInTheDocument();
  });

  // 2026-09-09 widening — a DIRTY draft now gets the same themed POST-form preview a dirty published
  // post does (branch 3), not the rough editor-buffer fallback (branch 4): `template-preview.ts`'s
  // `pendingBodyJson` override already bypassed the visibility guard for a draft's own id, so
  // `status === "published"` was never load-bearing for this branch's correctness.
  it("preview shows the same themed live-template render for a draft post with unsaved edits, not the raw editor buffer", () => {
    renderPostEditor({ view: "preview", status: "draft", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Post preview");
    expect(preview).not.toHaveAttribute("src");
    expect(preview).not.toHaveAttribute("srcdoc");
    const form = document.querySelector("form[method='post']");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("action", expect.stringContaining("/p1/template-preview"));
    expect(screen.getByText(/previewing your unsaved edits through the live template/i)).toBeInTheDocument();
  });

  // Visibility-gap fix — mirrors `PageEditor.tsx`'s own equivalent test in
  // `pages/__tests__/PageEditor.unit.test.tsx` ("places the raw-body-fallback notice BEFORE the preview
  // frame"), which fixed this exact gap for Pages on 2026-08-11 but was never ported to Posts. A
  // brand-new post is always a draft, so this is the very first thing an operator sees in Preview —
  // now the pending-content notice, not the retired raw-fallback one (2026-09-11) — and it must render
  // BEFORE `.post-editor-pane`, not after: `main.admin-content`'s internal scroll container hid a
  // notice placed after the (previously full-pane-height) fallback (confirmed live, QA dispatch
  // 2026-09-06). Asserts DOM order, not mere presence — presence alone already passed before that fix;
  // the bug was the notice being unreachable, not missing.
  it("places the pending-content-preview notice BEFORE the preview frame, not after, so it's visible without scrolling", () => {
    renderPostEditor({ view: "preview", status: "draft", dirty: false, contentDirty: false });
    const notice = screen.getByText(/previewing your unsaved edits through the live template/i);
    const preview = screen.getByTitle("Post preview");
    expect(notice.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The template picker is a publish-time setting, not tab-specific content — it has to survive the
  // toolbar restructure (2026-08-11: moved out of its own `.editor-slug-row` into this toolbar's
  // right-hand side) and stay visible regardless of which tab is active.
  it("keeps the template picker visible in preview view, not just edit view", () => {
    renderPostEditor({ view: "preview", availableTemplates: ["blog-post.html"], templateChoice: "blog-post.html" });
    expect(document.querySelector('[data-agent-element="post-template-choice"]')).toBeInTheDocument();
  });

  // Agent reach (2026-09-15) — `page.find_elements`/`page.click` match on `data-agent-element`
  // only, never CSS selectors or visible text (`@jini-ai/agentic`'s own element-handles module), so
  // these tabs were unreachable by the assistant before this tag existed even though a human could
  // already click them — see `post-editor-agent-drive.unit.test.tsx` for the real-driver proof this
  // characterizes only the markup for.
  it("tags the Editor and Preview tabs with agentHandles", () => {
    renderPostEditor({ view: "edit" });
    expect(document.querySelector('[data-agent-element="post-view-edit"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="post-view-preview"]')).toBeInTheDocument();
  });
});

/**
 * Preview fullscreen, Level 1 (2026-09-15) — `ADS-memory/.local-artifacts/handoffs/
 * 2026-09-15-preview-fullscreen-PLAN.md` §1.4, as revised by `a380c716`. `previewExpanded`/
 * `togglePreviewExpanded` themselves are `usePostEditor`'s own state (covered in
 * `use-post-editor.hooks.unit.test.tsx`); these tests are about `PostEditor`'s rendering decision
 * given that state, through the same DI seam the "Edit/Preview toolbar" suite above already uses.
 *
 * `a380c716` replaced TWO controls (a toolbar button labelled "Expand to full width" + the expanded
 * panel's own "Exit full width" header button) with ONE translucent control floating on the preview
 * itself, `.post-preview-fab`, rendered in the same place in BOTH states. That is the whole point of
 * the change and the property this suite exists to defend: the way out is always visible. An earlier
 * overlay attempt was killed by an operator who could not see how to get back.
 *
 * Queried by accessible name rather than class wherever the name IS the contract — it is what both
 * an operator's screen reader and `page.find_elements` read to tell which way the toggle goes. The
 * class is asserted only where the class itself is load-bearing (`.post-preview-surface` is the
 * `position: relative` ancestor the fab's `position: absolute` resolves against, see `editor.css`).
 */
describe("Preview fullscreen — Level 1 expand toggle", () => {
  it("renders no fullscreen control in Editor view — expanding only makes sense for the rendered preview", () => {
    renderPostEditor({ view: "edit" });
    expect(screen.queryByRole("button", { name: "Show full screen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exit full screen" })).not.toBeInTheDocument();
    expect(document.querySelector(".post-preview-fab")).not.toBeInTheDocument();
  });

  it("renders the fullscreen control on the preview while collapsed", () => {
    renderPostEditor({ view: "preview", previewExpanded: false });
    expect(screen.getByRole("button", { name: "Show full screen" })).toHaveClass("post-preview-fab");
  });

  it("clicking the collapsed control calls togglePreviewExpanded", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ view: "preview", previewExpanded: false });
    await user.click(screen.getByRole("button", { name: "Show full screen" }));
    expect(ctrl.togglePreviewExpanded).toHaveBeenCalledTimes(1);
  });

  // The regression `a380c716` exists to prevent: the previous shape hid the toggle once expanded and
  // relied on a separate header button to get back. If this test ever fails because the control is
  // absent while expanded, the operator is trapped in a full-screen panel with no visible exit.
  it("renders the SAME control while expanded — the way out is always on screen", () => {
    renderPostEditor({ view: "preview", previewExpanded: true });
    expect(screen.getByRole("button", { name: "Exit full screen" })).toHaveClass("post-preview-fab");
  });

  it("clicking the expanded control calls togglePreviewExpanded", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ view: "preview", previewExpanded: true });
    await user.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(ctrl.togglePreviewExpanded).toHaveBeenCalledTimes(1);
  });

  // One control, two directions: the ONLY thing distinguishing them is the accessible name (the glyph
  // is `aria-hidden`). Both an operator on a screen reader and an agent reading `page.find_elements`
  // depend on this to know which way the toggle goes, so assert the names are mutually exclusive
  // rather than merely present.
  it("names the control for the direction it goes, and never both ways at once", () => {
    const collapsed = renderPostEditor({ view: "preview", previewExpanded: false });
    expect(screen.getByRole("button", { name: "Show full screen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exit full screen" })).not.toBeInTheDocument();
    collapsed.unmount();

    renderPostEditor({ view: "preview", previewExpanded: true });
    expect(screen.getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show full screen" })).not.toBeInTheDocument();
  });

  // Esc is the second way out (`usePostEditor`'s own key handler). The tooltip is where an operator
  // who found the icon learns that, so it is part of the shipped contract, not decoration.
  it("advertises Esc in the expanded control's tooltip", () => {
    renderPostEditor({ view: "preview", previewExpanded: true });
    expect(screen.getByRole("button", { name: "Exit full screen" })).toHaveAttribute(
      "title",
      "Exit full screen (Esc)",
    );
  });

  it("collapsed view renders the preview pane with no .post-preview-expanded wrapper", () => {
    renderPostEditor({ view: "preview", previewExpanded: false });
    expect(document.querySelector(".post-preview-expanded")).not.toBeInTheDocument();
    expect(screen.getByTitle("Post preview")).toBeInTheDocument();
  });

  it("expanded view wraps the pane AND the control in .post-preview-expanded", () => {
    renderPostEditor({ view: "preview", previewExpanded: true });
    const wrapper = document.querySelector(".post-preview-expanded");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.querySelector('[title="Post preview"]')).not.toBeNull();
    expect(wrapper?.contains(screen.getByRole("button", { name: "Exit full screen" }))).toBe(true);
  });

  // `.post-preview-surface` is the fab's positioning ancestor (`position: relative` in `editor.css`).
  // Hoist the fab out of it and `position: absolute; top/right` resolves against some far outer box
  // instead — the icon lands somewhere unrelated on screen, which jsdom cannot see. Pinning the
  // nesting is the part of that contract a unit test CAN hold.
  it("nests the control inside .post-preview-surface — its positioning ancestor — in both states", () => {
    const collapsed = renderPostEditor({ view: "preview", previewExpanded: false });
    expect(screen.getByRole("button", { name: "Show full screen" }).parentElement).toHaveClass(
      "post-preview-surface",
    );
    collapsed.unmount();

    renderPostEditor({ view: "preview", previewExpanded: true });
    expect(screen.getByRole("button", { name: "Exit full screen" }).parentElement).toHaveClass(
      "post-preview-surface",
    );
  });

  // Exactly ONE, never two. The old shape mounted two separate buttons sharing this handle and was
  // safe only because they were mutually exclusive; the current shape renders one element in both
  // states. A second copy would make `page.click` ambiguous for the assistant.
  it.each<[string, boolean]>([
    ["collapsed", false],
    ["expanded", true],
  ])("tags exactly one post-preview-expand agentHandle while %s", (_label, previewExpanded) => {
    renderPostEditor({ view: "preview", previewExpanded });
    expect(document.querySelectorAll('[data-agent-element="post-preview-expand"]')).toHaveLength(1);
  });
});

/**
 * Slug-collision override, tri-state (2026-08-15) — a two-state checkbox can no longer represent
 * `overridesThemePage`'s three real states (`null`/`true`/`false`), so the control became a
 * `<select>`. These pin the value<->option mapping and the copy change (the notice used to claim the
 * theme page wins by default, which is now false) — nothing here exercises `usePostEditor` itself
 * (that hook's own tri-state plumbing is covered by `use-post-editor.hooks.unit.test.tsx`), only that
 * `PostEditor` renders and drives the control correctly for a given controller state.
 */
describe("Slug-collision override (tri-state)", () => {
  it("renders nothing when there is no slug collision", () => {
    renderPostEditor({ hasSlugCollision: false });
    expect(document.querySelector('[data-agent-element="post-override-theme-page"]')).not.toBeInTheDocument();
  });

  it("selects 'Use the default' when overridesThemePage is null (never decided)", () => {
    renderPostEditor({ hasSlugCollision: true, overridesThemePage: null });
    const select = document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("default");
    // The copy must no longer claim the theme page wins by default — that became false 2026-08-15.
    expect(screen.getByText(/this post is shown at that url instead of the theme's page/i)).toBeInTheDocument();
  });

  it("selects 'Always show this post' when overridesThemePage is explicitly true", () => {
    renderPostEditor({ hasSlugCollision: true, overridesThemePage: true });
    const select = document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement;
    expect(select.value).toBe("post");
  });

  it("selects \"Always show the theme's page\" when overridesThemePage is explicitly false", () => {
    renderPostEditor({ hasSlugCollision: true, overridesThemePage: false });
    const select = document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement;
    expect(select.value).toBe("theme");
  });

  it("choosing 'Use the default' calls setOverridesThemePage(null), not false", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ hasSlugCollision: true, overridesThemePage: true });
    await user.selectOptions(
      document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement,
      "default"
    );
    expect(ctrl.setOverridesThemePage).toHaveBeenCalledWith(null);
  });

  it("choosing 'Always show this post' calls setOverridesThemePage(true)", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ hasSlugCollision: true, overridesThemePage: null });
    await user.selectOptions(
      document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement,
      "post"
    );
    expect(ctrl.setOverridesThemePage).toHaveBeenCalledWith(true);
  });

  it("choosing \"Always show the theme's page\" calls setOverridesThemePage(false)", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ hasSlugCollision: true, overridesThemePage: null });
    await user.selectOptions(
      document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement,
      "theme"
    );
    expect(ctrl.setOverridesThemePage).toHaveBeenCalledWith(false);
  });
});

/**
 * Header wiring — the back-link's `confirmLeave()` guard, and the status select — driven through the
 * same `renderPostEditor`/DI-seam convention the two describe blocks above already establish, rather
 * than a `fetch`-mocked full render: this is about `PostEditorHeader`'s own click/change wiring, not
 * `usePostEditor`'s internals.
 */
describe("Header — back-link confirmLeave guard and status select", () => {
  it("does not prevent the back-link navigation when confirmLeave() returns true", async () => {
    const confirmLeave = vi.fn(() => true);
    renderPostEditor({ confirmLeave });
    const link = screen.getByRole("link", { name: /posts/i });

    const notPrevented = fireEvent.click(link);

    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(true); // event.preventDefault() was NOT called
  });

  it("prevents the back-link navigation when confirmLeave() returns false", async () => {
    const confirmLeave = vi.fn(() => false);
    renderPostEditor({ confirmLeave });
    const link = screen.getByRole("link", { name: /posts/i });

    const notPrevented = fireEvent.click(link);

    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false); // event.preventDefault() WAS called
  });

  it("changing the status select calls setStatus with the new value", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ status: "draft" });

    const statusSelect = document.querySelector('[data-agent-element="post-status"]') as HTMLSelectElement;
    expect(statusSelect).toBeInTheDocument();
    await user.selectOptions(statusSelect, "published");

    expect(ctrl.setStatus).toHaveBeenCalledWith("published");
  });
});

describe("Title and slug fields — typing calls setTitle/setSlug", () => {
  it("typing in the title field calls setTitle with the field's new value", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ title: "Hello world" });

    await user.type(screen.getByLabelText("Post title"), "!");

    expect(ctrl.setTitle).toHaveBeenCalled();
  });

  it("typing in the slug field calls setSlug with the field's new value", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ slug: "hello-world" });

    await user.type(screen.getByLabelText("URL slug"), "x");

    expect(ctrl.setSlug).toHaveBeenCalled();
  });
});

describe("Template picker — theme with zero templates", () => {
  it("renders a disabled 'no templates for this theme' select instead of hiding the row", () => {
    renderPostEditor({ availableTemplates: [] });

    const select = templateSelect();
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent(/no templates for this theme/i);
  });
});

/**
 * Standing-draft autosave — the STALE-BASIS notice (2026-09-06). Distinct from the recovery banner
 * (`recoverableDraft`, work found parked from a PREVIOUS session) and from `PostVersionConflictBanner`
 * (an explicit Save the server rejected): this one reports that BACKGROUND autosaving has stopped
 * for the session happening right now. `usePostEditor` decides when (`autosaveStaleBasis`) and
 * `rules.ts` decides what it says; this proves the component renders it at all, which is precisely
 * the gap that existed — the shared hook recorded the refusal and no editor consumed it, so the
 * operator was told nothing until they reloaded.
 *
 * Mirrors `features/pages/__tests__/PageEditor.unit.test.tsx`'s identical suite: both editors share
 * the hook, so a notice in only one of them leaves the other silently dropping work.
 */
describe("standing-draft autosave stale-basis notice", () => {
  const STALE = {
    baseVersion: 3,
    draft: {
      bodyFormat: "doc" as const,
      bodyJson: { type: "doc", content: [] },
      title: "Still being typed",
      slug: "hello-world",
      baseVersion: 3,
    },
  };

  it("renders nothing while autosave is healthy", () => {
    renderPostEditor({ autosaveStaleBasis: null });
    expect(screen.queryByText(/someone else saved this/i)).not.toBeInTheDocument();
  });

  it("tells the operator autosaving has paused, their work is unsaved, and it is still in the editor", () => {
    renderPostEditor({ autosaveStaleBasis: STALE });
    const notice = screen.getByText(/someone else saved this while you were editing/i);
    expect(notice).toHaveTextContent(/version 3/);
    expect(notice).toHaveTextContent(/autosaving has paused/i);
    expect(notice).toHaveTextContent(/were NOT saved/);
    expect(notice).toHaveTextContent(/still here in the editor/i);
  });

  /** Deliberately no Dismiss, and deliberately no Reload button — see `PostAutosaveStaleBanner`'s
   *  own doc. This asserts the absence, because "add a Dismiss" is the obvious next change and it
   *  would put the operator back in the silent state this whole fix exists to end. */
  it("offers no button that could silence it or discard the operator's text", () => {
    renderPostEditor({ autosaveStaleBasis: STALE });
    const region = document.querySelector('[data-agent-element="post-autosave-stale"]');
    expect(region).not.toBeNull();
    expect(region!.querySelectorAll("button")).toHaveLength(0);
  });
});
