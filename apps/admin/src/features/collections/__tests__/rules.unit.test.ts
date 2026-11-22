import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_SYSTEM_CONTENT_TYPES,
  addDraftField,
  autoFocusCancelForLifecycleOp,
  collectionEmbedSnippet,
  contentTypeMenuItems,
  describeEditFieldsError,
  draftFieldsFromContentType,
  emptyField,
  firstDraftFieldError,
  isUserCollection,
  LIFECYCLE_COPY,
  removeDraftField,
  STALE_VERSION_MESSAGE,
  stripDraftFieldRowIds,
  updateDraftField,
  validateEditFieldsDraft,
  validateFieldName,
  validateKey,
  validateNewContentTypeDraft,
  visibleEntryEditorError,
  type DraftField,
} from "../rules";
import type { AdminContentType, ContentTypeFieldDef } from "@jini-ai/admin/screens/collections/api/collections-api.types";
import { ApiError } from "@/lib/admin-http/request";

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
    expect(validateKey({ key: "recipe_2" })).toBeNull();
  });

  it("rejects a key starting with a digit or uppercase letter", () => {
    expect(validateKey({ key: "2recipe" })).not.toBeNull();
    expect(validateKey({ key: "Recipe" })).not.toBeNull();
  });

  it.each(["my-recipe", "recipE", "my recipe"])("rejects an invalid character within key %s", (key) => {
    expect(validateKey({ key })).toBe("Key must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 chars).");
  });

  it("rejects an empty key", () => {
    expect(validateKey({ key: "" })).not.toBeNull();
  });

  it("rejects a key over 64 characters", () => {
    expect(validateKey({ key: "a" + "b".repeat(64) })).not.toBeNull();
  });

  it("accepts a key at exactly 64 characters", () => {
    expect(validateKey({ key: "a" + "b".repeat(63) })).toBeNull();
  });

  it("rejects the reserved keys 'post' and 'page'", () => {
    expect(validateKey({ key: "post" })).toContain("reserved");
    expect(validateKey({ key: "page" })).toContain("reserved");
    for (const key of ["post", "page"]) {
      expect(validateKey({ key })).toBe(`"${key}" is a reserved key (built-in content already uses it).`);
    }
  });
});

describe("validateFieldName", () => {
  it("accepts a valid field name", () => {
    expect(validateFieldName({ name: "prep_time" })).toBeNull();
  });

  it.each(["prep-time", "prep Time", "prepTime", "", "a" + "b".repeat(64)])("rejects invalid field name %s with the validation message", (name) => {
    expect(validateFieldName({ name })).toBe("Field name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.");
  });

  it("rejects an invalid field name", () => {
    expect(validateFieldName({ name: "Prep-Time" })).not.toBeNull();
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
    const seeded = draftFieldsFromContentType({ fields: [
      { name: "a", kind: "text", required: false, queryable: false },
      { name: "b", kind: "text", required: false, queryable: false },
    ] });
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
    const openEditDialogFirstId = draftFieldsFromContentType({ fields: [{ name: "x", kind: "text", required: false, queryable: false }] })[0]._rowId;
    expect(openEditDialogFirstId).toBeGreaterThan(openNewDialogFirstId);
  });
});

describe("updateDraftField", () => {
  it("patches only the field matching rowId, leaving others untouched", () => {
    const fields: DraftField[] = [
      { _rowId: 1, name: "a", kind: "text", required: false, queryable: false },
      { _rowId: 2, name: "b", kind: "text", required: false, queryable: false },
    ];
    const result = updateDraftField({ fields, rowId: 2, patch: { name: "b2" } });
    expect(result[0]).toEqual(fields[0]);
    expect(result[1].name).toBe("b2");
  });

  it("returns the list unchanged (by value) when rowId matches nothing", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "a", kind: "text", required: false, queryable: false }];
    expect(updateDraftField({ fields, rowId: 999, patch: { name: "z" } })).toEqual(fields);
  });
});

describe("removeDraftField", () => {
  it("removes only the field matching rowId", () => {
    const fields: DraftField[] = [
      { _rowId: 1, name: "a", kind: "text", required: false, queryable: false },
      { _rowId: 2, name: "b", kind: "text", required: false, queryable: false },
    ];
    expect(removeDraftField({ fields, rowId: 1 })).toEqual([fields[1]]);
  });
});

describe("addDraftField", () => {
  it("appends one new empty field with a fresh _rowId", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "a", kind: "text", required: false, queryable: false }];
    const result = addDraftField({ fields });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ name: "", kind: "text", required: false, queryable: false });
    expect(result[1]._rowId).not.toBe(1);
  });
});

describe("stripDraftFieldRowIds", () => {
  it("drops _rowId from every field", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "a", kind: "text", required: true, queryable: true }];
    const result: ContentTypeFieldDef[] = stripDraftFieldRowIds({ fields });
    expect(result).toEqual([{ name: "a", kind: "text", required: true, queryable: true }]);
    expect(result[0]).not.toHaveProperty("_rowId");
  });

  it("handles an empty list", () => {
    expect(stripDraftFieldRowIds({ fields: [] })).toEqual([]);
  });
});

