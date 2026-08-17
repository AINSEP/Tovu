import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuEditor, MenuItemTargetFields, targetForKind } from "../MenuEditor";
import type { MenuEditorController } from "../hooks/use-menu-editor.hooks";

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
    fetchMock.mockResolvedValueOnce(jsonResponse(MENU_WITH_NESTED_CHILD));
    render(<MenuEditor menuId="m1" />);

    await screen.findByDisplayValue("Parent");
    // One "Link type" select per item row (2 root items + 1 nested child in the fixture).
    expect(screen.getAllByLabelText("Link type").length).toBe(3);
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

    expect(watch.result()).toBe(false); // this screen's own handler did not prevent it
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

  it("renders a Route name field for a route target, pre-filled from the item", () => {
    render(
      <MenuItemTargetFields item={{ id: "i1", target: { kind: "route", route: "/dashboard" } }} path={[0]} onChange={noop} />,
    );
    expect(screen.getByPlaceholderText("route name")).toHaveValue("/dashboard");
  });

  it("renders an Entry ID field for an entryRef target, defaulting to empty when absent", () => {
    render(<MenuItemTargetFields item={{ id: "i1", target: { kind: "entryRef" } }} path={[0]} onChange={noop} />);
    expect(screen.getByPlaceholderText("entry id")).toHaveValue("");
  });

  it("renders BOTH Term ID and Taxonomy fields for a termRef target", () => {
    render(
      <MenuItemTargetFields
        item={{ id: "i1", target: { kind: "termRef", termId: "t1", taxonomy: "category" } }}
        path={[0]}
        onChange={noop}
      />,
    );
    expect(screen.getByPlaceholderText("term id")).toHaveValue("t1");
    expect(screen.getByPlaceholderText("taxonomy")).toHaveValue("category");
  });
});

describe("injected hook seam (useMenuEditorHook)", () => {
  it("renders from a fake controller, proving the real hook is not hardcoded — no fetch involved", () => {
    const controller: MenuEditorController = {
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
      t: (key) => key,
    };
    const useMenuEditorHook = vi.fn(() => controller);

    render(<MenuEditor menuId="m1" useMenuEditorHook={useMenuEditorHook} />);

    // `loading: true` renders the loading notice regardless of `isNew`/`menuId` — reaching it
    // synchronously, with no fetch queued, is only possible via the injected fake.
    expect(screen.getByText("Loading menu…")).toBeInTheDocument();
    expect(useMenuEditorHook).toHaveBeenCalledWith("m1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
