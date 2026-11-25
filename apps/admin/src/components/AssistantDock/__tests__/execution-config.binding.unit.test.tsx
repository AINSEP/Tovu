import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import { useExecutionConfig } from "../hooks/execution-config.hooks";

afterEach(cleanup);

it("binds credential presence to its own loader rather than the saved config read", async () => {
  const config = { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" as const };
  const port = {
    loadConfig: vi.fn(async () => config),
    loadCredential: vi.fn(async () => ({ isSet: true })),
    now: () => 0,
  };
  const { result } = renderHook(() => useExecutionConfig({}, { port }), { wrapper: FetchQueryProvider });

  await waitFor(() => expect(result.current.hasStoredAdminKey).toBe(true));
  expect(result.current.executionConfig).toEqual(config);
  expect(port.loadConfig).toHaveBeenCalledTimes(1);
  expect(port.loadCredential).toHaveBeenCalledTimes(1);
});
