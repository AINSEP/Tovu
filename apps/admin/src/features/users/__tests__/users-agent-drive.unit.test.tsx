import { useState, type SetStateAction } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { UserManagePanel, Users, type UserManageController } from "../UsersPanel";
import { useUsers, type UsersController } from "../hooks/users-controller.hooks";
import { createFakeUsersPort } from "../hooks/users-dependencies.hooks";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import userEvent from "@testing-library/user-event";
import type { AdminIdentityUser } from "@/lib/api";

/**
 * @file Regression test for this batch's agent-control tagging on `Users.tsx` — same shape as
 * `forms/__tests__/forms-agent-drive.unit.test.tsx`, driving the real `executePageCapability` and
 * the real `createDomPageDriver`, not `userEvent`.
 *
 * Uses `Users`' own `useUsersHook` injection seam (a real, supported prop the component already
 * takes — `Users.unit.test.tsx` just happens not to use it, preferring a full `fetch` mock) so
 * these tests need no server. `UserManagePanel` is separately exported and driven directly, the
 * same seam `Users.unit.test.tsx`'s own "controller seam" tests already exercise.
 *
 * Properties covered:
 *
 * 1. `page.fill` on the new-user form's username/email fields reaches React state.
 * 2. Two users get distinct `users-row-<id>-manage` handles, and `page.click`-ing one calls
 *    `toggleExpanded` with THAT user, not the other — proving the per-row handle resolves to the
 *    correct row's own control, not merely that a handle with the right shape exists somewhere.
 * 3. `UserManagePanel`'s shared `GrantSelect` gives the role and policy grants distinct handles
 *    despite being the exact same component rendered twice — `page.select_option` +`page.click` on
 *    the role handle calls `roleGrant.submit`, never `policyGrant.submit`.
 */

