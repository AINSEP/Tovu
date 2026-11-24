import { afterEach, describe, expect, it, vi } from "vitest";

import { aiAssistantApi } from "@/features/ai-assistant/api/ai-assistant-api";
import { assistantDaemonProcessRestartPort, defaultAssistantDaemonRestartPort } from "../hooks/assistant-daemon-restart-dependencies.hooks";

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

it("retains malformed readiness cause behind safe HTTP wording", async () => {
  const cause = new SyntaxError("password=READY_CANARY");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 503, headers: { "content-type": "application/json" } }));
  vi.spyOn(Response.prototype, "json").mockRejectedValue(cause);
  await expect(defaultAssistantDaemonRestartPort.getReadyz()).rejects.toMatchObject({
    message: "Could not check the assistant's status (malformed response, HTTP 503).", cause,
  });
});

it.each([200, 503])("preserves meaningful readiness JSON at HTTP %s", async status => {
  const body = { ready: status === 200, assistantDaemonKnownFailed: true };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  await expect(defaultAssistantDaemonRestartPort.getReadyz()).resolves.toEqual(body);
});

describe("assistantDaemonProcessRestartPort (the engine restart hook's readiness adapter)", () => {
  it("reports failed only while the server latches a known daemon failure", async () => {
    const getReadyz = vi.spyOn(aiAssistantApi, "getAssistantDaemonReadyz").mockResolvedValue({ ready: false, assistantDaemonKnownFailed: true });
    await expect(assistantDaemonProcessRestartPort.getStatus()).resolves.toEqual({ failed: true });
    getReadyz.mockResolvedValue({ ready: true });
    await expect(assistantDaemonProcessRestartPort.getStatus()).resolves.toEqual({ failed: false });
    // `ready: false` alone is not a latched daemon failure — only the explicit flag is.
    getReadyz.mockResolvedValue({ ready: false });
    await expect(assistantDaemonProcessRestartPort.getStatus()).resolves.toEqual({ failed: false });
  });

  it("restart passes the server's own answer through unchanged", async () => {
    const result = { ok: false, reason: "shutting down" };
    vi.spyOn(aiAssistantApi, "restartAssistantDaemon").mockResolvedValue(result);
    await expect(assistantDaemonProcessRestartPort.restart()).resolves.toEqual(result);
  });
});
