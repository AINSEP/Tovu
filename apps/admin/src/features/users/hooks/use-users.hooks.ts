import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { type AdminIdentityUser, type AdminPolicy, type AdminRole } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { useAsyncAction } from "@/hooks/use-async-action.hooks";
import { describeApiError, KEYS } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { passwordResetNotice, t } from "../users-i18n";
import { navigate as realNavigate } from "@/lib/router";
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
 *  pre-migration `reload()` call this helper used to make explicitly.
 *
 *  `onSuccess` (2026-09-05 fix, same bug class as `use-roles.hooks.ts`'s `onSaveRole`/
 *  `onWritePermission`): nothing gates opening a DIFFERENT user's Manage panel
 *  (`toggleExpanded`) while a grant for the previously expanded one is still in flight, and
 *  `onSuccess` clears `pendingRoleId`/`pendingPolicyId` — a shared field, not keyed by principal.
 *  `toggleGenerationRef` (bumped once per `toggleExpanded` call, regardless of which panel — see
 *  that function) lets a stale grant tell whether the operator switched panels at ALL while it was
 *  in flight, independent of which principal is currently expanded: comparing against the panel's
 *  OWN identity would wrongly refuse a grant issued before any panel was ever expanded (a
 *  legitimate, already-certified call shape), where `expandedId` never gets set to begin with.
 *  `onSuccess` is skipped only when a switch actually happened since this call started — otherwise
 *  a stale grant's success would erase a NEW, unrelated selection the operator has since made for
 *  the panel they actually have open now. */
async function runGrantMutation(
  generationAtStart: number,
  toggleGenerationRef: { current: number },
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
    if (toggleGenerationRef.current === generationAtStart) onSuccess();
  } catch (e) {
    // Same generation check as the success branch above (C8, plan-access.md §8, N3): a stale
    // failure must not paint onto a DIFFERENT user's panel the operator has since opened.
    if (toggleGenerationRef.current === generationAtStart) setGrantError(describeError(e));
  } finally {
    // Guarded the same way — a stale call's `finally` must not clear a NEWER call's own saving
    // flag. `toggleExpanded` resets `grantSaving` itself when it bumps the generation, so a panel
    // switch still leaves the new panel un-stuck even though this skip means THIS call no longer
    // clears it.
    if (toggleGenerationRef.current === generationAtStart) setGrantSaving(false);
  }
}

/** What `useUsers` needs injected from outside — see this file's header for the conversion note.
 *
 *  `openOwnPasswordReset`/`navigate` (password-banner plan, 2026-09-24 Slice 3): the dashboard nag's
 *  "Change password" link deep-links to `/admin/users/change-password`, which `panels.tsx` turns
 *  into this flag. Both are optional so every existing `useUsers({ port })` call (this file's own
 *  tests, `Users.tsx`'s default) keeps working unchanged — the deep link is additive behavior, not a
 *  new required collaborator. */
