import { afterEach, describe, expect, it, vi } from "vitest";

import { renderAdminScreenshotCanvas } from "../agent-screenshot";

/**
 * @file The host's html2canvas-pro capture adapter. The orchestration it feeds
 * (`captureAdminScreenshotToolResult`) is tested in `@jini-ai/admin/shell/lib/agent-screenshot`.
 * This test mocks html2canvas-pro to pin its library selection and viewport options; actual painting
 * still needs browser verification.
 */

vi.mock("html2canvas-pro", () => ({ default: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("renderAdminScreenshotCanvas", () => {
  it("uses html2canvas-pro with the current viewport and no device-pixel scaling", async () => {
    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = fakeCanvas({ "0.7": 1000 });
    vi.mocked(html2canvas).mockResolvedValue(canvas as unknown as HTMLCanvasElement);
    vi.stubGlobal("scrollX", 23);
    vi.stubGlobal("scrollY", 47);
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 768);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(740);
    const element = document.createElement("main");

    expect(await renderAdminScreenshotCanvas(element)).toBe(canvas);
    expect(html2canvas).toHaveBeenCalledWith(element, {
      scale: 1, useCORS: true, x: 23, y: 47, width: 1024, height: 768,
      windowWidth: 1000, windowHeight: 740,
    });
  });
});

/** A fake canvas whose `toDataURL` returns a data URL sized to a requested byte count, so the
 *  size-budget retry loop can be asserted without ever decoding a real image. */
function fakeCanvas(bytesByQuality: Record<string, number>) {
  return {
    toDataURL: vi.fn((type: string, quality: number) => {
      const bytes = bytesByQuality[String(quality)];
      if (bytes === undefined) throw new Error(`fakeCanvas: no byte count configured for quality ${quality}`);
      // Real base64 is ~4/3 the raw byte count; padding with "A" is valid base64 filler and decodes
      // to zero bytes, so the length arithmetic in `agent-screenshot.ts` is exercised for real rather
      // than asserted against a mocked estimator.
      const data = "A".repeat(Math.ceil((bytes * 4) / 3));
      return `data:${type};base64,${data}`;
    }),
  };
}
