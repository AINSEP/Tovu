import { Button, Dialog, TextField } from "@jini-ai/ui-kit/react";
import { useRemoteImageImport } from "./hooks/use-remote-image-import.hooks";
import type { MediaImportPort } from "./hooks/media-import-dependencies.hooks";
import { DockHeaderTip } from "@/components/AssistantDock/DockHeaderTip";
import { agentHandle } from "@jini-ai/agentic";
import "../../styles/native-domain-dialogs.css";

/** Markup only; downloads, mutation state, dialog state and list invalidation live in the hook.
 *  The "Import from URL" button sits beside "Upload image" and opens the same dialog shape
 *  (owner item #9, 2026-10-13). */
export function RemoteImageImport(props: { t: (key: string) => string; dependencies?: { port: MediaImportPort } }) {
  const controller = useRemoteImageImport({ t: props.t }, props.dependencies);
  return (
    <>
      {/* Icon button (owner, 2026-11-01): tooltip and accessible name are the same text. */}
      <DockHeaderTip label={props.t("Import from URL")}>
        <button type="button" className="btn-secondary media-icon-btn" aria-label={props.t("Import from URL")} onClick={controller.openDialog}
          {...agentHandle({ handle: "media-import-open" }, { role: "button", label: "Open the Import from URL dialog" })}>
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path d="M7.5 10.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M10.5 7.5a3 3 0 0 0-4.2 0L3.7 10.1a3 3 0 0 0 4.2 4.2l.9-.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </DockHeaderTip>
      <Dialog open={controller.open} title={props.t("Import from URL")} pending={controller.pending} onClose={controller.close}
        className="settings-dialog jini-domain-dialog media-import-dialog">
        <form onSubmit={controller.submit} noValidate>
          <TextField label={props.t("Remote image URL")} type="url" placeholder="https://" value={controller.url} disabled={controller.pending}
            onValueChange={({ value }) => controller.setUrl(value)}
            attrs={{ "data-jini-autofocus": "", "aria-invalid": controller.urlInvalid,
              ...agentHandle({ handle: "media-import-url" }, { role: "field", label: props.t("Remote image URL") }) }} />
          {controller.urlInvalid ? <span className="jini-field-error">{props.t("Enter an https:// image URL.")}</span> : null}
          {/* Short visible label like the upload dialog's, but its own accessible name: that field
              already owns "Alt text (optional)" on this screen. */}
          <TextField label={props.t("Alt text (optional)")} value={controller.alt} disabled={controller.pending}
            onValueChange={({ value }) => controller.setAlt(value)}
            attrs={{ "aria-label": props.t("Imported image alt text (optional)"),
              ...agentHandle({ handle: "media-import-alt" }, { role: "field", label: props.t("Imported image alt text (optional)") }) }} />
          {controller.error ? <div role="alert" className="notice error">{controller.error}</div> : null}
          <div className="jini-dialog-footer">
            <Button variant="secondary" className="btn-secondary" disabled={controller.pending} onPress={controller.close}>{props.t("Cancel")}</Button>
            <Button type="submit" variant="primary" disabled={!controller.canSubmit}
              attrs={agentHandle({ handle: "media-import-submit" }, { role: "button", label: props.t("Import from URL") })}>
              {controller.pending ? props.t("Importing…") : props.t("Import")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
