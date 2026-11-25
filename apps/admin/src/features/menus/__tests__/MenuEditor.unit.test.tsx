import { cleanup, fireEvent, render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuEditor } from "../menu-editor-panel";
import { useWiredMenuEditor } from "../hooks/use-menu-editor.hooks";
import { useRouteGuardedMenuEditor } from "../hooks/use-route-guarded-menu-editor.hooks";
import { targetForKind } from "@jini-ai/admin/screens/menus/page-link-rules";
import type { MenuEditorController } from "@jini-ai/admin/screens/menus/hooks/use-menu-editor.hooks";
import type { AdminMenuItem } from "@jini-ai/admin/screens/menus/api/menus-api.types";
import { installInternalLinkInterceptor, useRouteLocation } from "@jini-ai/admin/shell/lib/router";

/**
 * @file `MenuEditor`'s nested-item tree — pins the fix for the audit's Major finding: "Remove"
 * previously deleted the clicked item's entire subtree (children, grandchildren, …) in a single
 * click with no confirmation and no indication children existed. A leaf item (no children) stays
 * a bare click, matching this app's low-stakes "Remove field" convention elsewhere
 * (`FormEditor.tsx`'s `FormFieldsEditor`). Follows the RTL harness `Plugins.unit.test.tsx`
 * established for this package.
 *
 * Also pins the `useDirtyGuard` wiring on this screen's "← Menus" back-link — the audit confirmed
 * live that editing a field and clicking that link discarded the edit with no dialog. The
 * assertions check `event.defaultPrevented` via a same-tick `document` listener (added AFTER
 * React's own, so it observes the outcome of this screen's `onClick`) rather than letting the
 * click's default action run to completion — a real, un-prevented `<a href>` click makes jsdom log
 * "Not implemented: navigation to another Document" (this screen renders standalone here, without
 * `router.ts`'s own click interceptor mounted to consume the event first), which is exactly the
 * kind of tolerated console noise `apps/admin/INFO.md`'s test guidance says to avoid.
 *
 * The "injected hook seam" describe block pins `MenuEditorProps.useMenuEditorHook` — the DI seam
 * that replaced this component's previous inline `useWiredMenuEditor(props.menuId)` call.
 */

/** Observes whether this screen's own `onClick` already called `preventDefault()`, then always
 *  prevents the browser default itself — jsdom has no real navigation to perform in this
 *  standalone render, and letting the click's default action run logs "Not implemented:
 *  navigation to another Document" noise regardless of which branch is under test. */
