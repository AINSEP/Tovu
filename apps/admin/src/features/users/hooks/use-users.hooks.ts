import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { type AdminIdentityUser, type AdminPolicy, type AdminRole } from "../../../lib/api";
import { useFetchMutation, useFetchQuery } from "../../../lib/fetch-query";
import { useAsyncAction } from "../../../hooks/use-async-action.hooks";
import { describeApiError, KEYS } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { passwordResetNotice, t } from "../users-i18n";
import { defaultUsersPort } from "./users-dependencies.hooks";
import type { UsersPort } from "./users-port.hooks";

/**
 * @file Everything the Users screen does, so `Users.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect bodies, same error strings.
 * This is the highest-state screen in the app (25 `useState` calls): users/roles/policies load, the
 * "New user" form, the per-row expandable "Manage" panel (role/policy grants, email edit), the
 * Disable confirm dialog, and the reset-password dialog all live here so `Users.tsx` can stay a pure
 * render of whatever this hook returns.
 *
 * `describeApiError` (this screen's server-error-code overrides) moved to `rules.ts` alongside the
 * row-menu builder, since both compute a value rather than performing an effect; this hook imports
 * it back for its own async handlers.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/users` needs it.
 *
 * `onCreate` and `confirmResetPassword` — each a single action with its OWN dedicated saving/error
 * pair — now run through `hooks/use-async-action.hooks.ts`'s `useAsyncAction`, replacing their own
 * `setXSaving(true)/setXError(null)/try/catch/finally` boilerplate with one `run()` call each; the
 * public `UsersController` shape (`saving`/`formError`, `passwordSaving`/`passwordError`/
 * `setPasswordError`) is unchanged. `grantSaving`/`grantError` (shared by three different handlers
 * for one "Manage" panel error slot) and `toggleSavingId`/`toggleError` (`toggleSavingId` is the
 * BUSY ROW'S id, not a boolean) stay hand-rolled — see `useAsyncAction`'s own header for why forcing
 * either shape onto that primitive would change behavior rather than just deduplicate it.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import): this hook already called
 * `useAdminLocale()` for its own error-string translations, so exposing that SAME already-resolved
 * `locale` as a bound `t` (plus the raw value, still needed for `rules.ts`'s `userRowMenuItems`,
 * which takes `locale` directly) on the return value adds no new fetch — `Users.tsx` used to call
 * `useAdminLocale()` a second time and rebuild its own `translateUsers(locale, key)` closure,
 * entirely redundant with the resolution this hook was already doing internally.
 *
 * `lib/fetch-query` migration (2026-08-12): the combined users+roles+policies read is one
 * `useFetchQuery` keyed on `KEYS.list`; every write below routes its actual API call through a
 * `useFetchMutation` that `invalidates: [KEYS.list]` instead of the `action`/handler body calling
 * `reload()` by hand — except `resetPasswordMutation`, which never called `reload()` either (a
 * password reset doesn't change anything the users table shows). `useAsyncAction` (`createUser`/
 * `resetPassword` below) keeps owning the busy/error UI state exactly as before — this migration
 * only changes what runs INSIDE its `action` callback, not the primitive itself, which is shared
 * with other screens and has no fetch-query concern of its own. `grantSaving`/`grantError`/
 * `toggleSavingId`/`toggleError` stay hand-rolled for the same reason `use-roles.hooks.ts`'s
 * `rowSavingId`/`rowError` do: each is shared across MULTIPLE independent mutations, and a single
 * mutation's own `status`/`error` has no way to carry "which row/action this particular call was
 * for". `emailSaving` is the one exception — it already tracked exactly one mutation 1:1 before this
 * migration, so it now derives from `updateEmailMutation.status` directly.
 *
 * `useX(dependencies)` / `useWiredX()` conversion (2026-08-14): every `api.xxx()` call below is now
 * `port.xxx()` — see `users-port.hooks.ts` for the interface and `users-dependencies.hooks.ts` for
 * the real binding, the only file left that imports `lib/api` as a value for this feature. `port` is
 * captured once from `deps` and read directly inside the `useFetchQuery`/`useFetchMutation` closures
 * below, which is safe without the ref-and-dep-array discipline `apps/admin/INFO.md`'s "Two traps"
 * section describes for a hand-rolled `useEffect`: TanStack's `useQuery`/`useMutation` (this file's
 * actual I/O primitive, via `lib/fetch-query`) take a fresh `queryFn`/`mutationFn` closure every
 * render by design and do not require referential stability to avoid a refetch loop, unlike a raw
 * `useEffect([port])`. There is no dependency array in this file for `port` to be listed in wrongly.
 */

