import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminIdentityUser } from "@/lib/api";
import { describeApiError, formatGrantLabel, userRowMenuItems } from "../rules";
import { t } from "../users-i18n";

/**
 * @file Pure-logic coverage for `features/users/rules.ts` — the screen's `describeApiError`
 * override table, the three-item `RowMenu` builder (`Users` was rank #10 by risk, 39.4% covered),
 * and the role/policy grant-label formatter.
 */

const ACTIVE_USER: AdminIdentityUser = {
  principalId: "u1",
  workspaceId: "w1",
  username: "alice",
  email: "alice@example.com",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  roleIds: ["r1"],
  policyIds: [],
};

const DISABLED_USER: AdminIdentityUser = { ...ACTIVE_USER, principalId: "u2", username: "bob", status: "disabled" };

describe("describeApiError", () => {
  it.each([
    ["GRANT_EXCEEDS_ISSUER", "You cannot grant a permission you do not hold."],
    ["FORBIDDEN", "You do not have permission to do that."],
    ["RESOURCE_CONFLICT", "That username is already in use."],
    ["OWNER_REQUIRED", "The workspace must keep at least one active owner."],
  ])("overrides code %s with a fixed message", (code, expected) => {
    expect(describeApiError(new ApiError("raw", 400, code), "fallback", "en")).toBe(expected);
  });

  it("VALIDATION_ERROR prefers the server's own message, falling back when blank", () => {
    expect(describeApiError(new ApiError("username too short", 400, "VALIDATION_ERROR"), "fallback", "en")).toBe(
      "username too short",
    );
    expect(describeApiError(new ApiError("", 400, "VALIDATION_ERROR"), "fallback", "en")).toBe(
      "Please correct the highlighted fields.",
    );
  });

  it("an unrecognized code falls through to the shared default", () => {
    expect(describeApiError(new ApiError("raw message", 500, "SOMETHING_ELSE"), "fallback", "en")).toBe(
      "raw message",
    );
  });

  it("a non-ApiError value falls through to the shared default", () => {
    expect(describeApiError(new Error("plain"), "fallback", "en")).toBe("plain");
    expect(describeApiError("nope", "fallback", "en")).toBe("fallback");
  });

  // C4 — the four static overrides plus the VALIDATION_ERROR fallback leaked English regardless of
  // locale. Table-driven per static code, in `es`.
  it.each([
    ["GRANT_EXCEEDS_ISSUER", "No puedes otorgar un permiso que no posees."],
    ["FORBIDDEN", "No tienes permiso para hacer eso."],
    ["RESOURCE_CONFLICT", "Ese nombre de usuario ya está en uso."],
    ["OWNER_REQUIRED", "El espacio de trabajo debe conservar al menos un propietario activo."],
  ])("translates the %s override into the operator's locale (es)", (code, expected) => {
    const translated = describeApiError(new ApiError("raw", 400, code), "fallback", "es");
    expect(translated).toBe(expected);
    expect(translated).not.toBe(STATIC_ENGLISH[code]);
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

const STATIC_ENGLISH: Record<string, string> = {
  GRANT_EXCEEDS_ISSUER: "You cannot grant a permission you do not hold.",
  FORBIDDEN: "You do not have permission to do that.",
  RESOURCE_CONFLICT: "That username is already in use.",
  OWNER_REQUIRED: "The workspace must keep at least one active owner.",
};

// C4 — dictionary-parity spot check for just the 5 keys this pass added, so pre-existing
// dictionary drift elsewhere in `USERS_DICT` does not fail this file (same scoping `roles-
// i18n.unit.test.ts` uses for C1's keys).
describe("users-i18n — C4 keys", () => {
  const LOCALES = [
    "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
    "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
  ];
  const NEW_KEYS = [
    "You cannot grant a permission you do not hold.",
    "You do not have permission to do that.",
    "That username is already in use.",
    "The workspace must keep at least one active owner.",
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

// Delete-user plan v2 (2026-09-24), Slice 4 — same scoping as the C4 block above, for the keys this
// pass added: the confirm dialog's title/body, the shared "Move to trash" confirm label, and the
// hook's own failure fallback. `SELF_DELETE`/`USER_IN_TRASH`/`USERNAME_IN_TRASH`'s STATIC_ERROR_MESSAGES
// values are already covered by this same key list (`describeApiError` looks them up the same way).
describe("users-i18n — delete-user plan v2 keys", () => {
  const LOCALES = [
    "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
    "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
  ];
  const NEW_KEYS = [
    "Delete this user?",
    "They will be signed out and moved to the Trash. You can restore them there; they are deleted permanently after 60 days.",
    "Move to trash",
    "You cannot delete your own account.",
    "This user is in the Trash; restore them first.",
    "A user with this username is in the Trash; restore or delete them permanently first.",
    "failed to delete user",
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

  it.each([
    ["SELF_DELETE", "You cannot delete your own account."],
    ["USER_IN_TRASH", "This user is in the Trash; restore them first."],
    ["USERNAME_IN_TRASH", "A user with this username is in the Trash; restore or delete them permanently first."],
  ])("describeApiError overrides code %s with a fixed message", (code, expected) => {
    expect(describeApiError(new ApiError("raw", 409, code), "fallback", "en")).toBe(expected);
  });
});

describe("userRowMenuItems", () => {
  const handlers = {
    onRequestDisable: vi.fn(),
    onEnable: vi.fn(),
    onManage: vi.fn(),
    onResetPassword: vi.fn(),
    onRequestDelete: vi.fn(),
  };

  it("has exactly three items when canDelete is false: toggle, manage, reset password", () => {
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en", false);
    expect(items.map((i) => i.key)).toEqual(["toggle", "manage", "reset-password"]);
  });

  it("an active user's toggle item reads Disable and asks (onRequestDisable), not immediate", () => {
    handlers.onRequestDisable.mockClear();
    handlers.onEnable.mockClear();
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en", false);
    const toggle = items.find((i) => i.key === "toggle")!;
    expect(toggle.label).toBe("Disable");
    expect(toggle.tone).toBe("warning");
    toggle.onSelect();
    expect(handlers.onRequestDisable).toHaveBeenCalledWith(ACTIVE_USER);
    expect(handlers.onEnable).not.toHaveBeenCalled();
  });

  it("a disabled user's toggle item reads Enable and fires immediately, no confirm", () => {
    handlers.onRequestDisable.mockClear();
    handlers.onEnable.mockClear();
    const items = userRowMenuItems(DISABLED_USER, false, handlers, "en", false);
    const toggle = items.find((i) => i.key === "toggle")!;
    expect(toggle.label).toBe("Enable");
    expect(toggle.tone).toBe("default");
    toggle.onSelect();
    expect(handlers.onEnable).toHaveBeenCalledWith(DISABLED_USER);
    expect(handlers.onRequestDisable).not.toHaveBeenCalled();
  });

  it("the toggle item no-ops while another row action is in flight (toggleSaving)", () => {
    handlers.onRequestDisable.mockClear();
    handlers.onEnable.mockClear();
    const items = userRowMenuItems(ACTIVE_USER, true, handlers, "en", false);
    items.find((i) => i.key === "toggle")!.onSelect();
    expect(handlers.onRequestDisable).not.toHaveBeenCalled();
    expect(handlers.onEnable).not.toHaveBeenCalled();
  });

  it("manage and reset-password wire straight through to their handlers", () => {
    handlers.onManage.mockClear();
    handlers.onResetPassword.mockClear();
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en", false);
    items.find((i) => i.key === "manage")!.onSelect();
    items.find((i) => i.key === "reset-password")!.onSelect();
    expect(handlers.onManage).toHaveBeenCalledWith(ACTIVE_USER);
    expect(handlers.onResetPassword).toHaveBeenCalledWith(ACTIVE_USER);
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "es", false);
    expect(items.map((i) => i.label)).toEqual(["Desactivar", "Administrar", "Restablecer contraseña"]);
    const disabledItems = userRowMenuItems(DISABLED_USER, false, handlers, "es", false);
    expect(disabledItems.find((i) => i.key === "toggle")?.label).toBe("Activar");
  });

  // Delete-user plan v2 (2026-09-24), Slice 4: the 4th item, appended only for a caller
  // `userRowMenuItems` is told may delete (owner or the built-in admin role — see this function's
  // own doc comment for why that decision lives outside this pure builder).
  describe("the Delete item (canDelete)", () => {
    it("is absent when canDelete is false", () => {
      const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en", false);
      expect(items.find((i) => i.key === "delete")).toBeUndefined();
    });

    it("is the 4th item, tone danger, when canDelete is true", () => {
      const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en", true);
      expect(items.map((i) => i.key)).toEqual(["toggle", "manage", "reset-password", "delete"]);
      const del = items.find((i) => i.key === "delete")!;
      expect(del.label).toBe("Delete");
      expect(del.tone).toBe("danger");
    });

    it("calls onRequestDelete, never firing immediately", () => {
      handlers.onRequestDelete.mockClear();
      const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en", true);
      items.find((i) => i.key === "delete")!.onSelect();
      expect(handlers.onRequestDelete).toHaveBeenCalledWith(ACTIVE_USER);
    });

    it("translates to Spanish (shares COMMON_I18N's Delete, not a users-i18n key)", () => {
      const items = userRowMenuItems(ACTIVE_USER, false, handlers, "es", true);
      expect(items.find((i) => i.key === "delete")?.label).toBe("Eliminar");
    });
  });
});

describe("formatGrantLabel", () => {
  const byId = new Map([
    ["r1", { name: "Editor" }],
    ["r2", { name: "Owner" }],
  ]);

  it("is null for an empty grant list", () => {
    expect(formatGrantLabel([], byId)).toBeNull();
  });

  it("joins resolved names for held grants", () => {
    expect(formatGrantLabel(["r1", "r2"], byId)).toBe("Editor, Owner");
  });

  it("falls back to the raw id when a grant has no matching entry (deleted out from under it)", () => {
    expect(formatGrantLabel(["r1", "deleted-role"], byId)).toBe("Editor, deleted-role");
  });
});
