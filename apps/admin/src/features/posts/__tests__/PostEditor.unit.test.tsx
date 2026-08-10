import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostEditor } from "../PostEditor";

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

let fetchMock: ReturnType<typeof vi.fn>;
/** Per-test override for the active theme's `postTemplate` list; `[]` disables the picker. */
let activeThemePostTemplates: string[];

beforeEach(() => {
  fetchMock = vi.fn();
  activeThemePostTemplates = [];
  // `PostEditor` now also reads `core.language.locale` (via `useAdminLocale`) to translate its own
  // chrome — a real `fetch` call this file's tests never queued for. Routed here, ahead of
  // `fetchMock`, so it never consumes a slot from the post-load/save `mockResolvedValueOnce`
  // sequence every test below still queues on `fetchMock` itself unchanged. An empty settings
  // response resolves `loadLanguage()` to `DEFAULT_LOCALE` ("en"), matching every assertion below,
  // which was already written against the untranslated English strings.
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
          activeThemePostTemplates,
          activeThemeStaticPageIds: [],
        })
      );
    }
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(screen.getByText(/hello world/i)).toBeInTheDocument();

    // Cancel leaves the post untouched — no DELETE fetched. `ConfirmDialog` stays mounted (its own
    // doc comment: the caller toggles `open`, never conditionally renders it), so "closed" here
    // means the `<dialog>` loses its `open` attribute, not that its text leaves the DOM.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    const dialog = document.querySelector(".confirm-dialog");
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
    activeThemePostTemplates = ["blog-post.html", "long-form.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: null } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    const select = templateSelect();
    await waitFor(() => expect(select).toHaveValue("blog-post.html"));
  });

  it("the View Template button is disabled once 'No template chosen' is selected", async () => {
    const user = userEvent.setup();
    activeThemePostTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    expect(screen.getByRole("button", { name: /view template/i })).toBeEnabled();
    await user.selectOptions(templateSelect(), "");
    expect(screen.getByRole("button", { name: /view template/i })).toBeDisabled();
  });

  it("clicking View Template opens the read-only modal for the selected template", async () => {
    const user = userEvent.setup();
    activeThemePostTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/theme-assets/")) return Promise.resolve(new Response("<p>hi</p>", { status: 200 }));
        if (url.includes("/settings/effective")) return Promise.resolve(jsonResponse({ data: [] }));
        if (url.includes("/presentation")) {
          return Promise.resolve(
            jsonResponse({
              settings: { activeThemeId: "basic" },
              availableThemeIds: [],
              availableThemes: [{ id: "basic", tier: "static" }],
              activeThemePostTemplates,
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
    activeThemePostTemplates = ["blog-post.html"];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }))
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "", version: 2 } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    await user.selectOptions(templateSelect(), "");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body.templateChoice).toBe("");
    expect(body.templateChoice).not.toBeNull();
  });
});
