import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, type AdminWidget } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { STALE_VERSION_MESSAGE, useWidgetInstanceEditor } from "../hooks/use-widget-instance-editor.hooks";

/**
 * @file Characterization tests for `useWidgetInstanceEditor` — first direct test file for this
 * hook (previously exercised only indirectly, and only for two `?type=` edge cases, through
 * `WidgetInstanceEditor.unit.test.tsx`). Written against CURRENT behavior per the complexity-pass
 * dispatch: this hook is explicitly NOT being restructured in this pass (its
 * `[message,error,fieldErrors,loading,saving]` cluster is slated for a shared `useAsyncAction`
 * primitive elsewhere) — these tests exist to give that future adoption a green baseline to work
 * against, not to assert what the hook "should" do differently.
 *
 * Follows the fetch-mocking-via-`api`-spies harness `use-collection-entry-editor.unit.test.ts`
 * established for this package's hook tests, including its `navigate` mock shape.
 */

vi.mock("../../../lib/router", () => ({ navigate: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(navigate).mockClear();
});

const EXISTING_WIDGET: AdminWidget = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-banner",
  title: "Hero banner",
  status: "active",
  widgetType: "text",
  config: { body: "hello" },
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 2,
};

const WHERE_USED = { count: 1, references: [{ kind: "region" as const, sourceEntryId: "e1", fieldPath: "regions.0" }] };

describe("initial state — new widget (widgetId null)", () => {
  it("starts with widget null, blank title, the type's default config, and loading=false", () => {
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: "text" }));

    expect(result.current.isNew).toBe(true);
    expect(result.current.widget).toBeNull();
    expect(result.current.title).toBe("");
    expect(result.current.config).toEqual({ body: "" }); // defaultWidgetConfig("text")
    expect(result.current.whereUsed).toEqual({ count: 0, references: [] });
    expect(result.current.loading).toBe(false);
    expect(result.current.widgetType).toBe("text");
  });

  it("defaults the config to the 'text' type's shape when widgetType is null (no ?type= at all)", () => {
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: null }));
    // resolveEditorWidgetType(isNew=true, null, null) -> null, so the CONTROLLER's widgetType is
    // null — but the config-seeding effect independently falls back to "text" via `?? "text"`,
    // which is why config is non-empty even though widgetType itself reads null.
    expect(result.current.widgetType).toBeNull();
    expect(result.current.config).toEqual({ body: "" });
  });

  it("resolves widgetType from resolveEditorWidgetType for a known query type", () => {
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: "menu" }));
    expect(result.current.widgetType).toBe("menu");
    expect(result.current.config).toEqual({ menuRef: "" });
  });

  it("does not call api.getWidget for a new widget", () => {
    const getWidget = vi.spyOn(api, "getWidget");
    renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: "text" }));
    expect(getWidget).not.toHaveBeenCalled();
  });
});

