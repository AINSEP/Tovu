import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminPolicy, AdminRole } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import {
  PolicyRow,
  Roles,
  RolesSection,
  type PolicyPermissionController,
  type PolicyRowController,
  type RoleCreateFormController,
  type RoleRowController,
} from "../Roles";
import { useRoles, type RolesController } from "../hooks/use-roles.hooks";
import { createFakeRolesPort } from "../hooks/roles-dependencies.hooks";
import { t as realT } from "../roles-i18n";

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

// OQ-10 / C1 — hoisted to file scope (was local to "section/row controller seam") so the
// permission-remove confirmation tests can use it too.
const PERMISSION_ROW = {
  id: "pp-1",
  workspaceId: "w1",
  policyId: CUSTOM_POLICY.id,
  permission: "content.write",
  resourceType: null,
  constraintJson: null,
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
    permissionRows: [],
    permissionsLoading: false,
    removingPermissionId: null,
    onRemovePermission: vi.fn(),

    pendingPermissionRemove: null,
    setPendingPermissionRemove: vi.fn(),
    onConfirmRemovePermission: vi.fn(),

    pendingRoleDelete: null,
    setPendingRoleDelete: vi.fn(),
    onDeleteRole: vi.fn(),

    pendingPolicyDelete: null,
    setPendingPolicyDelete: vi.fn(),
    onDeletePolicy: vi.fn(),

    t: (key: string) => key,
    locale: "en",

    ...overrides,
  };
}

/**
 * `tabId` was added when this screen became two `?tab=` tabs (2026-09-06). It is the same value
 * `panels.tsx` threads in from the query string, and it defaults to `undefined` — which
 * `resolveRolesTabId` resolves to the first tab, "roles" — so every test about the roles list, the
 * page banners, and either delete dialog reads exactly as it did before and needed no change.
 *
 * The policy-facing cases pass {@link POLICIES_TAB}. That is a real assertion rather than plumbing:
 * omitting it makes them fail, because an inactive panel is genuinely unmounted, not hidden. (Worth
 * stating, because a `[hidden]`-based tab implementation would leave these queries passing whether
 * the tabs worked or not — and in this codebase an author-set `display` beats `[hidden]` anyway.)
 */
function renderRoles(overrides: Partial<RolesController> = {}, tabId?: string) {
  const controller = baseController(overrides);
  render(<Roles tabId={tabId} useRolesHook={() => controller} />);
  return controller;
}

/** The second tab's id, named so a reader does not have to match a bare literal against
 *  `ROLES_TAB_IDS`. */
const POLICIES_TAB = "policies";

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

