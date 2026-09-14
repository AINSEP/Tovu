import { act, renderHook, waitFor } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { useWidgetEmbedNodeView } from "../widget-embed-extension.hooks";

/**
 * @file Direct coverage for `useWidgetEmbedNodeView` — the state, stale-guarded widget fetch and
 * handlers moved out of `WidgetEmbedNodeView`'s component body. `widget-embed-extension.unit.test.tsx`
 * still drives the same behavior through the rendered node view; this suite pins the hook's own
 * returned contract, including the stale-response guard, against the real hook (nothing mocked but
 * the `api` calls).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const NO_WHERE_USED = { count: 0, references: [] };

const ACTIVE_WIDGET = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-text",
  title: "Hero text",
  status: "active" as const,
  widgetType: "text" as const,
  config: { body: "hi" },
  updatedAt: "2026-01-01",
  version: 1,
};

type GetWidgetResult = Awaited<ReturnType<typeof api.getWidget>>;

function fakeProps(
  attrs: { widgetEntryId?: string; placementId?: string },
  overrides: Partial<NodeViewProps> = {},
): NodeViewProps {
  return {
    node: { attrs } as unknown as NodeViewProps["node"],
    deleteNode: vi.fn(),
    updateAttributes: vi.fn(),
    ...overrides,
  } as unknown as NodeViewProps;
}

function renderView(props: NodeViewProps) {
  return renderHook((p: NodeViewProps) => useWidgetEmbedNodeView(p), { initialProps: props });
}

/** A `getWidget` whose responses the test settles by id, in any order. */
function deferredGetWidget() {
  const pending = new Map<string, { resolve: (value: GetWidgetResult) => void; reject: (error: unknown) => void }>();
  vi.spyOn(api, "getWidget").mockImplementation(
    (id: string) => new Promise<GetWidgetResult>((resolve, reject) => pending.set(id, { resolve, reject })),
  );
  return pending;
}

describe("useWidgetEmbedNodeView — fetch and display state", () => {
  it("is loading (widget undefined, not broken, no dialog) before getWidget settles", () => {
    vi.spyOn(api, "getWidget").mockReturnValue(new Promise(() => {}));
    const { result } = renderView(fakeProps({ widgetEntryId: "w1", placementId: "p1" }));

    expect(result.current.widget).toBeUndefined();
    expect(result.current.isBroken).toBe(false);
    expect(result.current.nodeClassName).toBe("widget-embed-node");
    expect(result.current.changeDialog).toBeNull();
    expect(result.current.placementId).toBe("p1");
  });

  it("is broken with a null widget, without calling getWidget, when widgetEntryId is missing", () => {
    const getWidget = vi.spyOn(api, "getWidget");
    const { result } = renderView(fakeProps({}));

    expect(result.current.widget).toBeNull();
    expect(result.current.isBroken).toBe(true);
    expect(result.current.nodeClassName).toBe("widget-embed-node widget-embed-node--broken");
    expect(result.current.placementId).toBe("");
    expect(getWidget).not.toHaveBeenCalled();
  });

  it("resolves an active widget as not broken", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }));

    await waitFor(() => expect(result.current.widget).toEqual(ACTIVE_WIDGET));
    expect(result.current.isBroken).toBe(false);
  });

  it("keeps a resolved but inactive widget, marked broken", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: { ...ACTIVE_WIDGET, status: "trash" }, whereUsed: NO_WHERE_USED });
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }));

    await waitFor(() => expect(result.current.isBroken).toBe(true));
    expect(result.current.widget?.title).toBe("Hero text");
  });

  it("a failed fetch leaves a null widget, marked broken", async () => {
    vi.spyOn(api, "getWidget").mockRejectedValue(new Error("404"));
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }));

    await waitFor(() => expect(result.current.widget).toBeNull());
    expect(result.current.isBroken).toBe(true);
  });
});