export interface UsersController {
  /** `null` until the initial load settles — the caller renders a loading state. Loaded together
   *  with `roles`/`policies` via `Promise.all`, so all three settle on the same render. */
  users: AdminIdentityUser[] | null;
  roles: AdminRole[] | null;
  policies: AdminPolicy[] | null;
  error: string | null;

  /** Whether the "New user" form is expanded. */
  formOpen: boolean;
  setFormOpen: Dispatch<SetStateAction<boolean>>;
  username: string;
  setUsername: Dispatch<SetStateAction<string>>;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
  saving: boolean;
  formError: string | null;
  onCreate: (e: FormEvent) => Promise<void>;

  /** The row whose "Manage" panel is expanded — `null` when every row is collapsed. */
  expandedId: string | null;
  toggleExpanded: (user: AdminIdentityUser) => void;
  pendingRoleId: string;
  setPendingRoleId: Dispatch<SetStateAction<string>>;
  pendingPolicyId: string;
  setPendingPolicyId: Dispatch<SetStateAction<string>>;
  grantSaving: boolean;
  grantError: string | null;
  onAssignRole: (principalId: string) => Promise<void>;
  onAttachPolicy: (principalId: string) => Promise<void>;

  /** The "Manage" panel's own email field — seeded from `user.email` when the panel opens. */
  editEmail: string;
  setEditEmail: Dispatch<SetStateAction<string>>;
  emailSaving: boolean;
  onSaveEmail: (principalId: string) => Promise<void>;

  /** In-flight Disable/Enable request, keyed by `principalId` — one at a time. */
  toggleSavingId: string | null;
  toggleError: string | null;
  notice: string | null;

  /** The user a `RowMenu` "Disable" selection is asking to confirm; `null` when the dialog is
   *  shut. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on
   *  why); this is what drives its `open` prop. */
  confirmingDisable: AdminIdentityUser | null;
  setConfirmingDisable: Dispatch<SetStateAction<AdminIdentityUser | null>>;
  /** Opens the Disable confirm dialog for `user` — the `RowMenu` "Disable" item's `onSelect` when
   *  the user is currently active (Enable, by contrast, fires immediately via `onToggleStatus`). */
  requestDisable: (user: AdminIdentityUser) => void;
  confirmDisable: () => Promise<void>;
  onToggleStatus: (user: AdminIdentityUser) => Promise<void>;

  /** The user a `RowMenu` "Reset password" selection is asking about; `null` when the dialog is
   *  shut. Kept open on failure (unlike the Disable dialog, which closes either way) so a failed
   *  attempt doesn't discard the password the operator just typed. */
  resetPasswordFor: AdminIdentityUser | null;
  setResetPasswordFor: Dispatch<SetStateAction<AdminIdentityUser | null>>;
  newPassword: string;
  setNewPassword: Dispatch<SetStateAction<string>>;
  passwordSaving: boolean;
  passwordError: string | null;
  setPasswordError: Dispatch<SetStateAction<string | null>>;
  openResetPassword: (user: AdminIdentityUser) => void;
  confirmResetPassword: () => Promise<void>;