function usersController(overrides: Partial<UsersController> = {}): UsersController {
  return {
    users: [],
    roles: [],
    policies: [],
    canGrant: true,
    error: null,
    formOpen: false,
    setFormOpen: vi.fn(),
    username: "",
    setUsername: vi.fn(),
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    saving: false,
    formError: null,
    onCreate: vi.fn(async () => {}),
    expandedId: null,
    toggleExpanded: vi.fn(),
    pendingRoleId: "",
    setPendingRoleId: vi.fn(),
    pendingPolicyId: "",
    setPendingPolicyId: vi.fn(),
    grantSaving: false,
    grantError: null,
    onAssignRole: vi.fn(async () => {}),
    onAttachPolicy: vi.fn(async () => {}),
    editEmail: "",
    setEditEmail: vi.fn(),
    emailSaving: false,
    onSaveEmail: vi.fn(async () => {}),
    toggleSavingId: null,
    toggleError: null,
    notice: null,
    confirmingDisable: null,
    setConfirmingDisable: vi.fn(),
    requestDisable: vi.fn(),
    confirmDisable: vi.fn(async () => {}),
    onToggleStatus: vi.fn(async () => {}),
    resetPasswordFor: null,
    setResetPasswordFor: vi.fn(),
    newPassword: "",
    setNewPassword: vi.fn(),
    passwordSaving: false,
    passwordError: null,
    setPasswordError: vi.fn(),
    openResetPassword: vi.fn(),
    confirmResetPassword: vi.fn(async () => {}),
    canManageUserTrash: false,
    rowCapabilities: () => ({ canDelete: overrides.canManageUserTrash ?? false,
      canDisable: true, canEnable: true, canResetPassword: true }),
    confirmingDelete: null,
    setConfirmingDelete: vi.fn(),
    requestDelete: vi.fn(),
    deleteSaving: false,
    confirmDelete: vi.fn(async () => {}),
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

function renderUsers(overrides: Partial<UsersController> = {}) {
  const controller = usersController(overrides);
  const { container } = render(<Users useUsersHook={() => controller} />);
  return { controller, container };
}

interface FoundElement {
  handle: string;
  role?: string;
  label: string;
}

async function findElements(
  driver: ReturnType<typeof createDomPageDriver>,
  filter: { role?: string } = {},
): Promise<FoundElement[]> {
  const result = (await executePageCapability({ driver, capabilityId: "page.find_elements", input: filter })) as { elements: FoundElement[] };
  return result.elements;
}

async function handlesOf(driver: ReturnType<typeof createDomPageDriver>, filter: { role?: string } = {}) {
  return (await findElements(driver, filter)).map((element) => element.handle);
}

describe("driving the new-user form through page.* verbs", () => {
  it("page.fill on the username and email fields reaches React state (via the injected setters)", async () => {
    const setUsernameSpy = vi.fn();
    const setEmailSpy = vi.fn();
    function useStatefulUsers() {
      const [username, setUsername] = useState("");
      const [email, setEmail] = useState("");
      return usersController({
        formOpen: true, username, email,
        setUsername: (value: SetStateAction<string>) => { setUsernameSpy(value); setUsername(value); },
        setEmail: (value: SetStateAction<string>) => { setEmailSpy(value); setEmail(value); },
      });
    }
    const { container, rerender } = render(<Users useUsersHook={useStatefulUsers} />);
    await screen.findByRole("button", { name: "Create user" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    await act(async () => {
      await executePageCapability({ driver, capabilityId: "page.fill", input: { handle: "users-new-username", text: "newop" } });
      await executePageCapability({ driver, capabilityId: "page.fill", input: { handle: "users-new-email", text: "newop@example.com" } });
    });
    rerender(<Users useUsersHook={useStatefulUsers} />);
    expect(container.querySelector('[data-agent-element="users-new-username"]')).toHaveValue("newop");
    expect(container.querySelector('[data-agent-element="users-new-email"]')).toHaveValue("newop@example.com");

    expect(setUsernameSpy).toHaveBeenCalledWith("newop");
    expect(setEmailSpy).toHaveBeenCalledWith("newop@example.com");
    expect(await handlesOf(driver)).toContain("users-new-submit");
  });

  it("refuses to fill the password field — it is a credential field", async () => {
    const { container } = renderUsers({ formOpen: true });
    await screen.findByRole("button", { name: "Create user" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    await expect(
      executePageCapability({ driver, capabilityId: "page.fill", input: { handle: "users-new-password", text: "hunter2" } }),
    ).rejects.toThrow();
  });
});

describe("addressing user rows", () => {
  const ACTIVE_USER = {
    principalId: "u1",
    workspaceId: "w1",
    username: "alice",
    email: "alice@example.com",
    status: "active" as const,
    createdAt: "2026-08-01T00:00:00.000Z",
    roleIds: [],
    policyIds: [],
  };
  const OTHER_USER = { ...ACTIVE_USER, principalId: "u2", username: "bob" };

  it("gives each user row a distinct manage-toggle handle, and page.click resolves to the right one", async () => {
    const { controller, container } = renderUsers({ users: [ACTIVE_USER, OTHER_USER] });
    await screen.findByText("alice");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver, { role: "button" });
    expect(handles).toContain("users-row-u1-manage");
    expect(handles).toContain("users-row-u2-manage");

    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "users-row-u1-manage" } });

    expect(controller.toggleExpanded).toHaveBeenCalledWith(ACTIVE_USER);
    expect(controller.toggleExpanded).not.toHaveBeenCalledWith(OTHER_USER);
  });
});

describe("UserManagePanel — the same shared GrantSelect rendered twice", () => {
  const t = (key: string): string => key;

  function manageController(overrides: Partial<UserManageController> = {}): UserManageController {
    return {
      error: null,
      saving: false,
      email: { value: "", set: vi.fn(), saving: false, save: vi.fn() },
      roleGrant: {
        options: [{ id: "r-1", name: "Editor", isBuiltin: false }],
        pendingId: "",
        setPendingId: vi.fn(),
        submit: vi.fn(),
      },
      policyGrant: {
        options: [{ id: "p-1", name: "Publish", isBuiltin: true }],
        pendingId: "",
        setPendingId: vi.fn(),
        submit: vi.fn(),
      },
      ...overrides,
    };
  }

  function renderPanel(manage: UserManageController) {
    return render(
      <table>
        <tbody>
          <UserManagePanel principalId="p-1" manage={manage} t={t} />
        </tbody>
      </table>,
    );
  }

  it("page.select_option + page.click on the ROLE handle submits roleGrant, never policyGrant", async () => {
    // `pendingId: "r-1"` up front, not left for `page.select_option` to produce: `setPendingId` is
    // a spy here, not real `useState` — calling it records the call but does not change the static
    // `pendingId` prop this render already has, and `grant.submit`'s button is disabled while
    // `pendingId` is empty. `page.select_option`'s own resolution is still checked below via the
    // `setPendingId` call it makes; only the button's enabled state needs a pre-selected value.
    const manage = manageController({
      roleGrant: {
        options: [{ id: "r-1", name: "Editor", isBuiltin: false }],
        pendingId: "r-1",
        setPendingId: vi.fn(),
        submit: vi.fn(),
      },
    });
    const { container } = renderPanel(manage);
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver);
    expect(handles).toContain("user-manage-role-select");
    expect(handles).toContain("user-manage-role-submit");
    expect(handles).toContain("user-manage-policy-select");
    expect(handles).toContain("user-manage-policy-submit");

    await executePageCapability({ driver, capabilityId: "page.select_option", input: { handle: "user-manage-role-select", option: "Editor" } });
    expect(manage.roleGrant?.setPendingId).toHaveBeenCalledWith("r-1");

    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "user-manage-role-submit" } });
    expect(manage.roleGrant?.submit).toHaveBeenCalled();
    expect(manage.policyGrant?.submit).not.toHaveBeenCalled();
  });

  it("page.fill on the email field calls the injected setter", async () => {
    const manage = manageController();
    const { container } = renderPanel(manage);
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability({ driver, capabilityId: "page.fill", input: { handle: "user-manage-email", text: "new@example.com" } });
    expect(manage.email.set).toHaveBeenCalledWith("new@example.com");
  });
});

