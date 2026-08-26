import { useId } from "react";
import { agentHandle } from "@jini-ai/agentic";
import type { AdminMedia } from "../../lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
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
 * Reuses the same `/media` data path `features/media/`'s own `useMedia`/`MediaPreview` already
 * read — rather than a second query against the same table — via the injected `useDialog` hook's
 * `MediaPickerPort` (`listMedia`, `mediaOriginalUrl`; see `media-picker-port.hooks.ts`).
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
 *
 * ## Agent handles
 *
 * Given `agentHandle="post-media"` this publishes:
 *
 * | element | handle | role |
 * |---|---|---|
 * | one grid item, keyed by the asset's own `id` | `post-media-item-<slug of id>` | `button` |
 * | the Cancel button | `post-media-cancel` | `button` |
 *
 * Items sit under their own `-item-` namespace via `@jini-ai/agentic`'s `buildAgentListHandles`,
 * the same "caller data cannot collide with this component's own literal segments" reasoning
 * `source-config-list/agent-handles.ts` documents for its own `-field-`/`-item-` namespaces. Omit
 * `agentHandle` and no `data-agent-*` markup is emitted at all.
 */

export interface MediaPickerDialogProps {
  onSelect: (item: AdminMedia) => void;
  onCancel: () => void;
  /** Injectable seam for the dialog's data-fetch and Escape-to-cancel hook. Defaults to the real
   *  {@link useWiredMediaPickerDialog}; a test can pass a fake here to exercise `MediaPickerDialog`'s
   *  rendering without invoking `api.listMedia()` or a real `document` keydown listener at all. */
  useDialog?: typeof useWiredMediaPickerDialog;
  /** This dialog's own base handle — see this file's "Agent handles" doc for the full scheme. Omit
   *  to leave it untagged. */
  agentHandle?: string;
}

export function MediaPickerDialog({ useDialog = useWiredMediaPickerDialog, agentHandle: base, ...props }: MediaPickerDialogProps) {
  const { items, error, select, mediaOriginalUrl } = useDialog(props.onSelect, props.onCancel);
  const titleId = useId();
  const itemHandles = base && items ? buildAgentListHandles(`${base}-item`, items.map((item) => item.id)) : undefined;

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
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className="media-picker-item"
                  title={item.title}
                  onClick={() => select(item)}
                  {...(itemHandles ? agentHandle(itemHandles[index]!, { role: "button", label: item.title }) : {})}
                >
                  <img src={mediaOriginalUrl(item.id)} alt={item.alt || item.title} loading="lazy" />
                  <span className="media-picker-item-title">{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="widget-picker-footer">
          <span className="editor-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={props.onCancel}
              {...(base ? agentHandle(`${base}-cancel`, { role: "button", label: "Close without choosing an image" }) : {})}
            >
              Cancel
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
