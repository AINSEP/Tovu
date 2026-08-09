import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminPolicy, type AdminRole } from "../../../lib/api";
import { describeApiError, roleMenuItems, policyMenuItems } from "../rules";

/**
 * @file Pure logic for `features/roles/rules.ts`.
 *
 * `describeApiError` layers five `ApiError.code` overrides on top of the shared
 * `lib/api.ts` default; every branch is asserted individually plus the fallthrough case, since a
 * screen-specific error-copy table silently regressing to the generic message (or vice versa) is
 * exactly the "moved verbatim" contract the extraction claims and is otherwise unverified.
 */

const ROLE: AdminRole = { id: "r1", workspaceId: "w1", name: "Editor", isBuiltin: false };
const POLICY: AdminPolicy = {
  id: "p1",
  workspaceId: "w1",
  name: "Content Policy",
  description: "desc",
  isBuiltin: false,
  isFrozen: false,
};

describe("describeApiError", () => {
  it.each([
    ["FORBIDDEN", "You do not have permission to do that."],
    ["RESOURCE_CONFLICT", "It is still in use — remove that assignment/attachment first."],
    ["PERMISSION_UNKNOWN", "That permission is not recognized."],
    ["GRANT_EXCEEDS_ISSUER", "You cannot grant a permission you do not hold."],
  ])("maps ApiError code %s to its screen-specific copy", (code, expected) => {
    const err = new ApiError("raw server message", 400, code);
    expect(describeApiError(err, "fallback")).toBe(expected);
  });

  it("uses the ApiError's own message for VALIDATION_ERROR when present", () => {
    const err = new ApiError("Name is required", 400, "VALIDATION_ERROR");
    expect(describeApiError(err, "fallback")).toBe("Name is required");
  });

  it("falls back to the generic validation copy when VALIDATION_ERROR carries no message", () => {
    const err = new ApiError("", 400, "VALIDATION_ERROR");
    expect(describeApiError(err, "fallback")).toBe("Please correct the highlighted fields.");
  });

  it("defers to the shared default translation for an unrecognized ApiError code", () => {
    const err = new ApiError("some other server message", 500, "SOME_OTHER_CODE");
    expect(describeApiError(err, "fallback")).toBe("some other server message");
  });

  it("defers to the shared default translation for a plain Error", () => {
    expect(describeApiError(new Error("network down"), "fallback")).toBe("network down");
  });

  it("uses the fallback for a non-Error, non-ApiError thrown value", () => {
    expect(describeApiError("boom", "fallback")).toBe("fallback");
  });
});

describe("roleMenuItems", () => {
  it("returns exactly Rename then Delete, with Delete marked destructive", () => {
    const items = roleMenuItems(ROLE, { onRename: vi.fn(), onDelete: vi.fn() }, "en");
    expect(items.map((i) => i.key)).toEqual(["rename", "delete"]);
    expect(items[0]).toMatchObject({ label: "Rename" });
    expect(items[1]).toMatchObject({ label: "Delete", destructive: true });
  });

  it("wires Rename's onSelect to onRename with the role, not onDelete", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const items = roleMenuItems(ROLE, { onRename, onDelete }, "en");
    items[0].onSelect?.();
    expect(onRename).toHaveBeenCalledWith(ROLE);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wires Delete's onSelect to onDelete with the role, not onRename", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const items = roleMenuItems(ROLE, { onRename, onDelete }, "en");
    items[1].onSelect?.();
    expect(onDelete).toHaveBeenCalledWith(ROLE);
    expect(onRename).not.toHaveBeenCalled();
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = roleMenuItems(ROLE, { onRename: vi.fn(), onDelete: vi.fn() }, "es");
    expect(items.map((i) => i.label)).toEqual(["Renombrar", "Eliminar"]);
  });
});

describe("policyMenuItems", () => {
  it("returns exactly Rename, permission-toggle, then Delete", () => {
    const items = policyMenuItems(
      POLICY,
      null,
      { onRename: vi.fn(), onTogglePermissionForm: vi.fn(), onDelete: vi.fn() },
      "en",
    );
    expect(items.map((i) => i.key)).toEqual(["rename", "permission", "delete"]);
    expect(items[2]).toMatchObject({ label: "Delete", destructive: true });
  });

  it("labels the toggle 'Add permission' when this policy's form is not open", () => {
    const items = policyMenuItems(
      POLICY,
      null,
      { onRename: vi.fn(), onTogglePermissionForm: vi.fn(), onDelete: vi.fn() },
      "en",
    );
    expect(items[1].label).toBe("Add permission");
  });

  it("labels the toggle 'Add permission' when a DIFFERENT policy's form is open", () => {
    const items = policyMenuItems(
      POLICY,
      "some-other-policy-id",
      { onRename: vi.fn(), onTogglePermissionForm: vi.fn(), onDelete: vi.fn() },
      "en",
    );
    expect(items[1].label).toBe("Add permission");
  });

  it("labels the toggle 'Close' when THIS policy's form is open", () => {
    const items = policyMenuItems(
      POLICY,
      POLICY.id,
      { onRename: vi.fn(), onTogglePermissionForm: vi.fn(), onDelete: vi.fn() },
      "en",
    );
    expect(items[1].label).toBe("Close");
  });

  it("wires the toggle's onSelect to onTogglePermissionForm with the policy id", () => {
    const onTogglePermissionForm = vi.fn();
    const items = policyMenuItems(
      POLICY,
      null,
      { onRename: vi.fn(), onTogglePermissionForm, onDelete: vi.fn() },
      "en",
    );
    items[1].onSelect?.();
    expect(onTogglePermissionForm).toHaveBeenCalledWith(POLICY.id);
  });

  it("wires Rename and Delete to the policy, independently of each other", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const items = policyMenuItems(POLICY, null, { onRename, onTogglePermissionForm: vi.fn(), onDelete }, "en");
    items[0].onSelect?.();
    items[2].onSelect?.();
    expect(onRename).toHaveBeenCalledWith(POLICY);
    expect(onDelete).toHaveBeenCalledWith(POLICY);
  });

  it("translates labels to Spanish when locale is es, including the toggle's open/closed state", () => {
    const closedItems = policyMenuItems(
      POLICY,
      null,
      { onRename: vi.fn(), onTogglePermissionForm: vi.fn(), onDelete: vi.fn() },
      "es",
    );
    expect(closedItems.map((i) => i.label)).toEqual(["Renombrar", "Agregar permiso", "Eliminar"]);

    const openItems = policyMenuItems(
      POLICY,
      POLICY.id,
      { onRename: vi.fn(), onTogglePermissionForm: vi.fn(), onDelete: vi.fn() },
      "es",
    );
    expect(openItems[1].label).toBe("Cerrar");
  });
});
