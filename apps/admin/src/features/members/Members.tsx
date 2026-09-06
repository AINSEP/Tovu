import { Fragment } from "react";
import { RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import type { AdminMember } from "../../lib/api";
import { formatTimestamp } from "../../lib/format-timestamp";
import type { Translate } from "../../lib/dictionary-translator";
import { buildAgentListHandles } from "../../lib/agent-list-handles";

import { memberRowMenuItems, type RowActionState } from "./rules";
import { useWiredMembers } from "./hooks/use-members.hooks";

/**
 * @file Admin "Members" screen (ADR-030, ADR-PIPE-013 Decision §7) — markup only.
 *
 * State and API calls live in `hooks/use-members.hooks.ts`; the row-menu logic, per-row action
 * state shape, and the server-error-message override live in `rules.ts`. What stays here is what
 * actually renders: the table and the confirm dialog.
 *
 * Mirrors `features/posts/Posts.tsx`'s fetch/loading/error/table shape. Adds the
 * three row-level actions this remediation wires up (T039): disable, resend
 * sign-in link, and a click-to-expand detail panel — all calling the 3
 * already-existing, already-unused `apps/admin/src/lib/api.ts` client methods
 * (`disableMember`, `requestMemberMagicLink`, `getMember`). No new backend
 * contract needed. Pagination is explicitly deferred (ADR-PIPE-013 Decision
 * §7) — not part of this screen yet.
 *
 * Per-row in-flight state disables only the clicked control (not the whole
 * table), and errors surface via the existing `notice error` convention
 * (inline per row for actions; a full-width banner for the initial load).
 * Stays a single flat file, matching every other admin section's convention.
 */
export interface MembersProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useMembersHook?: typeof useWiredMembers;
}

interface MemberDetailPanelProps {
  memberId: string;
  detailLoadingId: string | null;
  detailError: string | null;
  detail: AdminMember | undefined;
  t: Translate;
}

/** The expanded row's detail panel — one of "loading" / "error" / the fetched fields / nothing
 *  yet, extracted out of `MemberRow` so its three-way branch isn't counted in `MemberRow`'s own
 *  scope. Same "the panel, not the row, was the actual size" split `Users.tsx`'s
 *  `UserRow` -> `UserManagePanel` and `Roles.tsx`'s `PolicyRow` -> `PolicyRowActions` already use. */
function MemberDetailPanel({ memberId, detailLoadingId, detailError, detail, t }: MemberDetailPanelProps) {
  if (detailLoadingId === memberId) return <div className="notice">{t("Loading detail…")}</div>;
  if (detailError) return <div className="notice error">{detailError}</div>;
  if (!detail) return null;
  return (
    <dl className="member-detail">
      <dt>{t("ID")}</dt>
      <dd>{detail.id}</dd>
      <dt>{t("Email verified")}</dt>
      <dd>{detail.emailVerifiedAt ?? t("not verified")}</dd>
      <dt>{t("Updated")}</dt>
      <dd>{detail.updatedAt}</dd>
      <dt>{t("Version")}</dt>
      <dd>{detail.version}</dd>
    </dl>
  );
}

interface MemberRowProps {
  member: AdminMember;
  rowState: RowActionState;
  isExpanded: boolean;
  detail: AdminMember | undefined;
  detailError: string | null;
  detailLoadingId: string | null;
  onToggleDetail: (member: AdminMember) => Promise<void>;
  onResendSignInLink: (member: AdminMember) => Promise<void>;
  setConfirmingDisable: (member: AdminMember) => void;
  /** This row's own distinct handle base — computed once, across every rendered row, by `Members`
   *  (via `buildAgentListHandles`); see `Users.tsx`'s `UserRowProps.agentBase` for why a
   *  per-instance uniqueness search does not work here. */
  agentBase: string;
  t: Translate;
  locale: string;
}

