import { afterEach, describe, expect, it, vi } from "vitest";

import { aiAssistantApi } from "@/features/ai-assistant/api/ai-assistant-api";
import { defaultAssistantDaemonRestartPort } from "../hooks/assistant-daemon-restart-dependencies.hooks";

afterEach(() => vi.restoreAllMocks());

describe("defaultAssistantDaemonRestartPort", () => {
  it("restart delegates to the restart API, returning its result unchanged", async () => {
    const result = { ok: false, reason: "shutting down" };
    const restart = vi.spyOn(aiAssistantApi, "restartAssistantDaemon").mockResolvedValue(result);
    const getReadyz = vi.spyOn(aiAssistantApi, "getAssistantDaemonReadyz").mockResolvedValue({ ready: true });

    await expect(defaultAssistantDaemonRestartPort.restart()).resolves.toEqual(result);
    expect(restart).toHaveBeenCalledExactlyOnceWith();
    expect(getReadyz).not.toHaveBeenCalled();
  });

  it("getReadyz delegates to the status API, returning its result unchanged", async () => {
    const result = { ready: false, assistantDaemonKnownFailed: true as const };
    const getReadyz = vi.spyOn(aiAssistantApi, "getAssistantDaemonReadyz").mockResolvedValue(result);
    const restart = vi.spyOn(aiAssistantApi, "restartAssistantDaemon").mockResolvedValue({ ok: true });

    await expect(defaultAssistantDaemonRestartPort.getReadyz()).resolves.toEqual(result);
    expect(getReadyz).toHaveBeenCalledExactlyOnceWith();
    expect(restart).not.toHaveBeenCalled();
  });
});
