import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminTrashItem } from "@/lib/api";
import { Trash } from "../Trash";
import type { TrashController } from "../hooks/use-trash.hooks";

/**
 * @file The Trash screen's markup, mounted over a stub controller through its `useTrashHook` seam.
 *
 * The coverage line has its own test because it is a product requirement, not decoration: phase 1
 * collects four of the seven kinds this admin can delete, and a user who deletes a widget, does not
 * find it here and is told nothing will reasonably conclude the widget is unrecoverable. A
 * disclosure would not fix that — it has to be visible on the first render, including on an empty
 * Trash, which is precisely when someone is looking for something that is not there.
 */

function item(overrides: Partial<AdminTrashItem> = {}): AdminTrashItem {
  return {
    id: "trash-1",
    entityType: "post",
    entityId: "post-1",
    title: "A deleted post",
    subtitle: "/a-deleted-post",
    trashedAt: "2026-09-01T00:00:00.000Z",
    purgeAfter: "2026-10-31T00:00:00.000Z",
    daysRemaining: 41,
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    ...overrides,
  };
}

function controller(overrides: Partial<TrashController> = {}): TrashController {
  return {
    items: [],
    nextCursor: null,
    loadingMore: false,
    loadMore: vi.fn(),
    error: null,
    notice: null,
    busy: false,
    selected: new Set<string>(),
    toggle: vi.fn(),
    toggleAll: vi.fn(),
    allSelected: false,
    onRestoreSelected: vi.fn(async () => {}),
    purgeConfirmOpen: false,
    setPurgeConfirmOpen: vi.fn(),
    onPurgeConfirmed: vi.fn(async () => {}),
    locale: "en",
    ...overrides,
  };
}

describe("Trash screen", () => {
  it("names the sections it covers, and the ones it does not, on an EMPTY Trash", () => {
    render(<Trash useTrashHook={() => controller({ items: [] })} />);

    const line = screen.getByText(/Covers Posts, Comments, Media and Redirects/);
    expect(line).toBeTruthy();
    expect(line.textContent).toContain("Widgets, Collection entries and Theme files");
    expect(screen.getByText("The Trash is empty.")).toBeTruthy();
  });

  it("renders a row with its kind, actor and days remaining", () => {
    render(<Trash useTrashHook={() => controller({ items: [item()] })} />);

    expect(screen.getByText("A deleted post")).toBeTruthy();
    expect(screen.getByText("Post")).toBeTruthy();
    expect(screen.getByText("principal-1")).toBeTruthy();
    expect(screen.getByText("41")).toBeTruthy();
  });

  it("both selection actions are disabled until something is selected", () => {
    const { rerender } = render(<Trash useTrashHook={() => controller({ items: [item()] })} />);
    expect(screen.getByRole("button", { name: "Restore" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Delete permanently" })).toHaveProperty("disabled", true);

    rerender(<Trash useTrashHook={() => controller({ items: [item()], selected: new Set(["trash-1"]) })} />);
    expect(screen.getByRole("button", { name: "Restore" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Delete permanently" })).toHaveProperty("disabled", false);
  });

  it("permanent deletion is behind a confirm modal that says how many and that it cannot be undone", () => {
    render(
      <Trash
        useTrashHook={() =>
          controller({ items: [item()], selected: new Set(["trash-1"]), purgeConfirmOpen: true })
        }
      />
    );

    expect(screen.getByText("Delete permanently?")).toBeTruthy();
    expect(screen.getByText("1 item(s) will be deleted permanently. This cannot be undone.")).toBeTruthy();
  });
});
