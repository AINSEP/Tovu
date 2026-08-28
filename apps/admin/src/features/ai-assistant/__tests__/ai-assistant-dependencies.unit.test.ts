import { describe, expect, it, vi } from "vitest";

import type { PublicAssistantSettings } from "@/lib/api";

/**
 * @file Coverage for `ai-assistant-dependencies.hooks.ts` (2/6 funcs) —
 * `defaultAiAssistantPort`'s two live `api.*` binds and `createFakeAiAssistantPort`'s
 * current getter / get-wrapped-in-data / patch-merge-set.
 */

const { getAssistantSettings, setAssistantSettings } = vi.hoisted(() => ({
  getAssistantSettings: vi.fn(),
  setAssistantSettings: vi.fn(),
}));

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return { ...actual, api: { ...actual.api, getAssistantSettings, setAssistantSettings } };
});

const { createFakeAiAssistantPort, defaultAiAssistantPort } = await import("../hooks/ai-assistant-dependencies.hooks");

describe("defaultAiAssistantPort", () => {
  it("getAssistantSettings delegates to api.getAssistantSettings, returning its result unchanged", async () => {
    const result = { data: { publicEnabled: true } as PublicAssistantSettings };
    getAssistantSettings.mockResolvedValue(result);
    await expect(defaultAiAssistantPort.getAssistantSettings()).resolves.toEqual(result);
    expect(getAssistantSettings).toHaveBeenCalledWith();
  });

  it("setAssistantSettings forwards the patch to api.setAssistantSettings", async () => {
    const result = { data: { publicEnabled: false } as PublicAssistantSettings };
    setAssistantSettings.mockResolvedValue(result);
    await expect(defaultAiAssistantPort.setAssistantSettings({ publicEnabled: false })).resolves.toEqual(result);
    expect(setAssistantSettings).toHaveBeenCalledWith({ publicEnabled: false });
  });
});

describe("createFakeAiAssistantPort", () => {
  it("defaults to publicEnabled:false, and current reflects it", async () => {
    const port = createFakeAiAssistantPort();
    expect(port.current).toEqual({ publicEnabled: false });
    await expect(port.getAssistantSettings()).resolves.toEqual({ data: { publicEnabled: false } });
  });

  it("seeds from options.settings when provided", () => {
    const port = createFakeAiAssistantPort({ settings: { publicEnabled: true } });
    expect(port.current).toEqual({ publicEnabled: true });
  });

  it("setAssistantSettings merges the patch and updates current", async () => {
    const port = createFakeAiAssistantPort({ settings: { publicEnabled: false } });
    const result = await port.setAssistantSettings({ publicEnabled: true });
    expect(result).toEqual({ data: { publicEnabled: true } });
    expect(port.current).toEqual({ publicEnabled: true });
  });
});
