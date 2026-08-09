import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminWidget } from "../../../lib/api";
import {
  buildDraftPlacement,
  describeReferencingLocations,
  isKnownWidgetType,
  movePlacement,
  resolveEditorWidgetType,
  widgetConfigFieldErrors,
  widgetTypeLabel,
} from "../rules";

/**
 * @file Pure-logic coverage for `features/widgets/rules.ts` — shared by all four widgets screens
 * (`WidgetsLibrary`, `WidgetInstanceEditor`, `WidgetRegionEditor`, `WidgetRegions`).
 */

describe("widgetTypeLabel", () => {
  it("returns the known type's display label", () => {
    // "text" is one of the five closed v1 types (WIDGET_TYPE_OPTIONS) per widgets/rules.ts's own
    // header comment.
    expect(widgetTypeLabel("text", "en")).not.toBe("text");
  });

  it("falls back to the raw stored value for an unknown type rather than rendering blank", () => {
    expect(widgetTypeLabel("some-legacy-type", "en")).toBe("some-legacy-type");
  });

  it("translates the known type's display label to Spanish when locale is es", () => {
    expect(widgetTypeLabel("text", "es")).toBe("Texto");
  });

  it("falls back to the raw stored value for an unknown type in Spanish too", () => {
    expect(widgetTypeLabel("some-legacy-type", "es")).toBe("some-legacy-type");
  });
});

describe("isKnownWidgetType", () => {
  it("is true for a known v1 type", () => {
    expect(isKnownWidgetType("text")).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isKnownWidgetType("garbage-nonsense")).toBe(false);
    expect(isKnownWidgetType("")).toBe(false);
  });
});

describe("describeReferencingLocations", () => {
  it("joins each location's kind and entryId", () => {
    expect(describeReferencingLocations([{ kind: "post", entryId: "p1" }, { kind: "page", entryId: "p2" }])).toBe(
      "post (p1), page (p2)",
    );
  });

  it("falls back to a generic phrase for an empty list", () => {
    expect(describeReferencingLocations([])).toBe("at least one other place");
  });
});

describe("widgetConfigFieldErrors", () => {
  it("extracts fieldErrors from a WIDGETS_CONFIG_VALIDATION_ERROR 409", () => {
    const fieldErrors = [{ field: "title", reason: "required" }];
    const err = new ApiError("bad config", 409, "WIDGETS_CONFIG_VALIDATION_ERROR", { details: { fieldErrors } });
    expect(widgetConfigFieldErrors(err)).toEqual(fieldErrors);
  });

  it("returns an empty array when the error body has no details.fieldErrors", () => {
    const err = new ApiError("bad config", 409, "WIDGETS_CONFIG_VALIDATION_ERROR", {});
    expect(widgetConfigFieldErrors(err)).toEqual([]);
  });

  it("returns an empty array for any other error code or shape", () => {
    expect(widgetConfigFieldErrors(new ApiError("nope", 403, "FORBIDDEN"))).toEqual([]);
    expect(widgetConfigFieldErrors(new Error("plain"))).toEqual([]);
    expect(widgetConfigFieldErrors("not an error")).toEqual([]);
  });
});

describe("resolveEditorWidgetType", () => {
  const WIDGET = { widgetType: "text" } as AdminWidget;

  it("while creating (isNew), reads the ?type= query param", () => {
    expect(resolveEditorWidgetType(true, "gallery", null)).toBe("gallery");
  });

  it("while creating with no query param, is null", () => {
    expect(resolveEditorWidgetType(true, null, null)).toBeNull();
  });

  it("once a widget exists, reads its own stored type instead of the query param", () => {
    expect(resolveEditorWidgetType(false, "gallery", WIDGET)).toBe("text");
  });

  it("once a widget exists but hasn't loaded yet, is undefined (no widget to read a type from)", () => {
    expect(resolveEditorWidgetType(false, "gallery", null)).toBeUndefined();
  });
});

describe("movePlacement", () => {
  it("swaps the element at index with its neighbor below", () => {
    expect(movePlacement(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("swaps the element at index with its neighbor above", () => {
    expect(movePlacement(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("returns the list unchanged (same values) when the swap would go past the start", () => {
    const items = ["a", "b"];
    expect(movePlacement(items, 0, -1)).toEqual(items);
  });

  it("returns the list unchanged (same values) when the swap would go past the end", () => {
    const items = ["a", "b"];
    expect(movePlacement(items, 1, 1)).toEqual(items);
  });

  it("does not mutate the original array on a real swap", () => {
    const items = ["a", "b", "c"];
    const next = movePlacement(items, 0, 1);
    expect(items).toEqual(["a", "b", "c"]);
    expect(next).not.toBe(items);
  });
});

describe("buildDraftPlacement", () => {
  it("builds a placement referencing the given widget instance, enabled, not broken", () => {
    const placement = buildDraftPlacement("widget-1");
    expect(placement.widgetEntryId).toBe("widget-1");
    expect(placement.enabled).toBe(true);
    expect(placement.broken).toBe(false);
    expect(placement.widgetTitle).toBeNull();
    expect(placement.widgetType).toBeNull();
    expect(typeof placement.placementId).toBe("string");
    expect(placement.placementId.length).toBeGreaterThan(0);
  });

  it("falls back to a Date.now()-based id when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: undefined });
    try {
      const placement = buildDraftPlacement("widget-1");
      expect(placement.placementId.startsWith("p-")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
