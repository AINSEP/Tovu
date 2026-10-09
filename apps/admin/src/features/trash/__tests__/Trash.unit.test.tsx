import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdminTrashItem } from "@/lib/api";
import { Trash } from "../Trash";
import { useTrash, type TrashController } from "../hooks/use-trash.hooks";
import { createFakeTrashPort } from "../hooks/trash-dependencies.hooks";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

/**
 * @file The Trash screen's markup, mounted over a stub controller through its `useTrashHook` seam.
 *
 * The coverage line has its own test because it is a product requirement, not decoration: phase 1
 * collects four of the seven kinds this admin can delete, and a user who deletes a widget, does not
 * find it here and is told nothing will reasonably conclude the widget is unrecoverable. A
 * disclosure would not fix that — it has to be visible on the first render, including on an empty
 * Trash, which is precisely when someone is looking for something that is not there.
 * Owner update (2026-10-07): that original visibility requirement is superseded by the title's
 * shared InfoTip. Keep the exceptions discoverable even on empty Trash without a second subtitle.
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
  it("shows the settled load error without a simultaneous loading notice", () => {
    render(<Trash useTrashHook={() => controller({ items: null, error: "The Tovu API did not respond. Try refreshing the Trash." })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The Tovu API did not respond. Try refreshing the Trash.");
    expect(screen.queryByText("Loading the Trash…")).not.toBeInTheDocument();
    expect(screen.queryByText("The Trash is empty.")).not.toBeInTheDocument();
  });
  function renderRealTrash(port: ReturnType<typeof createFakeTrashPort>) {
    render(<FetchQueryProvider><Trash useTrashHook={() => useTrash({ port, locale: "en" })} /></FetchQueryProvider>);
  }

  it("opens confirmation from the toolbar and purges only after Confirm, never after Cancel", async () => {
    const user = userEvent.setup();
    const port = createFakeTrashPort({ items: [item()] });
    renderRealTrash(port);
    await user.click(await screen.findByRole("checkbox", { name: 'Select "A deleted post"' }));
    const purge = screen.getByRole("button", { name: "Delete permanently" });
    await user.click(purge);
    const dialog = screen.getByRole("dialog", { name: "Delete permanently?" });
    expect(dialog).toHaveAttribute("open");
    expect(port.purgeCalls).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(port.purgeCalls).toEqual([]);
    await user.click(purge);
    expect(dialog).toHaveAttribute("open");
    expect(port.purgeCalls).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(port.purgeCalls).toEqual([{ ids: ["trash-1"] }]));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });

  it("restores the selected row through the real controller", async () => {
    const user = userEvent.setup();
    const port = createFakeTrashPort({ items: [item(), item({ id: "trash-2", entityId: "post-2", title: "Second post" })] });
    renderRealTrash(port);
    await user.click(await screen.findByRole("checkbox", { name: 'Select "Second post"' }));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(port.restoreCalls).toEqual([{ items: [{ entityType: "post", entityId: "post-2" }] }]));
    expect(port.purgeCalls).toEqual([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled());
  });

  it("select-all toggles every visible row and Load more appends the next page", async () => {
    const user = userEvent.setup();
    const port = createFakeTrashPort({ items: [item()], nextCursor: "next-page" });
    const list = port.listTrash;
    port.listTrash = async (options) => {
      const page = await list(options);
      return options.cursor ? { items: [item({ id: "trash-2", entityId: "post-2", title: "Second post" })], nextCursor: null } : page;
    };
    renderRealTrash(port);
    await screen.findByRole("checkbox", { name: 'Select "A deleted post"' });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    const second = await screen.findByRole("checkbox", { name: 'Select "Second post"' });
    expect(port.listCalls).toEqual([{}, { cursor: "next-page" }]);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    const all = screen.getByRole("checkbox", { name: "Select every item shown" });
    await user.click(all);
    expect(all).toBeChecked();
    expect(second).toBeChecked();
    expect(screen.getByRole("checkbox", { name: 'Select "A deleted post"' })).toBeChecked();
    await user.click(all);
    expect(all).not.toBeChecked();
    expect(second).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
  });

  it("shows one short subtitle and a closed info tip beside the title on empty Trash", () => {
    const { container } = render(<Trash useTrashHook={() => controller({ items: [] })} />);

    const descriptions = container.querySelectorAll(".page-header .page-description");
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]).toHaveTextContent("Deleted items are kept for 60 days.");
    const info = within(screen.getByRole("heading", { level: 1 })).getByLabelText(
      "Collection entries and theme files don't go to Trash.",
    );
    expect(info).toHaveAttribute("data-agent-element", "trash-coverage-info");
    expect(screen.queryByText("Collection entries and theme files don't go to Trash.")).not.toBeInTheDocument();
    expect(screen.getByText("The Trash is empty.")).toBeInTheDocument();
  });

  it("opens the exceptions on click using the shared title info pattern", async () => {
    const user = userEvent.setup();
    render(<Trash useTrashHook={() => controller({ items: [] })} />);

    await user.click(screen.getByLabelText("Collection entries and theme files don't go to Trash."));
    expect(screen.getByText("Collection entries and theme files don't go to Trash.")).toBeInTheDocument();
  });

  it("opens the exceptions with Tab and closes with Escape while keeping icon focus", async () => {
    const user = userEvent.setup();
    render(<Trash useTrashHook={() => controller({ items: [] })} />);
    const info = screen.getByLabelText("Collection entries and theme files don't go to Trash.");

    await user.tab();
    expect(document.activeElement).toBe(info);
    expect(screen.getByText("Collection entries and theme files don't go to Trash.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Collection entries and theme files don't go to Trash.")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(info);
  });

  it("translates the short subtitle and exceptions together", async () => {
    const user = userEvent.setup();
    render(<Trash useTrashHook={() => controller({ locale: "es", items: [] })} />);

    expect(screen.getByText("Los elementos eliminados se conservan durante 60 días.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Las entradas de colecciones y los archivos de temas no van a la papelera."));
    expect(screen.getByText("Las entradas de colecciones y los archivos de temas no van a la papelera.")).toBeInTheDocument();
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
