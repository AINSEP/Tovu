import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { type AdminPolicy, type AdminPolicyPermission, type AdminRole } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { describeApiError, KEYS } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../roles-i18n";
import { defaultRolesPort } from "./roles-dependencies.hooks";
import type { RolesPort } from "./roles-port.hooks";

/**
 * @file Everything the "Roles & Permissions" screen does, so `Roles.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings. This
 * screen has no unit test today (`README.md`'s own note: "treat a change here as unverified until
 * you have driven it in a browser"), and it is the file this extraction pass exists for: a hook is
 * reachable from `renderHook` with no table, no `RowMenu`, and no `ConfirmDialog`.
 *
 * The doc comments below moved WITH the functions they describe, verbatim — several are decision
 * records (why delete now gates via `ConfirmDialog` instead of the two-click `ConfirmButton`) and a
 * comment separated from its code stops being read.
 *
 * `describeApiError` moved to `../rules` (it computes a value — an error string — rather than
 * rendering one); every handler below that used to call the module-level `describeApiError` now
 * calls the imported one instead, unchanged in every other respect.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `features/posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/roles` needs it.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import): this hook already called
 * `useAdminLocale()` for its own error-string translations, so exposing that SAME already-resolved
 * `locale` as a bound `t` (plus the raw value, still needed for `rules.ts`'s `roleMenuItems`/
 * `policyMenuItems` and `roles-i18n.tsx`'s several part-builder helpers, all of which take `locale`
 * directly) on the return value adds no new fetch — `Roles.tsx` used to call `useAdminLocale()` a
 * second time and rebuild its own `translateRoles(locale, key)` closure, entirely redundant with
 * the resolution this hook was already doing internally.
 *
 * `lib/fetch-query` migration (2026-08-12): the combined roles+policies read is one `useFetchQuery`
 * keyed on `KEYS.list`; every write invalidates it instead of calling `reload()` by hand (see
 * `rules.ts`'s `KEYS` doc) — except `onWritePermission`, which never called `reload()` either, so it
 * stays a plain `useFetchMutation` with no `invalidates`.
 *
 * `rowSavingId`/`rowError` deliberately stay plain `useState`, NOT derived from any mutation's own
 * `status`/`error`: five independent writes (rename role, delete role, rename policy, delete policy,
 * write permission) share this ONE "which row is busy" id and one error slot, and a mutation object's
 * `status` has no way to carry "which row this particular call was for" the way a manually-set id
 * does. `createRoleMutation`/`createPolicyMutation` are the ones-per-mutation exception below — each
 * backs exactly one form, so `roleSaving`/`policySaving`/`roleError`/`policyError` derive from them
 * directly, same shape as every other migrated create form in this sweep.
 *
 * `useX(dependencies)` / `useWiredX()` conversion (2026-08-14): every `api.xxx()` call below is now
 * `port.xxx()` — see `roles-port.hooks.ts` for the interface and `roles-dependencies.hooks.ts` for
 * the real binding, the only file left that imports `lib/api` as a value for this feature. Same
 * "no ref/dep-array needed" note as `use-users.hooks.ts`'s identical section: every write here goes
 * through `useFetchMutation` (via `lib/fetch-query`), which takes a fresh `mutationFn` closure every
 * render by design — there is no `useEffect([port])` in this file for `port` to be listed in wrongly.
 */

export interface RolesController {
  roles: AdminRole[] | null;
  policies: AdminPolicy[] | null;
  error: string | null;
  rowError: string | null;

  roleName: string;
  setRoleName: (name: string) => void;
  roleSaving: boolean;
  roleError: string | null;
  onCreateRole: (e: React.FormEvent) => Promise<void>;

  policyName: string;
  setPolicyName: (name: string) => void;
  policyDescription: string;
  setPolicyDescription: (description: string) => void;
  policySaving: boolean;
  policyError: string | null;
  onCreatePolicy: (e: React.FormEvent) => Promise<void>;

