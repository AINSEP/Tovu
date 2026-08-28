import { describe, expect, it, vi } from "vitest";

import {
  addDraftField,
  autoFocusCancelForLifecycleOp,
  contentTypeMenuItems,
  describeEditFieldsError,
  draftFieldsFromContentType,
  emptyField,
  firstDraftFieldError,
  LIFECYCLE_COPY,
  removeDraftField,
  STALE_VERSION_MESSAGE,
  stripDraftFieldRowIds,
  updateDraftField,
  validateEditFieldsDraft,
  validateFieldName,
  validateKey,
  validateNewContentTypeDraft,
  type DraftField,
} from "../rules";
import { ApiError, type AdminContentType, type ContentTypeFieldDef } from "@/lib/api";

/**
 * @file Pure logic for the top-level `Collections` screen — validation, draft-field-list
 * transforms, error formatting, lifecycle copy, and the row-menu builder.
 *
 * `nextRowId` (backing {@link emptyField}/{@link draftFieldsFromContentType}) is deliberately
 * NOT reset between tests — this file's own doc comment marks it as an intentionally impure,
 * module-level monotonic counter SHARED across `NewContentTypeDialog` and `EditFieldsDialog`
 * (open New, cancel, then open Edit continues the same sequence rather than resetting). A test
 * that reset it between cases would be pinning the wrong behavior; the "monotonic, never resets"
 * property is asserted directly below instead.
 */

function contentType(overrides: Partial<AdminContentType> = {}): AdminContentType {
  return {
    key: "recipe",
    label: "Recipe",
    status: "active",
    fields: [],
    version: 1,
    ...overrides,
  } as AdminContentType;
}

describe("validateKey", () => {
  it("accepts a lowercase key with digits/underscores", () => {
    expect(validateKey("recipe_2")).toBeNull();
  });

  it("rejects a key starting with a digit or uppercase letter", () => {
    expect(validateKey("2recipe")).not.toBeNull();
    expect(validateKey("Recipe")).not.toBeNull();
  });

  it("rejects an empty key", () => {
    expect(validateKey("")).not.toBeNull();
  });

  it("rejects a key over 64 characters", () => {
    expect(validateKey("a" + "b".repeat(64))).not.toBeNull();
  });

  it("accepts a key at exactly 64 characters", () => {
    expect(validateKey("a" + "b".repeat(63))).toBeNull();
  });

  it("rejects the reserved keys 'post' and 'page'", () => {
    expect(validateKey("post")).toContain("reserved");
    expect(validateKey("page")).toContain("reserved");
  });
});

describe("validateFieldName", () => {
  it("accepts a valid field name", () => {
    expect(validateFieldName("prep_time")).toBeNull();
  });

  it("rejects an invalid field name", () => {
    expect(validateFieldName("Prep-Time")).not.toBeNull();
  });
});

describe("nextRowId — shared, monotonic, never resets (deliberate landmine)", () => {
  it("emptyField assigns a strictly increasing _rowId across repeated calls", () => {
    const a = emptyField();
    const b = emptyField();
    const c = emptyField();
    expect(b._rowId).toBeGreaterThan(a._rowId);
    expect(c._rowId).toBeGreaterThan(b._rowId);
  });

  it("draftFieldsFromContentType assigns fresh, increasing _rowIds off the SAME counter emptyField uses", () => {
    const before = emptyField();
    const seeded = draftFieldsFromContentType([
      { name: "a", kind: "text", required: false, queryable: false },
      { name: "b", kind: "text", required: false, queryable: false },
    ]);
    expect(seeded[0]._rowId).toBeGreaterThan(before._rowId);
    expect(seeded[1]._rowId).toBeGreaterThan(seeded[0]._rowId);
    // Continuing to call emptyField afterward keeps advancing past draftFieldsFromContentType's
    // ids too — proof it's genuinely the same shared counter, not two independent ones that
    // happen to start at the same place.
    const after = emptyField();
    expect(after._rowId).toBeGreaterThan(seeded[1]._rowId);
  });

  it("LANDMINE: the counter does not reset between independent dialog sessions — simulates 'open New, cancel, open Edit'", () => {
    const openNewDialogFirstId = emptyField()._rowId;
    // ...dialog cancelled, unmounted...
    const openEditDialogFirstId = draftFieldsFromContentType([{ name: "x", kind: "text", required: false, queryable: false }])[0]._rowId;
    expect(openEditDialogFirstId).toBeGreaterThan(openNewDialogFirstId);
  });
});

