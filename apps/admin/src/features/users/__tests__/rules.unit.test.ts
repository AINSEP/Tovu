import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminIdentityUser } from "../../../lib/api";
import { describeApiError, formatGrantLabel, userRowMenuItems } from "../rules";

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
    expect(describeApiError(new ApiError("raw", 400, code), "fallback")).toBe(expected);
  });

  it("VALIDATION_ERROR prefers the server's own message, falling back when blank", () => {
    expect(describeApiError(new ApiError("username too short", 400, "VALIDATION_ERROR"), "fallback")).toBe(
      "username too short",
    );
    expect(describeApiError(new ApiError("", 400, "VALIDATION_ERROR"), "fallback")).toBe(
      "Please correct the highlighted fields.",
    );
  });

  it("an unrecognized code falls through to the shared default", () => {
    expect(describeApiError(new ApiError("raw message", 500, "SOMETHING_ELSE"), "fallback")).toBe("raw message");
  });

  it("a non-ApiError value falls through to the shared default", () => {
    expect(describeApiError(new Error("plain"), "fallback")).toBe("plain");
    expect(describeApiError("nope", "fallback")).toBe("fallback");
  });
});

describe("userRowMenuItems", () => {
  const handlers = {
    onRequestDisable: vi.fn(),
    onEnable: vi.fn(),
    onManage: vi.fn(),
    onResetPassword: vi.fn(),
  };

  it("always has exactly three items: toggle, manage, reset password", () => {
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en");
    expect(items.map((i) => i.key)).toEqual(["toggle", "manage", "reset-password"]);
  });

  it("an active user's toggle item reads Disable and asks (onRequestDisable), not immediate", () => {
    handlers.onRequestDisable.mockClear();
    handlers.onEnable.mockClear();
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en");
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
    const items = userRowMenuItems(DISABLED_USER, false, handlers, "en");
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
    const items = userRowMenuItems(ACTIVE_USER, true, handlers, "en");
    items.find((i) => i.key === "toggle")!.onSelect();
    expect(handlers.onRequestDisable).not.toHaveBeenCalled();
    expect(handlers.onEnable).not.toHaveBeenCalled();
  });

  it("manage and reset-password wire straight through to their handlers", () => {
    handlers.onManage.mockClear();
    handlers.onResetPassword.mockClear();
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "en");
    items.find((i) => i.key === "manage")!.onSelect();
    items.find((i) => i.key === "reset-password")!.onSelect();
    expect(handlers.onManage).toHaveBeenCalledWith(ACTIVE_USER);
    expect(handlers.onResetPassword).toHaveBeenCalledWith(ACTIVE_USER);
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = userRowMenuItems(ACTIVE_USER, false, handlers, "es");
    expect(items.map((i) => i.label)).toEqual(["Desactivar", "Administrar", "Restablecer contraseña"]);
    const disabledItems = userRowMenuItems(DISABLED_USER, false, handlers, "es");
    expect(disabledItems.find((i) => i.key === "toggle")?.label).toBe("Activar");
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