/** One member's row plus its optional expanded detail row — extracted from `Members`'s
 *  `.map()` body verbatim, same convention `Users.tsx`'s `UserRow`/`Roles.tsx`'s `PolicyRow` use.
 *  `key` lives on the `<MemberRow>` element at the call site. */
function MemberRow({
  member,
  rowState,
  isExpanded,
  detail,
  detailError,
  detailLoadingId,
  onToggleDetail,
  onResendSignInLink,
  setConfirmingDisable,
  agentBase,
  t,
  locale,
}: MemberRowProps) {
  return (
    <Fragment key={member.id}>
      <tr>
        <td>
          <button
            type="button"
            className="link-button"
            onClick={() => void onToggleDetail(member)}
            aria-expanded={isExpanded}
            {...agentHandle(`${agentBase}-toggle-detail`, { role: "button", label: `Expand or collapse ${member.email}'s detail panel` })}
          >
            {member.email}
          </button>
        </td>
        <td>{member.name ?? "—"}</td>
        <td>
          <span className={`status status-${member.status}`}>{member.status}</span>
        </td>
        <td>{formatTimestamp(member.createdAt)}</td>
        <td>
          <RowMenu
            triggerLabel={`${t("Actions for member")} "${member.email}"`}
            agentHandle={`${agentBase}-menu`}
            items={memberRowMenuItems(
              member,
              rowState,
              {
                onResendSignInLink: (m) => void onResendSignInLink(m),
                onRequestDisable: setConfirmingDisable,
              },
              locale,
            )}
          />
          {rowState.error ? (
            <div className="notice error" role="alert">
              {rowState.error}
            </div>
          ) : null}
          {rowState.notice ? <div className="notice">{rowState.notice}</div> : null}
        </td>
      </tr>
      {isExpanded ? (
        <tr>
          <td colSpan={5}>
            <MemberDetailPanel
              memberId={member.id}
              detailLoadingId={detailLoadingId}
              detailError={detailError}
              detail={detail}
              t={t}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function Members({ useMembersHook = useWiredMembers }: MembersProps = {}) {
  const {
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
    t,
    locale,
  } = useMembersHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!members) return <div className="notice">{t("Loading members…")}</div>;

  // Member ids are stable and unique, so they disambiguate one row's menu from another's — same
  // reasoning as every other list on this workstream.
  const memberMenuBases = buildAgentListHandles(
    "members-row",
    members.map((member) => member.id),
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("People")}</p>
          <h1 className="page-title">{t("Members")}</h1>
          <p className="page-description">
            {t(
              "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.",
            )}
          </p>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>{t("No members yet.")}</p>
            <p className="page-description">{t("Registered site visitors will show up here.")}</p>
          </div>
        </div>
      ) : (
      <div className="table-scroll">
      <table className="list-table">
        <thead>
          <tr>
            <th>{t("Email")}</th>
            <th>{t("Name")}</th>
            <th>{t("Status")}</th>
            <th>{t("Created")}</th>
            <th>{t("Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, index) => (
            <MemberRow
              key={member.id}
              member={member}
              rowState={stateFor(member.id)}
              isExpanded={expandedId === member.id}
              detail={detailById[member.id]}
              detailError={detailError}
              detailLoadingId={detailLoadingId}
              onToggleDetail={onToggleDetail}
              onResendSignInLink={onResendSignInLink}
              setConfirmingDisable={setConfirmingDisable}
              agentBase={memberMenuBases[index]!}
              t={t}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
      </div>
      )}
      <ConfirmDialog
        open={confirmingDisable !== null}
        agentHandle="members-disable"
        title={t("Disable this member?")}
        body={
          confirmingDisable ? (
            <p>
              {t("Disable")} &quot;{confirmingDisable.email}&quot;? {t("They will no longer be able to sign in.")}
            </p>
          ) : null
        }
        confirmLabel={t("Disable")}
        tone="warning"
        pending={confirmingDisable !== null && stateFor(confirmingDisable.id).disabling}
        onConfirm={confirmDisable}
        onCancel={() => setConfirmingDisable(null)}
      />
    </div>
  );
}