describe("updateDraftField", () => {
  it("patches only the field matching rowId, leaving others untouched", () => {
    const fields: DraftField[] = [
      { _rowId: 1, name: "a", kind: "text", required: false, queryable: false },
      { _rowId: 2, name: "b", kind: "text", required: false, queryable: false },
    ];
    const result = updateDraftField(fields, 2, { name: "b2" });
    expect(result[0]).toEqual(fields[0]);
    expect(result[1].name).toBe("b2");
  });

  it("returns the list unchanged (by value) when rowId matches nothing", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "a", kind: "text", required: false, queryable: false }];
    expect(updateDraftField(fields, 999, { name: "z" })).toEqual(fields);
  });
});

describe("removeDraftField", () => {
  it("removes only the field matching rowId", () => {
    const fields: DraftField[] = [
      { _rowId: 1, name: "a", kind: "text", required: false, queryable: false },
      { _rowId: 2, name: "b", kind: "text", required: false, queryable: false },
    ];
    expect(removeDraftField(fields, 1)).toEqual([fields[1]]);
  });
});

describe("addDraftField", () => {
  it("appends one new empty field with a fresh _rowId", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "a", kind: "text", required: false, queryable: false }];
    const result = addDraftField(fields);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ name: "", kind: "text", required: false, queryable: false });
    expect(result[1]._rowId).not.toBe(1);
  });
});

describe("stripDraftFieldRowIds", () => {
  it("drops _rowId from every field", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "a", kind: "text", required: true, queryable: true }];
    const result: ContentTypeFieldDef[] = stripDraftFieldRowIds(fields);
    expect(result).toEqual([{ name: "a", kind: "text", required: true, queryable: true }]);
    expect(result[0]).not.toHaveProperty("_rowId");
  });

  it("handles an empty list", () => {
    expect(stripDraftFieldRowIds([])).toEqual([]);
  });
});

describe("firstDraftFieldError", () => {
  it("returns null when every field name is valid", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "prep_time", kind: "text", required: false, queryable: false }];
    expect(firstDraftFieldError(fields)).toBeNull();
  });

  it("returns the first failure, quoting the field's own name", () => {
    const fields: DraftField[] = [
      { _rowId: 1, name: "ok_field", kind: "text", required: false, queryable: false },
      { _rowId: 2, name: "Bad-Name", kind: "text", required: false, queryable: false },
    ];
    expect(firstDraftFieldError(fields)).toContain('Field "Bad-Name"');
  });

  it("labels an unnamed field as '(unnamed)' rather than showing an empty quoted name", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "", kind: "text", required: false, queryable: false }];
    expect(firstDraftFieldError(fields)).toContain('Field "(unnamed)"');
  });

  it("trims whitespace before validating a field name", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "  prep_time  ", kind: "text", required: false, queryable: false }];
    expect(firstDraftFieldError(fields)).toBeNull();
  });
});

describe("validateNewContentTypeDraft", () => {
  const validField: DraftField = { _rowId: 1, name: "prep_time", kind: "text", required: false, queryable: false };

  it("returns null for a fully valid draft", () => {
    expect(validateNewContentTypeDraft({ key: "recipe", label: "Recipe", fields: [validField] })).toBeNull();
  });

  it("checks key BEFORE label — an invalid key wins even if label is also blank", () => {
    const result = validateNewContentTypeDraft({ key: "", label: "", fields: [validField] });
    expect(result).not.toContain("Label is required");
  });

  it("checks label before field errors when key is valid", () => {
    const badField: DraftField = { _rowId: 1, name: "Bad-Name", kind: "text", required: false, queryable: false };
    const result = validateNewContentTypeDraft({ key: "recipe", label: "", fields: [badField] });
    expect(result).toBe("Label is required.");
  });

  it("trims the key and label before validating", () => {
    expect(validateNewContentTypeDraft({ key: "  recipe  ", label: "  Recipe  ", fields: [validField] })).toBeNull();
  });

  it("falls through to field errors once key and label are valid", () => {
    const badField: DraftField = { _rowId: 1, name: "Bad-Name", kind: "text", required: false, queryable: false };
    const result = validateNewContentTypeDraft({ key: "recipe", label: "Recipe", fields: [badField] });
    expect(result).toContain('Field "Bad-Name"');
  });
});

describe("validateEditFieldsDraft", () => {
  it("rejects an empty field list — a content type cannot be edited down to zero fields", () => {
    expect(validateEditFieldsDraft([])).toBe("At least one field is required.");
  });

  it("returns null when at least one field remains and all names are valid", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "prep_time", kind: "text", required: false, queryable: false }];
    expect(validateEditFieldsDraft(fields)).toBeNull();
  });

  it("falls through to field-name errors once the length check passes", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "Bad-Name", kind: "text", required: false, queryable: false }];
    expect(validateEditFieldsDraft(fields)).toContain('Field "Bad-Name"');
  });
});

