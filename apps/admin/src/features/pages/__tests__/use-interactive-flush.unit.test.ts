import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INTERACTIVE_FLUSH_TIMEOUT_MS,
  useInteractiveEditorFlush,
} from "../hooks/use-interactive-flush.hooks";

/**
 * @file `useInteractiveEditorFlush` — the failure arms. Every Save, Publish, "Save anyway", tab switch
 * and template change awaits this flush, so a flush that rejects or never settles must not block any
 * of them: it resolves `undefined` (the caller falls back to the working copy it already has) and
 * says so on the console. A flush that settles after the timeout must NOT write into `html` late —
 * by then the operator may be typing in the HTML tab's textarea, and a late write would clobber it.
 */
describe("useInteractiveEditorFlush — a rejected or hanging flush never blocks its caller", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  it("resolves the flushed HTML and writes it into html", async () => {
    const setHtml = vi.fn();
    const { result } = renderHook(() => useInteractiveEditorFlush(setHtml));
    result.current.interactiveEditorRef.current = { flush: vi.fn(async () => "<p>typed</p>") };

    let flushed: string | undefined;
    await act(async () => {
      flushed = await result.current.flushInteractiveEdits();
    });

    expect(flushed).toBe("<p>typed</p>");
    expect(setHtml).toHaveBeenCalledWith("<p>typed</p>");
    expect(warn).not.toHaveBeenCalled();
  });

  it("resolves undefined with no editor mounted, without writing", async () => {
    const setHtml = vi.fn();
    const { result } = renderHook(() => useInteractiveEditorFlush(setHtml));

    await expect(result.current.flushInteractiveEdits()).resolves.toBeUndefined();
    expect(setHtml).not.toHaveBeenCalled();
  });

  it("a rejected flush resolves undefined and warns", async () => {
    const setHtml = vi.fn();
    const { result } = renderHook(() => useInteractiveEditorFlush(setHtml));
    result.current.interactiveEditorRef.current = { flush: vi.fn(async () => Promise.reject(new Error("boom"))) };

    await expect(result.current.flushInteractiveEdits()).resolves.toBeUndefined();
    expect(setHtml).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[useInteractiveEditorFlush] flush failed; saving the working copy without the open edit",
      expect.any(Error),
    );
  });

  it("a flush that never settles resolves undefined after the timeout and warns", async () => {
    const setHtml = vi.fn();
    const { result } = renderHook(() => useInteractiveEditorFlush(setHtml));
    result.current.interactiveEditorRef.current = { flush: vi.fn(() => new Promise<string>(() => {})) };

    let settled = false;
    let flushed: string | undefined = "unset";
    void result.current.flushInteractiveEdits().then((v) => {
      settled = true;
      flushed = v;
    });
    await vi.advanceTimersByTimeAsync(INTERACTIVE_FLUSH_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toBe(true);
    expect(flushed).toBeUndefined();
    expect(setHtml).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      `[useInteractiveEditorFlush] flush did not settle within ${INTERACTIVE_FLUSH_TIMEOUT_MS}ms; continuing without the open edit`,
    );
  });

  it("a flush that settles after the timeout never writes into html late", async () => {
    const setHtml = vi.fn();
    const { result } = renderHook(() => useInteractiveEditorFlush(setHtml));
    let resolveLate!: (html: string) => void;
    result.current.interactiveEditorRef.current = {
      flush: vi.fn(() => new Promise<string>((r) => (resolveLate = r))),
    };

    const pending = result.current.flushInteractiveEdits();
    await vi.advanceTimersByTimeAsync(INTERACTIVE_FLUSH_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();

    resolveLate("<p>late</p>");
    await vi.advanceTimersByTimeAsync(0);
    expect(setHtml).not.toHaveBeenCalled();
  });
});