export interface UsersDependencies {
  port: UsersPort;
  /** When true, auto-opens the reset-password dialog on the caller's own row once it is known —
   *  see the one-shot effect in {@link useUsers} for why this needs both the flag AND the user list
   *  AND `me()` to have settled before it can act. */
  openOwnPasswordReset?: boolean;
  /** DI seam for `@/lib/router`'s `navigate`, same convention `use-post-editor.hooks.ts`'s `navigate`
   *  dependency uses — real impl wired only in {@link useWiredUsers}. */
  navigate?: (path: string, options?: { replace?: boolean }) => void;
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
  const { port, openOwnPasswordReset = false, navigate } = deps;
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);

  // `portRef` (password-banner plan, 2026-09-24 Slice 3 deep-link half): captured once at mount and
  // never written again, same discipline and same reasoning as `use-assistant-chats.hooks.ts`'s own
  // `portRef` — the one-shot `me()` effect below must not spin if a caller builds a fresh port object
  // per render (`apps/admin/INFO.md`'s "Two traps" section). Every OTHER `port.xxx()` call in this
  // file stays a direct closure read, unaffected — this ref exists only for the raw `useEffect` below,
  // which is not a `useFetchQuery`/`useFetchMutation` closure and so does not get that discipline for
  // free.
  const portRef = useRef(port);

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
  const error = list.error ? describeApiError(list.error, t(locale, "failed to load users"), locale) : null;

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
  // Bumped once per `toggleExpanded` call, regardless of which panel — `runGrantMutation` (a
  // top-level function, outside this closure's re-render cycle) reads this to tell whether the
  // operator switched panels AT ALL while its own grant was in flight. See that function's own doc
  // comment for why this counts switches rather than comparing against `expandedId`'s value.
  const toggleGenerationRef = useRef(0);
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

  /** The signed-in caller's own principal id (password-banner plan, 2026-09-24 Slice 3), from
   *  `port.me()`. `null` until that call settles, or forever if it fails — both are treated as
   *  "unknown", which the deep-link effect below and `confirmResetPassword`'s notice branch both
   *  already handle as "not a self-reset".
   *
   *  Fetched unconditionally (not gated on `openOwnPasswordReset`) — a deliberate choice, not an
   *  oversight: it makes the "sign in again" notice below correct for ANY self-reset, including an
   *  admin resetting their OWN row from the ordinary row-menu (no deep link involved), not just the
   *  one opened via `/users/change-password`. One extra `me()` call per screen load is cheaper than
   *  threading two different notice code paths for what is, to the operator, the same event. */
  const [ownPrincipalId, setOwnPrincipalId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    portRef.current
      .me()
      .then((res) => {
        if (!cancelled) setOwnPrincipalId(res.user.id);
      })
      .catch(() => {
        // Best-effort, see `ownPrincipalId`'s own doc comment above — a failure just means the
        // deep link can't auto-open and self-resets fall back to the per-username notice.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Guards the one-shot deep-link auto-open effect below so it fires at most once per mount, even
   *  as `users`/`ownPrincipalId` keep changing identity across the renders it's waiting on (list
   *  reloads, `me()` settling). Separate from {@link openedViaDeepLinkRef}, which tracks a DIFFERENT
   *  question ("should closing the dialog navigate away") over the dialog's own open/close lifetime
   *  — this one is "has the auto-open already been attempted", which must stay true forever once it
   *  fires, including after the dialog this effect opened has since been closed. */
  const deepLinkAttemptedRef = useRef(false);
  /** Set true exactly when this effect opens the dialog, cleared by the close-effect below the first
   *  time it observes `resetPasswordFor` go back to `null`. Read there to decide whether to navigate
   *  — an operator resetting a DIFFERENT row's password from the ordinary row menu, or cancelling a
   *  normal reset, must not also get shoved to `/users`. */
  const openedViaDeepLinkRef = useRef(false);
  useEffect(() => {
    if (!openOwnPasswordReset || deepLinkAttemptedRef.current) return;
    if (!users || ownPrincipalId === null) return;
    const ownRow = users.find((u) => u.principalId === ownPrincipalId);
    if (!ownRow) return;
    deepLinkAttemptedRef.current = true;
    openedViaDeepLinkRef.current = true;
    openResetPassword(ownRow);
  }, [openOwnPasswordReset, users, ownPrincipalId]);

  useEffect(() => {
    if (resetPasswordFor !== null || !openedViaDeepLinkRef.current) return;
    openedViaDeepLinkRef.current = false;
    navigate?.("/users");
  }, [resetPasswordFor, navigate]);

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
    }, (e) => describeApiError(e, t(locale, "failed to create user"), locale));
  }

  function toggleExpanded(user: AdminIdentityUser) {
    setGrantError(null);
    // A still-in-flight grant for the panel being LEFT can no longer clear this itself
    // (`runGrantMutation`'s `finally` now skips a stale call's own generation) — reset it here so
    // the newly opened panel never inherits a stuck "saving" indicator from the old one.
    setGrantSaving(false);
    setPendingRoleId("");
    setPendingPolicyId("");
    setEditEmail(user.email ?? "");
    toggleGenerationRef.current += 1;
    setExpandedId((current) => (current === user.principalId ? null : user.principalId));
  }

  async function onAssignRole(principalId: string) {
    if (!pendingRoleId) return;
    await runGrantMutation(
      toggleGenerationRef.current,
      toggleGenerationRef,
      () => assignRoleMutation.mutate({ principalId, roleId: pendingRoleId }),
      () => setPendingRoleId(""),
      setGrantSaving,
      setGrantError,
      (e) => describeApiError(e, t(locale, "failed to assign role"), locale),
    );
  }

  async function onAttachPolicy(principalId: string) {
    if (!pendingPolicyId) return;
    await runGrantMutation(
      toggleGenerationRef.current,
      toggleGenerationRef,
      () => attachPolicyMutation.mutate({ principalId, policyId: pendingPolicyId }),
      () => setPendingPolicyId(""),
      setGrantSaving,
      setGrantError,
      (e) => describeApiError(e, t(locale, "failed to attach policy"), locale),
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
      setGrantError(describeApiError(e, t(locale, "failed to update email"), locale));
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
      // A self-reset (own row, deep-linked or from the ordinary row menu — see `ownPrincipalId`'s
      // own doc comment) gets the "sign in again" notice instead of the per-username one: the reset
      // just revoked the CALLER'S OWN session, so the next request 401s and `App.hooks.tsx` sends
      // them to the login screen — the generic notice naming a DIFFERENT user would be misleading
      // here, since it's actually their own sign-in that just ended.
      setNotice(
        resetPasswordFor.principalId === ownPrincipalId
          ? t(locale, "Password changed. Sign in again with your new password.")
          : passwordResetNotice(locale, resetPasswordFor.username),
      );
      setResetPasswordFor(null);
      setNewPassword("");
    }, (e) => describeApiError(e, t(locale, "failed to reset password"), locale));
  }

  /** `setToggleSavingId`'s `finally` reset (2026-09-05 fix, same bug class as
   *  `use-roles.hooks.ts`'s `onSaveRole`/`runRowDelete`) is a functional update keyed on THIS call's
   *  own `principalId`: Enable fires with no confirmation gate, so two calls — on different users —
   *  can genuinely overlap, and an unconditional reset would clear the busy indicator (which
   *  `openResetPassword` below reads to refuse opening while a toggle is in flight) out from under a
   *  still-in-flight, unrelated toggle. */
  async function onToggleStatus(user: AdminIdentityUser) {
    setToggleSavingId(user.principalId);
    setToggleError(null);
    try {
      await toggleStatusMutation.mutate(user);
    } catch (e) {
      setToggleError(describeApiError(e, t(locale, "failed to change status"), locale));
    } finally {
      setToggleSavingId((current) => (current === user.principalId ? null : current));
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
   *  failure surfaces via `toggleError` above the table, not by leaving the modal open.
   *
   *  2026-09-05 fix, same bug class as `use-roles.hooks.ts`'s `runRowDelete`: `setConfirmingDisable`
   *  is exposed directly on the controller, so nothing at the hook level stops the operator opening
   *  a DIFFERENT user's Disable confirmation while this one's toggle is still in flight. The close
   *  below only clears it when it still names the SAME user this call started for — otherwise a
   *  stale toggle's settlement would silently dismiss a newer, still-undecided confirmation. */
  async function confirmDisable() {
    if (!confirmingDisable) return;
    const user = confirmingDisable;
    await onToggleStatus(user);
    setConfirmingDisable((current) => (current?.principalId === user.principalId ? null : current));
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
 * `users-dependencies.hooks.ts`. The zero-argument (or options-only) half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `Users.tsx` composes this and a test composes
 * {@link useUsers} with `createFakeUsersPort`.
 *
 * @param options - `openOwnPasswordReset`, threaded from `panels.tsx`'s `/users/change-password`
 *   route (password-banner plan, 2026-09-24 Slice 3). Omitted for every other caller of the Users
 *   panel, same as before this slice.
 * @returns The same `UsersController` {@link useUsers} returns, wired to the live API client and
 *   the real `@/lib/router` navigate.
 */
export function useWiredUsers(options?: { openOwnPasswordReset?: boolean }): UsersController {
  return useUsers({ port: defaultUsersPort, navigate: realNavigate, openOwnPasswordReset: options?.openOwnPasswordReset });
}
