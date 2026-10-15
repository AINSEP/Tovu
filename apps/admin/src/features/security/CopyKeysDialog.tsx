import { Button, Dialog } from "@jini-ai/ui-kit/react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { CopyKeysController } from "./hooks/use-copy-keys.hooks";
import "../../styles/native-domain-dialogs.css";
import "./copy-keys-dialog.css";

/** Compact project/keys form; the controller owns all selection and copy decisions. */
export function CopyKeysDialog({ dialog, t }: { dialog: CopyKeysController; t: Translate }) {
  if (!dialog.open) return null;
  return (
    <Dialog open title={t("Copy keys from another project…")} pending={dialog.pending} onClose={dialog.cancel} className="settings-dialog jini-domain-dialog copy-keys-dialog">
      <form onSubmit={dialog.submit}>
        <div className="jini-dialog-body">
          <label className="copy-keys-source">{t("Source project")}
            <select value={dialog.sourceSiteId} onChange={dialog.changeSource} disabled={dialog.loading || dialog.pending} data-jini-autofocus="">
              <option value="">{t("Choose a project")}</option>
              {dialog.sources.map(source => <option key={source.siteId} value={source.siteId}>{source.name}</option>)}
            </select>
          </label>
          {dialog.loading ? <span role="status">{t("Loading projects…")}</span> : null}
          {dialog.sourceMessage ? <span role="status">{dialog.sourceMessage}</span> : null}
          {dialog.canStart ? <Button variant="secondary" className="btn-secondary" disabled={dialog.pending || dialog.loading} onPress={dialog.start}>{t("Start project")}</Button> : null}
          {dialog.empty ? <span>{t("No keys to copy.")}</span> : null}
          <div className="copy-keys-list">
            {dialog.keys.map(key => <label key={key.id}><input type="checkbox" value={key.id} checked={key.checked} onChange={dialog.changeKey} disabled={dialog.pending || dialog.loading} />{key.text}</label>)}
          </div>
          <label className="copy-keys-overwrite"><input type="checkbox" checked={dialog.overwrite} onChange={dialog.changeOverwrite} disabled={dialog.pending || dialog.loading} />{t("Overwrite existing")}</label>
          {dialog.error ? <span className="jini-field-error" role="alert">{dialog.error}</span> : null}
          {dialog.results.length ? <ul aria-live="polite" className="copy-keys-results">{dialog.results.map(result => <li key={result.key}>{result.text}</li>)}</ul> : null}
        </div>
        <div className="jini-dialog-footer">
          <Button variant="secondary" className="btn-secondary" disabled={dialog.pending} onPress={dialog.cancel}>{t("Cancel")}</Button>
          <Button type="submit" variant="primary" className="btn-primary" disabled={dialog.disabled}>{t("Copy")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
