import { useEffect, useId, useState } from "react";
import { api, describeApiError, type AdminMedia } from "../lib/api";

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
 */

export interface MediaPickerDialogProps {
  onSelect: (item: AdminMedia) => void;
  onCancel: () => void;
}

/**
 * Fetches the workspace's active media once per mount — mirrors `useExistingInstances`'s exact
 * shape (`null` while loading, a describable `error` string on failure).
 *
 * @returns `items` (`null` while the fetch is in flight, otherwise the loaded, active-only list)
 *   and `error` (a describable failure message, or `null`).
 */
export function useMediaPickerItems() {
  const [items, setItems] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .listMedia()
      .then((r) => setItems(r.media.filter((m) => m.status === "active")))
      .catch((e) => setError(describeApiError(e, "failed to load media")));
  }, []);
  return { items, error };
}

/**
 * Owns the dialog's own state on top of {@link useMediaPickerItems}: the Escape-to-cancel
 * listener and the single submit handler. Split out for the same reason
 * `useWidgetPickerDialog` is — a render-free unit to test the interaction logic against.
 */
export function useMediaPickerDialog(props: MediaPickerDialogProps) {
  const { items, error } = useMediaPickerItems();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, error, select: props.onSelect };
}

export function MediaPickerDialog(props: MediaPickerDialogProps) {
  const { items, error, select } = useMediaPickerDialog(props);
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
