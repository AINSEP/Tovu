import { useEffect, useState } from "react";
import { api, type AdminMember } from "../lib/api";

/**
 * @file Admin "Members" screen (ADR-030).
 *
 * Mirrors `sections/Posts.tsx`'s fetch/loading/error/table shape.
 */

export function Members() {
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMembers()
      .then((r) => setMembers(r.members))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load members"));
  }, []);

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
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{member.email}</td>
              <td>{member.name ?? "—"}</td>
              <td>
                <span className={`status status-${member.status}`}>{member.status}</span>
              </td>
              <td>{member.createdAt.slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
