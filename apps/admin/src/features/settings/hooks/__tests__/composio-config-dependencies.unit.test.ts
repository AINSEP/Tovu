import { describe, expect, it, vi } from "vitest";

/**
 * @file Coverage for `composio-config-dependencies.hooks.ts` (0/6 funcs) — `defaultComposioConfigPort`'s
 * two live `api.*` binds, plus `createFakeComposioConfigPort`'s `current` getter/`getComposioConfig`/
 * `saveComposioConfig` (including its own apiKey-or-null → configured/apiKeyTail derivation).
 */

const { getComposioConfig, saveComposioConfig } = vi.hoisted(() => ({
  getComposioConfig: vi.fn(),
  saveComposioConfig: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return { ...actual, api: { ...actual.api, getComposioConfig, saveComposioConfig } };
});

const { createFakeComposioConfigPort, defaultComposioConfigPort } = await import("../composio-config-dependencies.hooks");

describe("defaultComposioConfigPort", () => {
  it("getComposioConfig delegates to api.getComposioConfig, returning its result unchanged", async () => {
    const config = { configured: true, apiKeyTail: "1234" };
    getComposioConfig.mockResolvedValue(config);
    await expect(defaultComposioConfigPort.getComposioConfig()).resolves.toEqual(config);
    expect(getComposioConfig).toHaveBeenCalledWith();
  });

  it("saveComposioConfig forwards the apiKey (string or null) to api.saveComposioConfig", async () => {
    const config = { configured: true, apiKeyTail: "5678" };
    saveComposioConfig.mockResolvedValue(config);
    await expect(defaultComposioConfigPort.saveComposioConfig("sk-x")).resolves.toEqual(config);
    expect(saveComposioConfig).toHaveBeenCalledWith("sk-x");

    const cleared = { configured: false, apiKeyTail: "" };
    saveComposioConfig.mockResolvedValue(cleared);
    await expect(defaultComposioConfigPort.saveComposioConfig(null)).resolves.toEqual(cleared);
    expect(saveComposioConfig).toHaveBeenCalledWith(null);
  });
});

describe("createFakeComposioConfigPort", () => {
  it("defaults to unconfigured, and current reflects it", async () => {
    const port = createFakeComposioConfigPort();
    expect(port.current).toEqual({ configured: false, apiKeyTail: "" });
    await expect(port.getComposioConfig()).resolves.toEqual({ configured: false, apiKeyTail: "" });
  });

  it("seeds from options.config when provided", () => {
    const port = createFakeComposioConfigPort({ config: { configured: true, apiKeyTail: "abcd" } });
    expect(port.current).toEqual({ configured: true, apiKeyTail: "abcd" });
  });

  it("saveComposioConfig(apiKey) derives configured:true and the last-4 tail, updating current", async () => {
    const port = createFakeComposioConfigPort();
    const result = await port.saveComposioConfig("sk-live-9999");
    expect(result).toEqual({ configured: true, apiKeyTail: "9999" });
    expect(port.current).toEqual({ configured: true, apiKeyTail: "9999" });
  });

  it("saveComposioConfig(null) clears back to unconfigured", async () => {
    const port = createFakeComposioConfigPort({ config: { configured: true, apiKeyTail: "abcd" } });
    const result = await port.saveComposioConfig(null);
    expect(result).toEqual({ configured: false, apiKeyTail: "" });
    expect(port.current).toEqual({ configured: false, apiKeyTail: "" });
  });
});