describe("initial load — existing widget (widgetId set)", () => {
  it("starts loading=true synchronously, before the fetch resolves", () => {
    vi.spyOn(api, "getWidget").mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: "w1", widgetType: null }));
    expect(result.current.loading).toBe(true);
    expect(result.current.isNew).toBe(false);
  });

  it("seeds widget/title/config/whereUsed from the resolved response, and sets loading=false", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: EXISTING_WIDGET, whereUsed: WHERE_USED });
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: "w1", widgetType: null }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.widget).toEqual(EXISTING_WIDGET);
    expect(result.current.title).toBe("Hero banner");
    expect(result.current.config).toEqual({ body: "hello" });
    expect(result.current.whereUsed).toEqual(WHERE_USED);
    expect(result.current.widgetType).toBe("text"); // resolved from the loaded widget's own type
    expect(result.current.error).toBeNull();
  });

  it("calls api.getWidget with exactly the widgetId prop", async () => {
    const getWidget = vi.spyOn(api, "getWidget").mockResolvedValue({ widget: EXISTING_WIDGET, whereUsed: WHERE_USED });
    renderHook(() => useWidgetInstanceEditor({ widgetId: "w1", widgetType: null }));
    await waitFor(() => expect(getWidget).toHaveBeenCalledWith("w1"));
  });

  it("sets a describable error and loading=false when the load rejects with an Error", async () => {
    vi.spyOn(api, "getWidget").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: "w1", widgetType: null }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network down");
    expect(result.current.widget).toBeNull();
  });

  it("falls back to 'failed to load widget' when the rejection is not an Error/ApiError", async () => {
    vi.spyOn(api, "getWidget").mockRejectedValue("string rejection");
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: "w1", widgetType: null }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("failed to load widget");
  });

  it("reloads when widgetId changes across a rerender", async () => {
    const getWidget = vi
      .spyOn(api, "getWidget")
      .mockResolvedValueOnce({ widget: EXISTING_WIDGET, whereUsed: WHERE_USED })
      .mockResolvedValueOnce({ widget: { ...EXISTING_WIDGET, id: "w2", title: "Other widget" }, whereUsed: { count: 0, references: [] } });

    const { result, rerender } = renderHook(({ widgetId }) => useWidgetInstanceEditor({ widgetId, widgetType: null }), {
      initialProps: { widgetId: "w1" },
    });
    await waitFor(() => expect(result.current.title).toBe("Hero banner"));

    rerender({ widgetId: "w2" });
    await waitFor(() => expect(result.current.title).toBe("Other widget"));

    expect(getWidget).toHaveBeenCalledTimes(2);
    expect(getWidget).toHaveBeenNthCalledWith(2, "w2");
  });
});

describe("save — no-op guards", () => {
  it("does not call any api method when widgetType has not resolved (null)", async () => {
    const createWidget = vi.spyOn(api, "createWidget");
    const updateWidget = vi.spyOn(api, "updateWidget");
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: null }));

    await act(async () => {
      await result.current.save();
    });

    expect(createWidget).not.toHaveBeenCalled();
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it("does not call api.updateWidget when editing but the widget hasn't loaded yet", async () => {
    vi.spyOn(api, "getWidget").mockReturnValue(new Promise(() => {})); // never resolves -> widget stays null
    const updateWidget = vi.spyOn(api, "updateWidget");
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: "w1", widgetType: "text" }));

    await act(async () => {
      await result.current.save();
    });

    expect(updateWidget).not.toHaveBeenCalled();
  });
});

describe("save — create (isNew)", () => {
  it("calls api.createWidget with widgetType/title/config, and navigates to the new widget's id", async () => {
    const createWidget = vi.spyOn(api, "createWidget").mockResolvedValue({ widget: { ...EXISTING_WIDGET, id: "w9" } });
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: "text" }));
    act(() => result.current.setTitle("New Text Widget"));

    await act(async () => {
      await result.current.save();
    });

    expect(createWidget).toHaveBeenCalledWith({ widgetType: "text", title: "New Text Widget", config: { body: "" } });
    expect(navigate).toHaveBeenCalledWith("/widgets/w9");
  });

  it("sets saving=true while the create is in flight, false after it settles", async () => {
    let resolveCreate: ((r: { widget: AdminWidget }) => void) | undefined;
    vi.spyOn(api, "createWidget").mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: "text" }));

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.save();
    });
    expect(result.current.saving).toBe(true);

    await act(async () => {
      resolveCreate?.({ widget: { ...EXISTING_WIDGET, id: "w9" } });
      await promise;
    });
    expect(result.current.saving).toBe(false);
  });

  it("does NOT set a success message on create — the hook navigates away instead", async () => {
    // Documented as observed behavior, not asserted as correct: unlike the update path (which sets
    // `Saved · version N`), the create path only calls `navigate` and returns — `message` is never
    // set at all on a successful create. Worth a look separately (see report), not changed here.
    vi.spyOn(api, "createWidget").mockResolvedValue({ widget: { ...EXISTING_WIDGET, id: "w9" } });
    const { result } = renderHook(() => useWidgetInstanceEditor({ widgetId: null, widgetType: "text" }));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.message).toBeNull();
  });
});