describe("describeEditFieldsError", () => {
  it("maps a 409 ApiError to the shared stale-version message", () => {
    const err = new ApiError("Conflict", 409, "VERSION_CONFLICT");
    expect(describeEditFieldsError(err)).toBe(STALE_VERSION_MESSAGE);
  });

  it("does not use the stale-version message for a non-409 ApiError", () => {
    const err = new ApiError("Server error", 500, "INTERNAL");
    expect(describeEditFieldsError(err)).not.toBe(STALE_VERSION_MESSAGE);
    expect(describeEditFieldsError(err)).toBe("Server error");
  });

  it("falls back to the generic 'Failed to update fields' message for a thrown non-Error value", () => {
    expect(describeEditFieldsError("not an Error instance")).toBe("Failed to update fields");
  });

  it("uses a plain Error's own message rather than the fallback", () => {
    expect(describeEditFieldsError(new Error("network down"))).toBe("network down");
  });
});

describe("autoFocusCancelForLifecycleOp", () => {
  it("focuses Cancel for tombstone (the heavier, less-reversible op)", () => {
    expect(autoFocusCancelForLifecycleOp("tombstone")).toBe(true);
  });

  it("does not focus Cancel for deprecate", () => {
    expect(autoFocusCancelForLifecycleOp("deprecate")).toBe(false);
  });
});

describe("LIFECYCLE_COPY", () => {
  it("has distinct title/body copy for deprecate and tombstone", () => {
    expect(LIFECYCLE_COPY.deprecate.title).toBe("Deprecate content type");
    expect(LIFECYCLE_COPY.tombstone.title).toBe("Tombstone content type");
    expect(LIFECYCLE_COPY.tombstone.body).toContain("not reversible");
  });
});

describe("contentTypeMenuItems", () => {
  const handlers = {
    onEditFields: () => {},
    onDeprecate: () => {},
    onReactivate: () => {},
    onTombstone: () => {},
  };

  it("always includes Edit fields", () => {
    const items = contentTypeMenuItems(contentType({ status: "active" }), handlers, "en");
    expect(items.map((i) => i.key)).toContain("edit-fields");
  });

  it("active status: offers Deprecate and Tombstone, not Reactivate", () => {
    const items = contentTypeMenuItems(contentType({ status: "active" }), handlers, "en");
    const keys = items.map((i) => i.key);
    expect(keys).toContain("deprecate");
    expect(keys).not.toContain("reactivate");
    expect(keys).toContain("tombstone");
  });

  it("deprecated status: offers Reactivate and Tombstone, not Deprecate", () => {
    const items = contentTypeMenuItems(contentType({ status: "deprecated" }), handlers, "en");
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain("deprecate");
    expect(keys).toContain("reactivate");
    expect(keys).toContain("tombstone");
  });

  it("tombstone status: offers neither Deprecate nor Reactivate nor Tombstone (already terminal)", () => {
    const items = contentTypeMenuItems(contentType({ status: "tombstone" }), handlers, "en");
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain("deprecate");
    expect(keys).not.toContain("reactivate");
    expect(keys).not.toContain("tombstone");
  });

  it("marks Tombstone destructive, and Deprecate/Reactivate plain", () => {
    const items = contentTypeMenuItems(contentType({ status: "active" }), handlers, "en");
    expect(items.find((i) => i.key === "tombstone")?.destructive).toBe(true);
    expect(items.find((i) => i.key === "deprecate")?.destructive).toBeFalsy();
  });

  it("each item's onSelect calls the matching handler with the content type", () => {
    const ct = contentType({ status: "active", key: "recipe" });
    const onEditFields = vi.fn();
    const onDeprecate = vi.fn();
    const items = contentTypeMenuItems(ct, { ...handlers, onEditFields, onDeprecate }, "en");
    items.find((i) => i.key === "edit-fields")!.onSelect();
    items.find((i) => i.key === "deprecate")!.onSelect();
    expect(onEditFields).toHaveBeenCalledWith(ct);
    expect(onDeprecate).toHaveBeenCalledWith(ct);
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = contentTypeMenuItems(contentType({ status: "active" }), handlers, "es");
    expect(items.map((i) => i.label)).toEqual(["Editar campos", "Marcar obsoleto", "Eliminar definitivamente"]);
    const deprecated = contentTypeMenuItems(contentType({ status: "deprecated" }), handlers, "es");
    expect(deprecated.find((i) => i.key === "reactivate")?.label).toBe("Reactivar");
  });
});
