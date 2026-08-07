import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Posts, postsListNotice } from "../Posts";
import type { PostsController } from "../hooks/use-posts.hooks";
import { navigate } from "../../../lib/router";
import type { AdminPost } from "../../../lib/api";

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
  return {
    posts: [POST],
    error: null,
    creating: false,
    rowSavingId: null,
    pendingDelete: null,
    setPendingDelete: vi.fn(),
    createPost: vi.fn(async () => {}),
    disablePost: vi.fn(async () => {}),
    removePost: vi.fn(async () => {}),
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
    expect(screen.getByRole("link", { name: "Hello World" })).toHaveAttribute("href", "/admin/posts/p1");
    expect(screen.getByRole("link", { name: "/hello-world" })).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("2026-08-01 12:34")).toBeInTheDocument();
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

describe("row menu — Disable visibility mirrors postRowMenuItems", () => {
  it("offers Disable for a published post", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Hello World"' }));
    expect(screen.getByRole("menuitem", { name: "Disable" })).toBeInTheDocument();
  });

  it("omits Disable for a draft post", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [DRAFT_POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Draft Post"' }));
    expect(screen.queryByRole("menuitem", { name: "Disable" })).not.toBeInTheDocument();
  });

  it("Edit navigates to the Posts editor at /posts/{id}", async () => {
    const user = userEvent.setup();
    renderWith({ posts: [POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Hello World"' }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(navigate).toHaveBeenCalledWith("/posts/p1");
  });

  it("Disable calls disablePost with the row", async () => {
    const user = userEvent.setup();
    const c = renderWith({ posts: [POST] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Hello World"' }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));
    expect(c.disablePost).toHaveBeenCalledWith(POST);
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
    const notice = postsListNotice(null, "boom");
    expect(notice).not.toBeNull();
  });

  it("returns the loading notice when there is no list and no error", () => {
    const notice = postsListNotice(null, null);
    expect(notice).not.toBeNull();
  });

  it("prioritizes the error branch over the loading branch when both conditions could apply", () => {
    render(<>{postsListNotice(null, "boom")}</>);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText("Loading posts…")).not.toBeInTheDocument();
  });

  it("returns null once the list has loaded, even with an error set (the inline-banner case)", () => {
    expect(postsListNotice([], "a later error")).toBeNull();
  });
});
