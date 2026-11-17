import type { Editor } from "@tiptap/react";
import { type Translate, interpolate } from "@jini-ai/core/text";
import { readFileAsDataUrl } from "../rules";
import type { PostEditorPort } from "./post-editor-port.hooks";

/**
 * @file Drag-and-drop and paste upload for the post editor's `FileHandler`: the advisory MIME
 * allowlist, the shared upload step, the failure message and the two callback bodies. A verbatim
 * move out of `use-post-editor.hooks.ts` (its size ratchet), no behavior change.
 */

/**
 * Mirrors the server's own advisory upload allowlist (`DEFAULT_ALLOWED_MIME_TYPES`,
 * `@jini-ai/cms/media`'s `media-service.ts`) rather than importing it: that subpath is the full
 * server-side upload/DB implementation, which has no place in a browser bundle — unlike
 * `@jini-ai/core/settings`'s plain i18n dictionaries, which `SettingsUi.tsx` already imports safely
 * elsewhere in this app. Hand-copied, not derived — kept in sync manually with the server list (see
 * the regression test pinning this exactly against a literal copy of `DEFAULT_ALLOWED_MIME_TYPES`);
 * a future addition to the server ceiling needs a matching edit here too, or this comment goes false
 * again (as `video/mp4`/`video/webm` did, added server-side 2026-08-24 but never mirrored here until
 * 2026-09-07). The server sanitises SVG at ingest. Advisory only —
 * `FileHandler` filters what reaches `onDrop`/`onPaste` client-side, but `port.uploadMedia` still
 * goes through the server's own authoritative allowlist regardless of what gets past this filter.
 */
export const FILE_HANDLER_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
];

/**
 * `@tiptap/extension-file-handler`'s shared upload step (2026-08-12, B1 — drag & paste image
 * upload) — uploads one dropped/pasted `File` through `port.uploadMedia`, the SAME media-upload
 * path `MediaPickerDialog`'s own upload flow already calls (confirmed against
 * `use-media.hooks.ts`'s `upload()`: `readFileAsDataUrl` then `port.uploadMedia({filename,
 * contentType, dataBase64}, ...)` — this reuses `readFileAsDataUrl` from `../rules.ts`, the same
 * helper `handleImageDrop` used to inline directly; here the `data:` prefix is stripped instead of
 * kept, since `uploadMedia` wants the bare base64 payload). Returns the `{assetId, alt}` pair a
 * ref-based image node needs, or `null` on upload failure so a caller can skip just that one file
 * rather than throwing out of a FileHandler callback ProseMirror never awaits — the same "failure is
 * silently absorbed, not a full-screen error" reasoning the mention-list effect above already states
 * for its own non-critical, best-effort background fetch.
 *
 * Split to a top-level function taking `port` as an explicit parameter, not a closure inside
 * `usePostEditor`, for the same reason `computeContentDirty` above already is: this project's
 * complexity metric folds nested closures into the enclosing function's own score, so only
 * top-level extraction keeps `usePostEditor` under the ceiling.
 *
 * @complexity Time: O(f) in file bytes (one `FileReader` read + one upload request); space: O(f) for
 * the base64 payload — same cost {@link readFileAsDataUrl}'s own doc already states.
 */
export async function uploadDroppedFile(
  port: PostEditorPort,
  file: File,
  { onError }: { onError?: UploadFailureHandler } = {},
): Promise<{ assetId: string; alt: string } | null> {
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const { media } = await port.uploadMedia({ filename: file.name, contentType: file.type, dataBase64 });
    return { assetId: media.id, alt: file.name };
  } catch (error) {
    // Reported, not swallowed: a dropped image that quietly never appears reads as a broken editor.
    onError?.({ file, error });
    return null;
  }
}

/** Called once per dropped or pasted file whose upload failed, with the file and the cause. */
export type UploadFailureHandler = (failure: { file: File; error: unknown }) => void;

/**
 * The plain-words editor message for a failed drop/paste upload: names the file and keeps the
 * cause (already redacted by the admin API) so the operator can paste it into a report.
 * @complexity O(1).
 */
export function formatUploadFailureMessage({ file, error, t }: { file: File; error: unknown; t: Translate }, _options: Record<string, never> = {}): string {
  const cause = error instanceof Error && error.message ? error.message : t("no reason was given");
  return interpolate({ template: t("Could not add {name}. Nothing was inserted. Cause: {cause}"), vars: { name: file.name, cause } });
}

