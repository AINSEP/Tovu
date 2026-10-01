import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuEditor, MenuItemTargetFields, targetForKind } from "../MenuEditor";
import type { MenuEditorController } from "../hooks/use-menu-editor.hooks";
import type { AdminMenuItem } from "../../../lib/api";
import { installInternalLinkInterceptor, useRouteLocation } from "../../../lib/router";

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

const MENU_WITH_NESTED_CHILD = {
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

    render(<MenuEditor menuId="m1" />);

    const parentFields = (await screen.findByDisplayValue("Parent")).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
    await user.click(within(parentFields).getByRole("button", { name: "Remove item" }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("1 nested item"));
    // Cancelled — the child row must still be present.
    expect(screen.getByDisplayValue("Child")).toBeInTheDocument();
  });

  it("removes the item and its subtree on confirm", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<MenuEditor menuId="m1" />);

    const parentFields = (await screen.findByDisplayValue("Parent")).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
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
    render(<MenuEditor menuId="m1" />);
    const fields = (await screen.findByDisplayValue("Parent")).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
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

    render(<MenuEditor menuId="m1" />);

    const leafFields = (await screen.findByDisplayValue("Leaf")).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
    await user.click(within(leafFields).getByRole("button", { name: "Remove item" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Leaf")).not.toBeInTheDocument();
  });
});

describe("item-row fields — accessible names", () => {
  it("gives the title and slug fields a real accessible name, not just a placeholder", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    render(<MenuEditor menuId="m1" />);

    const titleInput = await screen.findByLabelText("Menu title");
    expect(titleInput).toHaveAttribute("placeholder", "Menu title");
    expect(screen.getByLabelText("Menu slug")).toHaveValue("main-menu");
  });

  it("gives the link-type select a real accessible name — previously none at all", async () => {
    const fixture: { menu: Omit<typeof MENU_WITH_NESTED_CHILD.menu, "items"> & { items: AdminMenuItem[] } } = structuredClone(MENU_WITH_NESTED_CHILD);
    fixture.menu.items[0].children![0].target = { kind: "route", route: "home" };
    fixture.menu.items[1].target = { kind: "entryRef", entryId: "e1" };
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));
    render(<MenuEditor menuId="m1" />);

    await screen.findByDisplayValue("Parent");
    // One "Link type" select per item row (2 root items + 1 nested child in the fixture).
    expect(screen.getAllByLabelText("Link type").length).toBe(3);
    for (const [label, kind] of [["Parent", "url"], ["Child", "route"], ["Leaf", "entryRef"]]) {
      const fields = screen.getByDisplayValue(label).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
      const select = within(fields).getByLabelText("Link type");
      expect(select).toBe(within(fields).getByRole("combobox", { name: "Link type" }));
      expect(select).toHaveValue(kind);
    }
  });

  it("gives the item label and the target-value fields a real accessible name", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    render(<MenuEditor menuId="m1" />);

    await screen.findByDisplayValue("Parent");
    expect(screen.getAllByLabelText("Item label").length).toBe(3);
    // The fixture's items are all "url" targets, so "URL" is the target-value field showing.
    expect(screen.getAllByLabelText("URL").length).toBe(3);

    // Switching a row's link type swaps in the field for that kind, still real-labeled.
    const parentFields = (await screen.findByDisplayValue("Parent")).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
    await user.selectOptions(within(parentFields).getByLabelText("Link type"), "route");
    expect(within(parentFields).getByLabelText("Route name")).toBeInTheDocument();
  });
});