  /** Bound translator — `key` already resolved against the caller's locale, so `Users.tsx` never
   *  imports `useAdminLocale`/`users-i18n` itself. See this file's header. */
  t: (key: string) => string;
  /** Raw resolved locale — `rules.ts`'s `userRowMenuItems` takes `locale` directly rather than a
   *  bound translator. See this file's header. */
  locale: string;
}

/** The shape `onAssignRole`/`onAttachPolicy` both repeat: set the shared `grantSaving`/`grantError`
 *  pair, run one mutation, do a success-only side effect, and clear saving in a `finally` — the
 *  "whole-hook" complexity view (brief §2) rolls every closure inside a hook into one score, so two
 *  near-identical blocks count against `useUsers` even though `grantError`/`grantSaving` are
 *  deliberately NOT a fit for `useAsyncAction` (see that file's own header: shared across three
 *  handlers on purpose, not one action's own slot — `onSaveEmail` is the third, kept separate below
 *  since it tracks its OWN `emailSaving`). Reproducing the shared-state shape as a local top-level
 *  helper — rather than importing the generic primitive — collapses the two call sites without
 *  forcing that mismatch onto them. `mutate` itself `invalidates: [KEYS.list]`, replacing the
 *  pre-migration `reload()` call this helper used to make explicitly. */
async function runGrantMutation(
  mutate: () => Promise<unknown>,
  onSuccess: () => void,
  setGrantSaving: Dispatch<SetStateAction<boolean>>,
  setGrantError: Dispatch<SetStateAction<string | null>>,
  describeError: (e: unknown) => string,
): Promise<void> {
  setGrantSaving(true);
  setGrantError(null);
  try {
    await mutate();
    onSuccess();
  } catch (e) {
    setGrantError(describeError(e));
  } finally {
    setGrantSaving(false);
  }
}

/** What `useUsers` needs injected from outside — see this file's header for the conversion note. */
export interface UsersDependencies {
  port: UsersPort;
}

/**
 * Everything the Users screen does — full state, effects, and every server write, as one hook so
 * `Users.tsx` stays a pure render of whatever this returns. See this file's header for the
 * `useFetchQuery`/`useFetchMutation` migration and the `port` injection it now also carries.
 *
 * @param deps - Injected collaborators; production callers get these from {@link useWiredUsers}.
 * @returns The full `UsersController` the view renders from — see that interface for every field.
 */
