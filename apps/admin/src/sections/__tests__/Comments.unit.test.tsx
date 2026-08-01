import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Comments } from "../Comments";

/**
 * @file `Comments` (QueueSection) — pins the MSG-03 RowMenu rollout: the per-status conditional
 * moderation buttons (Approve/Spam/Trash/Restore/Purge) moved into a shared `RowMenu`, with every
 * visibility condition copied verbatim from the inline buttons they replace, and Purge's
 * confirmation moved off `window.confirm` onto the shared `ConfirmDialog` (same "cannot be undone"
 * copy).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const FULL_PERMISSIONS = ["comments.read", "comments.moderate", "comments.delete", "comments.delete.force"];

const PENDING_COMMENT = {
  id: "c1",
  workspaceId: "ws1",
  entryId: "e1",
  parentId: null,
  threadRootId: "c1",
  depth: 0,
  status: "pending" as const,
  authorPrincipalId: null,
  authorName: "Jane",
  authorEmail: null,
  authorUrl: null,
  authorIpHash: null,
  bodyText: "Nice post!",
  spamScore: null,
  spamProvider: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const TRASHED_COMMENT = { ...PENDING_COMMENT, id: "c2", status: "trash" as const };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("offers only Approve/Spam/Trash for a pending comment — no Restore, no Purge", async () => {
  const user = userEvent.setup();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ effectivePermissions: FULL_PERMISSIONS }))
    .mockResolvedValueOnce(jsonResponse({ items: [PENDING_COMMENT], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(undefined)) // "approve" POST body is `void`
    // `onModerate` success reloads page 1 (`reloadFirstPage`) — a second queue GET, not just the
    // moderation POST itself.
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));

  render(<Comments />);

  const trigger = await screen.findByRole("button", { name: /actions for the comment by "jane"/i });
  await user.click(trigger);

  expect(screen.getByRole("menuitem", { name: /^approve$/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /^spam$/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /^trash$/i })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /^restore$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /^purge$/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole("menuitem", { name: /^approve$/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  const approveCall = fetchMock.mock.calls[2];
  expect(String(approveCall[0])).toContain("/comments/c1/approve");
  expect(approveCall[1]?.method).toBe("POST");
});

it("offers Purge only under the trash filter, and gates it through ConfirmDialog instead of window.confirm", async () => {
  const user = userEvent.setup();
  const confirmSpy = vi.spyOn(window, "confirm");
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ effectivePermissions: FULL_PERMISSIONS }))
    .mockResolvedValueOnce(jsonResponse({ items: [PENDING_COMMENT], nextCursor: null }))
    // Switching the status filter to "trash" refetches under that status.
    .mockResolvedValueOnce(jsonResponse({ items: [TRASHED_COMMENT], nextCursor: null }));

  render(<Comments />);

  await screen.findByRole("button", { name: /actions for the comment by "jane"/i });
  await user.selectOptions(screen.getByLabelText(/status/i), "trash");

  const trigger = await screen.findByRole("button", { name: /actions for the comment by "jane"/i });
  await user.click(trigger);

  expect(screen.getByRole("menuitem", { name: /^restore$/i })).toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: /^purge$/i }));

  expect(confirmSpy).not.toHaveBeenCalled();
  expect(
    await screen.findByText(/permanently delete this comment by "jane"\? this cannot be undone\./i)
  ).toBeInTheDocument();

  fetchMock
    .mockResolvedValueOnce(jsonResponse(undefined)) // purge POST, `void`
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null })); // reloadFirstPage

  await user.click(screen.getByRole("button", { name: /^permanently delete$/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  const purgeCall = fetchMock.mock.calls[3];
  expect(String(purgeCall[0])).toContain("/comments/c2/purge");
});
