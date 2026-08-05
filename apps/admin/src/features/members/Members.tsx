import { Fragment } from "react";
import { RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import { formatTimestamp } from "../../lib/format-timestamp";

import { memberRowMenuItems } from "./rules";
import { useMembers } from "./hooks/use-members.hooks";

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
  useMembersHook?: typeof useMembers;
}

export function Members({ useMembersHook = useMembers }: MembersProps = {}) {
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
  } = useMembersHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!members) return <div className="notice">Loading members…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">People</p>
          <h1 className="page-title">Members</h1>
          <p className="page-description">Site visitors who have registered an account — review status, resend a sign-in link, or disable access.</p>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No members yet.</p>
            <p className="page-description">Registered site visitors will show up here.</p>
          </div>
        </div>
      ) : (
      <div className="table-scroll">
      <table className="list-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const rs = stateFor(member.id);
            const isExpanded = expandedId === member.id;
            const detail = detailById[member.id];
            return (
              <Fragment key={member.id}>
                <tr>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void onToggleDetail(member)}
                      aria-expanded={isExpanded}
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
                      triggerLabel={`Actions for member "${member.email}"`}
                      items={memberRowMenuItems(member, rs, {
                        onResendSignInLink: (m) => void onResendSignInLink(m),
                        onRequestDisable: setConfirmingDisable,
                      })}
                    />
                    {rs.error ? (
                      <div className="notice error" role="alert">
                        {rs.error}
                      </div>
                    ) : null}
                    {rs.notice ? <div className="notice">{rs.notice}</div> : null}
                  </td>
                </tr>
                {isExpanded ? (
                  <tr>
                    <td colSpan={5}>
                      {detailLoadingId === member.id ? (
                        <div className="notice">Loading detail…</div>
                      ) : detailError ? (
                        <div className="notice error">{detailError}</div>
                      ) : detail ? (
                        <dl className="member-detail">
                          <dt>ID</dt>
                          <dd>{detail.id}</dd>
                          <dt>Email verified</dt>
                          <dd>{detail.emailVerifiedAt ?? "not verified"}</dd>
                          <dt>Updated</dt>
                          <dd>{detail.updatedAt}</dd>
                          <dt>Version</dt>
                          <dd>{detail.version}</dd>
                        </dl>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
      <ConfirmDialog
        open={confirmingDisable !== null}
        title="Disable this member?"
        body={
          confirmingDisable ? (
            <p>Disable &quot;{confirmingDisable.email}&quot;? They will no longer be able to sign in.</p>
          ) : null
        }
        confirmLabel="Disable"
        tone="warning"
        pending={confirmingDisable !== null && stateFor(confirmingDisable.id).disabling}
        onConfirm={confirmDisable}
        onCancel={() => setConfirmingDisable(null)}
      />
    </div>
  );
}
