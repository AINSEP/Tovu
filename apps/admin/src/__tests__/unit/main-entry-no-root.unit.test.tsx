// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

it("reports the missing admin mount point and does not make startup requests", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  try {
    expect(document.getElementById("root")).toBeNull();
    await expect(import("../../main")).rejects.toThrow("admin app root element is missing");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
}, 30000);
