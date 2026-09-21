import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { AdminMember } from "@/lib/api";
import { MEMBERS_RESOURCE, describeApiError, emptyRowState, type RowActionState } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { t } from "../members-i18n";
import { defaultMembersPort } from "./members-dependencies.hooks";
import type { MembersPort } from "./members-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file Everything the Members screen does, so `Members.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect bodies, same error strings.
 * `RowActionState`/`emptyRowState`/`describeApiError` moved to `rules.ts` (they were already
 * module-scope free functions in the original, just private and untested); this hook imports them
 * back for `stateFor` and its own async handlers.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/members` needs it.
 *
 * `deps.port` is injected (see `members-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly — the same `useX(dependencies)` / `useWiredX()` split `redirects`/`widgets`/`plugins` use.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import): this hook already called
 * `useAdminLocale()` for its own error-string translations, so exposing that SAME already-resolved
 * `locale` as a bound `t` (plus the raw value, still needed for `rules.ts`'s `memberRowMenuItems`,
 * which takes `locale` directly) on the return value adds no new fetch — `Members.tsx` used to call
 * `useAdminLocale()` a second time and rebuild its own `translateMembers(locale, key)` closure,
 * entirely redundant with the resolution this hook was already doing internally.
 *
 * `useContentRefreshSubscription` (staleness-bug generalization pass — see that hook's own header):
 * `load` is pulled into a `useCallback` so it can also be handed to that hook, which re-runs it
 * whenever `members_disable` (`apps/website/src/features/members/agent-tools.ts`) changes a
 * member's status from an assistant run this screen otherwise has no way to learn about. No draft
 * to protect — every row's own edit state is per-action busy/error tracking, not typed text.
 */

export interface MembersDependencies {
  port: MembersPort;
}

export interface MembersController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  members: AdminMember[] | null;
  error: string | null;

  /** Per-row action state (Disable/Resend in-flight, error, notice), falling back to the empty
   *  state for a row with no action taken yet. */
  stateFor: (id: string) => RowActionState;
  onResendSignInLink: (member: AdminMember) => Promise<void>;

  /** The row whose detail panel is expanded — `null` when every row is collapsed. */
  expandedId: string | null;
  /** Detail already fetched for an expanded row, keyed by member id — a cache so re-expanding a
   *  row already visited this session doesn't re-fetch. */
  detailById: Record<string, AdminMember>;
  detailError: string | null;
  detailLoadingId: string | null;
  onToggleDetail: (member: AdminMember) => Promise<void>;

  /** The member a `RowMenu` "Disable" selection is asking to confirm; `null` when the dialog is
   *  shut. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on
   *  why); this is what drives its `open` prop. */
  confirmingDisable: AdminMember | null;
  setConfirmingDisable: Dispatch<SetStateAction<AdminMember | null>>;
  confirmDisable: () => Promise<void>;

  /** Bound translator — `key` already resolved against the caller's locale, so `Members.tsx` never
   *  imports `useAdminLocale`/`members-i18n` itself. See this file's header. */
  t: Translate;
  /** Raw resolved locale — `rules.ts`'s `memberRowMenuItems` takes `locale` directly rather than a
   *  bound translator. See this file's header. */
  locale: string;
}

