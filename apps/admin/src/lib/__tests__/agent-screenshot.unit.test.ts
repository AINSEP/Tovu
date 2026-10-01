import { afterEach, describe, expect, it, vi } from "vitest";

import { ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID, MAX_SCREENSHOT_BYTES, captureAdminScreenshotToolResult, renderAdminScreenshotCanvas } from "../agent-screenshot";

/**
 * @file `agent-screenshot.ts`'s orchestration logic — the part `App.hooks.tsx`'s `useAgentPageBridge`
 * registers under `createFrontendSessionBridge`'s `"admin."` executor prefix to answer
 * `admin.capture_screenshot` invocations.
 *
 * The orchestration tests inject a canvas fake. The adapter test mocks html2canvas-pro to pin
 * its library selection and viewport options; actual painting still needs browser verification.
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

describe("captureAdminScreenshotToolResult", () => {
  it("reports a text-only failure, not a thrown error, when there is no element to capture", async () => {
    const renderElementToCanvas = vi.fn();

    const result = await captureAdminScreenshotToolResult({ element: null, renderElementToCanvas });

    expect(renderElementToCanvas).not.toHaveBeenCalled();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text: string }).text).toMatch(/no admin content area/i);
  });

  it("reports a text-only failure when the element is no longer attached to the document", async () => {
    const renderElementToCanvas = vi.fn();
    const detached = document.createElement("main"); // never appended — isConnected is false

    const result = await captureAdminScreenshotToolResult({ element: detached, renderElementToCanvas });

    expect(renderElementToCanvas).not.toHaveBeenCalled();
    expect((result.content[0] as { text: string }).text).toMatch(/no admin content area/i);
  });

  it("returns a text note plus an image content block on a successful capture within budget", async () => {
    const element = document.createElement("main");
    document.body.appendChild(element);
    const canvas = fakeCanvas({ "0.7": 1000 });
    const renderElementToCanvas = vi.fn().mockResolvedValue(canvas);

    const result = await captureAdminScreenshotToolResult({ element, renderElementToCanvas });

    expect(renderElementToCanvas).toHaveBeenCalledWith(element);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.7);
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[1]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    expect(typeof (result.content[1] as { data: string }).data).toBe("string");
    expect((result.content[1] as { data: string }).data.length).toBeGreaterThan(0);
    expect((result.content[1] as { data: string }).data).toBe(canvas.toDataURL.mock.results[0].value.split(",")[1]);
    document.body.removeChild(element);
  });

  it("the accompanying text names the fidelity limits, so a blank MCP-UI iframe is never read as 'nothing there'", async () => {
    const element = document.createElement("main");
    document.body.appendChild(element);
    const renderElementToCanvas = vi.fn().mockResolvedValue(fakeCanvas({ "0.7": 1000 }));

    const result = await captureAdminScreenshotToolResult({ element, renderElementToCanvas });

    expect((result.content[0] as { text: string }).text).toMatch(/iframe/i);
    document.body.removeChild(element);
  });

  it("retries at a lower JPEG quality when the first attempt exceeds the size budget", async () => {
    const element = document.createElement("main");
    document.body.appendChild(element);
    const canvas = fakeCanvas({ "0.7": MAX_SCREENSHOT_BYTES + 1, "0.4": 1000 });
    const renderElementToCanvas = vi.fn().mockResolvedValue(canvas);

    const result = await captureAdminScreenshotToolResult({ element, renderElementToCanvas });

    // Rendered exactly once — only the ENCODE is retried at a lower quality, not the (expensive)
    // rasterization itself.
    expect(renderElementToCanvas).toHaveBeenCalledTimes(1);
    expect(canvas.toDataURL).toHaveBeenNthCalledWith(1, "image/jpeg", 0.7);
    expect(canvas.toDataURL).toHaveBeenNthCalledWith(2, "image/jpeg", 0.4);
    expect(result.content[1]).toMatchObject({ type: "image" });
    const data = (result.content[1] as { data: string }).data;
    expect(data).toBe(canvas.toDataURL.mock.results[1].value.split(",")[1]);
    expect(atob(data).length).toBeLessThanOrEqual(MAX_SCREENSHOT_BYTES);
    document.body.removeChild(element);
  });

  it("fails with a text-only explanation, never a truncated/corrupt image, when every quality attempt exceeds budget", async () => {
    const element = document.createElement("main");
    document.body.appendChild(element);
    const canvas = fakeCanvas({ "0.7": MAX_SCREENSHOT_BYTES + 1, "0.4": MAX_SCREENSHOT_BYTES + 1 });
    const renderElementToCanvas = vi.fn().mockResolvedValue(canvas);

    const result = await captureAdminScreenshotToolResult({ element, renderElementToCanvas });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text: string }).text).toMatch(/too large|size budget/i);
    document.body.removeChild(element);
  });

  it("reports a text-only failure, not a thrown error, when the renderer itself rejects", async () => {
    const element = document.createElement("main");
    document.body.appendChild(element);
    const renderElementToCanvas = vi.fn().mockRejectedValue(new Error("html2canvas exploded"));

    const result = await captureAdminScreenshotToolResult({ element, renderElementToCanvas });

    expect(result.content).toHaveLength(1);
    expect((result.content[0] as { text: string }).text).toMatch(/html2canvas exploded/);
    document.body.removeChild(element);
  });
});

describe("ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID", () => {
  it("matches the id registered server-side in frontend-control-capabilities.ts", () => {
    // The two files cannot import each other (apps/admin and apps/website are separate builds — see
    // this module's own header) so the id is intentionally duplicated; this pins the literal so the
    // two cannot silently drift, the same cross-boundary-string discipline `assistant-transport.ts`'s
    // `frontendBindToken` envelope key already relies on.
    expect(ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID).toBe("admin.capture_screenshot");
  });
});
