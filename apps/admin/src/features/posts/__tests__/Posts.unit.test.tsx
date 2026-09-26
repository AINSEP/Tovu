import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Posts, postsListNotice } from "../Posts";
import type { PostsController } from "../hooks/use-posts.hooks";
import { buildPostRowMenuHandleMap } from "../rules";
import { navigate } from "@/lib/router";
import type { AdminPost } from "@/lib/api";

/**
 * @file `Posts` — markup-only list screen, twin of `features/pages/Pages.tsx`. Had NO test file
 * before this pass (2026-08-06, complexity pass, fourth pass — `postsListNotice`'s extraction out
 * of `Posts` needed characterisation coverage first per the brief's coverage rule). Mirrors
 * `Pages.unit.test.tsx` case-for-case, driven through the injectable `usePostsHook` seam
 * (`Posts.tsx`'s own doc comment on `PostsProps`), so every state — loading, error-before-load,
 * error-after-load, empty, mid-delete — is reached directly rather than through a real `fetch`.
 */

vi.mock("../../../lib/router", () => ({ navigate: vi.fn() }));

const POST: AdminPost = {
  id: "p1",
  workspaceId: "w1",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T12:34:00.000Z",
  version: 1,
};

const DRAFT_POST: AdminPost = { ...POST, id: "p2", title: "Draft Post", slug: "draft-post", status: "draft" };

function controller(overrides: Partial<PostsController> = {}): PostsController {
  const posts = overrides.posts !== undefined ? overrides.posts : [POST];
  return {
    posts: [POST],
    error: null,
    creating: false,
    rowSavingId: null,
    pendingDelete: null,
    setPendingDelete: vi.fn(),
    createPost: vi.fn(async () => {}),
    togglePostPublish: vi.fn(async () => {}),
    removePost: vi.fn(async () => {}),
    rowMenuHandleById: buildPostRowMenuHandleMap(posts),
    ...overrides,
  };
}

function renderWith(overrides: Partial<PostsController> = {}) {
  const c = controller(overrides);
  const usePostsHook = () => c;
  render(<Posts usePostsHook={usePostsHook} />);
  return c;
}

