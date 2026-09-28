import { agentHandle } from "@jini-ai/agentic";

import { useWiredAlwaysAllow } from "./hooks/use-always-allow.hooks";
import "./always-allow.css";

/**
 * @file The Integrations page's "Always allow" tab — markup only; state and API calls live in
 * `hooks/use-always-allow.hooks.ts`.
 *
 * One heading + table per external MCP server with at least one tool set to "Always allow" on a chat approval
 * card, each tool with a Revoke button. Granting stays on the chat card (see the route's own
 * header, `routes/external-mcp/tool-approvals.ts`).
 */
export interface AlwaysAllowPanelProps {
  /** DI seam for tests — same convention `IntegrationDeliveriesProps` follows. */
  useAlwaysAllowHook?: typeof useWiredAlwaysAllow;
}

function resolveAlwaysAllowHook(override: typeof useWiredAlwaysAllow | undefined): typeof useWiredAlwaysAllow {
  return override ?? useWiredAlwaysAllow;
}

export function AlwaysAllowPanel(props: AlwaysAllowPanelProps) {
  const useAlwaysAllowHook = resolveAlwaysAllowHook(props.useAlwaysAllowHook);
  const { groups, loadError, revokeError, pendingKey, revoke, rowKey, formatDate, t } = useAlwaysAllowHook();

  if (loadError) return <div className="notice error">{loadError}</div>;
  if (!groups) return <div className="notice">{t("Loading…")}</div>;

  return (
    <div className="always-allow-panel">
      <p className="page-description">{t("These tools run without asking. Revoke one and it asks again.")}</p>
      {revokeError ? <div className="notice error">{revokeError}</div> : null}
      {groups.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>{t("Nothing is set to Always allow. Pick it on a tool's approval card in chat.")}</p>
          </div>
        </div>
      ) : null}
      {groups.map((group) => (
        <section
          key={group.serverId}
          className="always-allow-server"
          {...agentHandle(group.handle, {
            role: "region",
            label: `Tools on the ${group.label} server set to Always allow`,
          })}
        >
          <h2 className="card-title">{group.label}</h2>
          <table className="list-table">
            <tbody>
              {group.tools.map((tool) => {
                const key = rowKey(group.serverId, tool.toolName);
                return (
                  <tr key={key}>
                    <td>
                      <code>{tool.toolName}</code>
                    </td>
                    <td className="muted-cell">{formatDate(tool.grantedAt)}</td>
                    <td className="always-allow-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={pendingKey === key}
                        onClick={() => revoke(group.serverId, tool.toolName)}
                        {...agentHandle(tool.revokeHandle, {
                          role: "button",
                          label: `Revoke Always allow for ${tool.toolName} on ${group.label}; it will ask again`,
                        })}
                      >
                        {t("Revoke")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