export function useMembers({ port }: MembersDependencies): MembersController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowActionState>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, AdminMember>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  // Disable now confirms via a `RowMenu` item -> `ConfirmDialog` modal (replacing the in-place
  // two-click `ConfirmButton`, which has no menu-item equivalent — same migration Posts.tsx/
  // Redirects.tsx/Users.tsx already made). `null` when the dialog is closed.
  const [confirmingDisable, setConfirmingDisable] = useState<AdminMember | null>(null);
  const settlement = useSettlementGeneration();
  // Which row's detail panel is actually open (C7, plan-access.md §8, N2) — a ref, not just
  // `expandedId` state, because `onToggleDetail`'s `catch`/`finally` read it after an `await`, where
  // a state read would see the closure's stale value. Set by `onToggleDetail` alone. Without this,
  // expanding row A (slow, then failing), then row B, lets A's `finally` blank B's loading indicator
  // and lets A's failure paint onto B's now-open panel — the same "entity-scoped panel, unkeyed
  // settle" shape `use-roles.hooks.ts`'s `permissionPolicyIdRef` fixes for `loadPermissions`.
  const expandedIdRef = useRef<string | null>(null);

  const load = useCallback(() => {
    // Claim this call's generation BEFORE the request starts — see `useSettlementGeneration`'s own
    // doc for why a synchronous ref bump, not `useState`, is what makes two overlapping calls each
    // see the other's claim. Needed now that a content refresh can fire more than once per run
    // (mid-run tool progress, see `AssistantDock.hooks.tsx`), so two overlapping `load()` calls have
    // no ordering guarantee on their responses.
    const generation = settlement.next();
    port
      .listMembers()
      .then((r) => {
        if (!settlement.isCurrent(generation)) return;
        setMembers(r.members);
      })
      .catch((e) => {
        if (!settlement.isCurrent(generation)) return;
        setError(e instanceof Error ? e.message : t(locale, "failed to load members"));
      });
    // `port`/`locale`/`settlement` are added — see `use-page-editor.hooks.ts`'s identical note:
    // function-scoped values ESLint's exhaustive-deps rule can see, referentially stable in
    // production, so this changes nothing about when this callback's identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, settlement]);

  useEffect(() => {
    load();
  }, [load]);

  useContentRefreshSubscription(MEMBERS_RESOURCE, load);

  function stateFor(id: string): RowActionState {
    return rowState[id] ?? emptyRowState();
  }

  function patchRowState(id: string, patch: Partial<RowActionState>) {
    setRowState((current) => ({ ...current, [id]: { ...emptyRowState(), ...current[id], ...patch } }));
  }

  async function onDisable(member: AdminMember) {
    if (stateFor(member.id).disabling) return;
    patchRowState(member.id, { disabling: true, error: null, notice: null });
    try {
      const result = await port.disableMember(member.id);
      setMembers((current) => (current ? current.map((m) => (m.id === member.id ? result.member : m)) : current));
      patchRowState(member.id, { disabling: false, notice: t(locale, "Member disabled.") });
    } catch (e) {
      patchRowState(member.id, { disabling: false, error: describeApiError(e, t(locale, "Failed to disable member."), locale) });
    }
  }

  async function onResendSignInLink(member: AdminMember) {
    if (stateFor(member.id).resending) return;
    patchRowState(member.id, { resending: true, error: null, notice: null });
    try {
      await port.requestMemberMagicLink({ email: member.email });
      patchRowState(member.id, { resending: false, notice: t(locale, "Sign-in link sent.") });
    } catch (e) {
      patchRowState(member.id, { resending: false, error: describeApiError(e, t(locale, "Failed to send sign-in link."), locale) });
    }
  }

  /** Confirms the Disable that `RowMenu`'s "Disable" item asked about. Closes the dialog either
   *  way (matching Posts.tsx/Redirects.tsx/Users.tsx's own Disable/Delete `ConfirmDialog`
   *  convention) — a failure surfaces via the row's own `rs.error`, not by leaving the modal open. */
  async function confirmDisable() {
    if (!confirmingDisable) return;
    await onDisable(confirmingDisable);
    setConfirmingDisable(null);
  }

  async function onToggleDetail(member: AdminMember) {
    if (expandedIdRef.current === member.id) {
      expandedIdRef.current = null;
      setExpandedId(null);
      return;
    }
    expandedIdRef.current = member.id;
    setExpandedId(member.id);
    setDetailError(null);
    if (detailById[member.id]) return;

    setDetailLoadingId(member.id);
    try {
      const result = await port.getMember(member.id);
      setDetailById((current) => ({ ...current, [member.id]: result.member }));
    } catch (e) {
      // Only paint the failure onto the panel this load was actually for — a different row may
      // already be open by the time this settles.
      if (expandedIdRef.current === member.id) {
        setDetailError(describeApiError(e, t(locale, "Failed to load member detail."), locale));
      }
    } finally {
      setDetailLoadingId((current) => (current === member.id ? null : current));
    }
  }

  return {
    members,
    error,

    stateFor,
    onResendSignInLink,

    expandedId,
    detailById,
    detailError,
    detailLoadingId,
    onToggleDetail,

    confirmingDisable,
    setConfirmingDisable,
    confirmDisable,

    t: boundT,
    locale,
  };
}

/**
 * Binds the real `/api/.../members` client — see `members-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Members.tsx` composes this and a test composes {@link useMembers} with `createFakeMembersPort`.
 */
export function useWiredMembers(): MembersController {
  return useMembers({ port: defaultMembersPort });
}
