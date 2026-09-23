import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminPolicy, type AdminRole } from "@/lib/api";
import { describeApiError, roleMenuItems, policyMenuItems } from "../rules";
import { t } from "../roles-i18n";

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
    expect(describeApiError(err, "fallback", "en")).toBe(expected);
  });

  it("uses the ApiError's own message for VALIDATION_ERROR when present", () => {
    const err = new ApiError("Name is required", 400, "VALIDATION_ERROR");
    expect(describeApiError(err, "fallback", "en")).toBe("Name is required");
  });

  it("falls back to the generic validation copy when VALIDATION_ERROR carries no message", () => {
    const err = new ApiError("", 400, "VALIDATION_ERROR");
    expect(describeApiError(err, "fallback", "en")).toBe("Please correct the highlighted fields.");
  });

  it("defers to the shared default translation for an unrecognized ApiError code", () => {
    const err = new ApiError("some other server message", 500, "SOME_OTHER_CODE");
    expect(describeApiError(err, "fallback", "en")).toBe("some other server message");
  });

  it("defers to the shared default translation for a plain Error", () => {
    expect(describeApiError(new Error("network down"), "fallback", "en")).toBe("network down");
  });

  it("uses the fallback for a non-Error, non-ApiError thrown value", () => {
    expect(describeApiError("boom", "fallback", "en")).toBe("fallback");
  });

  // C4 — table-driven translation of each static override into the operator's locale (es).
  it.each([
    ["FORBIDDEN", "No tienes permiso para hacer eso."],
    ["RESOURCE_CONFLICT", "Todavía está en uso; primero quita esa asignación o adjunto."],
    ["PERMISSION_UNKNOWN", "Ese permiso no se reconoce."],
    ["GRANT_EXCEEDS_ISSUER", "No puedes otorgar un permiso que no posees."],
  ])("translates the %s override into the operator's locale (es)", (code, expected) => {
    expect(describeApiError(new ApiError("raw", 400, code), "fallback", "es")).toBe(expected);
  });

  it("translates the VALIDATION_ERROR fallback into the operator's locale (es)", () => {
    expect(describeApiError(new ApiError("", 400, "VALIDATION_ERROR"), "fallback", "es")).toBe(
      "Corrige los campos resaltados.",
    );
  });

  it("falls back to English for an unrecognized locale", () => {
    expect(describeApiError(new ApiError("raw", 400, "FORBIDDEN"), "fallback", "xx")).toBe(
      "You do not have permission to do that.",
    );
  });
});

// C4 — dictionary-parity spot check for just the 5 keys this pass added (same scoping as C1's own
// `roles-i18n.unit.test.ts`, so pre-existing dictionary drift elsewhere does not fail this file).
describe("roles-i18n — C4 keys", () => {
  const LOCALES = [
    "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
    "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
  ];
  const NEW_KEYS = [
    "You do not have permission to do that.",
    "It is still in use — remove that assignment/attachment first.",
    "That permission is not recognized.",
    "You cannot grant a permission you do not hold.",
    "Please correct the highlighted fields.",
  ];

  for (const key of NEW_KEYS) {
    for (const locale of LOCALES) {
      it(`t(${locale}, "${key}") is non-empty and translated`, () => {
        const translated = t(locale, key);
        expect(translated.length).toBeGreaterThan(0);
        expect(translated).not.toBe(key);
      });
    }
  }
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
