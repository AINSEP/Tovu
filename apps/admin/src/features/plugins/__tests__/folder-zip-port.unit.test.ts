/**
 * The folder zipper the Plugins / Agent Plugins "Choose a folder" buttons are bound to. Jini's
 * `useFolderUpload` maps a refused folder through `folderZip.FolderZipError`; the `folder-zip`
 * module stopped exporting that class (it now lives in `core/folder-zip-error`), so binding the
 * bare module namespace made every refusal throw `instanceof` TypeError instead of showing a message.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFolderUpload } from "@jini-ai/admin/shell/components/InstallTabCard/use-folder-upload.hooks";
import { FOLDER_EMPTY, FOLDER_UNREADABLE } from "@jini-ai/agent-plugins/folder-zip";
import { FolderZipError } from "@jini-ai/agent-plugins/core/folder-zip-error";
import { folderZipPort } from "../hooks/use-plugins.hooks";

function pick({ files }: { files: File[] }) {
  const onError = vi.fn(); const onZipped = vi.fn();
  const { result } = renderHook(() => useFolderUpload({ maxBytes: 1024, tooLarge: "TOO_LARGE", isLocked: () => false, onZipped, onError, folderZip: folderZipPort }));
  return { onError, onZipped, change: () => act(async () => { await result.current.onChange({ target: { files, value: "x" } }); }) };
}

describe("host folder-zip port", () => {
  it("carries the refusal class the zipper actually throws", () => {
    expect(folderZipPort.FolderZipError).toBe(FolderZipError);
  });

  it("shows the empty-folder message for an empty pick instead of throwing", async () => {
    const { onError, onZipped, change } = pick({ files: [] });
    await change();
    expect(onZipped).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({ key: FOLDER_EMPTY });
  });

  it("shows the over-limit message for a folder over the upload limit", async () => {
    const big = new File(["x".repeat(2048)], "big.txt");
    Object.defineProperty(big, "webkitRelativePath", { value: "f/big.txt" });
    const { onError, change } = pick({ files: [big] });
    await change();
    expect(onError).toHaveBeenCalledWith({ key: "TOO_LARGE" });
    expect(onError).not.toHaveBeenCalledWith({ key: FOLDER_UNREADABLE });
  });
});
