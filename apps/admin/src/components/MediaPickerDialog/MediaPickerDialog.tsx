import { useId } from "react";
import { api, type AdminMedia } from "../../lib/api";
import { useWiredMediaPickerDialog } from "./MediaPickerDialog.hooks";

/**
 * @file `MediaPickerDialog` — lets an operator choose an EXISTING asset from the Media library
 * instead of typing a URL. First call site: the Posts/Pages editors' toolbar ("Insert from Media
 * Library"), replacing the old blind `window.prompt("Image URL:")` flow with a real picker over
 * the same library `features/media/Media.tsx` already manages.
 *
 * Mirrors `WidgetPickerDialog.tsx`'s exact modal chrome (`.settings-dialog`/
 * `.settings-dialog-backdrop`, `role="dialog"`, `aria-modal`, `aria-labelledby`,
 * Escape-to-close, backdrop-click-to-cancel) — no new modal idiom invented. Unlike
 * `WidgetPickerDialog`, there is no "create new" branch here: a new asset is uploaded through
 * `features/media/Media.tsx`'s own upload flow, not inline from an editor toolbar (uploading a
 * file mid-edit, with its own alt/caption/credit fields, is a bigger surface than this picker's
 * job — "choose one of the assets that already exist").
 *
 * Reuses `api.listMedia()`/`api.mediaOriginalUrl()` — the SAME data path `features/media/`'s own
 * `useMedia`/`MediaPreview` already read — rather than a second query against the same table.
 * Deliberately does NOT reuse `MediaPreview`'s full video/unsupported-type fallback chain
 * (`use-media-preview.hooks.ts`): this picker only ever inserts an `image` node, so a thumbnail
 * grid needs just the image case, not the video/`<video>`/download-link branches a general asset
 * preview does. `active` assets only — a trashed asset is not a legal choice for new content.
 *
 * State/effects — the once-per-mount media fetch and the Escape-to-cancel listener — live in
 * `MediaPickerDialog.hooks.tsx`, split out the same way `ConfirmDialog`/`ConfirmDialog.hooks.tsx`
 * does in `@jini-ai/admin`: this file stays props-and-JSX only, and the `useDialog` prop below lets
 * a test render this JSX against a fake hook — no real `api.listMedia()` call and no real
 * `document`-level keydown listener required.
 */

export interface MediaPickerDialogProps {
  onSelect: (item: AdminMedia) => void;
  onCancel: () => void;
  /** Injectable seam for the dialog's data-fetch and Escape-to-cancel hook. Defaults to the real
   *  {@link useWiredMediaPickerDialog}; a test can pass a fake here to exercise `MediaPickerDialog`'s
   *  rendering without invoking `api.listMedia()` or a real `document` keydown listener at all. */
  useDialog?: typeof useWiredMediaPickerDialog;
}

export function MediaPickerDialog({ useDialog = useWiredMediaPickerDialog, ...props }: MediaPickerDialogProps) {
  const { items, error, select } = useDialog(props.onSelect, props.onCancel);
  const titleId = useId();

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <div
        className="settings-dialog media-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Choose an image</h2>

        <div className="media-picker-body">
          {error ? <div className="notice error">{error}</div> : null}
          {items === null ? (
            <p className="notice">Loading media…</p>
          ) : items.length === 0 ? (
            <p className="notice">
              No media uploaded yet. Upload an asset from the <a href="/admin/media">Media</a> screen first.
            </p>
          ) : (
            <div className="media-picker-grid">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="media-picker-item"
                  title={item.title}
                  onClick={() => select(item)}
                >
                  <img src={api.mediaOriginalUrl(item.id)} alt={item.alt || item.title} loading="lazy" />
                  <span className="media-picker-item-title">{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="widget-picker-footer">
          <span className="editor-actions">
            <button type="button" className="btn-secondary" onClick={props.onCancel}>
              Cancel
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
