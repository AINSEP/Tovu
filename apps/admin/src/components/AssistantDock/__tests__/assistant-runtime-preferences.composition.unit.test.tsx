import { afterEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@/__tests__/fetch-query-render";
import * as ledgerSlice from "@/lib/ledger-slice";
import { resetSettingsRefreshBus } from "@/lib/settings-refresh-bus";
import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES } from "../assistant-runtime-preferences";
import { useAssistantRuntimePreferencesPreference } from "../assistant-runtime-preferences.adapter";

afterEach(() => { vi.restoreAllMocks(); resetSettingsRefreshBus(); });

it("starts from the defaults and then shows what the per-person ledger stored, wired to the real port", async () => {
  const load = vi.spyOn(ledgerSlice, "loadNamespaceValues").mockResolvedValue(new Map([["preferSubagents", false]]));
  const { result } = renderHook(() => useAssistantRuntimePreferencesPreference());
  expect(result.current.preferences).toEqual(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES);
  expect(result.current.saveFailed).toBe(false);
  await waitFor(() => expect(result.current.preferences.preferSubagents).toBe(false));
  expect(load).toHaveBeenCalledWith({ namespace: expect.any(String) });
  expect(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES.preferSubagents).toBe(true);
});