/**
 * A failed drop/paste upload shows in the editor's own error line; nothing is inserted. Built from the
 * editor's own message and error setters so the hook holds one line, not the handler's body.
 */
export function uploadFailureReporter(
  { setMessage, setError, t }: { setMessage: (message: string | null) => void; setError: (error: string | null) => void; t: Translate },
  _options: Record<string, never> = {},
): UploadFailureHandler {
  return ({ file, error }) => {
    setMessage(null);
    setError(formatUploadFailureMessage({ file, error, t }));
  };
}

/**
 * `FileHandler`'s `onDrop` callback body (2026-08-12, B1; switched from the `image` node to the
 * generic `media` node 2026-09-11 — see `lib/media-embed-extension.tsx`'s own file header) —
 * uploads each dropped file via {@link uploadDroppedFile} and inserts it at the drop position with
 * `insertContentAt`, producing the IDENTICAL `{assetId, transformName: "public", alt}` node shape
 * `insertMediaEmbed` (`lib/media-embed-extension.tsx`, the Media picker's own insert command)
 * builds. `insertMediaEmbed` itself isn't called here because it always inserts at the CURRENT
 * SELECTION, never an arbitrary position, and `pos` (the drop point) is very often not the
 * selection — `insertContentAt(pos, ...)` is TipTap's own documented pattern for a file-handler drop
 * for exactly this reason. Never base64-inlines into `bodyJson` — see `handleImageDrop`
 * (`../rules.ts`) for the legacy local-file behavior this supersedes, and why that function now
 * deliberately leaves local files unhandled so this one is reachable at all.
 *
 * `FILE_HANDLER_ALLOWED_MIME_TYPES` (above) already includes `video/mp4`/`video/webm`, so a dropped
 * video file reaches this same path — inserting it as a `media` node (not `image`) is what makes
 * that video actually play once saved, instead of rendering `image`'s broken `<img>` for a video
 * asset (see `render.ts`'s `renderDocMedia` for the render-side half).
 *
 * Each file is uploaded and inserted independently, as its own upload resolves — not
 * `Promise.all`-batched, and this function itself does not await any of them (`onDrop` is a
 * synchronous callback) — a multi-file drop with one slow or failing upload still lands every other
 * file rather than blocking on the slowest or losing the whole batch to one failure.
 */
export function handleFileDrop({ port, editor, files, pos, onError }: { port: PostEditorPort; editor: Editor; files: File[]; pos: number; onError?: UploadFailureHandler }, _options: Record<string, never> = {}): void {
  for (const file of files) {
    uploadDroppedFile(port, file, { ...(onError ? { onError } : {}) }).then((result) => {
      if (!result) return;
      editor
        .chain()
        .insertContentAt(pos, { type: "media", attrs: { assetId: result.assetId, transformName: "public", alt: result.alt } })
        .focus()
        .run();
    });
  }
}

/**
 * `FileHandler`'s `onPaste` callback body (2026-08-12, B1; switched from `insertMediaRef` to
 * `insertMediaEmbed` 2026-09-11, same reasoning as {@link handleFileDrop} immediately above) — same
 * upload step as {@link handleFileDrop}, but inserts through the real `insertMediaEmbed` command
 * (`lib/media-embed-extension.tsx`) rather than `insertContentAt`: `@tiptap/extension-file-handler`'s
 * own `onPaste` signature carries no position argument (unlike `onDrop`'s `pos`), and inserting at
 * the current selection is exactly what a paste is supposed to do — exactly what `insertMediaEmbed`
 * does with no position argument (after the selected node when a node is selected, see
 * `lib/block-atom-insert.ts`).
 */
export function handleFilePaste({ port, editor, files, onError }: { port: PostEditorPort; editor: Editor; files: File[]; onError?: UploadFailureHandler }, _options: Record<string, never> = {}): void {
  for (const file of files) {
    uploadDroppedFile(port, file, { ...(onError ? { onError } : {}) }).then((result) => {
      if (!result) return;
      editor.commands.insertMediaEmbed({ assetId: result.assetId, transformName: "public", alt: result.alt });
    });
  }
}