export function useUsers(deps: UsersDependencies): UsersController {
  const { port } = deps;
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);

  const list = useFetchQuery({
    key: KEYS.list,
    fetch: async () => {
      const [u, r, p] = await Promise.all([port.listUsers(), port.listRoles(), port.listPolicies()]);
      return { users: u.users, roles: r.roles, policies: p.policies };
    },
  });
  const users = list.data?.users ?? null;
  const roles = list.data?.roles ?? null;
  const policies = list.data?.policies ?? null;
  const error = list.error ? describeApiError(list.error, t(locale, "failed to load users")) : null;

  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const createUser = useAsyncAction();
  const createUserMutation = useFetchMutation({
    run: (input: { username: string; password: string; email: string | undefined }) =>
      port.createUser({ username: input.username, password: input.password }, { email: input.email }),
    invalidates: [KEYS.list],
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState("");
  const [pendingPolicyId, setPendingPolicyId] = useState("");
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const assignRoleMutation = useFetchMutation({
    run: (input: { principalId: string; roleId: string }) => port.assignRole(input),
    invalidates: [KEYS.list],
  });
  const attachPolicyMutation = useFetchMutation({
    run: (input: { principalId: string; policyId: string }) => port.attachPolicy(input),
    invalidates: [KEYS.list],
  });

  const [editEmail, setEditEmail] = useState("");
  const updateEmailMutation = useFetchMutation({
    run: (input: { principalId: string; email: string }) => port.updateUser({ principalId: input.principalId }, { email: input.email }),
    invalidates: [KEYS.list],
  });
  const [toggleSavingId, setToggleSavingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toggleStatusMutation = useFetchMutation({
    run: (user: AdminIdentityUser) => (user.status === "active" ? port.disableUser(user.principalId) : port.enableUser(user.principalId)),
    invalidates: [KEYS.list],
  });

  // Disable now confirms via a `RowMenu` item -> `ConfirmDialog` modal (replacing the in-place
  // two-click `ConfirmButton`, which has no menu-item equivalent — same migration Posts.tsx/
  // Redirects.tsx already made). `null` when the dialog is closed.
  const [confirmingDisable, setConfirmingDisable] = useState<AdminIdentityUser | null>(null);

  // Reset password moved out of the expanded "Manage" panel into its own `RowMenu` item, which
  // opens this dialog (it needs a text field, so it's a `ConfirmDialog` with an input in the body,
  // not a plain confirm). Kept open on failure (unlike the delete-style dialogs above, which close
  // either way) so a failed attempt doesn't discard the password the operator just typed.
  const [resetPasswordFor, setResetPasswordFor] = useState<AdminIdentityUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const resetPassword = useAsyncAction();
  // No `invalidates` — matches the pre-migration `confirmResetPassword`, which never called
  // `reload()` either (a password reset changes nothing the users table shows).
  const resetPasswordMutation = useFetchMutation({
    run: (input: { principalId: string; password: string }) => port.resetUserPassword(input),
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createUser.run(async () => {
      await createUserMutation.mutate({ username, password, email: email || undefined });
      setUsername("");
      setEmail("");
      setPassword("");
      setFormOpen(false);
    }, (e) => describeApiError(e, t(locale, "failed to create user")));
  }

  function toggleExpanded(user: AdminIdentityUser) {
    setGrantError(null);
    setPendingRoleId("");
    setPendingPolicyId("");
    setEditEmail(user.email ?? "");
    setExpandedId((current) => (current === user.principalId ? null : user.principalId));
  }

  async function onAssignRole(principalId: string) {
    if (!pendingRoleId) return;
    await runGrantMutation(
      () => assignRoleMutation.mutate({ principalId, roleId: pendingRoleId }),
      () => setPendingRoleId(""),
      setGrantSaving,
      setGrantError,
      (e) => describeApiError(e, t(locale, "failed to assign role")),
    );
  }

  async function onAttachPolicy(principalId: string) {
    if (!pendingPolicyId) return;
    await runGrantMutation(
      () => attachPolicyMutation.mutate({ principalId, policyId: pendingPolicyId }),
      () => setPendingPolicyId(""),
      setGrantSaving,
      setGrantError,
      (e) => describeApiError(e, t(locale, "failed to attach policy")),
    );
  }

  // `onSaveEmail` was left out of the `runGrantMutation` fold above on purpose: it tracks its OWN
  // `emailSaving` flag rather than the shared `grantSaving` `onAssignRole`/`onAttachPolicy` use, so
  // routing it through the same helper would mean passing a no-op in place of `setGrantSaving` —
  // extraction for the sake of a shared call site, not a shared shape. Left hand-rolled; `emailSaving`
  // now derives from `updateEmailMutation.status` since (unlike `grantSaving`) it was already this
  // one mutation's own dedicated flag.
  async function onSaveEmail(principalId: string) {
    setGrantError(null);
    try {
      await updateEmailMutation.mutate({ principalId, email: editEmail });
    } catch (e) {
      setGrantError(describeApiError(e, t(locale, "failed to update email")));
    }
  }
  const emailSaving = updateEmailMutation.status === "pending";

  /** Opens the reset-password dialog for `user` — the `RowMenu` item's `onSelect`. Guards against
   *  opening a second one while a toggle or a previous reset is still in flight, same discipline
   *  Redirects.tsx uses for its own `RowMenu` items (no per-item `disabled` on `RowMenu` itself). */
  function openResetPassword(user: AdminIdentityUser) {
    if (toggleSavingId || resetPassword.saving) return;
    resetPassword.setError(null);
    setNewPassword("");
    setResetPasswordFor(user);
  }

  async function confirmResetPassword() {
    if (!resetPasswordFor || !newPassword) return;
    // Dialog stays open on failure (unlike the Disable/Delete-style dialogs elsewhere in this app,
    // which close either way) — closing would discard the password the operator just typed for no
    // reason; there's nothing sensitive left on screen once they retry or cancel. `resetPasswordFor`/
    // `newPassword` are therefore only cleared in the success path below, never as a `finally`.
    await resetPassword.run(async () => {
      await resetPasswordMutation.mutate({ principalId: resetPasswordFor.principalId, password: newPassword });
      setNotice(passwordResetNotice(locale, resetPasswordFor.username));
      setResetPasswordFor(null);
      setNewPassword("");
    }, (e) => describeApiError(e, t(locale, "failed to reset password")));
  }

  async function onToggleStatus(user: AdminIdentityUser) {
    setToggleSavingId(user.principalId);
    setToggleError(null);
    try {
      await toggleStatusMutation.mutate(user);
    } catch (e) {
      setToggleError(describeApiError(e, t(locale, "failed to change status")));
    } finally {
      setToggleSavingId(null);
    }
  }

  /** Opens the Disable confirm dialog for `user` — the `RowMenu` "Disable" item's `onSelect` when
   *  the user is currently active. Was an inline closure inside the old `rowMenuItems`; named here
   *  now that the item builder itself moved to `rules.ts` and needs a callback to hand it. */
  function requestDisable(user: AdminIdentityUser) {
    setToggleError(null);
    setConfirmingDisable(user);
  }

  /** Confirms the Disable that `RowMenu`'s "Disable" item asked about. Closes the dialog either
   *  way (matching Posts.tsx/Redirects.tsx's own Disable/Delete `ConfirmDialog` convention) — a
   *  failure surfaces via `toggleError` above the table, not by leaving the modal open. */
  async function confirmDisable() {
    if (!confirmingDisable) return;
    await onToggleStatus(confirmingDisable);
    setConfirmingDisable(null);
  }

  return {
    users,
    roles,
    policies,
    error,

    formOpen,
    setFormOpen,
    username,
    setUsername,
    email,
    setEmail,
    password,
    setPassword,
    saving: createUser.saving,
    formError: createUser.error,
    onCreate,

    expandedId,
    toggleExpanded,
    pendingRoleId,
    setPendingRoleId,
    pendingPolicyId,
    setPendingPolicyId,
    grantSaving,
    grantError,
    onAssignRole,
    onAttachPolicy,

    editEmail,
    setEditEmail,
    emailSaving,
    onSaveEmail,

    toggleSavingId,
    toggleError,
    notice,

    confirmingDisable,
    setConfirmingDisable,
    requestDisable,
    confirmDisable,
    onToggleStatus,

    resetPasswordFor,
    setResetPasswordFor,
    newPassword,
    setNewPassword,
    passwordSaving: resetPassword.saving,
    passwordError: resetPassword.error,
    setPasswordError: resetPassword.setError,
    openResetPassword,
    confirmResetPassword,

    t: boundT,
    locale,
  };
}

/**
 * Binds the real `/api/.../users`, `/roles`, and `/policies` clients — see
 * `users-dependencies.hooks.ts`. The zero-argument half of the `useX(dependencies)` / `useWiredX()`
 * pair, so `Users.tsx` composes this and a test composes {@link useUsers} with
 * `createFakeUsersPort`.
 *
 * @returns The same `UsersController` {@link useUsers} returns, wired to the live API client.
 */
export function useWiredUsers(): UsersController {
  return useUsers({ port: defaultUsersPort });
}
