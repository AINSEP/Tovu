import { useJiniMediaPicker } from "./JiniMediaPicker.hooks";
import { Dialog } from "@jini-ai/ui-kit/react";
import "../../styles/native-domain-dialogs.css";
import { agentHandle } from "@jini-ai/agentic";
import type { AdminMedia } from "../../lib/api";
import { buildAgentListHandles } from "@jini-ai/agentic";
import { splitOnPlaceholders } from "@jini-ai/ui/panel-kit";
import { acceptedMediaItems, useWiredMediaPickerDialog } from "./MediaPickerDialog.hooks";

/**
 * @file `MediaPickerDialog` — lets an operator choose an EXISTING asset from the Media library
 * instead of typing a URL. First call site: the Posts/Pages editors' toolbar ("Insert from Media
 * Library"), replacing the old blind `window.prompt("Image URL:")` flow with a real picker over
 * the same library `features/media/Media.tsx` already manages.
 *
 * Reuses Jini's native dialog owner, like `WidgetPickerDialog.tsx`: the browser provides
 * modal isolation and Jini owns open/close, Escape, backdrop dismissal and focus return. Unlike
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
 * Domain state/effects — the once-per-mount media fetch — live in
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
  /** Content types this caller can use, e.g. `["image/*"]` (2026-10-05: the featured-image chooser
   *  offered videos). Same matching as Jini's `acceptsMedia`: an asset with no known type is hidden
   *  once a filter is given. Omit (or `[]`) to offer every asset — existing callers' behavior. */
  accept?: readonly string[];
}

function LegacyMediaPickerDialog({ useDialog = useWiredMediaPickerDialog, agentHandle: base, accept, ...props }: MediaPickerDialogProps) {
  const dialog = useDialog(props.onSelect, props.onCancel);
  const { error, select, mediaOriginalUrl, t } = dialog;
  const items = acceptedMediaItems(dialog.items, accept);
  // Native modality keeps Tab inside; Jini also restores the opener when this dialog unmounts.
  // Cancel is always present regardless of loading/error/empty/populated state, the same reason
  // useMediaLightbox has an always-available Close target.
  const itemHandles = base && items ? buildAgentListHandles({ prefix: `${base}-item`, ids: items.map((item) => item.id) }) : undefined;
  // `{link}` must render as a real `<a>` node, not plain text — interpolate() can't produce that,
  // so this splits the template around the token instead. See `lib/template-i18n.ts`'s own header.
  const [emptyStateBefore, emptyStateAfter] = splitOnPlaceholders({ template: t("No media uploaded yet. Upload an asset from the {link} screen first."), tokens: ["{link}"] }
  );

  return (
    <Dialog open title={t("Choose an image")} onClose={() => props.onCancel()}
      className="settings-dialog tovu-domain-dialog media-picker-dialog">

        <div className="media-picker-body">
          {error ? <div className="notice error">{error}</div> : null}
          {items === null ? (
            <p className="notice">{t("Loading media…")}</p>
          ) : items.length === 0 ? (
            <p className="notice">
              {emptyStateBefore}
              <a href="/admin/media">{t("Media")}</a>
              {emptyStateAfter}
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
                  {...(itemHandles ? agentHandle({ handle: itemHandles[index]! }, { role: "button", label: item.title }) : {})}
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
              data-jini-autofocus=""
              type="button"
              className="btn-secondary"
              onClick={props.onCancel}
              {...(base ? agentHandle({ handle: `${base}-cancel` }, { role: "button", label: "Close without choosing an image" }) : {})}
            >
              {t("Cancel")}
            </button>
          </span>
        </div>
    </Dialog>
  );
}

/** Existing callers keep their CMS callbacks; the mounted admin supplies Jini's promise service. */
export function MediaPickerDialog(props: MediaPickerDialogProps, _optional: Record<string, never> = {}) {
  const vm = useJiniMediaPicker(props);
  return vm.enabled ? <>{vm.error && <div role="alert">{vm.error}<button type="button" onClick={vm.onCancel}>Cancel</button></div>}</> : <LegacyMediaPickerDialog {...props} />;
}
