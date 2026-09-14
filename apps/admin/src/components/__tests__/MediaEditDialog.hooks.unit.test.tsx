import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaEditDialog, useWiredMediaEditDialog } from "../MediaEditDialog/MediaEditDialog.hooks";

/**
 * @file `useMediaEditDialog` — the `MediaEditDialog`'s draft/validation/Escape state, driven
 * directly with `renderHook` rather than through a full component render. Renamed from
 * `useMediaStyleDialog`/`MediaStyleDialog.hooks.tsx` (2026-09-11, owner UI revision — the `media`
 * node's node-view action becomes `Edit` (not `Style…`), moves BEFORE `Replace`, and now edits
 * THREE fields, not two: `alt` joins `cssClass`/`htmlAttributes`. `alt` was previously only ever
 * set at insert time (`MediaPickerDialog`'s `item.alt || item.title`); this is the first way to
 * change it per-instance afterward.
 *
 * Mirrors `MediaPickerDialog.hooks.unit.test.tsx`'s split (data/interaction logic tested here,
 * `MediaEditDialog.unit.test.tsx` tests the JSX). No `port`/network dependency exists here —
 * `deps.locale` is the only injected value, reused to drive the SAME
 * `parseMediaHtmlAttributes`/`describeMediaHtmlAttributeError` validators `use-edit-media-panel
 * .hooks.ts` already uses for the asset-level field, per this task's "reuse, don't reparse"
 * directive. `alt` carries NO allowlist/validation of any kind — free accessibility text, same as
 * the asset-level field's own `alt`.
 *
 * `save()` NEVER gates on `htmlAttributesError` (2026-09-07 incident `a7cce060`'s lesson, restated
 * for the node-level field): the hint is a live, as-you-type convenience only, and the render-time
 * allowlist (`render.ts`'s `resolveMediaHtmlAttributes`) is the real, independent security
 * boundary — see the "save proceeds regardless of the hint" test below.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaEditDialog — seeding from the current node value", () => {
  it("seeds all three fields from a non-null initial value", () => {
    const { result } = renderHook(() =>
      useMediaEditDialog({ alt: "A cat", cssClass: "hero", htmlAttributes: 'data-kui="x"' }, vi.fn(), vi.fn(), { locale: "en" })
    );
    expect(result.current.alt).toBe("A cat");
    expect(result.current.cssClass).toBe("hero");
    expect(result.current.htmlAttributes).toBe('data-kui="x"');
    expect(result.current.htmlAttributesError).toBeNull();
  });

  it("seeds all three fields to an empty string when the node's current value is null (nothing set yet)", () => {
    const { result } = renderHook(() =>
      useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), vi.fn(), { locale: "en" })
    );
    expect(result.current.alt).toBe("");
    expect(result.current.cssClass).toBe("");
    expect(result.current.htmlAttributes).toBe("");
  });
});

describe("useMediaEditDialog — editing", () => {
  it("setAlt/setCssClass/setHtmlAttributes update the draft", () => {
    const { result } = renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), vi.fn(), { locale: "en" }));
    act(() => result.current.setAlt("A cat"));
    act(() => result.current.setCssClass("float-right"));
    act(() => result.current.setHtmlAttributes("muted"));
    expect(result.current.alt).toBe("A cat");
    expect(result.current.cssClass).toBe("float-right");
    expect(result.current.htmlAttributes).toBe("muted");
  });

  it("htmlAttributesError reflects the SAME allowlist rejection the asset-level field uses (event-handler), naming the attribute — alt carries no such gate", () => {
    const { result } = renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), vi.fn(), { locale: "en" }));
    act(() => result.current.setHtmlAttributes('onerror="alert(1)"'));
    expect(result.current.htmlAttributesError).toBe("Event handler attributes like 'onerror' are not allowed.");
    act(() => result.current.setAlt('<script>alert(1)</script>'));
    expect(result.current.htmlAttributesError).toBe("Event handler attributes like 'onerror' are not allowed.");
  });
});

describe("useMediaEditDialog — save", () => {
  it("calls onSave with all three values as typed — same 'raw value, blank-trims-to-null' contract cssClass/htmlAttributes already use", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, onSave, vi.fn(), { locale: "en" }));
    act(() => result.current.setAlt("A cat"));
    act(() => result.current.setCssClass("hero"));
    act(() => result.current.setHtmlAttributes('data-kui="x"'));
    act(() => result.current.save());
    expect(onSave).toHaveBeenCalledWith({ alt: "A cat", cssClass: "hero", htmlAttributes: 'data-kui="x"' });
  });

  it("blank fields save as null (clearing a previously-set value), not an empty string — alt included", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useMediaEditDialog({ alt: "was-set", cssClass: "was-set", htmlAttributes: "was-set" }, onSave, vi.fn(), { locale: "en" })
    );
    act(() => result.current.setAlt(""));
    act(() => result.current.setCssClass(""));
    act(() => result.current.setHtmlAttributes(""));
    act(() => result.current.save());
    expect(onSave).toHaveBeenCalledWith({ alt: null, cssClass: null, htmlAttributes: null });
  });

  it("save proceeds even while htmlAttributesError is set — the hint is a UX convenience, never a save gate (a7cce060's lesson)", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, onSave, vi.fn(), { locale: "en" }));
    act(() => result.current.setHtmlAttributes('onerror="alert(1)"'));
    expect(result.current.htmlAttributesError).not.toBeNull();
    act(() => result.current.save());
    expect(onSave).toHaveBeenCalledWith({ alt: null, cssClass: null, htmlAttributes: 'onerror="alert(1)"' });
  });
});

describe("useMediaEditDialog — Escape", () => {
  it("calls onCancel on Escape, anywhere in the document", () => {
    const onCancel = vi.fn();
    renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), onCancel, { locale: "en" }));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", () => {
    const onCancel = vi.fn();
    renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), onCancel, { locale: "en" }));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("removes its keydown listener on unmount", () => {
    const onCancel = vi.fn();
    const { unmount } = renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), onCancel, { locale: "en" }));
    unmount();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("useMediaEditDialog — t", () => {
  it("translates the dialog's copy through media-i18n for deps.locale", () => {
    const { result } = renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), vi.fn(), { locale: "es" }));
    expect(result.current.t("Edit this instance")).toBe("Editar esta instancia");
    expect(result.current.t("Save")).toBe("Guardar");
  });

  it("falls back to the English key for the default locale", () => {
    const { result } = renderHook(() => useMediaEditDialog({ alt: null, cssClass: null, htmlAttributes: null }, vi.fn(), vi.fn(), { locale: "en" }));
    expect(result.current.t("Edit this instance")).toBe("Edit this instance");
  });
});

describe("useWiredMediaEditDialog — real locale wiring", () => {
  it("resolves to the same controller shape as the unwired hook (English default, no settings stub)", () => {
    const { result } = renderHook(() => useWiredMediaEditDialog({ alt: null, cssClass: "x", htmlAttributes: null }, vi.fn(), vi.fn()));
    expect(result.current.cssClass).toBe("x");
    expect(result.current.htmlAttributesError).toBeNull();
  });
});
