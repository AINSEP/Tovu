import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAttachmentUploader } from "../hooks/composer-files.hooks";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("useAttachmentUploader reads fetch at call time (B012)", () => {
  it("uses a window.fetch patched AFTER the uploader was built (tests, auth wrappers)", async () => {
    const { result } = renderHook(() => useAttachmentUploader());
    // Patched after the hook memoized the uploader: a `fetch` captured at memo time would never see it.
    const patched = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ attachment: { path: "staged/a.txt", name: "a.txt", kind: "file" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    globalThis.fetch = patched as unknown as typeof globalThis.fetch;

    const uploaded = await result.current([new File(["hello"], "a.txt", { type: "text/plain" })]);

    expect(patched).toHaveBeenCalledTimes(1);
    expect(String(patched.mock.calls[0]?.[0])).toContain("/api/attachments");
    expect(uploaded).toHaveLength(1);
  });
});
