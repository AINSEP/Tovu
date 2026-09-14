import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * @file `useExecutionConfig`'s two mount loads (`loadExecutionConfig`, `loadAdminExecutionCredential`)
 * across the two failure shapes live-reproduced on 2026-09-13 (o12, headless Chromium against
 * `https://localhost:5173/admin`):
 *
 * - A dev-API restart (`tsx watch` reloading on an `apps/website` save): the Vite proxy answers a
 *   bare 500 for ~6-11s, `request()` maps it to `API_UNREACHABLE`, and the dock — mounted once for
 *   the whole session — logged an error and stayed degraded (picker on defaults, "no stored key")
 *   until a full reload, even though the API was back seconds later.
 * - A full-page navigation cutting off the in-flight loads: `request()` now rejects those as an
 *   `AbortError` (see `lib/__tests__/api-request-page-unload.unit.test.ts`), which is a cancellation,
 *   not a failure worth an error log.
 *
 * Its own file rather than `AssistantDock.hooks.unit.test.tsx`: these need fake timers for the retry
 * backoff, which that suite's `waitFor`-driven tests do not use.
 */

vi.mock("../../lib/execution-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/execution-settings")>();
  return {
    ...actual,
    loadExecutionConfig: vi.fn(),
    saveExecutionConfig: vi.fn(),
    createExecutionPort: vi.fn(),
    loadAdminExecutionCredential: vi.fn(),
  };
});
vi.mock("../../lib/settings-refresh-bus", () => ({
  publishSettingsRefresh: vi.fn(),
  subscribeToSettingsRefresh: vi.fn(() => () => {}),
}));
vi.mock("@/features/fs-files/hooks/use-folder-drop.hooks", () => ({ useFolderDrop: vi.fn() }));

import { useExecutionConfig } from "../AssistantDock/hooks/AssistantDock.hooks";
import { API_UNREACHABLE_CODE, ApiError } from "../../lib/api";
import {
  DEFAULT_EXECUTION_CONFIG,
  loadAdminExecutionCredential,
  loadExecutionConfig,
} from "../../lib/execution-settings";

const mockLoadExecutionConfig = vi.mocked(loadExecutionConfig);
const mockLoadAdminExecutionCredential = vi.mocked(loadAdminExecutionCredential);
type Credential = Awaited<ReturnType<typeof loadAdminExecutionCredential>>;

/** Exactly what `request()` throws for the dev proxy's bare 500 while the API restarts. */
function unreachable(): ApiError {
  return new ApiError("cannot reach the Tovu API (HTTP 500) — is the server running?", 500, API_UNREACHABLE_CODE, {});
}

/** Exactly what `request()` throws for a fetch cut off by the page unloading. */
function pageUnloadAbort(): DOMException {
  return new DOMException("request cancelled: the page is unloading", "AbortError");
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  mockLoadExecutionConfig.mockReset();
  mockLoadAdminExecutionCredential.mockReset();
});

afterEach(() => {
  consoleError.mockRestore();
  vi.useRealTimers();
});

async function flush(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

test("a config load that hits a restarting API retries and applies the config once it is back, without an error log", async () => {
  mockLoadExecutionConfig.mockRejectedValueOnce(unreachable()).mockResolvedValueOnce({ ...DEFAULT_EXECUTION_CONFIG, mode: "byok" });
  mockLoadAdminExecutionCredential.mockResolvedValue({ isSet: false } as Credential);

  const { result } = renderHook(() => useExecutionConfig());
  await flush(0);
  await flush(1_000);

  expect(mockLoadExecutionConfig).toHaveBeenCalledTimes(2);
  expect(result.current.executionConfig.mode).toBe("byok");
  expect(result.current.configLoaded).toBe(true);
  expect(consoleError).not.toHaveBeenCalled();
});

test("a credential load that hits a restarting API retries and reports the stored key once it is back", async () => {
  mockLoadExecutionConfig.mockResolvedValue(DEFAULT_EXECUTION_CONFIG);
  mockLoadAdminExecutionCredential.mockRejectedValueOnce(unreachable()).mockResolvedValueOnce({ isSet: true } as Credential);

  const { result } = renderHook(() => useExecutionConfig());
  await flush(0);
  await flush(1_000);

  expect(mockLoadAdminExecutionCredential).toHaveBeenCalledTimes(2);
  expect(result.current.hasStoredAdminKey).toBe(true);
  expect(consoleError).not.toHaveBeenCalled();
});

test("loads cancelled by the page unloading are not logged as failures", async () => {
  mockLoadExecutionConfig.mockRejectedValue(pageUnloadAbort());
  mockLoadAdminExecutionCredential.mockRejectedValue(pageUnloadAbort());

  const { result } = renderHook(() => useExecutionConfig());
  await flush(5_000);

  expect(consoleError).not.toHaveBeenCalled();
  expect(mockLoadExecutionConfig).toHaveBeenCalledTimes(1);
  expect(result.current.hasStoredAdminKey).toBeNull();
});

test("an API that stays down is still reported, once, after the retries give up", async () => {
  mockLoadExecutionConfig.mockRejectedValue(unreachable());
  mockLoadAdminExecutionCredential.mockResolvedValue({ isSet: false } as Credential);

  const { result } = renderHook(() => useExecutionConfig());
  await flush(0);
  expect(consoleError).not.toHaveBeenCalled();
  await flush(120_000);

  expect(mockLoadExecutionConfig.mock.calls.length).toBeGreaterThan(1);
  expect(consoleError).toHaveBeenCalledTimes(1);
  expect(consoleError).toHaveBeenCalledWith("[AssistantDock] failed to load execution config", expect.any(ApiError));
  expect(result.current.configLoaded).toBe(true);
});

test("a non-reachability failure is reported immediately, not retried", async () => {
  mockLoadExecutionConfig.mockRejectedValue(new ApiError("forbidden", 403, "FORBIDDEN", {}));
  mockLoadAdminExecutionCredential.mockResolvedValue({ isSet: false } as Credential);

  renderHook(() => useExecutionConfig());
  await flush(5_000);

  expect(mockLoadExecutionConfig).toHaveBeenCalledTimes(1);
  expect(consoleError).toHaveBeenCalledTimes(1);
});

test("unmounting during a retry wait stops retrying", async () => {
  mockLoadExecutionConfig.mockRejectedValue(unreachable());
  mockLoadAdminExecutionCredential.mockRejectedValue(unreachable());

  const { unmount } = renderHook(() => useExecutionConfig());
  await flush(0);
  unmount();
  await flush(120_000);

  expect(mockLoadExecutionConfig).toHaveBeenCalledTimes(1);
  expect(mockLoadAdminExecutionCredential).toHaveBeenCalledTimes(1);
  expect(consoleError).not.toHaveBeenCalled();
});
