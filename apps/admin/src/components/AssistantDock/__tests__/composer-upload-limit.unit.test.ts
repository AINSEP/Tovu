import { describe, expect, it, vi } from "vitest";

import { withUploadSizeLimit } from "../hooks/composer-files.hooks";

const MIB = 1024 * 1024;

function sizedFile(name: string, size: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("chat composer attachments share the admin's 50 MiB limit", () => {
  it("refuses a file one byte over 50 MiB with the admin's own words, before any upload starts", async () => {
    const upload = vi.fn(async () => []);
    const guarded = withUploadSizeLimit({ upload });
    await expect(guarded([sizedFile("clip.mov", 50 * MIB + 1)])).rejects.toThrow(
      "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.",
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("passes a file of exactly 50 MiB, and the composer's batch options, straight through", async () => {
    const upload = vi.fn(async () => []);
    const guarded = withUploadSizeLimit({ upload });
    const file = sizedFile("clip.mp4", 50 * MIB);
    const options = { batchId: "b-1", signal: new AbortController().signal };
    await guarded([file], options);
    expect(upload).toHaveBeenCalledWith([file], options);
  });

  it("says the limit in the viewer's language when given one", async () => {
    const guarded = withUploadSizeLimit({ upload: vi.fn(async () => []) }, { locale: "es" });
    await expect(guarded([sizedFile("big.pdf", 50 * MIB + 1)])).rejects.toThrow(/50 MB/);
    await expect(guarded([sizedFile("big.pdf", 50 * MIB + 1)])).rejects.not.toThrow("This file is larger than 50 MB.");
  });
});
