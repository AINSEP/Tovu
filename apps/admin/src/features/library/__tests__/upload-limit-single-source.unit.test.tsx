import { act, renderHook } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES } from "@tovu/contracts/upload-limits";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { CHAT_ATTACHMENT_MAX_BATCH_BYTES, CHAT_ATTACHMENT_MAX_BYTES, useAttachmentUploader } from "@/components/AssistantDock/hooks/composer-files.hooks";
import { useWiredLibrary } from "../hooks/use-wired-library.hooks";

/** One upload limit across Library, Media and chat attachments: every admin surface reads the shared contract. */
function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function sizedFile(name: string, size: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

afterEach(() => vi.unstubAllGlobals());

describe("one upload limit", () => {
  it("chat attachments use the shared contract limit and batch limit", () => {
    expect(CHAT_ATTACHMENT_MAX_BYTES).toBe(MAX_UPLOAD_BYTES);
    expect(CHAT_ATTACHMENT_MAX_BATCH_BYTES).toBe(MAX_UPLOAD_BATCH_BYTES);
  });

  it("the chat composer accepts a 60 MiB video, refuses a 60 MiB image in plain words, and refuses a 501 MiB video", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ attachment: { path: "attachment:11111111-1111-4111-8111-111111111111", name: "clip.mp4", kind: "file", size: 1 } }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAttachmentUploader());
    const MB = 1024 * 1024;
    const video = sizedFile("clip.mp4", 60 * MB);
    Object.defineProperty(video, "type", { value: "video/mp4" });
    const image = sizedFile("photo.png", 60 * MB);
    Object.defineProperty(image, "type", { value: "image/png" });
    const huge = sizedFile("huge.mp4", 501 * MB);
    Object.defineProperty(huge, "type", { value: "video/mp4" });
    await expect(result.current([video], { batchId: "b1", signal: new AbortController().signal })).resolves.toHaveLength(1);
    await expect(result.current([image], { batchId: "b2", signal: new AbortController().signal })).rejects.toThrow("That file is 60 MB; the limit is 50 MB.");
    await expect(result.current([huge], { batchId: "b3", signal: new AbortController().signal })).rejects.toThrow(`the limit is ${VIDEO_UPLOAD_LIMIT_BYTES / MB} MB.`);
  });

  it("the Library refuses only a file over the shared limit, and says both sizes in plain words", () => {
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
    const { result } = renderHook(() => useWiredLibrary(), { wrapper });
    act(() => result.current.addFiles([sizedFile("huge.pdf", MAX_UPLOAD_BYTES + 1), sizedFile("ok.pdf", 11 * 1024 * 1024)]));
    const rows = new Map(result.current.uploads.map((row) => [row.name, row]));
    expect(rows.get("huge.pdf")?.error).toBe("That file is 50.1 MB; the limit is 50 MB.");
    expect(rows.get("ok.pdf")?.status).not.toBe("failed");
  });
});