describe("account-management controls are agent-drivable, like the rest of the page", () => {
  const bob: AdminIdentityUser = {
    principalId: "u-bob",
    workspaceId: "ws-1",
    username: "bob",
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
    roleIds: [],
    policyIds: [],
  };

  it("publishes the reset-password fields, their show toggles, and the reset confirm", async () => {
    function useResetController() {
      const [newPassword, setNewPassword] = useState("");
      return usersController({ resetPasswordFor: bob, newPassword, setNewPassword: (value: SetStateAction<string>) => {
        setNewPasswordSpy(value); setNewPassword(value);
      }, confirmResetPassword });
    }
    const setNewPasswordSpy = vi.fn();
    const confirmResetPassword = vi.fn(async () => {});
    const { container } = render(<Users useUsersHook={useResetController} />);
    const driver = createDomPageDriver({ root: container, pages: {} });
    const handles = await handlesOf(driver);
    for (const handle of [
      "users-reset-password-cancel",
      "users-reset-password-confirm",
      "users-reset-password",
      "users-reset-password-reveal",
      "users-reset-password-retype",
      "users-reset-password-retype-reveal",
    ]) {
      expect(handles).toContain(handle);
    }
    expect(container.querySelector("#users-reset-password-input")).toHaveAttribute("data-agent-element", "users-reset-password");
    expect(container.querySelector("#users-reset-password-confirm-input")).toHaveAttribute(
      "data-agent-element",
      "users-reset-password-retype",
    );
    for (const handle of ["users-reset-password", "users-reset-password-retype"]) {
      await expect(executePageCapability({ driver, capabilityId: "page.fill", input: { handle, text: "secret123" } })).rejects.toThrow();
    }
    await act(async () => {
      await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "users-reset-password-reveal" } });
      await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "users-reset-password-retype-reveal" } });
    });
    expect(container.querySelector("#users-reset-password-input")).toHaveAttribute("type", "text");
    expect(container.querySelector("#users-reset-password-confirm-input")).toHaveAttribute("type", "text");
    // Credentials are human-only; drive their React handlers with ordinary input.
    fireEvent.change(container.querySelector("#users-reset-password-input")!, { target: { value: "secret123" } });
    fireEvent.change(container.querySelector("#users-reset-password-confirm-input")!, { target: { value: "secret123" } });
    expect(setNewPasswordSpy).toHaveBeenCalledWith("secret123");
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "users-reset-password-confirm" } });
    expect(confirmResetPassword).toHaveBeenCalledTimes(1);
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "users-reset-password-cancel" } });
    expect(setNewPasswordSpy).toHaveBeenLastCalledWith("");
  });

  it.each([false, true])("gates Delete by canManageUserTrash=%s and confirms through the real hook", async (canManageUserTrash) => {
    const port = createFakeUsersPort({ users: [bob], meId: "u-manager", canManageUserTrash });
    const deleteUser = vi.spyOn(port, "deleteUser");
    function useRealUsers() { return useUsers({ port }); }
    const { container } = render(<FetchQueryProvider><Users useUsersHook={useRealUsers} /></FetchQueryProvider>);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "bob" });
    // me() must settle before opening the menu.
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: 'Actions for user "bob"' }));
    if (!canManageUserTrash) {
      expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
      expect(deleteUser).not.toHaveBeenCalled();
      return;
    }
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByText("Delete this user?").closest("dialog")!;
    expect(dialog).toHaveAttribute("open");
    await act(async () => {
      await executePageCapability({ driver: createDomPageDriver({ root: container, pages: {} }), capabilityId: "page.click", input: { handle: "users-delete-confirm" } });
    });
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith(bob.principalId);
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });

  it("publishes the delete dialog's Cancel and Confirm", async () => {
    const { container, controller } = renderUsers({ confirmingDelete: bob });
    const handles = await handlesOf(createDomPageDriver({ root: container, pages: {} }));
    expect(handles).toContain("users-delete-cancel");
    expect(handles).toContain("users-delete-confirm");
    const driver = createDomPageDriver({ root: container, pages: {} });
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "users-delete-confirm" } });
    expect(controller.confirmDelete).toHaveBeenCalledTimes(1);
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "users-delete-cancel" } });
    expect(controller.setConfirmingDelete).toHaveBeenCalledWith(null);
  });
});