  editingRoleId: string | null;
  setEditingRoleId: (roleId: string | null) => void;
  editingRoleName: string;
  setEditingRoleName: (name: string) => void;
  startEditRole: (role: AdminRole) => void;
  onSaveRole: (roleId: string) => Promise<void>;

  editingPolicyId: string | null;
  setEditingPolicyId: (policyId: string | null) => void;
  editingPolicyName: string;
  setEditingPolicyName: (name: string) => void;
  editingPolicyDescription: string;
  setEditingPolicyDescription: (description: string) => void;
  startEditPolicy: (policy: AdminPolicy) => void;
  onSavePolicy: (policyId: string) => Promise<void>;

  /** In-flight row action (rename, delete, or write-permission) — one at a time. */
  rowSavingId: string | null;

  permissionPolicyId: string | null;
  permissionInput: string;
  setPermissionInput: (permission: string) => void;
  resourceTypeInput: string;
  setResourceTypeInput: (resourceType: string) => void;
  togglePermissionForm: (policyId: string) => void;
  onWritePermission: (policyId: string) => Promise<void>;

  /** OQ-10 — the open policy's CURRENT permission rows, so the form can show what is already
   *  granted and offer each one a Remove. Empty whenever no form is open. Loaded on open (and
   *  re-loaded after a write or a removal) rather than with the policy list, because
   *  `listPolicies` does not carry permissions and only one policy's form is open at a time. */
  permissionRows: AdminPolicyPermission[];
  permissionsLoading: boolean;
  /** Which permission row has its removal in flight — drives that row's own busy label, not a
   *  page-wide spinner (same reasoning as `rowSavingId`). */
  removingPermissionId: string | null;
  onRemovePermission: (policyId: string, policyPermissionId: string) => Promise<void>;

  /** The role a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
   *  closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
   *  this is what drives its `open` prop. Separate state per table since a role and a policy delete
   *  are independent operations with their own copy, not because anything shares data between them. */
  pendingRoleDelete: AdminRole | null;
  setPendingRoleDelete: (role: AdminRole | null) => void;
  onDeleteRole: () => Promise<void>;

  pendingPolicyDelete: AdminPolicy | null;
  setPendingPolicyDelete: (policy: AdminPolicy | null) => void;
  onDeletePolicy: () => Promise<void>;

  /** Bound translator — `key` already resolved against the caller's locale, so `Roles.tsx` never
   *  imports `useAdminLocale`/`roles-i18n` itself. See this file's header. */
  t: (key: string) => string;
  /** Raw resolved locale — `rules.ts`'s row-menu builders and `roles-i18n.tsx`'s part-builder
   *  helpers take `locale` directly rather than a bound translator. See this file's header. */
  locale: string;
}

/** The shape `onDeleteRole`/`onDeletePolicy` both repeat: guard on nothing pending, set the shared
 *  `rowSavingId`/`rowError` pair keyed by the row's own id (deliberately not a fit for
 *  `useAsyncAction` — see that file's own header on why a busy-row-id, not a boolean, is a
 *  different shape), delete, and always clear both the saving flag and the pending selection in
 *  `finally` regardless of outcome. `reload()` is gone — `deleteMutation` itself `invalidates:
 *  [KEYS.list]` — this helper's job now is purely the shared busy-id/error bookkeeping. The
 *  "whole-hook" complexity view (brief §2) counts both ~10-line blocks against `useRoles` even
 *  though each is individually small under ESLint's own per-function view — `onDeletePolicy` had no
 *  test at all before the extraction pass that introduced this helper; characterisation tests were
 *  added first (`use-roles.unit.test.ts`) so this extraction has coverage to prove it behavior-
 *  preserving against.
 *
 *  `setRowSavingId`'s `finally` reset (2026-09-05 fix, same bug class as `use-sites.hooks.ts`'s
 *  `activate`/`use-themes.hooks.ts`'s `activate`/`download`/`use-theme-explore.hooks.ts`'s rename)
 *  is a functional update keyed on THIS call's own `id`, not a blind `setRowSavingId(null)`: nothing
 *  gated a second delete (on a DIFFERENT row) from starting before this one settles, so an
 *  unconditional reset would clear the busy indicator out from under a still-in-flight newer
 *  delete. `clearPending` is the caller's own responsibility to guard the same way (see
 *  `onDeleteRole`/`onDeletePolicy` below) since only the caller knows which pending-selection state
 *  it owns. */
