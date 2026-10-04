import type { AgentPluginMemoryController } from "./hooks/use-agent-plugin-memory.hooks";

/** All state and requests live in the hook; this pane only renders its controller. */
export function AgentPluginMemoryPanel({ controller: c }: { controller: AgentPluginMemoryController }) {
  return <div className="form-stack">
    <p>{c.t("Notes load automatically when this plugin is used.")}</p>
    <label>{c.t("Note file")}<input value={c.entryPath} onChange={event => c.setPath(event.target.value)} disabled={c.saving || !c.listing} /></label>
    <label>{c.t("Project notes")}<textarea rows={12} value={c.text} onChange={event => c.setText(event.target.value)} disabled={c.saving || !c.listing} /></label>
    <button type="button" onClick={c.save} disabled={c.saving || !c.listing}>{c.t("Save note")}</button>
    {c.status ? <p role="status">{c.status}</p> : null}
    {c.listing?.notes.map(file => <button key={file.relativePath} type="button" onClick={() => c.setPath(file.relativePath)} disabled={c.saving}>{file.relativePath}</button>)}
    <h3>{c.t("Learned knowledge")}</h3>
    {c.listing?.learned.map(file => <details key={file.relativePath}><summary>{file.relativePath}</summary><pre>{file.text}</pre></details>)}
  </div>;
}
