import { useId } from "react";
import { agentHandle } from "@jini-ai/agentic";
import { ChatSettingsSegmented } from "@jini-ai/chat/react";
import { InfoTip } from "@jini-ai/ui/admin-widgets";

import type { VisitorToolMode, VisitorToolView } from "@/lib/visitor-tools";
import {
  groupVisitorTools, modeDisabled, useVisitorToolLimitsDraft, useWiredVisitorTools,
  type VisitorToolsController,
} from "./hooks/use-visitor-tools.hooks";
// The segmented pill's look lives with the chat settings it was built for; imported here too so this
// tab never depends on the dock having loaded it first.
import "../../styles/assistant.css";

/**
 * "Visitor tools" tab (owner, 2026-10-22): the tool calls the visitor's assistant may make on a
 * visitor's behalf, each Auto | Ask first | Off — the same segmented control as the chat gear's
 * "Agent plugins". It reads and writes the same service as the chat's visitor-tool tools.
 *
 * Security review F2 (binding): modes change on a click of the segmented radios (no `<select>`),
 * limits persist only from an explicit Save click, and none of this tab's handles may be added to
 * `DIRECT_PAGE_HANDLES` — the admin chat's page clicks here must keep their approval card.
 */
const MODES: readonly { mode: VisitorToolMode; label: string }[] = [
  { mode: "auto", label: "Auto" }, { mode: "ask", label: "Ask first" }, { mode: "off", label: "Off" },
];
/** Agent handles are lowercase hyphenated words; tool ids are server data (`list_posts`, plugin ids). */
function toolHandle(id: string, part: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "tool";
  return `ai-assistant-visitor-tool-${slug}-${part}`;
}
const GROUP_LABELS: Record<VisitorToolView["source"], string> = {
  builtin: "Built-in", plugin: "From plugins", created: "Created", unavailable: "Unavailable",
};

export interface VisitorToolsPanelProps {
  t: (key: string) => string;
  /** Test seam, defaulted to the real hook. */
  useVisitorToolsHook?: typeof useWiredVisitorTools;
}

