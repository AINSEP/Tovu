import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { closePublishRequest, requestPublish, usePublishRequest } from "../hooks/publish-request.store";

/**
 * @file `publish-criteria-tool-webmcp-plan-2026-09-24.md` §4 S2's `publish-request.store.ts` — the
 * module-level store `App.tsx` reads to decide whether (and with what criteria) to mount
 * `PublishContentDialog`. Nothing here touches a port or a plan; see the store's own file header.
 */

describe("publish-request.store", () => {
  it("requestPublish({types:['page']}) sets the open request", () => {
    const { result } = renderHook(() => usePublishRequest());
    expect(result.current).toBeNull();

    act(() => {
      void requestPublish({ types: ["page"] });
    });

    expect(result.current).not.toBeNull();
    expect(result.current?.criteria).toEqual({ types: ["page"] });
    expect(typeof result.current?.requestId).toBe("string");
  });

  it("a second call replaces it with a new requestId", () => {
    const { result } = renderHook(() => usePublishRequest());

    act(() => {
      void requestPublish({ types: ["page"] });
    });
    const first = result.current;

    act(() => {
      void requestPublish({ types: ["menu"] });
    });
    const second = result.current;

    expect(second?.criteria).toEqual({ types: ["menu"] });
    expect(second?.requestId).not.toBe(first?.requestId);
  });

  it("a second call settles the first request's own promise, so no caller waits forever", async () => {
    const { result } = renderHook(() => usePublishRequest());

    let firstResult: Awaited<ReturnType<typeof requestPublish>> | undefined;
    act(() => {
      void requestPublish({ types: ["page"] }).then((r) => {
        firstResult = r;
      });
    });

    await act(async () => {
      void requestPublish({ types: ["menu"] });
      await Promise.resolve();
    });

    expect(firstResult).toEqual(
      expect.objectContaining({ opened: true, planned: false })
    );
  });

  it("close() resolves the pending promise with opened:true", async () => {
    const { result } = renderHook(() => usePublishRequest());

    let settled: Awaited<ReturnType<typeof requestPublish>> | undefined;
    act(() => {
      void requestPublish({}).then((r) => {
        settled = r;
      });
    });
    expect(result.current).not.toBeNull();

    await act(async () => {
      closePublishRequest();
      await Promise.resolve();
    });

    expect(result.current).toBeNull();
    expect(settled?.opened).toBe(true);
    expect(settled?.planned).toBe(false);
  });

  it("closing with nothing open is a no-op", () => {
    const { result } = renderHook(() => usePublishRequest());
    expect(() => closePublishRequest()).not.toThrow();
    expect(result.current).toBeNull();
  });
});
