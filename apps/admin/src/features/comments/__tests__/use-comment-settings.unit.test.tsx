import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { createFakeCommentSettingsPort } from "../hooks/comment-settings-dependencies.hooks";
import { useCommentSettings } from "../hooks/use-comment-settings.hooks";

/**
 * @file `useCommentSettings` — new coverage added alongside the `useWiredX` conversion
 * (`comment-settings-port.hooks.ts` / `comment-settings-dependencies.hooks.ts`). There was no
 * hook-level test file for this before — `Comments.unit.test.tsx` already exercises it end-to-end
 * through real `fetch` (mounted via `Comments`'s `SettingsSection`); this file proves the pure
 * hook is independently testable against an injected port, no `fetch` stub required.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

/** A `FormData` matching the fake's default settings exactly except for one changed field, so
 *  `buildSettingsPatch`'s diff isolates the one field under test. */
function formWithMaxDepth(maxDepth: string) {
  const form = new FormData();
  form.set("enabled", "on");
  form.set("requireModeration", "on");
  form.set("maxDepth", maxDepth);
  form.set("closeAfterDays", "");
  form.set("spamAutoRejectScore", "0.05");
  form.set("maxPerIpPerHour", "10");
  return form;
}

describe("useCommentSettings", () => {
  it("loads settings through the injected port when canConfigure is true, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeCommentSettingsPort();
      const { result } = renderHook(() => useCommentSettings(true, { port, locale: "en" }), { wrapper });

      await waitFor(() => expect(result.current.settings).not.toBeNull());
      expect(result.current.settings?.maxDepth).toBe(3);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("skips the load entirely when canConfigure is false (AC-10) — settings stay null, no error", async () => {
    const port = createFakeCommentSettingsPort();
    const { result } = renderHook(() => useCommentSettings(false, { port, locale: "en" }), { wrapper });

    // No `waitFor` to settle a load that should never start — asserting the synchronous initial
    // state is the point.
    expect(result.current.settings).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets the fallback error when the injected port's load rejects", async () => {
    const port = createFakeCommentSettingsPort({ getError: new Error("network down") });
    const { result } = renderHook(() => useCommentSettings(true, { port, locale: "en" }), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("network down");
  });

  it("save sends only the changed field through the injected port and sets settings + notice", async () => {
    const port = createFakeCommentSettingsPort();
    const { result } = renderHook(() => useCommentSettings(true, { port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.save(formWithMaxDepth("5"));
    });

    expect(port.settings.maxDepth).toBe(5);
    expect(result.current.settings?.maxDepth).toBe(5);
    expect(result.current.notice).toBe("Saved.");
  });

  it("is a no-op through the port when the client-side spamAutoRejectScore validation fails", async () => {
    const port = createFakeCommentSettingsPort();
    const { result } = renderHook(() => useCommentSettings(true, { port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    const form = formWithMaxDepth("3");
    form.set("spamAutoRejectScore", "5"); // out of the valid 0-1 range

    await act(async () => {
      await result.current.save(form);
    });

    expect(result.current.error).toBe("Spam auto-reject score must be between 0 and 1.");
    expect(port.settings.spamAutoRejectScore).toBe(0.05); // unchanged — the port was never called
  });

  it("sets the fallback error when the injected port's save rejects", async () => {
    const port = createFakeCommentSettingsPort({ putError: new Error("stale version") });
    const { result } = renderHook(() => useCommentSettings(true, { port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.save(formWithMaxDepth("5"));
    });

    expect(result.current.error).toBe("stale version");
    expect(result.current.notice).toBeNull();
  });
});
