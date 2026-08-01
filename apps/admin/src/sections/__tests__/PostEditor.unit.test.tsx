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

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
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
