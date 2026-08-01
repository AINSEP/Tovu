import { Fragment, useEffect, useState } from "react";
import { ApiError, api, describeApiError as describeApiErrorDefault, type AdminMember } from "../lib/api";
import { ConfirmButton } from "../components/ConfirmButton";
import { formatTimestamp } from "../lib/format-timestamp";

/**
 * @file Admin "Members" screen (ADR-030, ADR-PIPE-013 Decision §7).
 *
 * Mirrors `sections/Posts.tsx`'s fetch/loading/error/table shape. Adds the
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

interface RowActionState {
  disabling: boolean;
  resending: boolean;
  error: string | null;
  notice: string | null;
}

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`). */
function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.code === "FORBIDDEN") return "You do not have permission to do that.";
  return describeApiErrorDefault(e, fallback);
}

function emptyRowState(): RowActionState {
  return { disabling: false, resending: false, error: null, notice: null };
}

export function Members() {
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowActionState>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, AdminMember>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  function load() {
    api
      .listMembers()
      .then((r) => setMembers(r.members))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load members"));
  }

  useEffect(() => {
    load();
  }, []);

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
      const result = await api.disableMember(member.id);
      setMembers((current) => (current ? current.map((m) => (m.id === member.id ? result.member : m)) : current));
      patchRowState(member.id, { disabling: false, notice: "Member disabled." });
    } catch (e) {
      patchRowState(member.id, { disabling: false, error: describeApiError(e, "Failed to disable member.") });
    }
  }

  async function onResendSignInLink(member: AdminMember) {
    if (stateFor(member.id).resending) return;
    patchRowState(member.id, { resending: true, error: null, notice: null });
    try {
      await api.requestMemberMagicLink({ email: member.email });
      patchRowState(member.id, { resending: false, notice: "Sign-in link sent." });
    } catch (e) {
      patchRowState(member.id, { resending: false, error: describeApiError(e, "Failed to send sign-in link.") });
    }
  }

  async function onToggleDetail(member: AdminMember) {
    if (expandedId === member.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(member.id);
    setDetailError(null);
    if (detailById[member.id]) return;

    setDetailLoadingId(member.id);
    try {
      const result = await api.getMember(member.id);
      setDetailById((current) => ({ ...current, [member.id]: result.member }));
    } catch (e) {
      setDetailError(describeApiError(e, "Failed to load member detail."));
    } finally {
      setDetailLoadingId(null);
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!members) return <div className="notice">Loading members…</div>;

  return (
    <div>
      <h1>Members</h1>
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
                    <span className="editor-actions">
                      {/* Reversible-but-access-affecting, same as Users.tsx's Disable — warning-toned,
                          not `.btn-danger` (audit cross-cutting §7). */}
                      <ConfirmButton
                        label="Disable"
                        confirmLabel="Confirm disable"
                        disabled={member.status === "disabled"}
                        pending={rs.disabling}
                        pendingLabel="Disabling…"
                        onConfirm={() => void onDisable(member)}
                        ariaLabel={`Disable member "${member.email}"`}
                      />
                      <button type="button" disabled={rs.resending} onClick={() => void onResendSignInLink(member)}>
                        {rs.resending ? "Sending…" : "Resend sign-in link"}
                      </button>
                    </span>
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
  );
}
