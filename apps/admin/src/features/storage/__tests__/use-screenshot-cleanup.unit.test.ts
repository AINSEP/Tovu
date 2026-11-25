import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createScreenshotCleanupClient, type ScreenshotCleanupClient } from "../api/screenshot-cleanup-api";
import { useScreenshotCleanup } from "../hooks/use-screenshot-cleanup.hooks";

const PREVIEW = { previewToken: "t1", deadline: 1, count: 1, bytes: 3, items: ["2026-01-01/old.jpg"] };

describe("useScreenshotCleanup", () => {
  it("shows the preview before anything is deleted, then applies only that preview", async () => {
    const client: ScreenshotCleanupClient = { preview: vi.fn(async () => PREVIEW), apply: vi.fn(async () => ({ deleted: ["2026-01-01/old.jpg"], kept: [] })) };
    const { result } = renderHook(() => useScreenshotCleanup({ client, describeError: () => "x" }));
    await act(async () => { await result.current.confirm(); });
    expect(client.apply).not.toHaveBeenCalled();
    await act(async () => { await result.current.preview({ before: 5 }); });
    expect(result.current.state).toEqual({ status: "shown", preview: PREVIEW });
    expect(client.apply).not.toHaveBeenCalled();
    await act(async () => { await result.current.confirm(); });
    expect(client.apply).toHaveBeenCalledWith({ previewToken: "t1" });
    expect(result.current.state).toEqual({ status: "done", result: { deleted: ["2026-01-01/old.jpg"], kept: [] } });
  });

  it("reports a failed request in the host's words", async () => {
    const client: ScreenshotCleanupClient = { preview: vi.fn(async () => { throw new Error("busy"); }), apply: vi.fn() };
    const { result } = renderHook(() => useScreenshotCleanup({ client, describeError: ({ error }) => `said: ${(error as Error).message}` }));
    await act(async () => { await result.current.preview({ before: 5 }); });
    expect(result.current.state).toEqual({ status: "error", message: "said: busy" });
  });
});

describe("createScreenshotCleanupClient", () => {
  it("posts the preview cutoff and a confirmed apply to the workspace routes", async () => {
    const request = vi.fn(async () => ({}));
    const client = createScreenshotCleanupClient({ request: request as never, workspaceId: "ws" });
    await client.preview({ before: 7 });
    await client.apply({ previewToken: "t" });
    expect(request.mock.calls).toEqual([
      [{ method: "POST", path: "/workspaces/ws/storage/screenshots/preview", body: { before: 7 } }],
      [{ method: "POST", path: "/workspaces/ws/storage/screenshots/apply", body: { previewToken: "t", confirm: true } }],
    ]);
  });
});