describe("tabs", () => {
  it("renders both tabs, with Roles selected for an absent ?tab=", () => {
    renderRoles();
    expect(screen.getByRole("tab", { name: /Roles/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Policies/ })).toHaveAttribute("aria-selected", "false");
  });

  it("selects the tab named by ?tab=", () => {
    renderRoles({}, POLICIES_TAB);
    expect(screen.getByRole("tab", { name: /Policies/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Roles/ })).toHaveAttribute("aria-selected", "false");
  });

  it("falls back to Roles for an unrecognized ?tab= rather than rendering a blank panel", () => {
    renderRoles({ roles: [CUSTOM_ROLE] }, "not-a-real-tab");
    expect(screen.getByRole("tab", { name: /Roles/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  // One render per `it`: React Testing Library cleans up BETWEEN tests, not within one, so two
  // `renderRoles` calls in a single case leave both trees mounted and any query that matches in
  // both throws "found multiple elements" (which is exactly how the first draft of the delete-
  // dialog case below failed).
  it("on the Roles tab, mounts the roles list and NOT the policies list", () => {
    renderRoles({ roles: [CUSTOM_ROLE], policies: [CUSTOM_POLICY] });
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.queryByText("Custom Policy")).not.toBeInTheDocument();
  });

  it("on the Policies tab, mounts the policies list and NOT the roles list", () => {
    renderRoles({ roles: [CUSTOM_ROLE], policies: [CUSTOM_POLICY] }, POLICIES_TAB);
    expect(screen.getByText("Custom Policy")).toBeInTheDocument();
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();
  });

  // Both delete dialogs live on the shell, not in a panel: a confirm dialog is an overlay over the
  // whole page and its pending state is shell state.
  it("renders the policy delete dialog while the Policies tab is open", () => {
    renderRoles({ pendingPolicyDelete: CUSTOM_POLICY }, POLICIES_TAB);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("still renders the ROLE delete dialog while the Policies tab is open", () => {
    renderRoles({ pendingRoleDelete: CUSTOM_ROLE }, POLICIES_TAB);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the shared rowError banner on the shell, visible from either tab", () => {
    // `useWiredRoles` keeps ONE rowSavingId/rowError pair for roles and policies alike, so the
    // banner belongs to neither panel.
    renderRoles({ rowError: "failed to rename policy" }, POLICIES_TAB);
    expect(screen.getByText("failed to rename policy")).toBeInTheDocument();
  });

  it("reuses the existing section-heading i18n keys as tab labels, adding no new copy strings", () => {
    // Both labels go through the real dictionary, so a locale that already translates the "Roles"
    // and "Policies" headings translates the tabs too — the point of reusing the keys.
    renderRoles({ t: realT.bind(null, "es") });
    expect(screen.getByRole("tab", { name: new RegExp(realT("es", "Roles")) })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: new RegExp(realT("es", "Policies")) })).toBeInTheDocument();
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
    renderRoles({ policies: [FROZEN_POLICY] }, POLICIES_TAB);
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
    renderRoles({ policies: [CUSTOM_POLICY, otherPolicy], permissionPolicyId: CUSTOM_POLICY.id }, POLICIES_TAB);
    expect(screen.getByPlaceholderText(/e\.g\. content\.write/i)).toBeInTheDocument();
    // Only one form row exists even though two policies are rendered.
    expect(screen.getAllByPlaceholderText(/e\.g\. content\.write/i)).toHaveLength(1);
  });

  it("disables Add while permissionInput is empty", () => {
    renderRoles({ policies: [CUSTOM_POLICY], permissionPolicyId: CUSTOM_POLICY.id, permissionInput: "" }, POLICIES_TAB);
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  it("enables Add and wires it to onWritePermission(policyId) once permissionInput is non-empty", async () => {
    const user = userEvent.setup();
    const controller = renderRoles({
      policies: [CUSTOM_POLICY],
      permissionPolicyId: CUSTOM_POLICY.id,
      permissionInput: "content.write",
    }, POLICIES_TAB);
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

/** `PermissionRemoveDialog`'s body wraps the permission string in its own `<code>` element, so RTL's
 *  default `getByText` (which only reads an element's OWN direct text-node children, not a
 *  descendant's) never matches the full sentence — only the enclosing `<p>`'s `textContent` (which
 *  DOES concatenate descendants) does. Scoped to `<p>` so it can't also match an ancestor. */
function getPermissionRemoveDialogBody(fullText: string): HTMLElement {
  return screen.getByText((_, element) => element?.tagName.toLowerCase() === "p" && element.textContent === fullText);
}

const PERMISSION_REMOVE_BODY_TEXT = 'Remove "content.write" from this policy? Anyone with this policy loses it.';

describe("permission-remove confirmation dialog (C1)", () => {
  it("opens naming the permission when pendingPermissionRemove is set", () => {
    renderRoles({ pendingPermissionRemove: { policyId: CUSTOM_POLICY.id, row: PERMISSION_ROW } }, POLICIES_TAB);
    expect(getPermissionRemoveDialogBody(PERMISSION_REMOVE_BODY_TEXT)).toBeInTheDocument();
  });

  it("stays closed when nothing is pending", () => {
    renderRoles({}, POLICIES_TAB);
    expect(screen.queryByText((_, element) => element?.textContent === PERMISSION_REMOVE_BODY_TEXT)).not.toBeInTheDocument();
  });

  it("wires Confirm/Cancel to onConfirmRemovePermission/setPendingPermissionRemove(null)", async () => {
    const user = userEvent.setup();
    const controller = renderRoles(
      { pendingPermissionRemove: { policyId: CUSTOM_POLICY.id, row: PERMISSION_ROW } },
      POLICIES_TAB,
    );
    const dialog = getPermissionRemoveDialogBody(PERMISSION_REMOVE_BODY_TEXT).closest("dialog") as HTMLElement;

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(controller.setPendingPermissionRemove).toHaveBeenCalledWith(null);
    expect(controller.onConfirmRemovePermission).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /^remove$/i }));
    expect(controller.onConfirmRemovePermission).toHaveBeenCalled();
  });
});

/**
 * The bug the stubbed-hook suites above cannot see (memory `green_tests_whose_assertion_tolerates_
 * bug.md` #2): a controller built by hand already has `requestRemove` staging a confirmation, so
 * none of the tests above ever drove the REAL hook's Remove button through to a durable write. This
 * describe renders `Roles` against the real `useRoles` hook (via the injectable `useRolesHook` seam)
 * composed with `createFakeRolesPort`, so the fake port's own state is the ground truth for whether
 * a click actually removed anything.
 */
describe("permission removal is confirmed first (real hook, fake port)", () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <FetchQueryProvider>{children}</FetchQueryProvider>;
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  beforeEach(() => {
    // `useRoles` also calls `useAdminLocale()` (real `fetch`) — routed to a fixed default-locale
    // response, same interceptor `use-roles.unit.test.tsx`'s `beforeEach` uses.
    vi.stubGlobal("fetch", (url: string) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${String(url)}`));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clicking Remove asks first and leaves the permission in place until confirmed", async () => {
    const user = userEvent.setup();
    const port = createFakeRolesPort({
      roles: [CUSTOM_ROLE],
      policies: [CUSTOM_POLICY],
      initialPolicyPermissions: [PERMISSION_ROW],
    });
    render(
      <FetchQueryProvider>
        <Roles tabId={POLICIES_TAB} useRolesHook={() => useRoles({ port })} />
      </FetchQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("Custom Policy")).toBeInTheDocument());

    // Open the panel through the real row menu, same as an operator would.
    await user.click(screen.getByRole("button", { name: 'Actions for policy "Custom Policy"' }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Add permission" }));
    await waitFor(() => expect(screen.getByText("content.write")).toBeInTheDocument());

    // First click asks — it must NOT have removed anything yet.
    await user.click(screen.getByRole("button", { name: "Remove permission content.write" }));
    expect(port.policyPermissions).toEqual([PERMISSION_ROW]);
    const dialog = getPermissionRemoveDialogBody(PERMISSION_REMOVE_BODY_TEXT).closest("dialog") as HTMLElement;
    expect(dialog).toHaveAttribute("open");

    // Cancel leaves the permission in place.
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(port.policyPermissions).toEqual([PERMISSION_ROW]);

    // Remove, then confirm — now it is actually gone.
    await user.click(screen.getByRole("button", { name: "Remove permission content.write" }));
    await user.click(within(dialog).getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(port.policyPermissions).toEqual([]));
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
    renderRoles({ policyName: "New Policy", policySaving: true }, POLICIES_TAB);
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
      rows: [],
      loading: false,
      removingId: null,
      requestRemove: vi.fn(),
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
          <PolicyRow policy={CUSTOM_POLICY} row={row} permission={permission} agentBase="policy-row" t={t} locale="en" />
        </tbody>
      </table>,
    );

    // The permission form is open, and the row is NOT mid-rename — two controllers, two states.
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(permission.write).toHaveBeenCalledWith(CUSTOM_POLICY.id);
    expect(row.saveRename).not.toHaveBeenCalled();
  });

  // OQ-10 — the open panel lists what the policy already holds, each row removable.

  function renderOpenPermissionPanel(permission: PolicyPermissionController) {
    render(
      <table>
        <tbody>
          <PolicyRow policy={CUSTOM_POLICY} row={policyRow()} permission={permission} agentBase="policy-row" t={t} locale="en" />
        </tbody>
      </table>,
    );
  }

  it("routes each Remove to a confirmation request, never straight to removal", async () => {
    const permission = policyPermission({ openForPolicyId: CUSTOM_POLICY.id, rows: [PERMISSION_ROW] });
    renderOpenPermissionPanel(permission);

    expect(screen.getByText("content.write")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove permission content.write" }));
    expect(permission.requestRemove).toHaveBeenCalledWith({ policyId: CUSTOM_POLICY.id, row: PERMISSION_ROW });
  });

  it("shows the empty state when the policy holds no permissions", () => {
    renderOpenPermissionPanel(policyPermission({ openForPolicyId: CUSTOM_POLICY.id, rows: [] }));

    expect(screen.getByText("No permissions yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove permission/ })).not.toBeInTheDocument();
  });

  it("shows the loading state instead of the list while permissions are in flight", () => {
    renderOpenPermissionPanel(policyPermission({ openForPolicyId: CUSTOM_POLICY.id, loading: true, rows: [] }));

    expect(screen.getByText("Loading permissions…")).toBeInTheDocument();
    expect(screen.queryByText("No permissions yet.")).not.toBeInTheDocument();
  });

  it("resolves every new permission-panel string through the REAL dictionary, not the English fallback", () => {
    // The identity `t` above cannot catch a dictionary miss: `dictionary-translator` resolves a
    // miss as `?? key`, so a string added to this component but NOT to `roles-i18n.ts` renders raw
    // English in every locale with no error and no failing test. This binds the real translator to
    // `es` and asserts the Spanish copy, which only passes if each key matches character for
    // character (the ellipsis in "Loading permissions…" is the easiest one to get wrong).
    const spanish = (key: string) => realT("es", key);
    render(
      <table>
        <tbody>
          <PolicyRow
            policy={CUSTOM_POLICY}
            row={policyRow()}
            permission={policyPermission({ openForPolicyId: CUSTOM_POLICY.id, rows: [PERMISSION_ROW] })}
            agentBase="policy-row"
            t={spanish}
            locale="es"
          />
        </tbody>
      </table>,
    );

    expect(screen.getByText("Permisos actuales")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar permiso content.write" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quitar permiso/ })).toHaveTextContent("Quitar");
  });

  it("disables only the row whose removal is in flight", () => {
    const other = { ...PERMISSION_ROW, id: "pp-2", permission: "content.read" };
    renderOpenPermissionPanel(
      policyPermission({
        openForPolicyId: CUSTOM_POLICY.id,
        rows: [PERMISSION_ROW, other],
        removingId: PERMISSION_ROW.id,
      }),
    );

    expect(screen.getByRole("button", { name: "Remove permission content.write" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove permission content.read" })).toBeEnabled();
  });
});