describe("loading and error-before-load states", () => {
  it("shows a loading notice while posts is null and there is no error", () => {
    renderWith({ posts: null, error: null });
    expect(screen.getByText("Loading posts…")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows only the error notice (no table) when posts is still null and error is set", () => {
    renderWith({ posts: null, error: "failed to load posts" });
    expect(screen.getByText("failed to load posts")).toBeInTheDocument();
    expect(screen.queryByText("Loading posts…")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an inline banner ABOVE the table, not a blank screen, once posts have loaded and a later error occurs", () => {
    renderWith({ posts: [POST], error: "failed to create post" });
    expect(screen.getByText("failed to create post")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("empty state", () => {
  it("renders the empty-state card instead of a bare table when there are no posts", () => {
    renderWith({ posts: [] });
    expect(screen.getByText("No posts yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("populated table", () => {
  it("renders title, slug, status, and formatted-updated columns for each row", () => {
    renderWith({ posts: [POST] });
    // Slug, not the stored id (2026-08-10 admin-URL cleanup). The server's get-by-id route resolves
    // either (`getAdminPostByIdOrSlug`), so an old id-based bookmark still works — but a freshly
    // rendered link must use the readable form.
    expect(screen.getByRole("link", { name: "Hello World" })).toHaveAttribute("href", "/admin/posts/hello-world");
    expect(screen.getByRole("link", { name: "/hello-world" })).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("2026-08-01 12:34")).toBeInTheDocument();
  });
});

describe("Updated column sort (2026-08-10)", () => {
  const older = { ...POST, id: "p-old", title: "Older Post", slug: "older-post", updatedAt: "2026-01-01T00:00:00.000Z" };
  const newer = { ...POST, id: "p-new", title: "Newer Post", slug: "newer-post", updatedAt: "2026-08-01T00:00:00.000Z" };

  function rowOrder(): string[] {
    return screen.getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
  }

  it("defaults to newest-first even though the input array arrives oldest-first", () => {
    renderWith({ posts: [older, newer] });
    const order = rowOrder();
    expect(order[0]).toContain("Newer Post");
    expect(order[1]).toContain("Older Post");
  });

  it("the header button's accessible name states the current direction, not just a glyph", () => {
    renderWith({ posts: [older, newer] });
    expect(screen.getByRole("button", { name: /newest first.*activate to sort oldest first/i })).toBeInTheDocument();
  });

  it("clicking the header toggles to oldest-first", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [older, newer] });
    await user.click(screen.getByRole("button", { name: /sorted by updated date/i }));
    expect(rowOrder()[0]).toContain("Older Post");
    expect(screen.getByRole("button", { name: /oldest first.*activate to sort newest first/i })).toBeInTheDocument();
  });

  it("clicking twice returns to newest-first", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [older, newer] });
    const header = () => screen.getByRole("button", { name: /sorted by updated date/i });
    await user.click(header());
    await user.click(header());
    expect(rowOrder()[0]).toContain("Newer Post");
  });
});

describe("Title/Slug/Status column sort (2026-09-02)", () => {
  const alpha = { ...POST, id: "p-alpha", title: "Alpha Post", slug: "alpha-post", status: "published" as const };
  const bravo = { ...POST, id: "p-bravo", title: "Bravo Post", slug: "bravo-post", status: "draft" as const };

  function rowOrder(): string[] {
    return screen.getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
  }

  it("an unsorted column's header still reads as clickable via its own aria-label, before any click", () => {
    renderWith({ posts: [alpha, bravo] });
    expect(screen.getByRole("button", { name: /not sorted by title\. activate to sort ascending/i })).toBeInTheDocument();
  });

  it("clicking Title sorts ascending and cancels the default Updated sort", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [bravo, alpha] });
    await user.click(screen.getByRole("button", { name: /not sorted by title/i }));
    expect(rowOrder()[0]).toContain("Alpha Post");
    expect(screen.getByRole("button", { name: /sorted by title, ascending\. activate to sort descending/i })).toBeInTheDocument();
    // Updated's header no longer claims to be the active sort.
    expect(screen.getByRole("button", { name: /not sorted by updated date/i })).toBeInTheDocument();
  });

  it("clicking Title again toggles to descending", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [bravo, alpha] });
    const titleHeader = () => screen.getByRole("button", { name: /sort.*title/i });
    await user.click(titleHeader());
    await user.click(titleHeader());
    expect(rowOrder()[0]).toContain("Bravo Post");
    expect(screen.getByRole("button", { name: /sorted by title, descending/i })).toBeInTheDocument();
  });

  it("clicking Slug sorts ascending by slug", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [bravo, alpha] });
    await user.click(screen.getByRole("button", { name: /not sorted by slug/i }));
    expect(rowOrder()[0]).toContain("Alpha Post");
  });

  it("clicking Status sorts draft before published (ascending)", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [alpha, bravo] });
    await user.click(screen.getByRole("button", { name: /not sorted by status/i }));
    expect(rowOrder()[0]).toContain("Bravo Post"); // draft
    expect(rowOrder()[1]).toContain("Alpha Post"); // published
  });

  it("clicking Slug after Title cancels Title's active sort — only one column active at a time", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [bravo, alpha] });
    await user.click(screen.getByRole("button", { name: /not sorted by title/i }));
    expect(screen.getByRole("button", { name: /sorted by title/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /not sorted by slug/i }));
    expect(screen.getByRole("button", { name: /not sorted by title/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sorted by slug, ascending/i })).toBeInTheDocument();
  });
});

describe("New Post action", () => {
  it("disables the button and shows 'Creating…' while creating is true", () => {
    renderWith({ creating: true });
    const button = screen.getByRole("button", { name: "Creating…" });
    expect(button).toBeDisabled();
  });

  it("calls createPost when clicked", async () => {
    const user = userEvent.setup();
    const c = renderWith({ creating: false });
    await user.click(screen.getByRole("button", { name: "New Post" }));
    expect(c.createPost).toHaveBeenCalledTimes(1);
  });
});

describe("Publish section button (plan-publish-sections-2026-09-25.md §2 S3)", () => {
  it("renders the section's own Publish posts button", () => {
    renderWith({});
    expect(screen.getByRole("button", { name: "Publish posts" })).toBeInTheDocument();
  });
});

