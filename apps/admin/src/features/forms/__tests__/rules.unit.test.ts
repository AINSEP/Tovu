import { describe, expect, it } from "vitest";

import { ApiError, type AdminFormDefinition } from "@/lib/api";
import { describeTrashError, formRowMenuItems, formsListError } from "../rules";

/**
 * @file T7a (2026-09-21) pure-logic coverage: the forms-delete confirm flow's `RowMenu` items, its
 * error-banner precedence, and the shared `describeTrashError` classifier `useFormsList` (forms) and
 * `useFormSubmissionDetail` (submissions) both use for their `api.trash` failures. No dedicated
 * `rules.unit.test.ts` existed for `features/forms` before this pass — `formRowMenuItems`/
 * `formsListError` were previously only exercised indirectly through `FormsList.unit.test.tsx`'s
 * full-component render.
 */

function form(overrides: Partial<AdminFormDefinition> = {}): AdminFormDefinition {
  return {
    id: "f1",
    workspaceId: "fake-ws",
    name: "Contact",
    slug: "contact",
    fields: [],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("describeTrashError", () => {
  const versionChangedMessage = "This item changed since you loaded it. Reload and try again.";
  it("returns no message and alreadyGone: false for a null error", () => {
    expect(describeTrashError(null, "failed to delete form", versionChangedMessage)).toEqual({ alreadyGone: false, message: null });
  });

  it("classifies a 404 as already-gone with no banner message — a quiet refetch, not an error", () => {
    const result = describeTrashError(new ApiError("not found", 404, "NOT_FOUND"), "failed to delete form", versionChangedMessage);
    expect(result).toEqual({ alreadyGone: true, message: null });
  });

  it("classifies a 409 TRASH_VERSION_CHANGED with the specific reload-and-retry copy", () => {
    const result = describeTrashError(new ApiError("changed", 409, "TRASH_VERSION_CHANGED"), "failed to delete form", versionChangedMessage);
    expect(result).toEqual({
      alreadyGone: false,
      message: "This item changed since you loaded it. Reload and try again.",
    });
  });

  it("falls through to the generic fallback for any other ApiError", () => {
    const result = describeTrashError(new ApiError("nope", 403, "FORBIDDEN"), "failed to delete form", versionChangedMessage);
    expect(result.alreadyGone).toBe(false);
    expect(result.message).toBe("nope");
  });

  it("falls through to the fallback for a non-ApiError failure (e.g. a network error)", () => {
    const result = describeTrashError(new Error("network down"), "failed to delete form", versionChangedMessage);
    expect(result).toEqual({ alreadyGone: false, message: "network down" });
  });
});

describe("formsListError", () => {
  const copy = {
    deleteFallback: "failed to delete form",
    statusUpdateFallback: "failed to update form status",
    loadFormsFallback: "failed to load forms",
    versionChangedMessage: "This item changed since you loaded it. Reload and try again.",
  };
  it("is null when nothing failed and forms are loaded", () => {
    expect(formsListError({ toggleError: null, deleteError: null, listError: null, hasForms: true, ...copy })).toBeNull();
  });

  it("a delete's own version-changed failure outranks the toggle and list errors", () => {
    const message = formsListError({
      toggleError: new Error("toggle failed"),
      deleteError: new ApiError("changed", 409, "TRASH_VERSION_CHANGED"),
      listError: new Error("list failed"),
      hasForms: true,
      ...copy,
    });
    expect(message).toBe("This item changed since you loaded it. Reload and try again.");
  });

  it("a delete's 404 (already gone) contributes no banner, so the toggle error surfaces instead", () => {
    const message = formsListError({
      toggleError: new Error("toggle failed"),
      deleteError: new ApiError("gone", 404, "NOT_FOUND"),
      listError: null,
      hasForms: true,
      ...copy,
    });
    expect(message).toBe("toggle failed");
  });

  it("falls back to the list error only once forms have never loaded", () => {
    const message = formsListError({ toggleError: null, deleteError: null, listError: new Error("boom"), hasForms: false, ...copy });
    expect(message).toBe("boom");
  });

  it("a background list-refresh failure is suppressed once forms have already loaded", () => {
    const message = formsListError({ toggleError: null, deleteError: null, listError: new Error("boom"), hasForms: true, ...copy });
    expect(message).toBeNull();
  });
});

describe("formRowMenuItems", () => {
  const handlers = { onEdit: () => {}, onToggleStatus: () => {}, onDelete: () => {} };

  it("includes a destructive-toned Delete item that opens the confirm (onDelete), not the port", () => {
    const items = formRowMenuItems(form(), handlers, (k) => k);
    const deleteItem = items.find((i) => i.key === "delete");
    expect(deleteItem).toBeDefined();
    expect(deleteItem?.tone).toBe("danger");
    expect(deleteItem?.label).toBe("Delete");
  });

  it("Delete's onSelect calls handlers.onDelete with the form, not handlers.onToggleStatus", () => {
    const calls: AdminFormDefinition[] = [];
    const items = formRowMenuItems(form({ id: "f9" }), { ...handlers, onDelete: (f) => calls.push(f) }, (k) => k);
    items.find((i) => i.key === "delete")?.onSelect();
    expect(calls).toEqual([form({ id: "f9" })]);
  });

  it("keeps Edit and the status toggle present alongside Delete (three items total)", () => {
    const items = formRowMenuItems(form({ status: "active" }), handlers, (k) => k);
    expect(items.map((i) => i.key)).toEqual(["edit", "toggle-status", "delete"]);
  });
});
