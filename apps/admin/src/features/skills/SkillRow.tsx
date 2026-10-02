import type { SkillRowView } from "./use-skills.hooks";
import { SkillDocumentIcon, SkillChevronIcon } from "./skills-visuals";
import { EyeIcon, TrashIcon } from "../plugins/agent-plugins-visuals";

/** Same summary, metadata, switch and action zones as AgentPluginRow. */
export function SkillRow({ row }: { row: SkillRowView }) {
  const { skill } = row;
  return (
    <li className="agent-plugin-row" data-enabled={skill.enabled} aria-label={skill.name}>
      <div className="agent-plugin-row-main">
        <div className="skills-row-summary">
          <div className="skills-row-identity">
            <button type="button" className="agent-plugin-row-summary" aria-label={skill.name} onClick={row.onInspect}>
              <span className="agent-plugin-row-glyph"><SkillDocumentIcon /></span>
              <span className="agent-plugin-row-text">
                <span className="agent-plugin-row-heading"><span className="agent-plugin-row-name">{skill.name}</span></span>
                <span className="agent-plugin-row-desc" title={skill.description}>{skill.description}</span>
              </span>
            </button>
            <button type="button" className="agent-plugin-icon-btn skills-row-expander" aria-label={`Show or hide details — ${skill.name}`} aria-expanded={row.expanded} aria-controls={row.detailId} onClick={row.onToggleExpanded}>
              <SkillChevronIcon />
            </button>
          </div>
          <p className="skills-row-source">
            {row.sourceUrl ? <><a href={row.sourceUrl} target="_blank" rel="noreferrer">GitHub</a><span aria-hidden="true"> · </span><code>{row.shortCommit}</code></> : "Uploaded"}
          </p>
        </div>
        <div className="agent-plugin-row-actions">
          <span className="agent-plugin-state">{skill.enabled ? "Enabled" : "Disabled"}</span>
          <button type="button" role="switch" aria-checked={skill.enabled} aria-label={`Enable ${skill.name}`} aria-busy={row.busy} disabled={row.busy} className="agent-plugin-switch" onClick={row.onToggleEnabled}>
            <span className="agent-plugin-switch-knob" aria-hidden="true" />
          </button>
          <button type="button" className="agent-plugin-icon-btn" aria-label={`Inspect skill files — ${skill.name}`} onClick={row.onInspect}><EyeIcon /></button>
          <button type="button" className="agent-plugin-icon-btn" disabled={row.busy} aria-label={`Remove ${skill.name}`} onClick={row.onRemove}><TrashIcon /></button>
        </div>
      </div>
      <div className="agent-plugin-row-detail" id={row.detailId} hidden={!row.expanded}>
        <p className="agent-plugin-detail-description">{skill.description}</p>
      </div>
    </li>
  );
}
