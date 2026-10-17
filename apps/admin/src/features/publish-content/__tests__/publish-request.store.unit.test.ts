import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closePublishRequest, requestPublish, usePublishRequest } from "../hooks/publish-request.store";

/**
 * @file `publish-criteria-tool-webmcp-plan-2026-09-24.md` §4 S2's `publish-request.store.ts` — the
 * module-level store `App.tsx` reads to decide whether (and with what criteria) to mount
 * `PublishContentDialog`. Nothing here touches a port or a plan; see the store's own file header.
 */

describe("publish-request.store", () => {
  beforeEach(() => closePublishRequest());
  afterEach(() => closePublishRequest());

  it("uses an empty server snapshot even while a client publish request is open", async () => {
    const { result } = renderHook(() => usePublishRequest());
    let pending!: ReturnType<typeof requestPublish>;
    act(() => {
      pending = requestPublish({ types: ["page"] });
    });
    const clientRequest = result.current;
    expect(clientRequest?.criteria).toEqual({ types: ["page"] });

    function RequestState() {
      const request = usePublishRequest();
      return createElement("span", null, request === null ? "No publish request" : "Publish request open");
    }

    expect(renderToString(createElement(RequestState))).toBe("<span>No publish request</span>");
    expect(result.current).toBe(clientRequest);

    act(() => closePublishRequest());
    expect(result.current).toBeNull();
    expect(await pending).toMatchObject({ opened: true, planned: false });
  });

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

  // plan-publish-sections-2026-09-25.md §2 S2 — a section button's `requestPublish({}, scope)` must
  // carry the scope through to whoever mounts the dialog from this store, same as `criteria` already
  // does.
  it("requestPublish({}, {entityTypes:['page']}) carries the scope on the open request", () => {
    const { result } = renderHook(() => usePublishRequest());

    act(() => {
      void requestPublish({}, { entityTypes: ["page"] });
    });

    expect(result.current?.scope).toEqual({ entityTypes: ["page"] });
  });

  it("requestPublish with no scope argument leaves scope undefined, not an empty object", () => {
    const { result } = renderHook(() => usePublishRequest());

    act(() => {
      void requestPublish({ types: ["page"] });
    });

    expect(result.current?.scope).toBeUndefined();
  });
});
