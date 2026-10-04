import type { SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionConfig } from "@jini-ai/ui";

vi.mock("@/lib/execution-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/execution-settings")>()),
  saveExecutionConfig: vi.fn(),
}));
vi.mock("@/lib/settings-refresh-bus", () => ({ publishSettingsRefresh: vi.fn() }));

import { DEFAULT_EXECUTION_CONFIG, saveExecutionConfig } from "@/lib/execution-settings";
import { publishSettingsRefresh } from "@/lib/settings-refresh-bus";
import * as retry from "@/lib/retry-unreachable";
import { applyExecutionConfigChange, persistExecutionConfigWrite } from "../execution-config-write";

const mockSave = vi.mocked(saveExecutionConfig);

/** A `Dispatch` that runs an updater twice, as StrictMode does. */
function doubleRunningSetter(current: ExecutionConfig) {
  return vi.fn((action: SetStateAction<ExecutionConfig>) => {
    if (typeof action !== "function") return;
    action(current);
    action(current);
  });
}

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("applyExecutionConfigChange", () => {
  it("reports the change once even when the updater runs twice", () => {
    const next = { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" as const };

    const write = applyExecutionConfigChange(doubleRunningSetter(DEFAULT_EXECUTION_CONFIG), () => next);

    expect(write).toEqual({ previous: DEFAULT_EXECUTION_CONFIG, next });
  });

  it("is null when the change returns previous unchanged", () => {
    expect(applyExecutionConfigChange(doubleRunningSetter(DEFAULT_EXECUTION_CONFIG), (previous) => previous)).toBeNull();
  });
});

describe("persistExecutionConfigWrite", () => {
  const write = { previous: DEFAULT_EXECUTION_CONFIG, next: { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" as const } };

  it("saves once and publishes a core.execution refresh", async () => {
    mockSave.mockResolvedValue([]);

    persistExecutionConfigWrite(write, "[test] failed");

    await vi.waitFor(() => expect(publishSettingsRefresh).toHaveBeenCalledWith(["core.execution"]));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(write.next, write.previous);
  });

  it("logs a failed save with the given message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("write failed");
    mockSave.mockRejectedValue(failure);

    persistExecutionConfigWrite(write, "[test] failed");

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith("[test] failed", failure));
    expect(publishSettingsRefresh).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("stays quiet about a cancelled save", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const handled = vi.spyOn(retry, "isAbortError");
    mockSave.mockRejectedValue(abort);

    persistExecutionConfigWrite(write, "[test] failed");
    await vi.waitFor(() => expect(handled).toHaveBeenCalledWith(abort));

    expect(consoleError).not.toHaveBeenCalled();
    expect(publishSettingsRefresh).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
