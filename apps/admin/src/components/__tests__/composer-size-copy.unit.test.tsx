import { renderHook } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VIDEO_UPLOAD_LIMIT_BYTES, MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";
import { t as mediaT } from "@/features/media/media-i18n";
import { useAttachmentUploader } from "../AssistantDock/hooks/composer-files.hooks";

const SPANISH_50_MB = "Este archivo supera los 50 MB. Elige un archivo más pequeño o pide al asistente que lo convierta.";
const MB = 1024 * 1024;
// One stable translator, like the dock's memoized one: the uploader is memoized on it.
const t = (key: string) => mediaT({ locale: "es", key });

function sizedFile({ name, type, size }: { name: string; type: string; size: number }): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

afterEach(() => vi.unstubAllGlobals());

describe("composer upload size copy", () => {
  it("composer oversize file shows the translated 50 MB copy and the video ceiling keeps its own copy", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useAttachmentUploader({ t }));
    const options = { batchId: "b1", signal: new AbortController().signal };
    const image = sizedFile({ name: "photo.png", type: "image/png", size: MAX_UPLOAD_BYTES + 1 });
    await expect(result.current([image], options)).rejects.toThrow(SPANISH_50_MB);
    const hugeVideo = sizedFile({ name: "huge.mp4", type: "video/mp4", size: VIDEO_UPLOAD_LIMIT_BYTES + 1 });
    const refusal = await result.current([hugeVideo], options).catch((failure: unknown) => failure);
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toBe(`That file is 500.1 MB; the limit is ${VIDEO_UPLOAD_LIMIT_BYTES / MB} MB.`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the composer says the same ordinary copy in English and never sends the oversize bytes", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useAttachmentUploader({ t: (key) => key }));
    const image = sizedFile({ name: "photo.png", type: "image/png", size: 60 * MB });
    await expect(result.current([image], { batchId: "b2", signal: new AbortController().signal })).rejects.toThrow("This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
