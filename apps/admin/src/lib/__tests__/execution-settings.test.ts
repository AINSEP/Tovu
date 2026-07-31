import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * @file The ADR-028 §6 compliance boundary this file exists to prove: the BYOK API key must NEVER
 * reach `api.setSetting` (the settings ledger's write chokepoint) — only mode/protocol/providerId/
 * baseUrl/model/maxTokens may. The key lives in `localStorage` instead. Also covers the
 * `ExecutionPort` adapter's real wiring to `api.detectExecutionAgents`/`testExecutionConnection`/
 * `listExecutionModels`, and that every port method resolves rather than throwing on failure.
 */

// `vi.mock` factories are hoisted above the top of the module — `vi.hoisted` is the escape hatch
// so the mock fns declared here can still be imported back below and asserted against per-test.
const { setSetting, getSettingsEffective, detectExecutionAgents, testExecutionConnection, listExecutionModels, FakeApiError } =
  vi.hoisted(() => {
    class FakeApiError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.status = status;
      }
    }
    return {
      setSetting: vi.fn(async (input: { key: string; valueJson: unknown }) => ({
        key: input.key,
        scope: "workspace" as const,
        value: input.valueJson,
        revisionSeq: 1,
      })),
      getSettingsEffective: vi.fn(),
      detectExecutionAgents: vi.fn(),
      testExecutionConnection: vi.fn(),
      listExecutionModels: vi.fn(),
      FakeApiError,
    };
  });

vi.mock("../api", () => ({
  api: {
    getSettingsEffective,
    setSetting,
    detectExecutionAgents,
    testExecutionConnection,
    listExecutionModels,
  },
  ApiError: FakeApiError,
}));

import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../execution-settings";
import type { ExecutionConfig } from "@jini-ai/ui";

const STORAGE_KEY = "tovu:execution-credentials:v1";

beforeEach(() => {
  window.localStorage.clear();
  setSetting.mockClear();
  getSettingsEffective.mockReset();
  detectExecutionAgents.mockReset();
  testExecutionConnection.mockReset();
  listExecutionModels.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("loadExecutionConfig", () => {
  it("falls back to defaults on a cold-start 404 (no registered definitions yet)", async () => {
    getSettingsEffective.mockRejectedValue(new FakeApiError("not found", 404));
    const config = await loadExecutionConfig();
    expect(config).toEqual(DEFAULT_EXECUTION_CONFIG);
  });

  it("re-throws a non-404 error rather than silently defaulting", async () => {
    getSettingsEffective.mockRejectedValue(new FakeApiError("server exploded", 500));
    await expect(loadExecutionConfig()).rejects.toThrow("server exploded");
  });

  it("merges ledger rows (non-secret) with the localStorage credential (apiKey)", async () => {
    getSettingsEffective.mockResolvedValue({
      data: [
        { key: "mode", value: "byok", sourceLayer: "workspace", defVersion: 1 },
        { key: "byok.protocol", value: "openai", sourceLayer: "workspace", defVersion: 1 },
        { key: "byok.providerId", value: "openai", sourceLayer: "workspace", defVersion: 1 },
        { key: "byok.baseUrl", value: "https://api.openai.com/v1", sourceLayer: "workspace", defVersion: 1 },
        { key: "byok.model", value: "gpt-4o", sourceLayer: "workspace", defVersion: 1 },
        { key: "byok.maxTokens", value: 4096, sourceLayer: "workspace", defVersion: 1 },
      ],
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: "sk-secret", savedByProviderId: {} }));

    const config = await loadExecutionConfig();
    expect(config).toEqual({
      mode: "byok",
      byok: {
        protocol: "openai",
        providerId: "openai",
        apiKey: "sk-secret",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        maxTokens: 4096,
      },
    });
  });

  it("treats the maxTokens sentinel (0) as unset", async () => {
    getSettingsEffective.mockResolvedValue({ data: [{ key: "byok.maxTokens", value: 0, sourceLayer: "workspace", defVersion: 1 }] });
    const config = await loadExecutionConfig();
    expect(config.byok.maxTokens).toBeUndefined();
  });

  it("restores savedByProviderId from localStorage", async () => {
    getSettingsEffective.mockResolvedValue({ data: [] });
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiKey: "",
        savedByProviderId: { anthropic: { apiKey: "saved-key", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" } },
      }),
    );
    const config = await loadExecutionConfig();
    expect(config.byok.savedByProviderId).toEqual({
      anthropic: { apiKey: "saved-key", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
    });
  });

  it("tolerates malformed localStorage JSON rather than throwing", async () => {
    getSettingsEffective.mockResolvedValue({ data: [] });
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const config = await loadExecutionConfig();
    expect(config.byok.apiKey).toBe("");
  });
});

describe("saveExecutionConfig — the ADR-028 §6 boundary", () => {
  it("NEVER sends apiKey to api.setSetting, on any field change", async () => {
    const previous = DEFAULT_EXECUTION_CONFIG;
    const next: ExecutionConfig = {
      ...previous,
      byok: { ...previous.byok, apiKey: "sk-super-secret", model: "claude-opus-4-5" },
    };
    await saveExecutionConfig(next, previous);

    for (const call of setSetting.mock.calls) {
      const body = call[0] as { key: string; valueJson: unknown };
      expect(body.key).not.toMatch(/apiKey/i);
      expect(JSON.stringify(body.valueJson)).not.toContain("sk-super-secret");
    }
  });

  it("writes only the ledger keys that actually changed", async () => {
    const previous = DEFAULT_EXECUTION_CONFIG;
    const next: ExecutionConfig = { ...previous, byok: { ...previous.byok, model: "claude-opus-4-5" } };
    await saveExecutionConfig(next, previous);

    expect(setSetting).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledWith({
      namespace: "core.execution",
      key: "byok.model",
      scope: "workspace",
      valueJson: "claude-opus-4-5",
    });
  });

  it("writes the maxTokens sentinel (0) to the ledger when the field is cleared to undefined", async () => {
    const previous: ExecutionConfig = { ...DEFAULT_EXECUTION_CONFIG, byok: { ...DEFAULT_EXECUTION_CONFIG.byok, maxTokens: 8192 } };
    const next: ExecutionConfig = { ...previous, byok: { ...previous.byok, maxTokens: undefined } };
    await saveExecutionConfig(next, previous);
    expect(setSetting).toHaveBeenCalledWith(
      expect.objectContaining({ key: "byok.maxTokens", valueJson: 0 }),
    );
  });

  it("persists the apiKey to localStorage, not the ledger, when only the key changes", async () => {
    const previous = DEFAULT_EXECUTION_CONFIG;
    const next: ExecutionConfig = { ...previous, byok: { ...previous.byok, apiKey: "sk-new-key" } };
    const written = await saveExecutionConfig(next, previous);

    expect(setSetting).not.toHaveBeenCalled();
    expect(written.length).toBeGreaterThan(0); // still reports "something was saved"
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.apiKey).toBe("sk-new-key");
  });

  it("persists savedByProviderId to localStorage", async () => {
    const previous = DEFAULT_EXECUTION_CONFIG;
    const next: ExecutionConfig = {
      ...previous,
      byok: {
        ...previous.byok,
        savedByProviderId: { openai: { apiKey: "sk-openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" } },
      },
    };
    await saveExecutionConfig(next, previous);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.savedByProviderId).toEqual({ openai: { apiKey: "sk-openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" } });
  });

  it("writes nothing at all when nothing changed", async () => {
    const written = await saveExecutionConfig(DEFAULT_EXECUTION_CONFIG, DEFAULT_EXECUTION_CONFIG);
    expect(setSetting).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });
});