export function VisitorToolsPanel({ t, useVisitorToolsHook = useWiredVisitorTools }: VisitorToolsPanelProps) {
  const controller = useVisitorToolsHook({ t });
  if (controller.loadError && !controller.view) {
    return <div className="visitor-tools-message" role="alert">
      <span>{controller.loadError}</span>
      <button type="button" className="btn-secondary" onClick={() => controller.retry()}>{t("Retry")}</button>
    </div>;
  }
  if (!controller.view) return <p role="status">{t("Loading visitor tools…")}</p>;
  const groups = groupVisitorTools({ tools: controller.view.tools });
  return (
    <div className="visitor-tools">
      <p className="visitor-tools-intro">
        {t("What the assistant can do for visitors.")}
        <InfoTip label={t("Auto runs it. Ask first asks the visitor (not live yet, so it acts as Off). Off hides it.")}
          triggerLabel={t("About visitor tools")} agentHandle="ai-assistant-visitor-tools-info" />
      </p>
      <Notices controller={controller} t={t} />
      {groups.length === 0 ? <p className="visitor-tools-empty">{t("No visitor tools yet.")}</p> : null}
      {groups.map(group => (
        <section key={group.source} className="visitor-tools-group" aria-label={t(GROUP_LABELS[group.source])}>
          {groups.length > 1 ? <h3 className="visitor-tools-group-title">{t(GROUP_LABELS[group.source])}</h3> : null}
          <ul className="visitor-tools-list">
            {group.tools.map(tool => <VisitorToolRow key={tool.id} tool={tool} controller={controller} t={t} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Notices({ controller, t }: { controller: VisitorToolsController; t: (key: string) => string }) {
  return <>
    {controller.invalid ? (
      <div className="visitor-tools-message is-warning" role="alert">
        <span>{t("Saved tool settings can't be read, so every tool is Off.")}</span>
        <button type="button" className="btn-secondary" disabled={controller.busyToolId !== null}
          onClick={() => void controller.repair()}
          {...agentHandle({ handle: "ai-assistant-visitor-tools-reset" }, { role: "button", label: "Turn all visitor tools Off to reset" })}>
          {t("Turn all tools Off to reset")}
        </button>
      </div>
    ) : null}
    {controller.notice ? (
      <p className={`visitor-tools-message is-${controller.notice.kind}`} role={controller.notice.kind === "error" ? "alert" : "status"}>
        {controller.notice.message}
      </p>
    ) : null}
  </>;
}

function VisitorToolRow({ tool, controller, t }: { tool: VisitorToolView; controller: VisitorToolsController; t: (key: string) => string }) {
  const nameId = useId();
  const title = t(tool.displayTitle ?? tool.title);
  const description = t(tool.displayDescription ?? tool.description);
  const busy = controller.busyToolId !== null;
  // An unreadable policy is enforced as all-Off server side; show exactly that, not the stale choice.
  const mode = controller.invalid ? "off" : tool.mode;
  return (
    <li className="visitor-tool" aria-labelledby={nameId} aria-busy={controller.busyToolId === tool.id || undefined}>
      <div className="visitor-tool-head">
        <div className="visitor-tool-text">
          <span id={nameId} className="visitor-tool-title">{title}</span>
          <span className="visitor-tool-description">{description}</span>
          {!tool.availability.available ? (
            <span className="visitor-tool-unavailable">{tool.availability.reason ?? t("Not available right now.")}</span>
          ) : null}
        </div>
        <div className="visitor-tool-mode" role="radiogroup" aria-labelledby={nameId}>
          <ChatSettingsSegmented name={`visitor-tool-mode-${tool.id}`}
            items={MODES.map(item => ({
              key: item.mode, label: t(item.label), checked: mode === item.mode,
              disabled: modeDisabled({ tool, mode: item.mode, invalid: controller.invalid, busy }),
              change: () => { if (item.mode !== mode) void controller.configure({ toolId: tool.id, mode: item.mode }); },
            }))} />
        </div>
      </div>
      <VisitorToolLimits tool={tool} title={title} controller={controller} t={t} />
    </li>
  );
}

function VisitorToolLimits({ tool, title, controller, t }: { tool: VisitorToolView; title: string; controller: VisitorToolsController; t: (key: string) => string }) {
  const limits = useVisitorToolLimitsDraft({ tool, configure: controller.configure });
  const ipId = useId();
  const siteId = useId();
  const errorId = useId();
  const locked = controller.invalid || !tool.availability.available;
  const fields = [
    { id: ipId, key: "perIpPerHour" as const, label: t("Per visitor, per hour") },
    { id: siteId, key: "perSitePerDay" as const, label: t("Whole site, per day") },
  ];
  return (
    <details className="visitor-tool-limits">
      <summary>{t("Limits")}</summary>
      {/* No <form>: Enter in a field must not submit — only the Save click persists (F2). */}
      <div className="visitor-tool-limits-body">
        {fields.map(field => (
          <label key={field.key} htmlFor={field.id} className="visitor-tool-limit">
            <span>{field.label}</span>
            <input id={field.id} className="jini-input" type="number" inputMode="numeric" min={1} step={1}
              value={limits.draft[field.key]} disabled={locked}
              aria-invalid={limits.invalid || undefined} aria-describedby={limits.invalid ? errorId : undefined}
              onChange={(event) => limits.edit(field.key, event.target.value)}
              {...agentHandle({ handle: toolHandle(tool.id, field.key === "perIpPerHour" ? "per-visitor-limit" : "per-site-limit") }, { role: "field", label: `${title}: ${field.label}` })} />
          </label>
        ))}
        <button type="button" className="btn-primary" disabled={locked || !limits.dirty || controller.busyToolId !== null}
          onClick={() => void limits.save()}
          {...agentHandle({ handle: toolHandle(tool.id, "limits-save") }, { role: "button", label: `Save ${title} limits` })}>
          {controller.busyToolId === tool.id ? t("Saving…") : t("Save")}
        </button>
        {limits.invalid ? <span id={errorId} className="visitor-tool-limit-error" role="alert">{t("Use a whole number, 1 or more.")}</span> : null}
        {!limits.invalid ? <VisitorToolLimitsHint controller={controller} t={t} /> : null}
      </div>
    </details>
  );
}

function VisitorToolLimitsHint({ controller, t }: { controller: VisitorToolsController; t: (key: string) => string }) {
  return <span className="visitor-tool-limit-hint">
    {t("Default: {ip} per visitor/hour, {site} per site/day.")
      .replace("{ip}", String(controller.view?.defaults.perIpPerHour ?? "")).replace("{site}", String(controller.view?.defaults.perSitePerDay ?? ""))}
  </span>;
}
