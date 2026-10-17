import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminServerLogs } from "@/lib/api";
import { createFakeRecentServerErrorsPort, defaultRecentServerErrorsPort } from "../hooks/recent-server-errors-dependencies.hooks";
import { RECENT_ERRORS_LIMIT, useRecentServerErrors, useWiredRecentServerErrors } from "../hooks/use-recent-server-errors.hooks";

/** @file Injected-port behavior and the wired hook's real API/locale composition. */

const LOGS: AdminServerLogs = {
  entries: [
    { seq: 1, at: "2026-10-05T12:00:01.000Z", level: "error", source: "server", message: "older" },
    { seq: 2, at: "2026-10-05T12:00:02.000Z", level: "error", source: "daemon", message: "newer\n  at stack" },
  ],
  matched: 2,
  buffered: 9,
  truncated: false,
  capturing: true,
};
const t = (key: string) => key;

describe("useRecentServerErrors", () => {
  it("copies the original error text through the browser clipboard", async () => {
    const copied: string[] = [];
    const priorClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { copied.push(text); } },
    });
    try {
      const text = "server failed\n  at request (/srv/app.ts:12:3)";
      await expect(defaultRecentServerErrorsPort.copyText(text)).resolves.toBe(true);
      expect(copied).toEqual([text]);
    } finally {
      if (priorClipboard) Object.defineProperty(navigator, "clipboard", priorClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("returns the fake's empty log snapshot when no logs are seeded", async () => {
    const port = createFakeRecentServerErrorsPort();
    await expect(port.getServerLogs({ level: "error", limit: 1 })).resolves.toEqual({
      entries: [], matched: 0, buffered: 0, truncated: false, capturing: true,
    });
    expect(port.queries).toEqual([{ level: "error", limit: 1 }]);
  });

  it("reports a refused copy without losing the requested diagnostic", async () => {
    const port = createFakeRecentServerErrorsPort({ copyResult: false });
    await expect(port.copyText("diagnostic")).resolves.toBe(false);
    expect(port.copied).toEqual(["diagnostic"]);
  });

  it("keeps an unformattable timestamp visible instead of dropping the row", async () => {
    const logs: AdminServerLogs = { ...LOGS, entries: [{ ...LOGS.entries[0], at: "invalid-timestamp" }], matched: 1 };
    const port = createFakeRecentServerErrorsPort({ logs });
    const { result } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({ at: "invalid-timestamp", when: "invalid-timestamp", message: "older" });
    expect(result.current.error).toBeNull();
  });

  it("composes the real logs client with the stored admin locale", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/settings/effective") && url.includes("namespace=core.language")) {
        return new Response(JSON.stringify({ data: [{ key: "locale", value: "es" }] }));
      }
      if (url.includes("/system/server-logs")) return new Response(JSON.stringify(LOGS));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result, unmount } = renderHook(() => useWiredRecentServerErrors());
      await waitFor(() => expect(result.current.logs).toEqual(LOGS));
      await waitFor(() => expect(result.current.t("Recent errors")).toBe("Errores recientes"));
      expect(result.current.rows[0]).toMatchObject({ source: "daemon", message: "newer\n  at stack" });
      const logCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/system/server-logs"));
      expect(logCalls.length).toBeGreaterThan(0);
      for (const [input] of logCalls) {
        const url = new URL(String(input), "https://admin.example");
        expect(url.pathname).toBe("/api/admin/v1/workspaces/workspace-local/system/server-logs");
        expect(Object.fromEntries(url.searchParams)).toEqual({ level: "error", limit: "50" });
      }
      expect(result.current.error).toBeNull();
      unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("asks for error lines only, capped, and returns rows newest first", async () => {
    const port = createFakeRecentServerErrorsPort({ logs: LOGS });
    const { result } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(port.queries).toEqual([{ level: "error", limit: RECENT_ERRORS_LIMIT }]);
    expect(result.current.rows.map((row) => [row.source, row.message, row.count])).toEqual([
      ["daemon", "newer\n  at stack", 1],
      ["server", "older", 1],
    ]);
    expect(result.current.rows[0].when).not.toBe("2026-10-05T12:00:02.000Z");
    expect(result.current.rows[0].at).toBe("2026-10-05T12:00:02.000Z");
    expect(result.current.rows[0].firstWhen).toBeNull();
    expect(result.current.rows[0].firstAt).toBeNull();
    expect(result.current.logs).toEqual(LOGS);
    expect(result.current.error).toBeNull();
  });

  it("groups repeats into one row with summary, shortened-path segments and copy text", async () => {
    const message = "[assistant] daemon unreachable\nTypeError: fetch failed\n    at f (/Users/me/Tovu/apps/website/src/a.ts:1:2)";
    const logs: AdminServerLogs = {
      entries: [
        { seq: 1, at: "2026-10-05T12:00:01.000Z", level: "error", source: "server", message },
        { seq: 2, at: "2026-10-05T12:00:02.000Z", level: "error", source: "server", message: "other" },
        { seq: 3, at: "2026-10-05T12:00:03.000Z", level: "error", source: "server", message },
      ],
      matched: 3,
      buffered: 3,
      truncated: false,
      capturing: true,
    };
    const port = createFakeRecentServerErrorsPort({ logs });
    const { result } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const [row, other] = result.current.rows;
    expect(result.current.rows).toHaveLength(2);
    expect(other.message).toBe("other");
    expect(row).toMatchObject({ at: "2026-10-05T12:00:03.000Z", source: "server", scope: "assistant", summary: "daemon unreachable — fetch failed", count: 2 });
    expect(row.firstWhen).not.toBeNull();
    expect(row.firstWhen).not.toBe(row.when);
    expect(row.firstAt).toBe("2026-10-05T12:00:01.000Z");
    expect(row.segments).toContainEqual({ text: "apps/website/src/a.ts:1:2", fullPath: "/Users/me/Tovu/apps/website/src/a.ts:1:2" });
    expect(row.copyText).toBe(
      `Time: 2026-10-05T12:00:03.000Z\nSource: server\nOccurrences: 2 (first 2026-10-05T12:00:01.000Z, last 2026-10-05T12:00:03.000Z)\nMessage:\n${message}`,
    );
  });

  it("hands the port to the rows as their clipboard and keeps rows stable across re-renders", async () => {
    const port = createFakeRecentServerErrorsPort({ logs: LOGS });
    const { result, rerender } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const rows = result.current.rows;
    rerender();
    expect(result.current.rows).toBe(rows);
    await expect(result.current.clipboard.copyText("x")).resolves.toBe(true);
    expect(port.copied).toEqual(["x"]);
  });

  it("starts loading with no rows while the read is pending", () => {
    const port = createFakeRecentServerErrorsPort();
    port.getServerLogs = () => new Promise(() => {});
    const { result } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));
    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual([]);
    expect(result.current.logs).toBeNull();
  });

  it("surfaces a failed read as error and stops loading", async () => {
    const port = createFakeRecentServerErrorsPort({ failWith: new ApiError("principal 'x' is not authorized for 'system.read'", 403) });
    const { result } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("not authorized for 'system.read'");
    expect(result.current.rows).toEqual([]);
  });

  it("refresh reads again", async () => {
    const port = createFakeRecentServerErrorsPort({ logs: LOGS });
    const { result } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.refresh());
    await waitFor(() => expect(port.queries).toHaveLength(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