describe("move controls", () => {
  it("Move up/down buttons have their own accessible name, not just a title attribute", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    render(<MenuEditor menuId="m1" />);

    await screen.findByDisplayValue("Parent");
    expect(screen.getAllByRole("button", { name: "Move item up" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Move item down" }).length).toBeGreaterThan(0);
    for (const label of ["Parent", "Child", "Leaf"]) {
      const fields = screen.getByDisplayValue(label).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
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
    render(<MenuEditor menuId="m1" />);
    await screen.findByDisplayValue("Parent");

    const labels = () => screen.getAllByLabelText("Item label").map((input) => (input as HTMLInputElement).value);
    const move = async (label: string, direction: "up" | "down") => {
      const fields = screen.getByDisplayValue(label).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
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
    render(<MenuEditor menuId="m1" />);

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
    render(<MenuEditor menuId="m1" />);

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
    render(<MenuEditor menuId="m1" />);

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
      return route === "/menus" ? <h1>Menus list</h1> : <MenuEditor menuId="m1" />;
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

/**
 * `targetForKind` — pulled apart from the four `?? ""` fallbacks that used to be inline
 * (2026-08-06, complexity pass, fourth pass; see `orEmpty`'s own doc in the source file). The
 * `item-row fields` describe block above only ever renders a "url" target through the full
 * `MenuEditor`; these tests exercise all four kinds directly, no fetch/render involved.
 */
describe("targetForKind", () => {
  it("switches to url, carrying over an existing href", () => {
    expect(targetForKind({ kind: "url", prev: { kind: "route", route: "unused" } })).toEqual({
      kind: "url",
      href: "",
    });
    expect(targetForKind({ kind: "url", prev: { kind: "url", href: "/old" } })).toEqual({
      kind: "url",
      href: "/old",
    });
  });

  it("switches to route, defaulting to an empty string when the previous target had none", () => {
    expect(targetForKind({ kind: "route", prev: { kind: "url", href: "/x" } })).toEqual({ kind: "route", route: "" });
  });

  it("switches to entryRef, defaulting to an empty string when the previous target had none", () => {
    expect(targetForKind({ kind: "entryRef", prev: { kind: "url", href: "/x" } })).toEqual({
      kind: "entryRef",
      entryId: "",
    });
  });

  it("switches to termRef, defaulting BOTH termId and taxonomy independently", () => {
    expect(targetForKind({ kind: "termRef", prev: { kind: "termRef", termId: "t1", taxonomy: "" } })).toEqual({
      kind: "termRef",
      termId: "t1",
      taxonomy: "",
    });
    expect(targetForKind({ kind: "termRef", prev: { kind: "url", href: "/x" } })).toEqual({
      kind: "termRef",
      termId: "",
      taxonomy: "",
    });
  });
});

/**
 * `MenuItemTargetFields` — same extraction, the rendered half. Direct render tests for the three
 * kinds ("route"/"entryRef"/"termRef") the full-`MenuEditor` fixture above never exercises (it only
 * ever seeds "url" targets).
 */
describe("MenuItemTargetFields", () => {
  const noop = () => {};
  const t = (key: string) => key;

  it("renders a Route name field for a route target, pre-filled from the item", () => {
    render(
      <MenuItemTargetFields item={{ id: "i1", target: { kind: "route", route: "/dashboard" } }} path={[0]} onChange={noop} t={t} />,
    );
    expect(screen.getByPlaceholderText("route name")).toHaveValue("/dashboard");
  });

  it("renders an Entry ID field for an entryRef target, defaulting to empty when absent", () => {
    render(<MenuItemTargetFields item={{ id: "i1", target: { kind: "entryRef" } }} path={[0]} onChange={noop} t={t} />);
    expect(screen.getByPlaceholderText("entry id")).toHaveValue("");
  });

  it("renders BOTH Term ID and Taxonomy fields for a termRef target", () => {
    render(
      <MenuItemTargetFields
        item={{ id: "i1", target: { kind: "termRef", termId: "t1", taxonomy: "category" } }}
        path={[0]}
        onChange={noop}
        t={t}
      />,
    );
    expect(screen.getByPlaceholderText("term id")).toHaveValue("t1");
    expect(screen.getByPlaceholderText("taxonomy")).toHaveValue("category");
  });

  it.each([
    { target: { kind: "url", href: "/old" }, field: "URL", value: "/new", expected: { kind: "url", href: "/new" } },
    { target: { kind: "route", route: "old" }, field: "Route name", value: "dashboard", expected: { kind: "route", route: "dashboard" } },
    { target: { kind: "entryRef", entryId: "e1" }, field: "Entry ID", value: "e2", expected: { kind: "entryRef", entryId: "e2" } },
    { target: { kind: "termRef", termId: "t1", taxonomy: "category" }, field: "Term ID", value: "t2", expected: { kind: "termRef", termId: "t2", taxonomy: "category" } },
    { target: { kind: "termRef", termId: "t1", taxonomy: "category" }, field: "Taxonomy", value: "tag", expected: { kind: "termRef", termId: "t1", taxonomy: "tag" } },
  ] as const)("writes $field to its own target field, retaining the rest of the item", ({ target, field, value, expected }) => {
    const item: AdminMenuItem = { id: "i1", label: "Link", target, attrs: { cssClass: "featured" }, children: [] };
    let changed: AdminMenuItem | undefined;
    const onChange = vi.fn((_path: number[], update: (item: AdminMenuItem) => AdminMenuItem) => { changed = update(item); });
    render(<MenuItemTargetFields item={item} path={[1, 0]} onChange={onChange} t={t} />);
    fireEvent.change(screen.getByLabelText(field), { target: { value } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([1, 0], expect.any(Function));
    expect(changed).toEqual({ ...item, target: expected });
  });

  it("saves a typed route target through the full editor", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    fetchMock.mockResolvedValueOnce(jsonResponse({ menu: { ...MENU_WITH_NESTED_CHILD.menu, version: 2 } }));
    render(<MenuEditor menuId="m1" />);
    const fields = (await screen.findByDisplayValue("Leaf")).closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
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

    render(<MenuEditor menuId="m1" />);

    const leafRow = (await screen.findByDisplayValue("Leaf")).closest(".menu-item-row") as HTMLElement;
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
    render(<MenuEditor menuId="m1" />);

    const leafRow = (await screen.findByDisplayValue("Leaf")).closest(".menu-item-row") as HTMLElement;
    await user.click(within(leafRow).getByText("Advanced"));

    expect(within(leafRow).getByPlaceholderText("CSS class")).toHaveValue("existing-class");
    expect(within(leafRow).getByRole("checkbox")).toBeChecked();
  });
});

describe("injected hook seam (useMenuEditorHook)", () => {
  function fakeController(overrides: Partial<MenuEditorController> = {}): MenuEditorController {
    return {
      isNew: true,
      menu: null,
      title: "",
      setTitle: vi.fn(),
      slug: "",
      setSlug: vi.fn(),
      items: [],
      message: null,
      error: null,
      loading: true,
      confirmLeave: vi.fn(() => true),
      changeAt: vi.fn(),
      removeAt: vi.fn(),
      addChildAt: vi.fn(),
      moveAt: vi.fn(),
      addRootItem: vi.fn(),
      save: vi.fn(async () => {}),
      saving: false,
      t: (key) => key,
      ...overrides,
    };
  }

  it("renders from a fake controller, proving the real hook is not hardcoded — no fetch involved", () => {
    const controller = fakeController();
    const useMenuEditorHook = vi.fn(() => controller);

    render(<MenuEditor menuId="m1" useMenuEditorHook={useMenuEditorHook} />);

    // `loading: true` renders the loading notice regardless of `isNew`/`menuId` — reaching it
    // synchronously, with no fetch queued, is only possible via the injected fake.
    expect(screen.getByText("Loading menu…")).toBeInTheDocument();
    expect(useMenuEditorHook).toHaveBeenCalledWith("m1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows save status and disables Save while saving", async () => {
    const user = userEvent.setup();
    const controller = fakeController({ loading: false, saving: true, message: "Saved · version 2", error: "Save failed" });
    render(<MenuEditor menuId="m1" useMenuEditorHook={() => controller} />);
    expect(screen.getByText("Saved · version 2")).toHaveClass("save-ok");
    expect(screen.getByText("Save failed")).toHaveClass("save-error");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(controller.save).not.toHaveBeenCalled();
  });

  it("wires create-mode Save, Add item, and a nested Add child to the controller", async () => {
    const user = userEvent.setup();
    const controller = fakeController({ loading: false, items: MENU_WITH_NESTED_CHILD.menu.items as AdminMenuItem[] });
    render(<MenuEditor menuId={null} useMenuEditorHook={() => controller} />);
    expect(screen.getByRole("heading", { name: "New menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(controller.save).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "+ Add item" }));
    expect(controller.addRootItem).toHaveBeenCalledTimes(1);
    const childFields = screen.getByDisplayValue("Child").closest(".menu-item-row")!.querySelector(".menu-item-fields") as HTMLElement;
    await user.click(within(childFields).getByRole("button", { name: "+ child" }));
    expect(controller.addChildAt).toHaveBeenCalledTimes(1);
    expect(controller.addChildAt).toHaveBeenCalledWith([0, 0]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
