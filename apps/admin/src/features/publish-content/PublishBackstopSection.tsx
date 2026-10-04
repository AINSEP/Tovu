import type { Translate } from "@/lib/dictionary-translator";
import type { PublishBackstopPort } from "./hooks/publish-backstop-port.hooks";
import { useWiredPublishBackstop } from "./hooks/use-wired-publish-backstop.hooks";
import "./publish-backstop.css";

/** Markup only. Kept outside the normal confirmation dialog per design §7. None of the human
 * confirmation controls are exposed through agentHandle or WebMCP action attributes. */
export function PublishBackstopSection({ port, t, useBackstopHook = useWiredPublishBackstop }: {
  port?: PublishBackstopPort; t?: Translate; useBackstopHook?: typeof useWiredPublishBackstop;
}) {
  const view = useBackstopHook({ port, t });
  const translate = view.t;
  return (
    <>
      {view.run && (
        <section className="dash-panel publish-backstop" aria-labelledby="backstop-undo-title">
          <h2 id="backstop-undo-title">{translate("Undo this send")}</h2>
          <p>{view.run.reason}</p>
          <ul>{view.run.items.map((item) => <li key={`${item.entityType}:${item.id}`}>{item.id}</li>)}</ul>
          <button type="button" className="btn-secondary" disabled={!view.canUndo} onClick={view.undo}>{translate("Undo this send")}</button>
          {view.undoResult && <div role="status"><p>{translate("Undo complete")}: {view.undoResult.undone}</p><ul>{view.undoResult.skipped.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
          {view.error && <p className="notice error" role="alert">{view.error}</p>}
        </section>
      )}
      {view.allowed && view.canPublish && (
        <section className="dash-panel publish-backstop" aria-labelledby="backstop-title">
          <button id="backstop-title" type="button" className="link-button" aria-expanded={view.expanded} aria-controls="publish-backstop-body" onClick={view.toggleExpanded}>
            {translate("Advanced: send by hand")}
          </button>
          {!view.installed && <p className="notice" role="status">{translate("Send by hand needs audit storage installed on both sites.")}</p>}
          {view.expanded && (
            <div id="publish-backstop-body">
              <p>{translate("Send specific items normal publishing cannot cover. Keys, passwords and user accounts are never sent. Live keeps an undo.")}</p>
              <label className="field"><span>{translate("Publish to")}</span><select value={view.peerId} disabled={view.busy || !!view.result} onChange={(event) => view.selectPeer(event.target.value)}>
                <option value="">{translate("Choose a site…")}</option>
                {view.peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.label}</option>)}
              </select></label>
              {!view.busy && view.peers.length === 0 && <p>{translate("Connect a live site using normal publishing first.")}</p>}
              <fieldset disabled={view.busy || !view.installed || !!view.result}>
                <legend>{translate("Choose items")}</legend>
                <p className="muted">{translate("Up to 200 rows and 50 files, totaling 50 MB. Existing live items are never deleted.")}</p>
                <div className="publish-backstop-row-entry">
                  <label className="field"><span>{translate("Table")}</span><input value={view.rowTable} onChange={(event) => view.setRowTable(event.target.value)} placeholder="p_banner" /></label>
                  <label className="field"><span>{translate("Primary key (JSON)")}</span><input value={view.rowPk} onChange={(event) => view.setRowPk(event.target.value)} placeholder={'{"id":"one"}'} /></label>
                  <button type="button" className="btn-secondary" onClick={view.addRow}>{translate("Add row")}</button>
                </div>
                <ul>{view.rowKeys.map((key, index) => <li key={key}><code>{key}</code> <button type="button" className="link-button" onClick={() => view.removeRow(index)} aria-label={`${translate("Remove")} ${key}`}>{translate("Remove")}</button></li>)}</ul>
                <label className="field"><span>{translate("Site-relative file path")}</span><input value={view.filePath} onChange={(event) => view.setFilePath(event.target.value)} placeholder="extras/banner.html" /></label>
                <button type="button" className="btn-secondary" onClick={view.addFile}>{translate("Add file")}</button>
                <ul>{view.files.map((file) => <li key={file}><code>{file}</code> <button type="button" className="link-button" onClick={() => view.removeFile(file)} aria-label={`${translate("Remove")} ${file}`}>{translate("Remove")}</button></li>)}</ul>
                <label className="field"><span>{translate("Reason (at least 10 characters)")}</span><textarea value={view.reason} maxLength={2000} onChange={(event) => view.setReason(event.target.value)} /></label>
              </fieldset>
              <button key="backstop-check" type="button" className="btn-secondary" disabled={!view.canCheck} onClick={view.check}>{translate("Check what would change")}</button>
              {view.busy && <p role="status">{translate("Working…")}</p>}
              {view.plan && (
                <>
                  {view.plan.plan?.details.refusalReason && <p className="notice error" role="alert">{view.plan.plan.details.refusalReason}</p>}
                  <div className="table-scroll"><table className="list-table publish-backstop-plan"><thead><tr>
                    <th>{translate("Item")}</th><th>{translate("Live now")}</th><th>{translate("After this send")}</th><th>{translate("What happens")}</th>
                  </tr></thead><tbody>{view.planRows.map((row) => <tr key={row.key}><td>{row.entityId}</td><td><pre>{row.before}</pre></td><td><pre>{row.after}</pre></td><td>{row.status}{row.reason && <p>{row.reason}</p>}
                    {(row.canOverwrite || view.overwriteKeys.includes(row.key)) && <label><input type="checkbox" checked={view.overwriteKeys.includes(row.key)} disabled={view.busy || !!view.result} onChange={() => view.toggleOverwrite(row.key)} /> {translate("Overwrite on live")}</label>}
                  </td></tr>)}</tbody></table></div>
                  {view.plan.skipped.length > 0 && <div><h3>{translate("Skipped")}</h3><ul>{view.plan.skipped.map((item) => <li key={`${item.entityType}:${item.id}`}><code>{item.id}</code>: <span>{item.reason}</span></li>)}</ul></div>}
                  {view.planRows.length === 0 && <p>{translate("Nothing can be sent from this selection.")}</p>}
                  {!view.valuesReviewed && <p className="notice">{translate("Live values unavailable; update live first.")}</p>}
                  {!view.result && <>
                    <p>{translate("Review the values above, then type the live address to confirm.")} <strong>{view.host}</strong></p>
                    <label className="field"><span>{translate("Type the live address")}</span><input value={view.typedHost} disabled={view.busy} autoComplete="off" spellCheck={false} onChange={(event) => view.setTypedHost(event.target.value)} /></label>
                    <button key="backstop-send" type="button" className="btn-primary" disabled={!view.canSend} onClick={view.send}>{translate("Send to live")}</button>
                  </>}
                </>
              )}
              {view.result && <div role="status"><p>{translate("Send complete")}</p><ul>{view.resultRows.map((row) => <li key={`${row.entityType}:${row.entityId}`}>{row.entityId}: {translate(row.writes ? "Sent" : "Skipped")}{row.reason && <p>{row.reason}</p>}</li>)}</ul>
                {view.undoHref && <><a className="btn-secondary" href={view.undoHref}>{translate("Open live to undo this send")}</a><p className="muted">{translate("Sign in on live, then click Undo this send. Items edited since this send are left alone.")}</p></>}
              </div>}
              {view.error && <p className="notice error" role="alert">{view.error}</p>}
              <h3>{translate("Things publishing cannot send yet")}</h3>
              {view.gapError && <p className="notice error" role="alert">{view.gapError}</p>}
              {!view.gapError && view.gaps.length === 0 && <p>{translate("No items have been sent by hand yet.")}</p>}
              <ul>{view.gaps.map((gap) => <li key={gap.label}><strong>{gap.label}</strong> · {gap.count} {translate("sends")}<p>{gap.lastReason}</p><time>{gap.lastAt}</time></li>)}</ul>
            </div>
          )}
        </section>
      )}
      {!view.run && view.undoRequested && view.error && <p className="notice error" role="alert">{view.error}</p>}
    </>
  );
}