describe("save — update (existing widget)", () => {
  async function mountLoaded() {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: EXISTING_WIDGET, whereUsed: WHERE_USED });
    const view = renderHook(() => useWidgetInstanceEditor({ widgetId: "w1", widgetType: null }));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    return view;
  }

  it("calls api.updateWidget with id/baseVersion/config, updates widget+config, and sets a version message", async () => {
    const view = await mountLoaded();
    const updateWidget = vi.spyOn(api, "updateWidget").mockResolvedValue({ widget: { ...EXISTING_WIDGET, version: 3, config: { body: "edited" } } });
    act(() => view.result.current.setConfig({ body: "edited" }));

    await act(async () => {
      await view.result.current.save();
    });

    expect(updateWidget).toHaveBeenCalledWith({ id: "w1", baseVersion: 2, config: { body: "edited" } });
    expect(view.result.current.widget?.version).toBe(3);
    expect(view.result.current.config).toEqual({ body: "edited" });
    expect(view.result.current.message).toBe("Saved · version 3");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("maps a WIDGETS_VERSION_CONFLICT ApiError to STALE_VERSION_MESSAGE", async () => {
    const view = await mountLoaded();
    vi.spyOn(api, "updateWidget").mockRejectedValue(new ApiError("stale", 409, "WIDGETS_VERSION_CONFLICT"));

    await act(async () => {
      await view.result.current.save();
    });

    expect(view.result.current.error).toBe(STALE_VERSION_MESSAGE);
    expect(view.result.current.fieldErrors).toEqual([]);
  });

  it("maps a WIDGETS_CONFIG_VALIDATION_ERROR ApiError to fieldErrors + a describable error message", async () => {
    const view = await mountLoaded();
    const fieldErrors = [{ field: "body", reason: "too long" }];
    vi.spyOn(api, "updateWidget").mockRejectedValue(
      new ApiError("invalid config", 409, "WIDGETS_CONFIG_VALIDATION_ERROR", { details: { fieldErrors } })
    );

    await act(async () => {
      await view.result.current.save();
    });

    expect(view.result.current.fieldErrors).toEqual(fieldErrors);
    expect(view.result.current.error).toBe("invalid config");
  });

  it("falls back to 'save failed' for any other ApiError code", async () => {
    const view = await mountLoaded();
    vi.spyOn(api, "updateWidget").mockRejectedValue(new ApiError("", 500, "SOME_OTHER_CODE"));

    await act(async () => {
      await view.result.current.save();
    });

    expect(view.result.current.error).toBe("save failed");
    expect(view.result.current.fieldErrors).toEqual([]);
  });

  it("uses a plain Error's own (possibly empty) message rather than the 'save failed' fallback", async () => {
    // `describeApiError` (lib/api.ts) special-cases `ApiError` to fall back on an EMPTY message
    // (`e.message || fallback`), but for a plain `Error` it does `e instanceof Error ? e.message :
    // fallback` — no `||` — so an empty-message plain Error yields `""`, not the fallback. Observed
    // and pinned as-is (see report); not asserted as correct, and not fixed in this pass.
    const view = await mountLoaded();
    vi.spyOn(api, "updateWidget").mockRejectedValue(new Error());

    await act(async () => {
      await view.result.current.save();
    });

    expect(view.result.current.error).toBe("");
  });

  it("uses a plain Error's real message when it has one", async () => {
    const view = await mountLoaded();
    vi.spyOn(api, "updateWidget").mockRejectedValue(new Error("boom"));

    await act(async () => {
      await view.result.current.save();
    });

    expect(view.result.current.error).toBe("boom");
  });

  it("clears a prior message/error/fieldErrors when re-invoked", async () => {
    const view = await mountLoaded();
    vi.spyOn(api, "updateWidget").mockRejectedValueOnce(new ApiError("invalid", 409, "WIDGETS_CONFIG_VALIDATION_ERROR", { details: { fieldErrors: [{ field: "x", reason: "y" }] } }));
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.error).not.toBeNull();
    expect(view.result.current.fieldErrors).not.toEqual([]);

    vi.spyOn(api, "updateWidget").mockResolvedValueOnce({ widget: EXISTING_WIDGET });
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.fieldErrors).toEqual([]);
  });
});
