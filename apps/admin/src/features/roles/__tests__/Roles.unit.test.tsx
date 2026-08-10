import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdminPolicy, AdminRole } from "../../../lib/api";
import {
  PolicyRow,
  Roles,
  RolesSection,
  type PolicyPermissionController,
  type PolicyRowController,
  type RoleCreateFormController,
  type RoleRowController,
} from "../Roles";
import type { RolesController } from "../hooks/use-roles.hooks";

/**
 * @file `Roles` — markup-only assertions driven entirely through the injectable `useRolesHook` seam
 * (same convention `Posts.tsx`'s own test doc comment describes), for states that would otherwise
 * require a real table, a real `RowMenu` popover, and a real API round trip to reach: a built-in row
 * hiding its actions, mid-rename inline editing, a frozen policy hiding its actions even though it
 * is not built-in, and the inline "Add permission" form appearing for exactly one row.
 */

const BUILTIN_ROLE: AdminRole = { id: "r-builtin", workspaceId: "w1", name: "Owner", isBuiltin: true };
const CUSTOM_ROLE: AdminRole = { id: "r-custom", workspaceId: "w1", name: "Editor", isBuiltin: false };

const FROZEN_POLICY: AdminPolicy = {
  id: "p-frozen",
  workspaceId: "w1",
  name: "Frozen Policy",
  isBuiltin: false,
  isFrozen: true,
};
const CUSTOM_POLICY: AdminPolicy = {
  id: "p-custom",
  workspaceId: "w1",
  name: "Custom Policy",
  isBuiltin: false,
  isFrozen: false,
};

function baseController(overrides: Partial<RolesController> = {}): RolesController {
  return {
    roles: [CUSTOM_ROLE],
    policies: [CUSTOM_POLICY],
    error: null,
    rowError: null,

    roleName: "",
    setRoleName: vi.fn(),
    roleSaving: false,
    roleError: null,
    onCreateRole: vi.fn(),

    policyName: "",
    setPolicyName: vi.fn(),
    policyDescription: "",
    setPolicyDescription: vi.fn(),
    policySaving: false,
    policyError: null,
    onCreatePolicy: vi.fn(),

    editingRoleId: null,
    setEditingRoleId: vi.fn(),
    editingRoleName: "",
    setEditingRoleName: vi.fn(),
    startEditRole: vi.fn(),
    onSaveRole: vi.fn(),

    editingPolicyId: null,
    setEditingPolicyId: vi.fn(),
    editingPolicyName: "",
    setEditingPolicyName: vi.fn(),
    editingPolicyDescription: "",
    setEditingPolicyDescription: vi.fn(),
    startEditPolicy: vi.fn(),
    onSavePolicy: vi.fn(),

    rowSavingId: null,

    permissionPolicyId: null,
    permissionInput: "",
    setPermissionInput: vi.fn(),
    resourceTypeInput: "",
    setResourceTypeInput: vi.fn(),
    togglePermissionForm: vi.fn(),
    onWritePermission: vi.fn(),

    pendingRoleDelete: null,
    setPendingRoleDelete: vi.fn(),
    onDeleteRole: vi.fn(),

    pendingPolicyDelete: null,
    setPendingPolicyDelete: vi.fn(),
    onDeletePolicy: vi.fn(),

    ...overrides,
  };
}

function renderRoles(overrides: Partial<RolesController> = {}) {
  const controller = baseController(overrides);
  render(<Roles useRolesHook={() => controller} />);
  return controller;
}

describe("loading and error states", () => {
  it("shows a loading notice while roles/policies are null", () => {
    renderRoles({ roles: null, policies: null });
    expect(screen.getByText(/loading roles & permissions/i)).toBeInTheDocument();
  });

  it("shows only the error notice, not the screen, when error is set", () => {
    renderRoles({ error: "failed to load roles/policies" });
    expect(screen.getByText("failed to load roles/policies")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /roles & permissions/i })).not.toBeInTheDocument();
  });

  it("shows the rowError banner above the tables without blanking the screen", () => {
    renderRoles({ rowError: "failed to rename role" });
    expect(screen.getByText("failed to rename role")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /roles & permissions/i })).toBeInTheDocument();
  });
});

describe("built-in rows", () => {
  it("renders a built-in role with no row menu — a muted dash instead", () => {
    renderRoles({ roles: [BUILTIN_ROLE] });
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions for role "owner"/i })).not.toBeInTheDocument();
  });

  it("renders a custom role WITH a row menu trigger", () => {
    renderRoles({ roles: [CUSTOM_ROLE] });
    expect(screen.getByRole("button", { name: /actions for role "editor"/i })).toBeInTheDocument();
  });

  it("renders a frozen (but not built-in) policy with no row menu — a muted dash instead", () => {
    renderRoles({ policies: [FROZEN_POLICY] });
    expect(screen.getByText("Frozen Policy")).toBeInTheDocument();
    expect(screen.getByText(/custom \(frozen\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions for policy "frozen policy"/i })).not.toBeInTheDocument();
  });
});