describe("row menu — Publish/Unpublish visibility mirrors postRowMenuItems", () => {
  it("offers Unpublish for a published post", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Hello World"' }));
    expect(screen.getByRole("menuitem", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("offers Publish for a draft post — the item flips rather than being omitted", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [DRAFT_POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Draft Post"' }));
    expect(screen.getByRole("menuitem", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("Edit navigates to the Posts editor at /posts/{slug}", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Hello World"' }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(navigate).toHaveBeenCalledWith("/posts/hello-world");
  });

  it("Unpublish calls togglePostPublish with the row", async () => {
    const user = userEvent.setup();
    const c = renderWith({ posts: [POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Hello World"' }));
    await user.click(screen.getByRole("menuitem", { name: "Unpublish" }));
    expect(c.togglePostPublish).toHaveBeenCalledWith(POST);
  });

  it("Publish calls togglePostPublish with the row, for a draft post", async () => {
    const user = userEvent.setup();
    const c = renderWith({ posts: [DRAFT_POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Draft Post"' }));
    await user.click(screen.getByRole("menuitem", { name: "Publish" }));
    expect(c.togglePostPublish).toHaveBeenCalledWith(DRAFT_POST);
  });

  it("Delete calls setPendingDelete with the row rather than deleting immediately", async () => {
    const user = userEvent.setup();
    const c = renderWith({ posts: [POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Hello World"' }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(c.setPendingDelete).toHaveBeenCalledWith(POST);
    expect(c.removePost).not.toHaveBeenCalled();
  });
});

describe("delete confirmation dialog", () => {
  it("stays closed when pendingDelete is null", () => {
    renderWith({ posts: [POST], pendingDelete: null });
    const dialog = document.querySelector("dialog.confirm-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("opens with copy naming only the observable consequence — no 'permanently' claim, no 'cannot be undone' claim", () => {
    renderWith({ posts: [POST], pendingDelete: POST });
    const dialog = document.querySelector("dialog.confirm-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(
      screen.getByText('Move "Hello World" to trash? It will disappear from the site and from this list.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/permanently/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
  });

  it("confirming calls removePost (the hook reads pendingDelete itself, not an argument)", async () => {
    const user = userEvent.setup();
    const c = renderWith({ posts: [POST], pendingDelete: POST });
    await user.click(screen.getByRole("button", { name: "Move to trash" }));
    expect(c.removePost).toHaveBeenCalledTimes(1);
  });

  it("canceling calls setPendingDelete(null) rather than removePost", async () => {
    const user = userEvent.setup();
    const c = renderWith({ posts: [POST], pendingDelete: POST });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(c.setPendingDelete).toHaveBeenCalledWith(null);
    expect(c.removePost).not.toHaveBeenCalled();
  });

  it("is pending only when rowSavingId matches the pendingDelete row's id", () => {
    renderWith({ posts: [POST], pendingDelete: POST, rowSavingId: POST.id });
    expect(screen.getByRole("button", { name: "Move to trash" })).toBeDisabled();
  });

  it("is not pending when rowSavingId belongs to a different row", () => {
    renderWith({ posts: [POST], pendingDelete: POST, rowSavingId: "some-other-id" });
    expect(screen.getByRole("button", { name: "Move to trash" })).not.toBeDisabled();
  });
});

/**
 * `postsListNotice` — pulled out of `Posts` (2026-08-06, complexity pass, fourth pass; see its own
 * doc). The states above already exercise it end to end through the full component; these pin the
 * function's own branch decisions directly, no render involved.
 */
describe("postsListNotice", () => {
  it("returns the error notice when there is an error and no list yet", () => {
    const notice = postsListNotice(null, "boom", (key) => key);
    expect(notice).not.toBeNull();
  });

  it("returns the loading notice when there is no list and no error", () => {
    const notice = postsListNotice(null, null, (key) => key);
    expect(notice).not.toBeNull();
  });

  it("prioritizes the error branch over the loading branch when both conditions could apply", () => {
    render(<>{postsListNotice(null, "boom", (key) => key)}</>);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText("Loading posts…")).not.toBeInTheDocument();
  });

  it("returns null once the list has loaded, even with an error set (the inline-banner case)", () => {
    expect(postsListNotice([], "a later error", (key) => key)).toBeNull();
  });
});
