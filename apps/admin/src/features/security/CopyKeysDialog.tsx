import { Button, Dialog } from "@jini-ai/ui-kit/react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { CopyKeysController } from "./hooks/use-copy-keys.hooks";
import "../../styles/native-domain-dialogs.css";
import "./copy-keys-dialog.css";

/** One Shared Keys selection approves access for this site; no token is copied. */
export function CopyKeysDialog({ dialog, t }: { dialog: CopyKeysController; t: Translate }) {
  if (!dialog.open) return null;
  // Every input locks while inventory loads or a site grant is in flight.
  const locked = dialog.pending || dialog.loading;
  return (
    <Dialog open title={t("Use a saved key")} pending={dialog.pending} onClose={dialog.cancel} className="settings-dialog jini-domain-dialog copy-keys-dialog">
      <form onSubmit={dialog.submit}>
        <div className="jini-dialog-body">
          <p>{t("Shared Keys")}</p>
          {dialog.loading ? <span role="status">{t("Loading Shared Keys…")}</span> : null}
          {dialog.empty ? <span>{t("No saved keys are available. Use Add credential to enter a new key.")}</span> : null}
          <div className="copy-keys-list">
            {dialog.keys.map(key => <label key={key.id}><input type="radio" name="saved-key" value={key.id} checked={key.checked} onChange={dialog.changeKey} disabled={locked} />{key.text}{key.worksFor ? <span> · {key.worksFor}</span> : null}</label>)}
          </div>
          {dialog.error ? <span className="jini-field-error" role="alert">{dialog.error}</span> : null}
          {dialog.results.length ? <ul aria-live="polite" className="copy-keys-results">{dialog.results.map(result => <li key={result.key}>{result.text}</li>)}</ul> : null}
        </div>
        <div className="jini-dialog-footer">
          <Button variant="secondary" className="btn-secondary" disabled={dialog.pending} onPress={dialog.cancel}>{t("Cancel")}</Button>
          <Button type="submit" variant="primary" className="btn-primary" disabled={dialog.disabled}>{t("Use this key on this site")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
