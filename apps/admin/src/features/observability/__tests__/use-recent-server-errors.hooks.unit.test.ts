import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError, type AdminServerLogs } from "@/lib/api";
import { createFakeRecentServerErrorsPort } from "../hooks/recent-server-errors-dependencies.hooks";
import { RECENT_ERRORS_LIMIT, useRecentServerErrors } from "../hooks/use-recent-server-errors.hooks";

/** @file `useRecentServerErrors` against the injected port — no fetch stub, no api spy. */

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
  it("asks for error lines only, capped, and returns rows newest first", async () => {
    const port = createFakeRecentServerErrorsPort({ logs: LOGS });
    const { result } = renderHook(() => useRecentServerErrors({ port, locale: "en", t }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(port.queries).toEqual([{ level: "error", limit: RECENT_ERRORS_LIMIT }]);
    expect(result.current.rows.map((row) => [row.key, row.source, row.message])).toEqual([
      ["2026-10-05T12:00:02.000Z-2", "daemon", "newer\n  at stack"],
      ["2026-10-05T12:00:01.000Z-1", "server", "older"],
    ]);
    expect(result.current.rows[0].when).not.toBe("2026-10-05T12:00:02.000Z");
    expect(result.current.logs).toEqual(LOGS);
    expect(result.current.error).toBeNull();
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