function watchDefaultPrevented(): { result: () => boolean | null } {
  let observed: boolean | null = null;
  document.addEventListener(
    "click",
    (e) => {
      observed = e.defaultPrevented;
      e.preventDefault();
    },
    { once: true }
  );
  return { result: () => observed };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const MENU_WITH_NESTED_CHILD: {
  menu: { id: string; title: string; slug: string; version: number; items: AdminMenuItem[] };
} = {
  menu: {
    id: "m1",
    title: "Main Menu",
    slug: "main-menu",
    version: 1,
    items: [
      {
        id: "parent",
        label: "Parent",
        target: { kind: "url", href: "/parent" },
        children: [{ id: "child", label: "Child", target: { kind: "url", href: "/child" } }],
      },
      { id: "leaf", label: "Leaf", target: { kind: "url", href: "/leaf" } },
    ],
  },
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;
let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `MenuEditor` now also reads `core.language.locale` (via `useAdminLocale`, moved from the
  // component into `useWiredMenuEditor` alongside this hook's own load effect — see
  // `use-menu-editor.hooks.ts`'s header) to translate its own chrome — a real `fetch` call this
  // file's tests never queued for. Routed here, ahead of `fetchMock`, so it never consumes a slot
  // from the `mockResolvedValueOnce` sequence every test below still queues on `fetchMock` itself
  // unchanged. An empty settings response resolves `loadLanguage()` to `DEFAULT_LOCALE` ("en"),
  // matching every assertion below. Same fix `Menus.unit.test.tsx` already applies.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  confirmSpy?.mockRestore();
});

describe("removing an item with nested children", () => {
  it("asks for confirmation naming the descendant count, and does nothing on cancel", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const parentFields = (await screen.findByDisplayValue("Parent")).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
    await user.click(within(parentFields).getByRole("button", { name: "Remove item" }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("1 nested item"));
    // Cancelled — the child row must still be present.
    expect(screen.getByDisplayValue("Child")).toBeInTheDocument();
  });

  it("removes the item and its subtree on confirm", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const parentFields = (await screen.findByDisplayValue("Parent")).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
    await user.click(within(parentFields).getByRole("button", { name: "Remove item" }));

    expect(screen.queryByDisplayValue("Parent")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Child")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Leaf")).toBeInTheDocument();
  });

  it("counts grandchildren in the exact plural confirmation and preserves them on cancel", async () => {
    const user = userEvent.setup();
    const fixture: { menu: Omit<typeof MENU_WITH_NESTED_CHILD.menu, "items"> & { items: AdminMenuItem[] } } = structuredClone(MENU_WITH_NESTED_CHILD);
    fixture.menu.items[0].children![0].children = [{ id: "grandchild", label: "Grandchild", target: { kind: "url", href: "/grandchild" } }];
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);
    const fields = (await screen.findByDisplayValue("Parent")).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
    await user.click(within(fields).getByRole("button", { name: "Remove item" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith('Remove "Parent"? This will also remove 2 nested items.');
    for (const label of ["Parent", "Child", "Grandchild", "Leaf"]) {
      expect(screen.getByDisplayValue(label)).toBeInTheDocument();
    }
  });
});

describe("removing a leaf item", () => {
  it("removes immediately, with no confirmation dialog", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm");

    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const leafFields = (await screen.findByDisplayValue("Leaf")).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
    await user.click(within(leafFields).getByRole("button", { name: "Remove item" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Leaf")).not.toBeInTheDocument();
  });
});

describe("item-row fields — accessible names", () => {
  it("gives the title and slug fields a real accessible name, not just a placeholder", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const titleInput = await screen.findByLabelText("Menu title");
    expect(titleInput).toHaveAttribute("placeholder", "Menu title");
    expect(screen.getByLabelText("Menu slug")).toHaveValue("main-menu");
  });

  it("gives the link-type select a real accessible name — previously none at all", async () => {
    const fixture: { menu: Omit<typeof MENU_WITH_NESTED_CHILD.menu, "items"> & { items: AdminMenuItem[] } } = structuredClone(MENU_WITH_NESTED_CHILD);
    fixture.menu.items[0].children![0].target = { kind: "route", route: "home" };
    fixture.menu.items[1].target = { kind: "entryRef", entryId: "e1" };
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    await screen.findByDisplayValue("Parent");
    // One "Link type" select per item row (2 root items + 1 nested child in the fixture).
    expect(screen.getAllByLabelText("Link type").length).toBe(3);
    for (const [label, kind] of [["Parent", "url"], ["Child", "route"], ["Leaf", "entryRef"]]) {
      const fields = screen.getByDisplayValue(label).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
      const select = within(fields).getByLabelText("Link type");
      expect(select).toBe(within(fields).getByRole("combobox", { name: "Link type" }));
      expect(select).toHaveValue(kind);
    }
  });

  it("gives the item label and the target-value fields a real accessible name", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    await screen.findByDisplayValue("Parent");
    expect(screen.getAllByLabelText("Item label").length).toBe(3);
    // The fixture's items are all "url" targets, so "URL" is the target-value field showing.
    expect(screen.getAllByLabelText("URL").length).toBe(3);

    // Switching a row's link type swaps in the field for that kind, still real-labeled.
    const parentFields = (await screen.findByDisplayValue("Parent")).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
    await user.selectOptions(within(parentFields).getByLabelText("Link type"), "route");
    expect(within(parentFields).getByLabelText("Route name")).toBeInTheDocument();
  });
});

describe("move controls", () => {
  it("Move up/down buttons have their own accessible name, not just a title attribute", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    await screen.findByDisplayValue("Parent");
    expect(screen.getAllByRole("button", { name: "Move item up" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Move item down" }).length).toBeGreaterThan(0);
    for (const label of ["Parent", "Child", "Leaf"]) {
      const fields = screen.getByDisplayValue(label).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
      expect(within(fields).getAllByRole("button", { name: "Move item up" })).toHaveLength(1);
      expect(within(fields).getAllByRole("button", { name: "Move item down" })).toHaveLength(1);
    }
  });

  it("moves roots and nested siblings, preserves boundaries, and saves the reordered tree", async () => {
    const user = userEvent.setup();
    const fixture = structuredClone(MENU_WITH_NESTED_CHILD);
    fixture.menu.items[0].children!.push({ id: "child2", label: "Child 2", target: { kind: "url", href: "/child2" } });
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));
    fetchMock.mockResolvedValueOnce(jsonResponse({ menu: { ...fixture.menu, version: 2 } }));
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);
    await screen.findByDisplayValue("Parent");

    const labels = () => screen.getAllByLabelText("Item label").map((input) => (input as HTMLInputElement).value);
    const move = async (label: string, direction: "up" | "down") => {
      const fields = screen.getByDisplayValue(label).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
      await user.click(within(fields).getByRole("button", { name: `Move item ${direction}` }));
    };
    await move("Parent", "up");
    await move("Leaf", "down");
    await move("Child", "up");
    await move("Child 2", "down");
    expect(labels()).toEqual(["Parent", "Child", "Child 2", "Leaf"]);
    await move("Parent", "down");
    expect(labels()).toEqual(["Leaf", "Parent", "Child", "Child 2"]);
    await move("Child 2", "up");
    expect(labels()).toEqual(["Leaf", "Parent", "Child 2", "Child"]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeDefined();
    const body = JSON.parse(String((putCall![1] as RequestInit).body));
    expect(body.items).toEqual([fixture.menu.items[1], { ...fixture.menu.items[0], children: [...fixture.menu.items[0].children!].reverse() }]);
  });
});

describe("unsaved-changes protection on the back-link", () => {
  it("with no edits, the back-link click proceeds without prompting", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm");
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    await screen.findByDisplayValue("Parent");
    const watch = watchDefaultPrevented();
    fireEvent.click(screen.getByRole("link", { name: /menus/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(watch.result()).toBe(false); // this screen's own handler did not prevent it
  });

  it("after an edit, cancelling the prompt blocks the navigation", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const titleInput = await screen.findByDisplayValue("Main Menu");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed");

    const watch = watchDefaultPrevented();
    fireEvent.click(screen.getByRole("link", { name: /menus/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("unsaved changes"));
    expect(watch.result()).toBe(true); // this screen's own handler prevented it
  });

  it("after an edit, confirming the prompt allows the navigation", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const titleInput = await screen.findByDisplayValue("Main Menu");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed");

    const watch = watchDefaultPrevented();
    fireEvent.click(screen.getByRole("link", { name: /menus/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith("You have unsaved changes. Leave without saving?");
    expect(watch.result()).toBe(false); // this screen's own handler did not prevent it
  });

  it("the real router preserves edits on cancel and reaches the list on confirmation", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const originalUrl = window.location.href;
    window.history.replaceState(null, "", "/admin/menus/m1");
    const uninstall = installInternalLinkInterceptor();
    function RoutedEditor() {
      const route = useRouteLocation();
      return route === "/menus" ? <h1>Menus list</h1> : <MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />;
    }
    const view = render(<RoutedEditor />);
    try {
      const title = await screen.findByLabelText("Menu title");
      await user.clear(title);
      await user.type(title, "Renamed");
      await user.click(screen.getByRole("link", { name: /menus/i }));
      expect(window.location.pathname).toBe("/admin/menus/m1");
      expect(screen.getByLabelText("Menu title")).toHaveValue("Renamed");
      expect(screen.queryByRole("heading", { name: "Menus list" })).not.toBeInTheDocument();

      confirmSpy.mockReturnValue(true);
      await user.click(screen.getByRole("link", { name: /menus/i }));
      expect(window.location.pathname).toBe("/admin/menus");
      expect(screen.getByRole("heading", { name: "Menus list" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Menu title")).not.toBeInTheDocument();
      expect(confirmSpy).toHaveBeenCalledTimes(2);
    } finally {
      view.unmount();
      uninstall();
      window.history.replaceState(null, "", originalUrl);
    }
  });
});

describe("router-owned menu leave guard", () => {
  let originalUrl: string;
  let uninstall: () => void;
  beforeEach(() => {
    originalUrl = window.location.href;
    window.history.replaceState(null, "", "/admin/menus/m1");
    uninstall = installInternalLinkInterceptor();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  });
  afterEach(() => {
    cleanup();
    uninstall();
    window.history.replaceState(null, "", originalUrl);
  });
  function RoutedEditor() {
    const route = useRouteLocation();
    if (route === "/pages") return <h1>Pages</h1>;
    if (route === "/menus") return <h1>Menus list</h1>;
    return <><a href="/admin/pages">Pages</a><MenuEditor menuId="m1" useMenuEditorHook={useRouteGuardedMenuEditor} /></>;
  }
  it("sidebar navigation with unsaved menu edits asks first", async () => {
    render(<RoutedEditor />);
    const editorUrl = window.location.href;
    const title = await screen.findByDisplayValue("Main Menu");
    fireEvent.change(title, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("link", { name: "Pages" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith("You have unsaved changes. Leave without saving?");
    expect(window.location.href).toBe(editorUrl);
    expect(screen.getByLabelText("Menu title")).toHaveValue("Renamed");
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "Pages" }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe("/admin/pages");
    expect(screen.getByRole("heading", { name: "Pages" })).toBeInTheDocument();
  });
  it("a dirty menu Back link prompts once when the router owns the guard", async () => {
    render(<RoutedEditor />);
    fireEvent.change(await screen.findByDisplayValue("Main Menu"), { target: { value: "Renamed" } });
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: /menus/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/admin/menus");
    expect(screen.getByRole("heading", { name: "Menus list" })).toBeInTheDocument();
  });
  it("a clean menu leaves from the sidebar without a prompt", async () => {
    render(<RoutedEditor />);
    await screen.findByDisplayValue("Main Menu");
    fireEvent.click(screen.getByRole("link", { name: "Pages" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/admin/pages");
    expect(screen.getByRole("heading", { name: "Pages" })).toBeInTheDocument();
  });
  it("unmounting a dirty menu removes the guard", async () => {
    render(<a href="/admin/pages">Pages</a>);
    const editor = render(<MenuEditor menuId="m1" useMenuEditorHook={useRouteGuardedMenuEditor} />);
    fireEvent.change(await screen.findByDisplayValue("Main Menu"), { target: { value: "Renamed" } });
    editor.unmount();
    fireEvent.click(screen.getByRole("link", { name: "Pages" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/admin/pages");
  });
});

describe("typed route target through the full editor", () => {
  it("saves a typed route target through the full editor", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    fetchMock.mockResolvedValueOnce(jsonResponse({ menu: { ...MENU_WITH_NESTED_CHILD.menu, version: 2 } }));
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);
    const fields = (await screen.findByDisplayValue("Leaf")).closest(".jini-menu-item-row")!.querySelector(".jini-menu-item-fields") as HTMLElement;
    await user.selectOptions(within(fields).getByLabelText("Link type"), "route");
    await user.type(within(fields).getByLabelText("Route name"), "dashboard");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeDefined();
    const body = JSON.parse(String((putCall![1] as RequestInit).body));
    expect(body.items[1].target).toEqual({ kind: "route", route: "dashboard" });
    expect(body.items[0]).toEqual(MENU_WITH_NESTED_CHILD.menu.items[0]);
  });
});

/**
 * `NavItemAttrs`'s five presentational fields (`cssClass`/`description`/`icon`/`rel`/
 * `openInNewTab`), exposed via `MenuItemAttrsFields`'s per-item "Advanced" disclosure. Pins the
 * ROUND TRIP, not just that the inputs render: a value typed here must reach the `PUT` request
 * body's `items[].attrs`, since that's the only observable proof the write path (which never
 * validated/stripped `attrs` — Jini's `validateAndCloneTree` clones each node with `{ ...node,
 * children }`) actually receives what the operator typed. Before `attrs` existed on `AdminMenuItem`
 * (`lib/api.ts`) and on this screen, these queries found nothing to type into at all.
 */
describe("attrs — advanced per-item fields", () => {
  it("round-trips a typed CSS class (and the other four fields) through Save into the PUT body", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    fetchMock.mockResolvedValueOnce(jsonResponse({ menu: { ...MENU_WITH_NESTED_CHILD.menu, version: 2 } }));

    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const leafRow = (await screen.findByDisplayValue("Leaf")).closest(".jini-menu-item-row") as HTMLElement;
    await user.click(within(leafRow).getByText("Advanced"));
    await user.type(within(leafRow).getByPlaceholderText("CSS class"), "featured-link");
    await user.type(within(leafRow).getByPlaceholderText("Icon"), "star");
    await user.type(within(leafRow).getByPlaceholderText("Description"), "Featured");
    await user.type(within(leafRow).getByPlaceholderText("Link rel"), "nofollow");
    await user.click(within(leafRow).getByRole("checkbox"));

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeDefined();
    const body = JSON.parse(String((putCall?.[1] as RequestInit).body));
    const leaf = body.items.find((it: { id: string }) => it.id === "leaf");
    expect(leaf.attrs).toEqual({
      cssClass: "featured-link",
      icon: "star",
      description: "Featured",
      rel: "nofollow",
      openInNewTab: true,
    });
  });

  it("shows an existing item's attrs pre-filled when the Advanced disclosure is opened", async () => {
    const withAttrs = {
      menu: {
        ...MENU_WITH_NESTED_CHILD.menu,
        items: [
          {
            id: "leaf",
            label: "Leaf",
            target: { kind: "url", href: "/leaf" },
            attrs: { cssClass: "existing-class", openInNewTab: true },
          },
        ],
      },
    };
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(withAttrs));
    render(<MenuEditor menuId="m1" useMenuEditorHook={useWiredMenuEditor} />);

    const leafRow = (await screen.findByDisplayValue("Leaf")).closest(".jini-menu-item-row") as HTMLElement;
    await user.click(within(leafRow).getByText("Advanced"));

    expect(within(leafRow).getByPlaceholderText("CSS class")).toHaveValue("existing-class");
    expect(within(leafRow).getByRole("checkbox")).toBeChecked();
  });
});
