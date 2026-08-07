import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetsLibrary, WidgetsLibraryNotices } from "../WidgetsLibrary";

/**
 * @file `WidgetsLibrary` — pins the MSG-03 confirm-dialog swap for the force-purge escalation: a
 * `WIDGETS_REFERENCED` 409 used to open a `window.confirm` built from the error body's
 * `referencingLocations`; it now opens the shared `ConfirmDialog` with the same dynamically-built
 * copy, and only a real confirm click retries with `force: true`.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const WIDGET = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-banner",
  title: "Hero banner",
  status: "trash" as const,
  widgetType: "text" as const,
  config: {},
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("opens ConfirmDialog with the referencing locations on a WIDGETS_REFERENCED 409, and only force-purges on explicit confirm", async () => {
  const user = userEvent.setup();
  const confirmSpy = vi.spyOn(window, "confirm");
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }))
    .mockResolvedValueOnce(
      jsonResponse(
        {
          error: "still referenced",
          code: "WIDGETS_REFERENCED",
          details: { referencingLocations: [{ kind: "post", entryId: "p1" }] },
        },
        409
      )
    );

  render(<WidgetsLibrary />);

  const deleteButton = await screen.findByRole("button", { name: /delete permanently/i });
  await user.click(deleteButton);

  expect(confirmSpy).not.toHaveBeenCalled();
  expect(await screen.findByText(/still used in: post \(p1\)/i)).toBeInTheDocument();
  expect(screen.getByText(/permanently delete anyway\? this cannot be undone\./i)).toBeInTheDocument();

  // First attempt was force:false — verify before confirming the escalation.
  expect(fetchMock.mock.calls[1][0]).not.toContain("force=true");

  fetchMock
    .mockResolvedValueOnce(jsonResponse({ widget: { ...WIDGET, status: "purged" } }))
    .mockResolvedValueOnce(jsonResponse({ widgets: [] }));

  await user.click(screen.getByRole("button", { name: /^permanently delete$/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  const forceCall = fetchMock.mock.calls[2];
  expect(String(forceCall[0])).toContain("force=true");
});

it("never opens the dialog when the first purge attempt succeeds outright", async () => {
  const user = userEvent.setup();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }))
    .mockResolvedValueOnce(jsonResponse({ widget: { ...WIDGET, status: "purged" } }))
    .mockResolvedValueOnce(jsonResponse({ widgets: [] }));

  render(<WidgetsLibrary />);

  await user.click(await screen.findByRole("button", { name: /delete permanently/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(screen.queryByText(/still used in/i)).not.toBeInTheDocument();
});

it("drops a purged row from the list once the reload comes back (server still includes purged rows under includeInactive)", async () => {
  // `GET .../widgets?includeInactive=true` intentionally returns BOTH `trash` and `purged` rows
  // (see src/server/routes/admin/widgets/list.ts's doc comment) — purge never hard-deletes the
  // row (ADR-047 Amendment 4: "never deleted, only active⇄disabled"). So the reload triggered by
  // a successful purge comes back still carrying the now-`purged` widget; the admin UI is
  // responsible for not rendering rows in a terminal `purged` state.
  const user = userEvent.setup();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ widgets: [WIDGET] }))
    .mockResolvedValueOnce(jsonResponse({ widget: { ...WIDGET, status: "purged" } }))
    .mockResolvedValueOnce(jsonResponse({ widgets: [{ ...WIDGET, status: "purged" }] }));

  render(<WidgetsLibrary />);

  await user.click(await screen.findByRole("button", { name: /delete permanently/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.queryByText("Hero banner")).not.toBeInTheDocument());
  expect(screen.getByText(/no widgets yet/i)).toBeInTheDocument();
});

it("keeps trash rows visible — only purged is filtered", async () => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ widgets: [WIDGET, { ...WIDGET, id: "w2", title: "Purged one", status: "purged" as const }] })
  );

  render(<WidgetsLibrary />);

  expect(await screen.findByText("Hero banner")).toBeInTheDocument();
  expect(screen.queryByText("Purged one")).not.toBeInTheDocument();
});

// Direct coverage of the two notices extracted out of `WidgetsLibrary`'s own render body under the
// tightened ≤9/≤9 pass. Neither branch had a test before this pass — `WidgetsLibrary`'s own suite
// above never renders it with a fetch/action error or a nonzero skippedCount.
it("renders neither notice when there is no error and nothing was skipped", () => {
  const { container } = render(<WidgetsLibraryNotices error={null} skippedCount={0} />);
  expect(container.querySelector(".notice")).not.toBeInTheDocument();
});

it("renders the error banner", () => {
  render(<WidgetsLibraryNotices error="failed to load widgets" skippedCount={0} />);
  expect(screen.getByText("failed to load widgets")).toBeInTheDocument();
});

it("uses the singular phrasing for exactly one skipped row", () => {
  render(<WidgetsLibraryNotices error={null} skippedCount={1} />);
  expect(screen.getByText("1 row could not be displayed.")).toBeInTheDocument();
});

it("uses the plural phrasing for more than one skipped row", () => {
  render(<WidgetsLibraryNotices error={null} skippedCount={3} />);
  expect(screen.getByText("3 rows could not be displayed.")).toBeInTheDocument();
});
