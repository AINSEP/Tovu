import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { api, type AdminIdentityUser, type AdminPolicy, type AdminRole } from "../../../lib/api";
import { useAsyncAction } from "../../../hooks/use-async-action.hooks";
import { describeApiError } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { passwordResetNotice, t } from "../users-i18n";

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
}

/** The shape `onAssignRole`/`onAttachPolicy`/`onSaveEmail` all repeat: set the shared
 *  `grantSaving`/`grantError` pair, run one call, do a success-only side effect, reload, and clear
 *  saving in a `finally` — the "whole-hook" complexity view (brief §2) rolls every closure inside
 *  a hook into one score, so three near-identical 10-line blocks count against `useUsers` even
 *  though `grantError`/`grantSaving` are deliberately NOT a fit for `useAsyncAction` (see that
 *  file's own header: shared across three handlers on purpose, not one action's own slot).
 *  Reproducing the shared-state shape as a local top-level helper — rather than importing the
 *  generic primitive — collapses the three call sites without forcing that mismatch onto them.
 *  `onSuccess` is a no-op for `onSaveEmail`, which has nothing else to clear on success. */
async function runGrantMutation(
  action: () => Promise<unknown>,
  onSuccess: () => void,
  setGrantSaving: Dispatch<SetStateAction<boolean>>,
  setGrantError: Dispatch<SetStateAction<string | null>>,
  reload: () => Promise<void>,
  describeError: (e: unknown) => string,
): Promise<void> {
  setGrantSaving(true);
  setGrantError(null);
  try {
    await action();
    onSuccess();
    await reload();
  } catch (e) {
    setGrantError(describeError(e));
  } finally {
    setGrantSaving(false);
  }
}

export function useUsers(): UsersController {
  const locale = useAdminLocale();
  const [users, setUsers] = useState<AdminIdentityUser[] | null>(null);
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [policies, setPolicies] = useState<AdminPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const createUser = useAsyncAction();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState("");
  const [pendingPolicyId, setPendingPolicyId] = useState("");
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const [editEmail, setEditEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [toggleSavingId, setToggleSavingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  function reload(): Promise<void> {
    return Promise.all([api.listUsers(), api.listRoles(), api.listPolicies()])
      .then(([u, r, p]) => {
        setUsers(u.users);
        setRoles(r.roles);
        setPolicies(p.policies);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load users"))));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createUser.run(async () => {
      await api.createUser({ username, password }, { email: email || undefined });
      setUsername("");
      setEmail("");
      setPassword("");
      setFormOpen(false);
      await reload();
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
      () => api.assignRole({ principalId, roleId: pendingRoleId }),
      () => setPendingRoleId(""),
      setGrantSaving,
      setGrantError,
      reload,
      (e) => describeApiError(e, t(locale, "failed to assign role")),
    );
  }

  async function onAttachPolicy(principalId: string) {
    if (!pendingPolicyId) return;
    await runGrantMutation(
      () => api.attachPolicy({ principalId, policyId: pendingPolicyId }),
      () => setPendingPolicyId(""),
      setGrantSaving,
      setGrantError,
      reload,
      (e) => describeApiError(e, t(locale, "failed to attach policy")),
    );
  }

  // `onSaveEmail` was left out of the `runGrantMutation` fold above on purpose: it tracks its OWN
  // `emailSaving` flag rather than the shared `grantSaving` `onAssignRole`/`onAttachPolicy` use, so
  // routing it through the same helper would mean passing a no-op in place of `setGrantSaving` —
  // extraction for the sake of a shared call site, not a shared shape. Left hand-rolled.
  async function onSaveEmail(principalId: string) {
    setEmailSaving(true);
    setGrantError(null);
    try {
      await api.updateUser({ principalId }, { email: editEmail });
      await reload();
    } catch (e) {
      setGrantError(describeApiError(e, t(locale, "failed to update email")));
    } finally {
      setEmailSaving(false);
    }
  }

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
      await api.resetUserPassword({ principalId: resetPasswordFor.principalId, password: newPassword });
      setNotice(passwordResetNotice(locale, resetPasswordFor.username));
      setResetPasswordFor(null);
      setNewPassword("");
    }, (e) => describeApiError(e, t(locale, "failed to reset password")));
  }

  async function onToggleStatus(user: AdminIdentityUser) {
    setToggleSavingId(user.principalId);
    setToggleError(null);
    try {
      if (user.status === "active") {
        await api.disableUser(user.principalId);
      } else {
        await api.enableUser(user.principalId);
      }
      await reload();
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
  };
}
