import { Button, Dialog, TextField } from "@jini-ai/ui-kit/react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { PostUrlDialogController } from "./hooks/use-post-url-dialog.hooks";
import "../../styles/native-domain-dialogs.css";
import "./post-url-dialog.css";

/** One compact URL form shared by Link, image and YouTube; the hook owns its behavior. */
export function PostUrlDialog({ dialog, t }: { dialog: PostUrlDialogController; t: Translate }) {
  if (!dialog.open) return null;
  return (
    <Dialog open title={t(dialog.title)} pending={dialog.pending} onClose={dialog.cancel} className="settings-dialog tovu-domain-dialog post-url-dialog">
      <form onSubmit={dialog.submit} noValidate>
        <TextField label={t("URL")} type="url" required placeholder="https://" value={dialog.url} onValueChange={dialog.changeUrl}
          attrs={{ "data-jini-autofocus": "", "aria-invalid": dialog.invalid, "aria-describedby": dialog.error ? dialog.errorId : undefined }} />
        {dialog.error ? <span id={dialog.errorId} className="jini-field-error" role="alert">{t(dialog.error)}</span> : null}
        {dialog.image ? <TextField label={t("Alt text (optional)")} value={dialog.alt} onValueChange={dialog.changeAlt} /> : null}
        <div className="jini-dialog-footer">
          <Button variant="secondary" className="btn-secondary" disabled={dialog.pending} onPress={dialog.cancel}>{t("Cancel")}</Button>
          <Button type="submit" variant="primary" disabled={dialog.disabled}>{t("Insert")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
