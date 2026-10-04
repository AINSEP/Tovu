import { useRemoteImageImport } from "./hooks/use-remote-image-import.hooks";
import type { MediaImportPort } from "./hooks/media-import-dependencies.hooks";
import { agentHandle } from "@jini-ai/agentic";

/** Markup only; downloads, mutation state and list invalidation live in the hook. */
export function RemoteImageImport(props: { t: (key: string) => string; dependencies?: { port: MediaImportPort } }) {
  const controller = useRemoteImageImport({ t: props.t }, props.dependencies);
  return (
    // Same `toolbar` row shape as the upload controls directly above it, so both entry points read
    // as one family. Placeholders double as aria-labels, matching that row's alt field.
    <div className="toolbar">
      <input type="url" value={controller.url} onChange={(event) => controller.setUrl(event.currentTarget.value)} disabled={controller.pending}
        placeholder={props.t("Remote image URL")} aria-label={props.t("Remote image URL")}
        {...agentHandle({ handle: "media-import-url" }, { role: "field", label: props.t("Remote image URL") })} />
      {/* Its own name: the upload row's alt field already owns "Alt text (optional)" on this screen. */}
      <input value={controller.alt} onChange={(event) => controller.setAlt(event.currentTarget.value)} disabled={controller.pending}
        placeholder={props.t("Alt text (optional)")} aria-label={props.t("Imported image alt text (optional)")}
        {...agentHandle({ handle: "media-import-alt" }, { role: "field", label: props.t("Imported image alt text (optional)") })} />
      <button type="button" onClick={controller.submit} disabled={!controller.canSubmit}
        {...agentHandle({ handle: "media-import-submit" }, { role: "button", label: props.t("Import from URL") })}>
        {controller.pending ? props.t("Importing…") : props.t("Import from URL")}
      </button>
      {controller.error ? <div role="alert" className="notice error">{controller.error}</div> : null}
    </div>
  );
}