describe("firstDraftFieldError", () => {
  it("returns null when every field name is valid", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "prep_time", kind: "text", required: false, queryable: false }];
    expect(firstDraftFieldError({ fields })).toBeNull();
  });

  it("returns the first failure, quoting the field's own name", () => {
    const fields: DraftField[] = [
      { _rowId: 1, name: "ok_field", kind: "text", required: false, queryable: false },
      { _rowId: 2, name: "Bad-Name", kind: "text", required: false, queryable: false },
    ];
    expect(firstDraftFieldError({ fields })).toContain('Field "Bad-Name"');
  });

  it("labels an unnamed field as '(unnamed)' rather than showing an empty quoted name", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "", kind: "text", required: false, queryable: false }];
    expect(firstDraftFieldError({ fields })).toContain('Field "(unnamed)"');
  });

  it("trims whitespace before validating a field name", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "  prep_time  ", kind: "text", required: false, queryable: false }];
    expect(firstDraftFieldError({ fields })).toBeNull();
  });
});

describe("validateNewContentTypeDraft", () => {
  const validField: DraftField = { _rowId: 1, name: "prep_time", kind: "text", required: false, queryable: false };

  it("returns null for a fully valid draft", () => {
    expect(validateNewContentTypeDraft({ draft: { key: "recipe", label: "Recipe", fields: [validField] } })).toBeNull();
  });

  it("checks key BEFORE label — an invalid key wins even if label is also blank", () => {
    const result = validateNewContentTypeDraft({ draft: { key: "", label: "", fields: [validField] } });
    expect(result).not.toContain("Label is required");
  });

  it("checks label before field errors when key is valid", () => {
    const badField: DraftField = { _rowId: 1, name: "Bad-Name", kind: "text", required: false, queryable: false };
    const result = validateNewContentTypeDraft({ draft: { key: "recipe", label: "", fields: [badField] } });
    expect(result).toBe("Label is required.");
  });

  it("trims the key and label before validating", () => {
    expect(validateNewContentTypeDraft({ draft: { key: "  recipe  ", label: "  Recipe  ", fields: [validField] } })).toBeNull();
  });

  it("falls through to field errors once key and label are valid", () => {
    const badField: DraftField = { _rowId: 1, name: "Bad-Name", kind: "text", required: false, queryable: false };
    const result = validateNewContentTypeDraft({ draft: { key: "recipe", label: "Recipe", fields: [badField] } });
    expect(result).toContain('Field "Bad-Name"');
  });
});

describe("validateEditFieldsDraft", () => {
  it("rejects an empty field list — a content type cannot be edited down to zero fields", () => {
    expect(validateEditFieldsDraft({ fields: [] })).toBe("At least one field is required.");
  });

  it("returns null when at least one field remains and all names are valid", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "prep_time", kind: "text", required: false, queryable: false }];
    expect(validateEditFieldsDraft({ fields })).toBeNull();
  });

  it("falls through to field-name errors once the length check passes", () => {
    const fields: DraftField[] = [{ _rowId: 1, name: "Bad-Name", kind: "text", required: false, queryable: false }];
    expect(validateEditFieldsDraft({ fields })).toContain('Field "Bad-Name"');
  });
});

describe("describeEditFieldsError", () => {
  it("maps a 409 ApiError to the shared stale-version message", () => {
    const err = new ApiError({ message: "Conflict", status: 409 }, { code: "VERSION_CONFLICT" });
    expect(describeEditFieldsError({ e: err })).toBe(STALE_VERSION_MESSAGE);
  });

  it("does not use the stale-version message for a non-409 ApiError", () => {
    const err = new ApiError({ message: "Server error", status: 500 }, { code: "INTERNAL" });
    expect(describeEditFieldsError({ e: err })).not.toBe(STALE_VERSION_MESSAGE);
    expect(describeEditFieldsError({ e: err })).toBe("Server error");
  });

  it("falls back to the generic 'Failed to update fields' message for a thrown non-Error value", () => {
    expect(describeEditFieldsError({ e: "not an Error instance" })).toBe("Failed to update fields");
  });

  it("uses a plain Error's own message rather than the fallback", () => {
    expect(describeEditFieldsError({ e: new Error("network down") })).toBe("network down");
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
    expect(LIFECYCLE_COPY.tombstone.title).toBe("Delete content type");
    expect(LIFECYCLE_COPY.tombstone.body).toContain("not reversible");
  });
});

describe("isUserCollection", () => {
  it("hides every ADMIN_SYSTEM_CONTENT_TYPES entry (widget/widget_area/menu)", () => {
    expect(ADMIN_SYSTEM_CONTENT_TYPES).toEqual(["widget", "widget_area", "menu"]);
    for (const key of ADMIN_SYSTEM_CONTENT_TYPES) {
      expect(isUserCollection({ key })).toBe(false);
    }
  });

  it("shows a user-defined content type", () => {
    expect(isUserCollection({ key: "recipe" })).toBe(true);
  });
});