async function runRowDelete(
  id: string,
  mutate: (id: string) => Promise<unknown>,
  setRowSavingId: Dispatch<SetStateAction<string | null>>,
  setRowError: Dispatch<SetStateAction<string | null>>,
  clearPending: () => void,
  describeError: (e: unknown) => string,
): Promise<void> {
  setRowSavingId(id);
  setRowError(null);
  try {
    await mutate(id);
  } catch (e) {
    setRowError(describeError(e));
  } finally {
    setRowSavingId((current) => (current === id ? null : current));
    clearPending();
  }
}

/** What `useRoles` needs injected from outside — see this file's header for the conversion note. */
export interface RolesDependencies {
  port: RolesPort;
}

/**
 * Everything the "Roles & Permissions" screen does — full state, effects, and every server write, as
 * one hook so `Roles.tsx` stays a pure render of whatever this returns. See this file's header for
 * the `useFetchQuery`/`useFetchMutation` migration and the `port` injection it now also carries.
 *
 * @param deps - Injected collaborators; production callers get these from {@link useWiredRoles}.
 * @returns The full `RolesController` the view renders from — see that interface for every field.
 */
export function useRoles(deps: RolesDependencies): RolesController {
  const { port } = deps;
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);

  const list = useFetchQuery({
    key: KEYS.list,
    fetch: async () => {
      const [r, p] = await Promise.all([port.listRoles(), port.listPolicies()]);
      return { roles: r.roles, policies: p.policies };
    },
  });
  const roles = list.data?.roles ?? null;
  const policies = list.data?.policies ?? null;
  const error = list.error ? describeApiError(list.error, t(locale, "failed to load roles/policies")) : null;

  const [rowError, setRowError] = useState<string | null>(null);

  const [roleName, setRoleName] = useState("");
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editingPolicyName, setEditingPolicyName] = useState("");
  const [editingPolicyDescription, setEditingPolicyDescription] = useState("");
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  const [permissionPolicyId, setPermissionPolicyId] = useState<string | null>(null);
  const [permissionInput, setPermissionInput] = useState("");
  const [resourceTypeInput, setResourceTypeInput] = useState("");
  const [permissionRows, setPermissionRows] = useState<AdminPolicyPermission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [removingPermissionId, setRemovingPermissionId] = useState<string | null>(null);
  // Monotonic per-call id (same shape as `use-theme-explore.hooks.ts`'s `renameGenerationRef` /
  // `use-themes.hooks.ts`'s `activateGenerationRef`/`downloadGenerationRef`): `togglePermissionForm`
  // (opening a different policy) and `onWritePermission`/`onRemovePermission` (their own trailing
  // refresh) all funnel into `loadPermissions` with no guard against a SECOND call — for a DIFFERENT
  // policy — starting before the first settles, and network completion order does not have to match
  // start order. Minted synchronously at the top of `loadPermissions` so two loads started back to
  // back always mint in the order they started even though both are async — a stale settlement
  // (checked before every state write below, not just the success path, since an out-of-order
  // FAILURE would otherwise resurrect a stale error over a newer load's real outcome — `rowError` is
  // one shared field across every action in this hook) is dropped instead of overwriting whichever
  // policy's rows the operator is actually looking at now.
  const permissionsGenerationRef = useRef(0);

  // The row a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
  // this is what drives its `open` prop. Separate state per table since a role and a policy delete
  // are independent operations with their own copy, not because anything shares data between them.
  const [pendingRoleDelete, setPendingRoleDelete] = useState<AdminRole | null>(null);
  const [pendingPolicyDelete, setPendingPolicyDelete] = useState<AdminPolicy | null>(null);

  const createRoleMutation = useFetchMutation({
    run: (name: string) => port.createRole(name),
    invalidates: [KEYS.list],
  });
  const createPolicyMutation = useFetchMutation({
    run: (input: { name: string; description: string | undefined }) =>
      port.createPolicy({ name: input.name }, { description: input.description }),
    invalidates: [KEYS.list],
  });
  const saveRoleMutation = useFetchMutation({
    run: (input: { roleId: string; name: string }) => port.updateRole(input),
    invalidates: [KEYS.list],
  });
  const deleteRoleMutation = useFetchMutation({
    run: (id: string) => port.deleteRole(id),
    invalidates: [KEYS.list],
  });
  const savePolicyMutation = useFetchMutation({
    run: (input: { policyId: string; name: string; description: string }) =>
      port.updatePolicy({ policyId: input.policyId }, { name: input.name, description: input.description }),
    invalidates: [KEYS.list],
  });
  const deletePolicyMutation = useFetchMutation({
    run: (id: string) => port.deletePolicy(id),
    invalidates: [KEYS.list],
  });
  // No `invalidates` — matches the pre-migration `onWritePermission`, which never called `reload()`
  // either.
  const writePermissionMutation = useFetchMutation({
    run: (input: { policyId: string; permission: string; resourceType: string | undefined }) =>
      port.writePolicyPermission({ policyId: input.policyId, permission: input.permission }, { resourceType: input.resourceType }),
  });
  // Also no `invalidates`: removing a permission changes nothing `KEYS.list` caches (the policy
  // list carries no permissions), so the refresh that matters is `loadPermissions` below.
  const removePermissionMutation = useFetchMutation({
    run: (input: { policyId: string; policyPermissionId: string }) => port.removePolicyPermission(input),
  });

  async function onCreateRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRoleMutation.mutate(roleName);
      setRoleName("");
    } catch {
      // already surfaced through createRoleMutation.error -> roleError below
    }
  }

  async function onCreatePolicy(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createPolicyMutation.mutate({ name: policyName, description: policyDescription || undefined });
      setPolicyName("");
      setPolicyDescription("");
    } catch {
      // already surfaced through createPolicyMutation.error -> policyError below
    }
  }

  function startEditRole(role: AdminRole) {
    setRowError(null);
    setEditingRoleId(role.id);
    setEditingRoleName(role.name);
  }

  /** `setEditingRoleId`/`setRowSavingId`'s settle-time writes (2026-09-05 fix, same bug class as
   *  `use-sites.hooks.ts`'s `activate`/`use-themes.hooks.ts`'s `activate`/`download`/
   *  `use-theme-explore.hooks.ts`'s rename) are functional updates keyed on THIS call's own
   *  `roleId`, not a blind `setEditingRoleId(null)`/`setRowSavingId(null)`: nothing gates a second
   *  `onSaveRole` (for a DIFFERENT role) from starting before this one settles — the operator can
   *  freely click "Edit" on another row at any time, no modal blocks it — so an unconditional reset
   *  would close a DIFFERENT, still-open and unsaved row's inline edit UI out from under the
   *  operator the moment this stale call finally settles. */
  async function onSaveRole(roleId: string) {
    setRowSavingId(roleId);
    setRowError(null);
    try {
      await saveRoleMutation.mutate({ roleId, name: editingRoleName });
      setEditingRoleId((current) => (current === roleId ? null : current));
    } catch (e) {
      setRowError(describeApiError(e, t(locale, "failed to rename role")));
    } finally {
      setRowSavingId((current) => (current === roleId ? null : current));
    }
  }

  /** Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item
   *  (`setPendingRoleDelete` below) — this row action moved off the in-place two-click
   *  `ConfirmButton` control (MSG-03 rollout) because a `RowMenu` item fires once and the menu
   *  closes immediately (`selectItem` in `RowMenu.tsx`), so there is no "stay open for a second
   *  confirm click" state for `ConfirmButton` to hold; `ConfirmDialog` is the mechanism that
   *  survives the menu closing, same as `Posts.tsx`/`Pages.tsx`'s own Delete.
   *
   *  `clearPending` (2026-09-05 fix, same reasoning as `onSaveRole`'s comment above) only clears
   *  `pendingRoleDelete` when it still names THIS call's own `role` — otherwise a stale delete
   *  settling after the operator has already opened a DIFFERENT row's delete confirmation would
   *  silently dismiss that dialog with no decision made. */
  async function onDeleteRole() {
    if (!pendingRoleDelete) return;
    const role = pendingRoleDelete;
    await runRowDelete(
      role.id,
      deleteRoleMutation.mutate,
      setRowSavingId,
      setRowError,
      () => setPendingRoleDelete((current) => (current?.id === role.id ? null : current)),
      (e) => describeApiError(e, t(locale, "failed to delete role")),
    );
  }

  function startEditPolicy(policy: AdminPolicy) {
    setRowError(null);
    setEditingPolicyId(policy.id);
    setEditingPolicyName(policy.name);
    setEditingPolicyDescription(policy.description ?? "");
  }

  /** Same settle-time guard as `onSaveRole` above, keyed on `policyId` instead of `roleId` — see
   *  that function's comment for why. */
  async function onSavePolicy(policyId: string) {
    setRowSavingId(policyId);
    setRowError(null);
    try {
      await savePolicyMutation.mutate({ policyId, name: editingPolicyName, description: editingPolicyDescription });
      setEditingPolicyId((current) => (current === policyId ? null : current));
    } catch (e) {
      setRowError(describeApiError(e, t(locale, "failed to update policy")));
    } finally {
      setRowSavingId((current) => (current === policyId ? null : current));
    }
  }

  /** Same `ConfirmDialog`-via-`RowMenu` swap as `onDeleteRole` above, plus the same `clearPending`
   *  settle-time guard — see that function's comments for both. */
  async function onDeletePolicy() {
    if (!pendingPolicyDelete) return;
    const policy = pendingPolicyDelete;
    await runRowDelete(
      policy.id,
      deletePolicyMutation.mutate,
      setRowSavingId,
      setRowError,
      () => setPendingPolicyDelete((current) => (current?.id === policy.id ? null : current)),
      (e) => describeApiError(e, t(locale, "failed to delete policy")),
    );
  }

  /** Refresh the open form's permission list. Failures land in `rowError` like every other row
   *  action rather than throwing — a list that cannot load must not take the form down with it. */
  async function loadPermissions(policyId: string) {
    const generation = ++permissionsGenerationRef.current;
    setPermissionsLoading(true);
    try {
      const { policyPermissions } = await port.listPolicyPermissions(policyId);
      // Superseded by a newer load started after this one — that later call owns
      // `permissionRows` now, and applying this stale result would let whichever policy's load
      // happens to settle LAST win regardless of which panel is actually open. See
      // `permissionsGenerationRef`'s doc comment above.
      if (permissionsGenerationRef.current !== generation) return;
      setPermissionRows(policyPermissions);
    } catch (e) {
      if (permissionsGenerationRef.current !== generation) return;
      setPermissionRows([]);
      setRowError(describeApiError(e, t(locale, "failed to load permissions")));
    } finally {
      if (permissionsGenerationRef.current !== generation) return;
      setPermissionsLoading(false);
    }
  }

  function togglePermissionForm(policyId: string) {
    setRowError(null);
    setPermissionInput("");
    setResourceTypeInput("");
    setPermissionPolicyId((current) => {
      const closing = current === policyId;
      // Clear first either way, so a re-open never flashes the previous policy's permissions.
      setPermissionRows([]);
      if (!closing) void loadPermissions(policyId);
      return closing ? null : policyId;
    });
  }

  async function onRemovePermission(policyId: string, policyPermissionId: string) {
    setRemovingPermissionId(policyPermissionId);
    setRowError(null);
    try {
      await removePermissionMutation.mutate({ policyId, policyPermissionId });
      await loadPermissions(policyId);
    } catch (e) {
      setRowError(describeApiError(e, t(locale, "failed to remove permission")));
    } finally {
      setRemovingPermissionId(null);
    }
  }

  /** 2026-09-05 fix, same bug class as `onSaveRole`/`onDeleteRole` above: nothing gates opening a
   *  DIFFERENT policy's permission form (`togglePermissionForm`) while a write for the previously
   *  open one is still in flight. `permissionInput`/`resourceTypeInput` are cleared on success
   *  unconditionally — captured here as `generationAtStart` (`permissionsGenerationRef`, bumped by
   *  every `loadPermissions` call, i.e. every panel open) before the write starts, so a stale
   *  write's success can tell "the operator is still on the policy this write was for" apart from
   *  "they've since switched panels and typed a NEW, unrelated value" and skip clearing in the
   *  latter case — otherwise it would erase whatever the operator typed for the policy they
   *  actually have open now. `rowSavingId`'s reset (matching `onSaveRole`'s identical fix) is a
   *  functional update keyed on this call's own `policyId` for the same reason. */
  async function onWritePermission(policyId: string) {
    if (!permissionInput) return;
    const generationAtStart = permissionsGenerationRef.current;
    setRowSavingId(policyId);
    setRowError(null);
    try {
      await writePermissionMutation.mutate({ policyId, permission: permissionInput, resourceType: resourceTypeInput || undefined });
      if (permissionsGenerationRef.current === generationAtStart) {
        setPermissionInput("");
        setResourceTypeInput("");
      }
      // The row the write just created has to appear in the list, or its Remove button would not
      // exist until the form was closed and re-opened. Safe to call even when superseded —
      // `loadPermissions` guards its own state writes against exactly that.
      await loadPermissions(policyId);
    } catch (e) {
      setRowError(describeApiError(e, t(locale, "failed to add permission")));
    } finally {
      setRowSavingId((current) => (current === policyId ? null : current));
    }
  }

  const roleSaving = createRoleMutation.status === "pending";
  const roleError = createRoleMutation.error ? describeApiError(createRoleMutation.error, t(locale, "failed to create role")) : null;
  const policySaving = createPolicyMutation.status === "pending";
  const policyError = createPolicyMutation.error
    ? describeApiError(createPolicyMutation.error, t(locale, "failed to create policy"))
    : null;

  return {
    roles,
    policies,
    error,
    rowError,

    roleName,
    setRoleName,
    roleSaving,
    roleError,
    onCreateRole,

    policyName,
    setPolicyName,
    policyDescription,
    setPolicyDescription,
    policySaving,
    policyError,
    onCreatePolicy,

    editingRoleId,
    setEditingRoleId,
    editingRoleName,
    setEditingRoleName,
    startEditRole,
    onSaveRole,

    editingPolicyId,
    setEditingPolicyId,
    editingPolicyName,
    setEditingPolicyName,
    editingPolicyDescription,
    setEditingPolicyDescription,
    startEditPolicy,
    onSavePolicy,

    rowSavingId,

    permissionPolicyId,
    permissionInput,
    setPermissionInput,
    resourceTypeInput,
    setResourceTypeInput,
    togglePermissionForm,
    onWritePermission,

    permissionRows,
    permissionsLoading,
    removingPermissionId,
    onRemovePermission,

    pendingRoleDelete,
    setPendingRoleDelete,
    onDeleteRole,

    pendingPolicyDelete,
    setPendingPolicyDelete,
    onDeletePolicy,

    t: boundT,
    locale,
  };
}

/**
 * Binds the real `/api/.../roles` and `/policies` clients — see `roles-dependencies.hooks.ts`. The
 * zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Roles.tsx` composes this
 * and a test composes {@link useRoles} with `createFakeRolesPort`.
 *
 * @returns The same `RolesController` {@link useRoles} returns, wired to the live API client.
 */
export function useWiredRoles(): RolesController {
  return useRoles({ port: defaultRolesPort });
}
