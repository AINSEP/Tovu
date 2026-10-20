import { useRef, useState } from "react";

import { FOLDER_EMPTY, FOLDER_UNREADABLE, FolderZipError, zipFolderFiles } from "./folder-zip";

export const FOLDER_TOO_MANY = "That folder has more than 4096 files.";

/** The only fields of the folder `<input>` the hook reads; a React change event's target satisfies it. */
export interface PickedFolderInput {
  readonly files: ArrayLike<File> | null;
  value: string;
}

/** Maps a refused folder to the dictionary key the page shows; anything that is not a FolderZipError reads as unreadable. */
function refusalKey({ error, tooLarge }: { error: unknown; tooLarge: string }): string {
  if (!(error instanceof FolderZipError)) return FOLDER_UNREADABLE;
  const keys: Record<FolderZipError["reason"], string> = {
    empty: FOLDER_EMPTY, "too-large": tooLarge, "too-many": FOLDER_TOO_MANY, unreadable: FOLDER_UNREADABLE,
  };
  return keys[error.reason];
}

/**
 * "Choose a folder" for an "Add a …" tab's {@link ZipDropZone}: opens the browser's folder picker,
 * zips what it returns (`folder-zip.ts`) and hands the result to the page as if that `.zip` had been
 * chosen, so the page's own size check, Preview and install run unchanged. Shared by Plugins and
 * Agent Plugins (owner, 2026-10-06: "Folder on this server" was a bare path with no button).
 *
 * @param required.maxBytes - The page's upload limit, checked before and after zipping.
 * @param required.tooLarge - The page's own "over the limit" dictionary key.
 * @param required.isLocked - True while the page is uploading; a pick is then ignored.
 * @param required.onZipped - Receives the `<folder>.zip` file.
 * @param required.onError - Receives a dictionary key for a refused folder.
 */
export function useFolderUpload(
  required: { maxBytes: number; tooLarge: string; isLocked: () => boolean; onZipped: (file: File) => void; onError: (key: string) => void },
  _optional: Record<string, never> = {},
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [zipping, setZipping] = useState(false);
  const zippingRef = useRef(false);

  async function zip(files: File[]): Promise<void> {
    if (zippingRef.current || required.isLocked()) return;
    zippingRef.current = true;
    setZipping(true);
    try {
      required.onZipped(await zipFolderFiles({ files, maxBytes: required.maxBytes }));
    } catch (error) {
      required.onError(refusalKey({ error, tooLarge: required.tooLarge }));
    } finally {
      zippingRef.current = false;
      setZipping(false);
    }
  }

  return {
    inputRef,
    zipping,
    onChoose: () => inputRef.current?.click(),
    /** Snapshots the picked files, then clears the input so picking the same folder again (after
     *  editing it) still fires `change`. */
    onChange: (event: { target: PickedFolderInput }) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      return zip(files);
    },
  };
}