describe("collectionEmbedSnippet", () => {
  it("embeds the content-type key as `id`, never a UUID", () => {
    expect(collectionEmbedSnippet({ key: "tovu_feature" })).toBe(
      '<div data-embed-config=\'{"type":"collection","id":"tovu_feature"}\'></div>',
    );
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
    const items = contentTypeMenuItems({ contentType: contentType({ status: "active" }), handlers, locale: "en" });
    expect(items.map((i) => i.key)).toContain("edit-fields");
  });

  it("active status: offers Deprecate and Tombstone, not Reactivate", () => {
    const items = contentTypeMenuItems({ contentType: contentType({ status: "active" }), handlers, locale: "en" });
    const keys = items.map((i) => i.key);
    expect(keys).toContain("deprecate");
    expect(keys).not.toContain("reactivate");
    expect(keys).toContain("tombstone");
  });

  it("deprecated status: offers Reactivate and Tombstone, not Deprecate", () => {
    const items = contentTypeMenuItems({ contentType: contentType({ status: "deprecated" }), handlers, locale: "en" });
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain("deprecate");
    expect(keys).toContain("reactivate");
    expect(keys).toContain("tombstone");
  });

  it("tombstone status: offers neither Deprecate nor Reactivate nor Tombstone (already terminal)", () => {
    const items = contentTypeMenuItems({ contentType: contentType({ status: "tombstone" }), handlers, locale: "en" });
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain("deprecate");
    expect(keys).not.toContain("reactivate");
    expect(keys).not.toContain("tombstone");
  });

  it("marks Tombstone destructive, and Deprecate/Reactivate plain", () => {
    const items = contentTypeMenuItems({ contentType: contentType({ status: "active" }), handlers, locale: "en" });
    expect(items.find((i) => i.key === "tombstone")?.destructive).toBe(true);
    expect(items.find((i) => i.key === "deprecate")?.destructive).toBeFalsy();
  });

  it("each item's onSelect calls the matching handler with the content type", () => {
    const ct = contentType({ status: "active", key: "recipe" });
    const onEditFields = vi.fn();
    const onDeprecate = vi.fn();
    const items = contentTypeMenuItems({ contentType: ct, handlers: { ...handlers, onEditFields, onDeprecate }, locale: "en" });
    items.find((i) => i.key === "edit-fields")!.onSelect();
    items.find((i) => i.key === "deprecate")!.onSelect();
    expect(onEditFields).toHaveBeenCalledWith(ct);
    expect(onDeprecate).toHaveBeenCalledWith({ contentType: ct });
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = contentTypeMenuItems({ contentType: contentType({ status: "active" }), handlers, locale: "es" });
    expect(items.map((i) => i.label)).toEqual(["Editar campos", "Marcar obsoleto", "Eliminar definitivamente"]);
    const deprecated = contentTypeMenuItems({ contentType: contentType({ status: "deprecated" }), handlers, locale: "es" });
    expect(deprecated.find((i) => i.key === "reactivate")?.label).toBe("Reactivar");
  });
});

describe("visibleEntryEditorError — version conflicts", () => {
  const base = {
    updateError: null,
    createError: null,
    lifecycleError: null,
    saveFallback: "save failed",
    lifecycleFallback: "Failed to publish entry",
    versionConflictMessage: "CONFLICT COPY",
  };
  const conflict = new ApiError({ message: "expected version 2 for entry 'e1', found 3", status: 409 }, { code: "VERSION_CONFLICT" });

  it("shows the conflict copy, not the server message, when a save loses the compare-and-set", () => {
    expect(visibleEntryEditorError({ ...base, updateError: conflict })).toBe("CONFLICT COPY");
  });

  it("shows the conflict copy when a publish/unpublish loses the compare-and-set", () => {
    expect(visibleEntryEditorError({ ...base, lifecycleError: conflict })).toBe("CONFLICT COPY");
  });

  it("keeps the server message for a code-less 409", () => {
    const slugTaken = new ApiError({ message: "slug 'x' already exists", status: 409 });
    expect(visibleEntryEditorError({ ...base, updateError: slugTaken })).toBe("slug 'x' already exists");
    expect(visibleEntryEditorError({ ...base, lifecycleError: slugTaken })).toBe("slug 'x' already exists");
  });

  it("describes a create failure with the save fallback", () => {
    expect(visibleEntryEditorError({ ...base, createError: new ApiError({ message: "", status: 500 }) })).toBe("save failed");
  });

  it("shows nothing for a lifecycle error with no attempted op, or when nothing failed", () => {
    expect(visibleEntryEditorError({ ...base, lifecycleError: conflict, lifecycleFallback: null })).toBeNull();
    expect(visibleEntryEditorError(base)).toBeNull();
  });
});