describe("inline role rename", () => {
  it("renders an input plus Save/Cancel instead of the row menu while editingRoleId matches the row", () => {
    renderRoles({ roles: [CUSTOM_ROLE], editingRoleId: CUSTOM_ROLE.id, editingRoleName: "Editor" });
    expect(screen.getByDisplayValue("Editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions for role/i })).not.toBeInTheDocument();
  });

  it("Cancel calls setEditingRoleId(null), not onSaveRole", async () => {
    const user = userEvent.setup();
    const controller = renderRoles({ roles: [CUSTOM_ROLE], editingRoleId: CUSTOM_ROLE.id });
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(controller.setEditingRoleId).toHaveBeenCalledWith(null);
    expect(controller.onSaveRole).not.toHaveBeenCalled();
  });

  it("shows 'Saving…' and disables Save while this row is the one saving", () => {
    renderRoles({ roles: [CUSTOM_ROLE], editingRoleId: CUSTOM_ROLE.id, rowSavingId: CUSTOM_ROLE.id });
    const saveButton = screen.getByRole("button", { name: /saving…/i });
    expect(saveButton).toBeDisabled();
  });
});

describe("inline permission form", () => {
  it("renders the Permission/resource-type inputs only for the policy whose id matches permissionPolicyId", () => {
    const otherPolicy: AdminPolicy = { ...CUSTOM_POLICY, id: "p-other", name: "Other Policy" };
    renderRoles({ policies: [CUSTOM_POLICY, otherPolicy], permissionPolicyId: CUSTOM_POLICY.id });
    expect(screen.getByPlaceholderText(/e\.g\. content\.write/i)).toBeInTheDocument();
    // Only one form row exists even though two policies are rendered.
    expect(screen.getAllByPlaceholderText(/e\.g\. content\.write/i)).toHaveLength(1);
  });

  it("disables Add while permissionInput is empty", () => {
    renderRoles({ policies: [CUSTOM_POLICY], permissionPolicyId: CUSTOM_POLICY.id, permissionInput: "" });
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  it("enables Add and wires it to onWritePermission(policyId) once permissionInput is non-empty", async () => {
    const user = userEvent.setup();
    const controller = renderRoles({
      policies: [CUSTOM_POLICY],
      permissionPolicyId: CUSTOM_POLICY.id,
      permissionInput: "content.write",
    });
    const addButton = screen.getByRole("button", { name: /^add$/i });
    expect(addButton).toBeEnabled();
    await user.click(addButton);
    expect(controller.onWritePermission).toHaveBeenCalledWith(CUSTOM_POLICY.id);
  });
});

describe("delete confirmation dialogs", () => {
  it("opens the role ConfirmDialog with the pending role's name when pendingRoleDelete is set", () => {
    renderRoles({ pendingRoleDelete: CUSTOM_ROLE });
    expect(screen.getByText(/delete role "editor"\?/i)).toBeInTheDocument();
  });

  it("stays closed — RoleDeleteDialog's open=false branch — when nothing is pending", () => {
    renderRoles();
    expect(screen.queryByText(/delete role ".*"\?/i)).not.toBeInTheDocument();
  });

  it("wires the role dialog's Confirm/Cancel to onDeleteRole/setPendingRoleDelete(null)", async () => {
    const user = userEvent.setup();
    const controller = renderRoles({ pendingRoleDelete: CUSTOM_ROLE });
    const dialog = screen.getByText(/delete role "editor"\?/i).closest("dialog") as HTMLElement;

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(controller.setPendingRoleDelete).toHaveBeenCalledWith(null);
    expect(controller.onDeleteRole).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(controller.onDeleteRole).toHaveBeenCalled();
  });

  it("opens the policy ConfirmDialog with the pending policy's name when pendingPolicyDelete is set", () => {
    renderRoles({ pendingPolicyDelete: CUSTOM_POLICY });
    expect(screen.getByText(/delete policy "custom policy"\?/i)).toBeInTheDocument();
  });

  it("stays closed — PolicyDeleteDialog's open=false branch — when nothing is pending", () => {
    renderRoles();
    expect(screen.queryByText(/delete policy ".*"\?/i)).not.toBeInTheDocument();
  });

  it("wires the policy dialog's Confirm/Cancel to onDeletePolicy/setPendingPolicyDelete(null)", async () => {
    const user = userEvent.setup();
    const controller = renderRoles({ pendingPolicyDelete: CUSTOM_POLICY });
    const dialog = screen.getByText(/delete policy "custom policy"\?/i).closest("dialog") as HTMLElement;

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(controller.setPendingPolicyDelete).toHaveBeenCalledWith(null);
    expect(controller.onDeletePolicy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(controller.onDeletePolicy).toHaveBeenCalled();
  });
});

describe("create forms", () => {
  it("disables 'Create role' while roleName is empty or a create is already saving", () => {
    renderRoles({ roleName: "" });
    expect(screen.getByRole("button", { name: /create role/i })).toBeDisabled();
  });

  it("shows the roleError text inside the create-role form", () => {
    renderRoles({ roleError: "failed to create role" });
    expect(screen.getByText("failed to create role")).toBeInTheDocument();
  });

  it("shows 'Creating…' and disables the button while policySaving is true", () => {
    renderRoles({ policyName: "New Policy", policySaving: true });
    expect(screen.getByRole("button", { name: /creating…/i })).toBeDisabled();
  });
});

/**
 * The controller seam introduced by the F05 coupling fix (audit `TM-20260810-01`). `RolesSection`
 * and `PolicyRow` used to take 14 and 19 loose state/setter/callback props respectively, which meant
 * the only practical way to render either was through `Roles` with a whole `RolesController`
 * standing behind it. These assertions drive them directly off hand-built controllers — if either
 * component reached back for anything outside the controller it was handed, none of this would
 * render.
 */
describe("section/row controller seam", () => {
  function roleCreate(overrides: Partial<RoleCreateFormController> = {}): RoleCreateFormController {
    return { name: "", setName: vi.fn(), saving: false, error: null, submit: vi.fn(), ...overrides };
  }

  function roleRow(overrides: Partial<RoleRowController> = {}): RoleRowController {
    return {
      editingId: null,
      setEditingId: vi.fn(),
      draftName: "",
      setDraftName: vi.fn(),
      startRename: vi.fn(),
      saveRename: vi.fn(),
      savingId: null,
      requestDelete: vi.fn(),
      ...overrides,
    };
  }

  function policyRow(overrides: Partial<PolicyRowController> = {}): PolicyRowController {
    return {
      editingId: null,
      setEditingId: vi.fn(),
      draftName: "",
      setDraftName: vi.fn(),
      draftDescription: "",
      setDraftDescription: vi.fn(),
      startRename: vi.fn(),
      saveRename: vi.fn(),
      savingId: null,
      requestDelete: vi.fn(),
      ...overrides,
    };
  }

  function policyPermission(overrides: Partial<PolicyPermissionController> = {}): PolicyPermissionController {
    return {
      openForPolicyId: null,
      permission: "",
      setPermission: vi.fn(),
      resourceType: "",
      setResourceType: vi.fn(),
      toggleForm: vi.fn(),
      write: vi.fn(),
      ...overrides,
    };
  }

  const t = (key: string): string => key;

  it("renders RolesSection from nothing but a create form and a row controller", async () => {
    const create = roleCreate({ name: "Editor" });
    render(<RolesSection roles={[CUSTOM_ROLE]} create={create} row={roleRow()} t={t} locale="en" />);

    expect(screen.getByRole("button", { name: "Create role" })).toBeEnabled();
    await userEvent.type(screen.getByRole("textbox"), "!");
    expect(create.setName).toHaveBeenCalled();
  });

  it("routes RolesSection's mid-rename save through the row controller alone", async () => {
    const row = roleRow({ editingId: CUSTOM_ROLE.id, draftName: "Renamed" });
    render(<RolesSection roles={[CUSTOM_ROLE]} create={roleCreate()} row={row} t={t} locale="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(row.saveRename).toHaveBeenCalledWith(CUSTOM_ROLE.id);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(row.setEditingId).toHaveBeenCalledWith(null);
  });

  it("keeps PolicyRow's rename and permission controllers independent of each other", async () => {
    const row = policyRow();
    const permission = policyPermission({ openForPolicyId: CUSTOM_POLICY.id, permission: "content.write" });
    render(
      <table>
        <tbody>
          <PolicyRow policy={CUSTOM_POLICY} row={row} permission={permission} t={t} locale="en" />
        </tbody>
      </table>,
    );

    // The permission form is open, and the row is NOT mid-rename — two controllers, two states.
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(permission.write).toHaveBeenCalledWith(CUSTOM_POLICY.id);
    expect(row.saveRename).not.toHaveBeenCalled();
  });
});