describe("createExecutionPort", () => {
  it("detectLocalAgents delegates to api.detectExecutionAgents and unwraps .data", async () => {
    detectExecutionAgents.mockResolvedValue({ data: [{ id: "claude", label: "Claude Code", installed: true }] });
    const port = createExecutionPort();
    expect(await port.detectLocalAgents()).toEqual([{ id: "claude", label: "Claude Code", installed: true }]);
  });

  it("detectLocalAgents resolves to [] rather than throwing on a transport failure", async () => {
    detectExecutionAgents.mockRejectedValue(new FakeApiError("network down", 0));
    const port = createExecutionPort();
    await expect(port.detectLocalAgents()).resolves.toEqual([]);
  });

  it("testConnection passes protocol/baseUrl/apiKey/model through and returns the result verbatim", async () => {
    testExecutionConnection.mockResolvedValue({ ok: true, message: "Connection succeeded" });
    const port = createExecutionPort();
    const result = await port.testConnection({
      protocol: "anthropic",
      providerId: "anthropic",
      apiKey: "sk-test",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
    });
    expect(result).toEqual({ ok: true, message: "Connection succeeded" });
    expect(testExecutionConnection).toHaveBeenCalledWith({
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-test",
      model: "claude-sonnet-4-5",
    });
  });

  it("testConnection resolves ok:false rather than throwing on a transport failure", async () => {
    testExecutionConnection.mockRejectedValue(new FakeApiError("network down", 0));
    const port = createExecutionPort();
    const result = await port.testConnection({
      protocol: "anthropic",
      providerId: "anthropic",
      apiKey: "",
      baseUrl: "https://api.anthropic.com",
      model: "",
    });
    expect(result.ok).toBe(false);
  });

  it("listModels returns [] when the route reports ok:false", async () => {
    listExecutionModels.mockResolvedValue({ ok: false, models: [], message: "invalid key" });
    const port = createExecutionPort();
    const models = await port.listModels?.({
      protocol: "openai",
      providerId: "openai",
      apiKey: "bad",
      baseUrl: "https://api.openai.com/v1",
      model: "",
    });
    expect(models).toEqual([]);
  });
});
