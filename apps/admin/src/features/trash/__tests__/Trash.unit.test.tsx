import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    actorUsername: "jdoe",
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
    refresh: vi.fn(),
    refreshing: false,
    actorUsernames: new Map<string, string>(),
    locale: "en",
    ...overrides,
  };
}

describe("Trash screen", () => {
  it("names the two sections it does NOT cover, on an EMPTY Trash", () => {
    render(<Trash useTrashHook={() => controller({ items: [] })} />);

    const line = screen.getByText(/Deleted items from every section appear here/);
    expect(line).toBeTruthy();
    expect(line.textContent).toContain("Collection entries and Theme files");
    expect(screen.getByText("The Trash is empty.")).toBeTruthy();
  });

  it("renders a row with its kind, actor and days remaining", () => {
    render(<Trash useTrashHook={() => controller({ items: [item()] })} />);

    expect(screen.getByText("A deleted post")).toBeTruthy();
    expect(screen.getByText("Post")).toBeTruthy();
    // The username, not the raw principal id — a UUID means nobody but the server can tell who
    // this was, which is exactly what this column exists to answer.
    expect(screen.getByText("jdoe")).toBeTruthy();
    expect(screen.queryByText("principal-1")).toBeNull();
    expect(screen.getByText("41")).toBeTruthy();
  });

  it("labels a plugin row as shared across all workspaces on the site", () => {
    render(
      <Trash
        useTrashHook={() =>
          controller({ items: [item({ entityType: "plugin", title: "My Plugin", subtitle: "my-plugin 1.0.0" })] })
        }
      />
    );

    expect(screen.getByText("Plugin")).toBeTruthy();
    expect(screen.getByText("my-plugin 1.0.0 · Shared across all workspaces on this site.")).toBeTruthy();
  });

  it("falls back to a readable label when the deleting user no longer has an account", () => {
    render(<Trash useTrashHook={() => controller({ items: [item({ actorUsername: null })] })} />);

    expect(screen.getByText("Deleted user")).toBeTruthy();
    expect(screen.queryByText("principal-1")).toBeNull();
  });

  it("shows '<username> + AI' when an agent did the deleting, with the plugin id as a tooltip rather than the visible text", () => {
    render(
      <Trash
        useTrashHook={() => controller({ items: [item({ actorPluginId: "forms", actorUsername: "jdoe" })] })}
      />
    );

    const cell = screen.getByText("jdoe + AI");
    expect(cell).toBeTruthy();
    expect(cell.getAttribute("title")).toBe("forms");
    expect(screen.queryByText("jdoe", { exact: true })).toBeNull();
    expect(screen.queryByText("forms")).toBeNull();
  });

  it("resolves the actor via the client-side users map when the server omitted actorUsername entirely", () => {
    render(
      <Trash
        useTrashHook={() =>
          controller({
            items: [item({ actorPrincipalId: "principal-owner", actorUsername: undefined })],
            actorUsernames: new Map([["principal-owner", "admin"]]),
          })
        }
      />
    );

    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.queryByText("Unknown")).toBeNull();
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
    // Human-only: the agent may open the modal (`trash-purge`) and cancel it, never confirm it.
    expect(document.querySelector('[data-agent-element="trash-purge-confirm-confirm"]')).toBeNull();
    expect(document.querySelector('[data-agent-element="trash-purge-confirm-cancel"]')).not.toBeNull();
    expect(document.querySelector('[data-agent-element="trash-purge"]')).not.toBeNull();
  });

  it("the Refresh button calls controller.refresh on click, is never gated by selection, and disables while refreshing", async () => {
    const refresh = vi.fn();
    const { rerender } = render(<Trash useTrashHook={() => controller({ items: [], refresh })} />);

    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button).toHaveProperty("disabled", false); // no selection required, unlike Restore/Delete
    await userEvent.click(button);
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender(<Trash useTrashHook={() => controller({ items: [], refreshing: true })} />);
    expect(screen.getByRole("button", { name: "Refreshing…" })).toHaveProperty("disabled", true);
  });
});
