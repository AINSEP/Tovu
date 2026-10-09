import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { Users } from "../UsersPanel";
import { useUsers } from "../hooks/users-controller.hooks";
import { createFakeUsersPort } from "../hooks/users-dependencies.hooks";
import { describe, expect, it } from "vitest";
import type { AdminIdentityUser } from "@/lib/api";
import { formatGrantLabel, userRowMenuItems, userAccountCapabilities, isOwnerAccount } from "@jini-ai/user-management/react";
import { t } from "../users-i18n";
const user: AdminIdentityUser = { principalId: "owner", workspaceId: "w", username: "admin", status: "active", createdAt: "now", roleIds: ["owner-role"], policyIds: [] };
const handlers = { onRequestDisable() {}, onEnable() {}, onManage() {}, onResetPassword() {}, onRequestDelete() {} };
describe("account row capabilities", () => {
  it("owner's own row only offers Manage and Reset password", () => {
    expect(userRowMenuItems({ user: user, toggleSaving: false, handlers: handlers, translate: key => t({ locale: "en", key: key }), canDelete: false, capabilities: { canDelete: false, canDisable: false, canEnable: true, canResetPassword: true } }).map(i => i.key)).toEqual(["manage", "reset-password"]);
  });
  it("non-owner has no Delete, Disable or Reset password on protected rows", () => {
    expect(userRowMenuItems({ user: user, toggleSaving: false, handlers: handlers, translate: key => t({ locale: "en", key: key }), canDelete: false, capabilities: { canDelete: false, canDisable: false, canEnable: false, canResetPassword: false } }).map(i => i.key)).toEqual(["manage"]);
  });
  it("owner can act on another admin", () => {
    expect(userRowMenuItems({ user: user, toggleSaving: false, handlers: handlers, translate: key => t({ locale: "en", key: key }), canDelete: false, capabilities: { canDelete: true, canDisable: true, canEnable: true, canResetPassword: true } }).map(i => i.key)).toEqual(["toggle", "manage", "reset-password", "delete"]);
  });
});
it("builtin owner role is shown as Owner; custom role names and username are preserved", () => {
  const roles = new Map([["owner-role", { name: "owner", isBuiltin: true }], ["custom", { name: "owner", isBuiltin: false }]]);
  expect(formatGrantLabel({ ids: ["owner-role"], byId: roles, translate: key => t({ locale: "en", key: key }) })).toBe("Owner");
  expect(formatGrantLabel({ ids: ["custom"], byId: roles, translate: key => t({ locale: "en", key: key }) })).toBe("owner");
  expect(user.username).toBe("admin");
});
const labels = { es: "Propietario", id: "Pemilik", de: "Inhaber", "zh-CN": "所有者", "zh-TW": "擁有者", "pt-BR": "Proprietário", ru: "Владелец", fa: "مالک", ar: "المالك", ja: "オーナー", ko: "소유자", pl: "Właściciel", hu: "Tulajdonos", fr: "Propriétaire", uk: "Власник", tr: "Sahip", th: "เจ้าของ", it: "Proprietario", hi: "स्वामी", ur: "مالک", bn: "মালিক" };
for (const [locale, label] of Object.entries(labels)) it(`Owner label in ${locale}`, () => {
  expect(t({ locale: locale, key: "Owner" })).toBe(label);
  expect(formatGrantLabel({ ids: ["owner-role"], byId: new Map([["owner-role", { name: "owner", isBuiltin: true }]]), translate: key => t({ locale: locale, key: key }) })).toBe(label);
});

it("row capabilities hide destructive self actions, even for an owner", () => {
  expect(userAccountCapabilities({ user, callerPrincipalId: "owner", callerIsOwner: true, canManageUserTrash: true, roles: new Map() }))
    .toEqual({ canDelete: false, canDisable: false, canEnable: true, canResetPassword: true });
});
it("admin caller cannot act on protected targets, including owners granted by policy", () => {
  for (const target of [{ ...user, isProtectedAccount: true }, { ...user, isOwner: true, isProtectedAccount: true, roleIds: [] }]) {
    expect(userAccountCapabilities({ user: target, callerPrincipalId: "admin-caller", callerIsOwner: false, canManageUserTrash: true, roles: new Map() }))
      .toEqual({ canDelete: false, canDisable: false, canEnable: false, canResetPassword: false });
  }
});
it("admin may act on ordinary users; unknown caller/role fails closed", () => {
  const ordinary = { ...user, principalId: "ordinary", roleIds: [] };
  expect(userAccountCapabilities({ user: ordinary, callerPrincipalId: "admin-caller", callerIsOwner: false, canManageUserTrash: true, roles: new Map() }))
    .toEqual({ canDelete: true, canDisable: true, canEnable: true, canResetPassword: true });
  expect(userAccountCapabilities({ user, callerPrincipalId: null, callerIsOwner: false, canManageUserTrash: true, roles: new Map() }))
    .toEqual({ canDelete: false, canDisable: false, canEnable: false, canResetPassword: false });
});
it("Owner badge uses server owner classification or builtin role; never username", () => {
  expect(isOwnerAccount({ user: { ...user, roleIds: [], isOwner: true }, roles: new Map() })).toBe(true);
  expect(isOwnerAccount({ user: { ...user, roleIds: [] }, roles: new Map() })).toBe(false);
  expect(isOwnerAccount({ user, roles: new Map([["owner-role", { name: "owner", isBuiltin: true }]]) })).toBe(true);
});

it("rendered owner row keeps admin login, shows Owner badge, and hides Delete/Disable", async () => {
  const port = createFakeUsersPort({ users: [{ ...user, isOwner: true, isProtectedAccount: true }],
    roles: [{ id: "owner-role", workspaceId: "w", name: "owner", isBuiltin: true }], meId: "owner" });
  render(<FetchQueryProvider><Users useUsersHook={() => useUsers({ port })} /></FetchQueryProvider>);
  await waitFor(() => expect(screen.getAllByText("Owner").length).toBeGreaterThanOrEqual(2));
  expect(screen.getByRole("button", { name: "admin" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: 'Actions for user "admin"' }));
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "Reset password" })).toBeTruthy());
  expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Disable" })).toBeNull();
});
it("rendered admin sees only Manage on an owner target", async () => {
  const port = createFakeUsersPort({ users: [{ ...user, isOwner: true, isProtectedAccount: true }],
    roles: [{ id: "owner-role", workspaceId: "w", name: "owner", isBuiltin: true }], meId: "another-admin" });
  render(<FetchQueryProvider><Users useUsersHook={() => useUsers({ port })} /></FetchQueryProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "admin" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: 'Actions for user "admin"' }));
  expect(screen.getByRole("menuitem", { name: "Manage" })).toBeTruthy();
  for (const name of ["Delete", "Disable", "Reset password"]) expect(screen.queryByRole("menuitem", { name })).toBeNull();
});