describe("useWidgetEmbedNodeView — stale responses are dropped", () => {
  it("ignores a late success for the previous widgetEntryId", async () => {
    const pending = deferredGetWidget();
    const { result, rerender } = renderView(fakeProps({ widgetEntryId: "w1" }));
    rerender(fakeProps({ widgetEntryId: "w2" }));

    await act(async () => {
      pending.get("w2")!.resolve({ widget: { ...ACTIVE_WIDGET, id: "w2", title: "Second" }, whereUsed: NO_WHERE_USED });
    });
    await act(async () => {
      pending.get("w1")!.resolve({ widget: { ...ACTIVE_WIDGET, title: "First" }, whereUsed: NO_WHERE_USED });
    });

    expect(result.current.widget?.title).toBe("Second");
    expect(result.current.isBroken).toBe(false);
  });

  it("ignores a late failure for the previous widgetEntryId", async () => {
    const pending = deferredGetWidget();
    const { result, rerender } = renderView(fakeProps({ widgetEntryId: "w1" }));
    rerender(fakeProps({ widgetEntryId: "w2" }));

    await act(async () => {
      pending.get("w2")!.resolve({ widget: { ...ACTIVE_WIDGET, id: "w2", title: "Second" }, whereUsed: NO_WHERE_USED });
    });
    await act(async () => {
      pending.get("w1")!.reject(new Error("404"));
    });

    expect(result.current.widget?.title).toBe("Second");
    expect(result.current.isBroken).toBe(false);
  });

  it("a response settling after unmount is ignored without throwing", async () => {
    const pending = deferredGetWidget();
    const { unmount } = renderView(fakeProps({ widgetEntryId: "w1" }));
    unmount();

    await expect(
      act(async () => {
        pending.get("w1")!.resolve({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
      }),
    ).resolves.not.toThrow();
  });
});

describe("useWidgetEmbedNodeView — Change dialog and Remove", () => {
  it("openChange yields no dialog until a widget has resolved to scope it to", async () => {
    let resolve!: (value: GetWidgetResult) => void;
    vi.spyOn(api, "getWidget").mockImplementation(() => new Promise<GetWidgetResult>((r) => (resolve = r)));
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }));

    act(() => result.current.openChange());
    expect(result.current.changeDialog).toBeNull();

    await act(async () => {
      resolve({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    });
    expect(result.current.changeDialog?.widgetType).toBe("text");
  });

  it("onUseExisting points the node at the chosen widget and closes the dialog", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    const updateAttributes = vi.fn();
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }, { updateAttributes }));
    await waitFor(() => expect(result.current.widget).toBeTruthy());
    act(() => result.current.openChange());

    act(() => result.current.changeDialog!.onUseExisting("w2"));

    expect(updateAttributes).toHaveBeenCalledWith({ widgetEntryId: "w2" });
    expect(result.current.changeDialog).toBeNull();
  });

  it("onCreateNew creates a widget of the current type, then points the node at it", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    const createWidget = vi.spyOn(api, "createWidget").mockResolvedValue({ widget: { ...ACTIVE_WIDGET, id: "w-new" } });
    const updateAttributes = vi.fn();
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }, { updateAttributes }));
    await waitFor(() => expect(result.current.widget).toBeTruthy());
    act(() => result.current.openChange());

    await act(async () => {
      await result.current.changeDialog!.onCreateNew("New one", { body: "x" });
    });

    expect(createWidget).toHaveBeenCalledWith({ widgetType: "text", title: "New one", config: { body: "x" } });
    expect(updateAttributes).toHaveBeenCalledWith({ widgetEntryId: "w-new" });
    expect(result.current.changeDialog).toBeNull();
  });

  it("a failed onCreateNew alerts the describable error and leaves the node and dialog untouched", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    vi.spyOn(api, "createWidget").mockRejectedValue(new Error("title already taken"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const updateAttributes = vi.fn();
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }, { updateAttributes }));
    await waitFor(() => expect(result.current.widget).toBeTruthy());
    act(() => result.current.openChange());

    await act(async () => {
      await result.current.changeDialog!.onCreateNew("Doomed", {});
    });

    expect(alertSpy).toHaveBeenCalledWith("title already taken");
    expect(updateAttributes).not.toHaveBeenCalled();
    expect(result.current.changeDialog).not.toBeNull();
  });

  it("onCancel closes the dialog without updating the node", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    const updateAttributes = vi.fn();
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }, { updateAttributes }));
    await waitFor(() => expect(result.current.widget).toBeTruthy());
    act(() => result.current.openChange());

    act(() => result.current.changeDialog!.onCancel());

    expect(result.current.changeDialog).toBeNull();
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  it("remove deletes the node", () => {
    vi.spyOn(api, "getWidget").mockReturnValue(new Promise(() => {}));
    const deleteNode = vi.fn();
    const { result } = renderView(fakeProps({ widgetEntryId: "w1" }, { deleteNode }));

    result.current.remove();

    expect(deleteNode).toHaveBeenCalledTimes(1);
  });
});
