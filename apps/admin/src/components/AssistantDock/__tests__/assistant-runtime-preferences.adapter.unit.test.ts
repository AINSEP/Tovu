import { afterEach, expect, it, vi } from "vitest";
import * as ledgerSlice from "@/lib/ledger-slice";
import { publishSettingsRefresh, resetSettingsRefreshBus } from "@/lib/settings-refresh-bus";
import { CHAT_DISPLAY_NAMESPACE } from "../chat-display-preferences";
import { assistantRuntimePreferencesPort } from "../assistant-runtime-preferences.adapter";

afterEach(() => { vi.restoreAllMocks(); resetSettingsRefreshBus(); });

it("loads runtime preferences from the chat-display ledger namespace", async () => {
  const load = vi.spyOn(ledgerSlice, "loadNamespaceValues").mockResolvedValue(new Map());
  await assistantRuntimePreferencesPort.load();
  expect(load).toHaveBeenCalledWith({ namespace: CHAT_DISPLAY_NAMESPACE });
});

it("saves only through the ledger and resolves with no value", async () => {
  const save = vi.spyOn(ledgerSlice, "saveChangedEntries").mockResolvedValue([]);
  vi.spyOn(ledgerSlice, "loadNamespaceValues").mockResolvedValue(new Map());
  const next = { ...(await assistantRuntimePreferencesPort.load()) };
  await expect(assistantRuntimePreferencesPort.save({ next, previous: next })).resolves.toBeUndefined();
  expect(save.mock.calls.every(([arg]) => arg.namespace === CHAT_DISPLAY_NAMESPACE)).toBe(true);
});

it("notifies on a global refresh or one naming the chat display namespace, ignores other scopes, and stops after unsubscribe", () => {
  const listener = vi.fn();
  const unsubscribe = assistantRuntimePreferencesPort.subscribe({ listener });
  publishSettingsRefresh();
  expect(listener).toHaveBeenCalledTimes(1);
  publishSettingsRefresh([CHAT_DISPLAY_NAMESPACE]);
  expect(listener).toHaveBeenCalledTimes(2);
  publishSettingsRefresh(["core.mail"]);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  publishSettingsRefresh();
  expect(listener).toHaveBeenCalledTimes(2);
});
