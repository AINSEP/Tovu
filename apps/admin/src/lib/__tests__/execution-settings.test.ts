import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * @file What this file exists to prove.
 *
 * 1. The ADR-028 §6 compliance boundary: the BYOK API key must NEVER reach `api.setSetting` (the
 *    settings ledger's write chokepoint) — only mode/protocol/providerId/baseUrl/model/maxTokens
 *    may.
 * 2. The write-only server-store boundary (2026-08-05): `saveExecutionConfig` — the function the
 *    debounced settings-slice auto-save calls on every settled edit — must NEVER write the API key
 *    anywhere, not to the ledger and not to `localStorage`. Persisting it is
 *    `saveAdminExecutionCredential`'s job, reachable only from an explicit "Save key" action. This
 *    is the structural fix for the incident recorded in the 2026-08-04 handoff (a debounced
 *    auto-save encrypted a half-typed stub over a live production key).
 * 3. The legacy-`localStorage` migration helpers (`readLegacyLocalCredential`/
 *    `clearLegacyLocalCredential`) never upload or clear anything themselves — they are pure reads
 *    and an unconditional clear, with the caller responsible for sequencing (design doc §6: only
 *    clear after a CONFIRMED SUCCESSFUL server save).
 * 4. The error-reporting contract (`ADS-memory/governance/contracts/error-reporting.md`):
 *    `detectLocalAgents`/`rescanLocalAgents`/`listModels` REJECT on failure rather than resolving
 *    an empty value indistinguishable from a real empty result; `testConnection` rejects ONLY on a
 *    transport failure (a reachable-but-rejecting provider is a value, per its own doc comment).
 */

// `vi.mock` factories are hoisted above the top of the module — `vi.hoisted` is the escape hatch
// so the mock fns declared here can still be imported back below and asserted against per-test.
const {
  setSetting,
  getSettingsEffective,
  detectExecutionAgents,
  testExecutionConnection,
  testExecutionAgent,
  listExecutionModels,
  getAdminExecutionCredential,
  setAdminExecutionCredential,
  FakeApiError,
} = vi.hoisted(() => {
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
    testExecutionAgent: vi.fn(),
    listExecutionModels: vi.fn(),
    getAdminExecutionCredential: vi.fn(),
    setAdminExecutionCredential: vi.fn(),
    FakeApiError,
  };
});

vi.mock("../api", () => ({
  api: {
    getSettingsEffective,
    setSetting,
    detectExecutionAgents,
    testExecutionConnection,
    testExecutionAgent,
    listExecutionModels,
    getAdminExecutionCredential,
    setAdminExecutionCredential,
  },
  ApiError: FakeApiError,
}));

import {
  DEFAULT_EXECUTION_CONFIG,
  buildByokConfigFromLedger,
  buildLocalCliConfigFromLedger,
  clearLegacyLocalCredential,
  createExecutionPort,
  hasTypedAdminKey,
  hasUsableAdminKey,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  readByokProtocol,
  readByokProviderId,
  readExecutionMode,
  readLegacyLocalCredential,
  reconcileExecutionConfigRefresh,
  resetLocalAgentDetectionCache,
  saveAdminExecutionCredential,
  saveExecutionConfig,
  selectedLocalCliReasoning,
} from "../execution-settings";
import type { ExecutionConfig } from "@jini-ai/ui";

const LEGACY_STORAGE_KEY = "tovu:execution-credentials:v1";

beforeEach(() => {
  window.localStorage.clear();
  // Agent detection is memoised at module scope so it survives ExecutionTab
  // remounts (see `cachedDetection`). That state outlives a single `it`, so
  // every case here has to start cold or it would assert against the previous
  // case's cached agents instead of its own mock.
  resetLocalAgentDetectionCache();
  setSetting.mockClear();
  getSettingsEffective.mockReset();
  detectExecutionAgents.mockReset();
  testExecutionConnection.mockReset();
  testExecutionAgent.mockReset();
  listExecutionModels.mockReset();
  getAdminExecutionCredential.mockReset();
  setAdminExecutionCredential.mockReset();
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

  it("merges ledger rows (non-secret) into the config, and apiKey is always empty — write-only", async () => {
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

    const config = await loadExecutionConfig();
    expect(config).toEqual({
      mode: "byok",
      byok: {
        protocol: "openai",
        providerId: "openai",
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        maxTokens: 4096,
      },
      localCli: { agentId: null },
    });
  });

  it("apiKey is empty even when a legacy localStorage credential is present — never hydrated from anywhere", async () => {
    getSettingsEffective.mockResolvedValue({ data: [] });
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-secret", savedByProviderId: {} }));

    const config = await loadExecutionConfig();
    expect(config.byok.apiKey).toBe("");
  });

  it("never populates savedByProviderId — scoped out of v1", async () => {
    getSettingsEffective.mockResolvedValue({ data: [] });
    const config = await loadExecutionConfig();
    expect(config.byok.savedByProviderId).toBeUndefined();
  });

  it("restores the selected local CLI agent and its model", async () => {
    getSettingsEffective.mockResolvedValue({
      data: [
        { key: "mode", value: "local-cli", sourceLayer: "workspace", defVersion: 1 },
        { key: "localCli.agentId", value: "claude", sourceLayer: "workspace", defVersion: 1 },
        { key: "localCli.model", value: "claude-opus-5", sourceLayer: "workspace", defVersion: 1 },
      ],
    });
    const config = await loadExecutionConfig();
    expect(config.localCli).toEqual({
      agentId: "claude",
      modelByAgentId: { claude: "claude-opus-5" },
    });
  });

  it("treats an empty agentId as nothing selected rather than an agent named \"\"", async () => {
    getSettingsEffective.mockResolvedValue({
      data: [{ key: "localCli.agentId", value: "", sourceLayer: "workspace", defVersion: 1 }],
    });
    const config = await loadExecutionConfig();
    expect(config.localCli.agentId).toBeNull();
  });

  it("treats the maxTokens sentinel (0) as unset", async () => {
    getSettingsEffective.mockResolvedValue({ data: [{ key: "byok.maxTokens", value: 0, sourceLayer: "workspace", defVersion: 1 }] });
    const config = await loadExecutionConfig();
    expect(config.byok.maxTokens).toBeUndefined();
  });

  it("treats an explicit null providerId as the custom-endpoint selection, not a missing value falling back to the default", async () => {
    getSettingsEffective.mockResolvedValue({ data: [{ key: "byok.providerId", value: null, sourceLayer: "workspace", defVersion: 1 }] });
    const config = await loadExecutionConfig();
    expect(config.byok.providerId).toBeNull();
  });

  // 2026-08-20: a malformed 200 (body with no `data`) used to reach `rows.map(...)` and throw a raw
  // `Cannot read properties of undefined (reading 'map')` — surfaced live as an unlabeled swallowed
  // exception inside `AssistantDock`'s `.catch()` (every admin route mounts the dock, so any test's
  // minimal `fetch` mock that doesn't specifically cover this namespace produced it as noise). The
  // `.catch()` fallback-to-defaults behavior is deliberate and correct and must be preserved; the fix
  // is only to make the THROWN error legible before it reaches that catch.
  it("throws a named, diagnosable error (not a raw property-access TypeError) when the response body has no data", async () => {
    getSettingsEffective.mockResolvedValue({});
    const error = await loadExecutionConfig().catch((e: unknown) => e);
    expect((error as Error).message).toBe("getSettingsEffective response missing data");
  });
});

/**
 * `readExecutionMode`/`readByokProtocol`/`readByokProviderId`/`buildByokConfigFromLedger`/
 * `buildLocalCliConfigFromLedger` — pulled out of `loadExecutionConfig` (2026-08-06, complexity
 * pass, second pass) so its six inline fallback ternaries became named, independently testable
 * steps. `loadExecutionConfig`'s own describe block above already exercises every one of these
 * branches end to end (that behavior is unchanged); these tests pin each unit's own contract
 * directly, with no `api.getSettingsEffective` mock involved.
 */
describe("readExecutionMode", () => {
  it("passes through a recognized mode", () => {
    expect(readExecutionMode("byok", "local-cli")).toBe("byok");
  });
  it("falls back on anything unrecognized, including undefined", () => {
    expect(readExecutionMode(undefined, "local-cli")).toBe("local-cli");
    expect(readExecutionMode("not-a-mode", "byok")).toBe("byok");
  });
});

describe("readByokProtocol", () => {
  it("passes through each of the four recognized protocols", () => {
    for (const protocol of ["anthropic", "openai", "azure", "google"] as const) {
      expect(readByokProtocol(protocol, "anthropic")).toBe(protocol);
    }
  });
  it("falls back on an unrecognized protocol", () => {
    expect(readByokProtocol("not-a-protocol", "openai")).toBe("openai");
  });
});

describe("readByokProviderId", () => {
  it("treats explicit null as the custom-endpoint selection, not a fallback trigger", () => {
    expect(readByokProviderId(null, "anthropic")).toBeNull();
  });
  it("passes through a string providerId", () => {
    expect(readByokProviderId("openai", "anthropic")).toBe("openai");
  });
  it("falls back only on undefined/non-string, non-null values", () => {
    expect(readByokProviderId(undefined, "anthropic")).toBe("anthropic");
    expect(readByokProviderId(42, "anthropic")).toBe("anthropic");
  });
});

describe("buildByokConfigFromLedger", () => {
  it("builds every field from the ledger map, omitting maxTokens when at the unset sentinel", () => {
    const byKey = new Map<string, unknown>([
      ["byko.unused", "ignored"],
      ["byok.protocol", "openai"],
      ["byok.providerId", "openai"],
      ["byok.baseUrl", "https://api.openai.com/v1"],
      ["byok.model", "gpt-4o"],
      ["byok.maxTokens", 4096],
    ]);
    expect(buildByokConfigFromLedger(byKey, DEFAULT_EXECUTION_CONFIG)).toEqual({
      protocol: "openai",
      providerId: "openai",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      maxTokens: 4096,
    });
  });
  it("falls back to defaults field-by-field on an empty map, and omits maxTokens", () => {
    const result = buildByokConfigFromLedger(new Map(), DEFAULT_EXECUTION_CONFIG);
    expect(result).toEqual(DEFAULT_EXECUTION_CONFIG.byok);
    expect(result.maxTokens).toBeUndefined();
  });
});

describe("buildLocalCliConfigFromLedger", () => {
  it("returns agentId: null with no modelByAgentId when nothing is picked", () => {
    expect(buildLocalCliConfigFromLedger(new Map())).toEqual({ agentId: null });
  });
  it("returns the selected agent keyed into modelByAgentId when both are present", () => {
    const byKey = new Map<string, unknown>([
      ["localCli.agentId", "claude"],
      ["localCli.model", "claude-opus-5"],
    ]);
    expect(buildLocalCliConfigFromLedger(byKey)).toEqual({
      agentId: "claude",
      modelByAgentId: { claude: "claude-opus-5" },
    });
  });
  it("omits modelByAgentId when an agent is selected but has no model recorded", () => {
    const byKey = new Map<string, unknown>([["localCli.agentId", "claude"]]);
    expect(buildLocalCliConfigFromLedger(byKey)).toEqual({ agentId: "claude" });
  });

  // The reasoning-effort pick round-trips exactly like the model pick: one scalar for the
  // SELECTED agent, keyed back into the per-agent map `@jini-ai/ui` reads. Without this the
  // effort control rendered, accepted a click, and lost it on reload.
  it("returns the selected agent keyed into reasoningByAgentId when a reasoning value is stored", () => {
    const byKey = new Map<string, unknown>([
      ["localCli.agentId", "claude"],
      ["localCli.model", "claude-opus-5"],
      ["localCli.reasoning", "high"],
    ]);
    expect(buildLocalCliConfigFromLedger(byKey)).toEqual({
      agentId: "claude",
      modelByAgentId: { claude: "claude-opus-5" },
      reasoningByAgentId: { claude: "high" },
    });
  });

  it("omits reasoningByAgentId when an agent is selected but has no reasoning recorded", () => {
    const byKey = new Map<string, unknown>([
      ["localCli.agentId", "claude"],
      ["localCli.model", "claude-opus-5"],
    ]);
    expect(buildLocalCliConfigFromLedger(byKey)).toEqual({
      agentId: "claude",
      modelByAgentId: { claude: "claude-opus-5" },
    });
  });

  // A reasoning value with no agent selected has nothing to key it under, so it is dropped
  // rather than attached to whichever agent is picked next.
  it("omits reasoningByAgentId when no agent is selected at all", () => {
    expect(buildLocalCliConfigFromLedger(new Map<string, unknown>([["localCli.reasoning", "high"]]))).toEqual({
      agentId: null,
    });
  });
});

describe("selectedLocalCliReasoning", () => {
  it("returns the selected agent's own reasoning pick", () => {
    expect(
      selectedLocalCliReasoning({
        ...DEFAULT_EXECUTION_CONFIG,
        localCli: { agentId: "claude", reasoningByAgentId: { claude: "max", codex: "low" } },
      }),
    ).toBe("max");
  });

  it("returns '' when no agent is picked, or the picked agent has no reasoning entry", () => {
    expect(
      selectedLocalCliReasoning({
        ...DEFAULT_EXECUTION_CONFIG,
        localCli: { agentId: null, reasoningByAgentId: { claude: "max" } },
      }),
    ).toBe("");
    expect(
      selectedLocalCliReasoning({ ...DEFAULT_EXECUTION_CONFIG, localCli: { agentId: "codex" } }),
    ).toBe("");
  });
});

describe("saveExecutionConfig — the ADR-028 §6 boundary, and the write-only credential boundary", () => {
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

  it("a pure API-key edit writes NOTHING — no ledger call, no localStorage write, empty written-keys list", async () => {
    const previous = DEFAULT_EXECUTION_CONFIG;
    const next: ExecutionConfig = { ...previous, byok: { ...previous.byok, apiKey: "sk-new-key" } };
    const written = await saveExecutionConfig(next, previous);

    expect(setSetting).not.toHaveBeenCalled();
    expect(written).toEqual([]);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    // Also confirms the debounced ledger-slice auto-save path (which calls this function on every
    // settled edit, including a keystroke in the key field) cannot persist a typed key anywhere —
    // the structural fix for the 2026-08-04 destructive-auto-save incident.
    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
  });

  it("never writes to the legacy localStorage key, even when savedByProviderId is present on the config", async () => {
    const previous = DEFAULT_EXECUTION_CONFIG;
    const next: ExecutionConfig = {
      ...previous,
      byok: {
        ...previous.byok,
        savedByProviderId: { openai: { apiKey: "sk-openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" } },
      },
    };
    await saveExecutionConfig(next, previous);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("writes the selected local CLI agent's own model when it changes", async () => {
    const previous: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      localCli: { agentId: "claude", modelByAgentId: { claude: "claude-sonnet-4-5" } },
    };
    const next: ExecutionConfig = {
      ...previous,
      localCli: { agentId: "claude", modelByAgentId: { claude: "claude-opus-5" } },
    };
    await saveExecutionConfig(next, previous);

    expect(setSetting).toHaveBeenCalledWith(
      expect.objectContaining({ key: "localCli.model", valueJson: "claude-opus-5" }),
    );
  });

  it("the selected agent's model falls back to '' when it has no entry in modelByAgentId at all", async () => {
    const previous: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      localCli: { agentId: "claude", modelByAgentId: { claude: "claude-sonnet-4-5" } },
    };
    const next: ExecutionConfig = { ...previous, localCli: { agentId: "claude" } }; // no modelByAgentId at all
    await saveExecutionConfig(next, previous);

    expect(setSetting).toHaveBeenCalledWith(expect.objectContaining({ key: "localCli.model", valueJson: "" }));
  });

  it("writes the selected local CLI agent's own reasoning effort when it changes", async () => {
    const previous: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      localCli: { agentId: "claude", reasoningByAgentId: { claude: "medium" } },
    };
    const next: ExecutionConfig = {
      ...previous,
      localCli: { agentId: "claude", reasoningByAgentId: { claude: "max" } },
    };
    await saveExecutionConfig(next, previous);

    expect(setSetting).toHaveBeenCalledWith(
      expect.objectContaining({ key: "localCli.reasoning", valueJson: "max" }),
    );
  });

  // Reverting to "no explicit effort" has to be persisted as such, for the same reason the model
  // write is unconditional: an omitted key would leave the old value in the ledger, silently
  // un-reverting on reload.
  it("the selected agent's reasoning falls back to '' when its entry is gone", async () => {
    const previous: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      localCli: { agentId: "claude", reasoningByAgentId: { claude: "max" } },
    };
    const next: ExecutionConfig = { ...previous, localCli: { agentId: "claude" } };
    await saveExecutionConfig(next, previous);

    expect(setSetting).toHaveBeenCalledWith(expect.objectContaining({ key: "localCli.reasoning", valueJson: "" }));
  });

  it("does not write localCli.reasoning when only an unrelated field changed", async () => {
    const previous: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      localCli: { agentId: "claude", reasoningByAgentId: { claude: "max" } },
    };
    const next: ExecutionConfig = { ...previous, byok: { ...previous.byok, model: "gpt-5.5" } };
    await saveExecutionConfig(next, previous);

    expect(setSetting).not.toHaveBeenCalledWith(expect.objectContaining({ key: "localCli.reasoning" }));
  });

  it("writes nothing at all when nothing changed", async () => {
    const written = await saveExecutionConfig(DEFAULT_EXECUTION_CONFIG, DEFAULT_EXECUTION_CONFIG);
    expect(setSetting).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });
});

describe("readLegacyLocalCredential / clearLegacyLocalCredential — migration-only, read/clear never upload", () => {
  it("returns the trimmed apiKey when a legacy credential is present", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "  sk-legacy  ", savedByProviderId: {} }));
    expect(readLegacyLocalCredential()).toBe("sk-legacy");
  });

  it("returns null when nothing is stored", () => {
    expect(readLegacyLocalCredential()).toBeNull();
  });

  it("returns null for a blank/whitespace-only apiKey", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "   " }));
    expect(readLegacyLocalCredential()).toBeNull();
  });

  it("returns null (never throws) on malformed JSON", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, "{not json");
    expect(readLegacyLocalCredential()).toBeNull();
  });

  it("returns null on a non-string apiKey field", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: 12345 }));
    expect(readLegacyLocalCredential()).toBeNull();
  });

  it("clearLegacyLocalCredential removes the entry", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    clearLegacyLocalCredential();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(readLegacyLocalCredential()).toBeNull();
  });

  it("clearLegacyLocalCredential does not throw when localStorage.removeItem fails", () => {
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    try {
      expect(() => clearLegacyLocalCredential()).not.toThrow();
    } finally {
      removeSpy.mockRestore();
    }
  });
});

describe("loadAdminExecutionCredential / saveAdminExecutionCredential — the explicit server-store wrappers", () => {
  it("loadAdminExecutionCredential unwraps .data from api.getAdminExecutionCredential", async () => {
    getAdminExecutionCredential.mockResolvedValue({
      data: { isSet: true, masked: "••••abcd", protocol: "anthropic", providerId: "anthropic", baseUrl: null, model: "claude-sonnet-4-5", maxTokens: null, updatedAt: "2026-08-05T00:00:00.000Z" },
    });
    const view = await loadAdminExecutionCredential();
    expect(view.isSet).toBe(true);
    expect(view.masked).toBe("••••abcd");
  });

  it("saveAdminExecutionCredential forwards the patch verbatim and unwraps .data", async () => {
    setAdminExecutionCredential.mockResolvedValue({
      data: { isSet: true, masked: "••••wxyz", protocol: "openai", providerId: "openai", baseUrl: null, model: "gpt-4o", maxTokens: null, updatedAt: "2026-08-05T00:00:00.000Z" },
    });
    const view = await saveAdminExecutionCredential({ apiKey: "sk-new", protocol: "openai", model: "gpt-4o" });
    expect(setAdminExecutionCredential).toHaveBeenCalledWith({ apiKey: "sk-new", protocol: "openai", model: "gpt-4o" });
    expect(view.masked).toBe("••••wxyz");
  });

  it("saveAdminExecutionCredential propagates a rejection (e.g. SECRET_STORE_UNCONFIGURED) rather than swallowing it", async () => {
    setAdminExecutionCredential.mockRejectedValue(new FakeApiError("no master key", 503));
    await expect(saveAdminExecutionCredential({ apiKey: "sk-new" })).rejects.toThrow("no master key");
  });

  // Same class of fix as `loadExecutionConfig`'s own malformed-response test above — see that
  // test's comment for the live symptom this replaces (there: `Cannot read properties of undefined
  // (reading 'isSet')`, surfaced from AssistantDock's own stored-credential read).
  it("loadAdminExecutionCredential throws a named, diagnosable error when the response body has no data", async () => {
    getAdminExecutionCredential.mockResolvedValue({});
    const error = await loadAdminExecutionCredential().catch((e: unknown) => e);
    expect((error as Error).message).toBe("getAdminExecutionCredential response missing data");
  });

  it("saveAdminExecutionCredential throws a named, diagnosable error when the response body has no data", async () => {
    setAdminExecutionCredential.mockResolvedValue({});
    const error = await saveAdminExecutionCredential({ apiKey: "sk-new" }).catch((e: unknown) => e);
    expect((error as Error).message).toBe("setAdminExecutionCredential response missing data");
  });
});

describe("reconcileExecutionConfigRefresh — the 2026-08-05 autosave key-wipe fix", () => {
  const loaded: ExecutionConfig = {
    mode: "byok",
    byok: { protocol: "anthropic", providerId: "anthropic", apiKey: "", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
    localCli: { agentId: null },
  };

  it("preserves the operator's in-memory apiKey instead of the reload's always-empty one", () => {
    const current: ExecutionConfig = { ...loaded, byok: { ...loaded.byok, apiKey: "sk-typed-not-yet-saved" } };
    const result = reconcileExecutionConfigRefresh(current, loaded);
    expect(result.byok.apiKey).toBe("sk-typed-not-yet-saved");
  });

  it("takes every OTHER field from the reload, not the operator's stale in-memory copy", () => {
    const current: ExecutionConfig = {
      mode: "local-cli",
      byok: { ...loaded.byok, apiKey: "sk-typed", model: "stale-model" },
      localCli: { agentId: "claude" },
    };
    const result = reconcileExecutionConfigRefresh(current, loaded);
    expect(result.mode).toBe(loaded.mode);
    expect(result.byok.model).toBe(loaded.byok.model);
    expect(result.localCli).toEqual(loaded.localCli);
  });

  it("is a no-op when nothing is typed — an empty apiKey reconciles to an empty apiKey", () => {
    const current: ExecutionConfig = { ...loaded, byok: { ...loaded.byok, apiKey: "" } };
    expect(reconcileExecutionConfigRefresh(current, loaded).byok.apiKey).toBe("");
  });
});

describe("hasUsableAdminKey", () => {
  it("is true when a non-empty apiKey is typed, regardless of stored state", () => {
    expect(hasUsableAdminKey("sk-typed", null)).toBe(true);
    expect(hasUsableAdminKey("sk-typed", { isSet: false })).toBe(true);
  });

  it("is true when nothing is typed but the server has a credential stored", () => {
    expect(hasUsableAdminKey("", { isSet: true })).toBe(true);
    expect(hasUsableAdminKey("   ", { isSet: true })).toBe(true);
  });

  it("is false when nothing is typed and nothing is stored", () => {
    expect(hasUsableAdminKey("", null)).toBe(false);
    expect(hasUsableAdminKey("", { isSet: false })).toBe(false);
  });
});

describe("hasTypedAdminKey", () => {
  // The narrower "is there anything to WRITE" rule behind the Save key button. Asserted next to
  // hasUsableAdminKey deliberately: the pair only makes sense as a contrast, and the one row where
  // they DISAGREE is the whole reason both exist.
  it("is true only for a non-whitespace field value", () => {
    expect(hasTypedAdminKey("sk-typed")).toBe(true);
    expect(hasTypedAdminKey("  sk-padded  ")).toBe(true);
  });

  it("treats an empty field and a whitespace-only field alike as blank", () => {
    expect(hasTypedAdminKey("")).toBe(false);
    expect(hasTypedAdminKey("   ")).toBe(false);
    expect(hasTypedAdminKey("\t\n ")).toBe(false);
  });

  it("ignores stored state entirely — the row where it must disagree with hasUsableAdminKey", () => {
    // The reported bug in one assertion. A stored key makes the credential USABLE, so the dock's
    // apiModeAvailable is right to say yes; it does not make an empty field WRITABLE, so Save key
    // must say no. Collapsing these two back into one predicate re-opens the bug.
    expect(hasUsableAdminKey("", { isSet: true })).toBe(true);
    expect(hasTypedAdminKey("")).toBe(false);
  });
});

describe("createExecutionPort", () => {
  it("detectLocalAgents delegates to api.detectExecutionAgents and unwraps .data", async () => {
    detectExecutionAgents.mockResolvedValue({ data: [{ id: "claude", label: "Claude Code", installed: true }] });
    const port = createExecutionPort();
    expect(await port.detectLocalAgents()).toEqual([{ id: "claude", label: "Claude Code", installed: true }]);
  });

  it("detectLocalAgents REJECTS on a transport failure — an empty array must stay reserved for a real zero-agents result", async () => {
    detectExecutionAgents.mockRejectedValue(new FakeApiError("network down", 0));
    const port = createExecutionPort();
    await expect(port.detectLocalAgents()).rejects.toThrow("network down");
  });

  // Same class of fix as `loadExecutionConfig`'s malformed-response test — see that test's comment.
  // The error-reporting contract this describe block's header documents (`detectLocalAgents` must
  // REJECT on any failure) is unchanged by this fix: a malformed body still rejects, just with a
  // legible message instead of a raw property-access TypeError.
  it("detectLocalAgents throws a named, diagnosable error when the response body has no data", async () => {
    detectExecutionAgents.mockResolvedValue({});
    const port = createExecutionPort();
    const error = await port.detectLocalAgents().catch((e: unknown) => e);
    expect((error as Error).message).toBe("detectExecutionAgents response missing data");
  });

  it("rescanLocalAgents REJECTS on a transport failure, same as detectLocalAgents", async () => {
    detectExecutionAgents.mockRejectedValue(new FakeApiError("daemon unreachable", 0));
    const port = createExecutionPort();
    await expect(port.rescanLocalAgents?.()).rejects.toThrow("daemon unreachable");
  });

  /**
   * Detection spawns every known CLI with `--version` server-side, and the
   * settings shell unmounts a tab's panel the moment you switch away from it.
   * These four pin the memoisation that keeps a tab revisit from re-paying
   * that cost — and, just as importantly, pin the two cases that must still
   * hit the wire.
   */
  it("detectLocalAgents probes once across repeated calls and separate port instances (a tab revisit must not re-scan)", async () => {
    detectExecutionAgents.mockResolvedValue({ data: [{ id: "claude", label: "Claude Code", installed: true }] });

    const first = await createExecutionPort().detectLocalAgents();
    // A new port object is exactly what `SettingsUi`'s `useRef(createExecutionPort())`
    // produces on remount, so the cache has to survive it.
    const second = await createExecutionPort().detectLocalAgents();

    expect(detectExecutionAgents).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("detectLocalAgents shares one in-flight request between concurrent callers", async () => {
    detectExecutionAgents.mockResolvedValue({ data: [{ id: "codex", label: "Codex CLI", installed: true }] });
    const port = createExecutionPort();

    await Promise.all([port.detectLocalAgents(), port.detectLocalAgents()]);

    expect(detectExecutionAgents).toHaveBeenCalledTimes(1);
  });

  it("does not cache a rejection — a retry after a network blip re-probes instead of replaying the error", async () => {
    detectExecutionAgents.mockRejectedValueOnce(new FakeApiError("network down", 0));
    detectExecutionAgents.mockResolvedValue({ data: [{ id: "claude", label: "Claude Code", installed: true }] });
    const port = createExecutionPort();

    await expect(port.detectLocalAgents()).rejects.toThrow("network down");
    expect(await port.detectLocalAgents()).toEqual([{ id: "claude", label: "Claude Code", installed: true }]);
    expect(detectExecutionAgents).toHaveBeenCalledTimes(2);
  });

  it("rescanLocalAgents bypasses the cache and its fresh result becomes the baseline for later mounts", async () => {
    detectExecutionAgents.mockResolvedValueOnce({ data: [{ id: "claude", label: "Claude Code", installed: true }] });
    const port = createExecutionPort();
    await port.detectLocalAgents();

    detectExecutionAgents.mockResolvedValue({
      data: [
        { id: "claude", label: "Claude Code", installed: true },
        { id: "codex", label: "Codex CLI", installed: true },
      ],
    });
    const rescanned = await port.rescanLocalAgents?.();
    expect(detectExecutionAgents).toHaveBeenCalledTimes(2);
    expect(rescanned).toHaveLength(2);

    // A newly-installed CLI found by Rescan must not be forgotten the next
    // time the tab mounts — otherwise the cache would undo the rescan.
    expect(await createExecutionPort().detectLocalAgents()).toHaveLength(2);
    expect(detectExecutionAgents).toHaveBeenCalledTimes(2);
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

  it("testConnection REJECTS on a transport failure (no provider-side answer to report as a value)", async () => {
    testExecutionConnection.mockRejectedValue(new FakeApiError("network down", 0));
    const port = createExecutionPort();
    await expect(
      port.testConnection({
        protocol: "anthropic",
        providerId: "anthropic",
        apiKey: "",
        baseUrl: "https://api.anthropic.com",
        model: "",
      }),
    ).rejects.toThrow("network down");
  });

  it("testConnection resolves {ok:false} as a VALUE when the route reached the provider and it rejected — this is the documented domain-outcome exception, not a bug", async () => {
    testExecutionConnection.mockResolvedValue({ ok: false, message: "Unauthorized" });
    const port = createExecutionPort();
    const result = await port.testConnection({
      protocol: "anthropic",
      providerId: "anthropic",
      apiKey: "bad-key",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
    });
    expect(result).toEqual({ ok: false, message: "Unauthorized" });
  });

  it("listModels REJECTS when the route reports ok:false — an empty array must stay reserved for a real zero-models result", async () => {
    listExecutionModels.mockResolvedValue({ ok: false, models: [], message: "invalid key" });
    const port = createExecutionPort();
    await expect(
      port.listModels?.({
        protocol: "openai",
        providerId: "openai",
        apiKey: "bad",
        baseUrl: "https://api.openai.com/v1",
        model: "",
      }),
    ).rejects.toThrow("invalid key");
  });

  it("listModels REJECTS with the generic fallback message when the route reports ok:false with no usable message", async () => {
    listExecutionModels.mockResolvedValue({ ok: false, models: [], message: "   " });
    const port = createExecutionPort();
    await expect(
      port.listModels?.({ protocol: "openai", providerId: "openai", apiKey: "bad", baseUrl: "https://api.openai.com/v1", model: "" }),
    ).rejects.toThrow("Model discovery failed");
  });

  it("listModels resolves the real list on success", async () => {
    listExecutionModels.mockResolvedValue({ ok: true, models: ["gpt-4o", "gpt-4o-mini"] });
    const port = createExecutionPort();
    const models = await port.listModels?.({
      protocol: "openai",
      providerId: "openai",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "",
    });
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("listModels REJECTS on a transport failure too", async () => {
    listExecutionModels.mockRejectedValue(new FakeApiError("network down", 0));
    const port = createExecutionPort();
    await expect(
      port.listModels?.({
        protocol: "openai",
        providerId: "openai",
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        model: "",
      }),
    ).rejects.toThrow("network down");
  });

  it("testConnection asks the server to use the stored site credential when useStoredCredential is on", async () => {
    testExecutionConnection.mockResolvedValue({ ok: true, message: "Connection succeeded" });
    const port = createExecutionPort({ useStoredCredential: true });
    await port.testConnection({ protocol: "anthropic", providerId: "anthropic", apiKey: "", baseUrl: "", model: "" });

    expect(testExecutionConnection).toHaveBeenCalledWith(expect.objectContaining({ useStoredCredential: true }));
  });

  it("testConnection omits useStoredCredential entirely by default (Settings -> Execution mode's own admin key must never be crossed)", async () => {
    testExecutionConnection.mockResolvedValue({ ok: true, message: "ok" });
    const port = createExecutionPort();
    await port.testConnection({ protocol: "anthropic", providerId: "anthropic", apiKey: "sk", baseUrl: "", model: "" });

    expect(testExecutionConnection).toHaveBeenCalledWith(expect.not.objectContaining({ useStoredCredential: expect.anything() }));
  });

  it("listModels asks the server to use the stored site credential when useStoredCredential is on", async () => {
    listExecutionModels.mockResolvedValue({ ok: true, models: [] });
    const port = createExecutionPort({ useStoredCredential: true });
    await port.listModels?.({ protocol: "openai", providerId: "openai", apiKey: "", baseUrl: "", model: "" });

    expect(listExecutionModels).toHaveBeenCalledWith(expect.objectContaining({ useStoredCredential: true }));
  });

  it("listModels asks the server to use the ADMIN's own stored credential when useAdminStoredCredential is on", async () => {
    // The regression this guards: the admin's own BYOK key moved server-side and write-only
    // (2026-08-05), so `ExecutionTab`'s discovery effect was sending the empty browser field and the
    // provider answered "No API key — model discovery needs the key from this browser". The visible
    // symptom was the admin BYOK panel rendering a free-text Model box while the visitor panel beside
    // it showed a live picker from the SAME component.
    listExecutionModels.mockResolvedValue({ ok: true, models: ["gemini-3.6-flash"] });
    const port = createExecutionPort({ useAdminStoredCredential: true });
    await port.listModels?.({ protocol: "google", providerId: "google-gemini", apiKey: "", baseUrl: "", model: "" });

    expect(listExecutionModels).toHaveBeenCalledWith(expect.objectContaining({ useAdminStoredCredential: true }));
  });

  it("useAdminStoredCredential does NOT imply useStoredCredential — the site's visitor key is a different row", async () => {
    // Two stored credentials, two flags. If these ever collapse into one, the admin screens start
    // probing (and discovering models for) the visitor credential — the boundary ADR-058 §5 makes
    // structural. See `server/.../assistant/stored-credential-probe.ts`'s header.
    listExecutionModels.mockResolvedValue({ ok: true, models: [] });
    const port = createExecutionPort({ useAdminStoredCredential: true });
    await port.listModels?.({ protocol: "google", providerId: "google-gemini", apiKey: "", baseUrl: "", model: "" });

    expect(listExecutionModels).toHaveBeenCalledWith(expect.not.objectContaining({ useStoredCredential: expect.anything() }));
  });

  it("testConnection carries useAdminStoredCredential too, so both probes on the admin screens speak for the same key", async () => {
    testExecutionConnection.mockResolvedValue({ ok: true, message: "ok" });
    const port = createExecutionPort({ useAdminStoredCredential: true });
    await port.testConnection({ protocol: "google", providerId: "google-gemini", apiKey: "", baseUrl: "", model: "m" });

    expect(testExecutionConnection).toHaveBeenCalledWith(expect.objectContaining({ useAdminStoredCredential: true }));
  });

  it("omits useAdminStoredCredential entirely by default — no existing caller's request body changes", async () => {
    listExecutionModels.mockResolvedValue({ ok: true, models: [] });
    const port = createExecutionPort();
    await port.listModels?.({ protocol: "openai", providerId: "openai", apiKey: "sk", baseUrl: "", model: "" });

    expect(listExecutionModels).toHaveBeenCalledWith(expect.not.objectContaining({ useAdminStoredCredential: expect.anything() }));
  });

  it("testAgent passes agentId and, when given, model through and returns the result verbatim", async () => {
    testExecutionAgent.mockResolvedValue({ ok: true, message: "Claude Code is usable" });
    const port = createExecutionPort();

    const result = await port.testAgent?.("claude", "claude-opus-5");

    expect(result).toEqual({ ok: true, message: "Claude Code is usable" });
    expect(testExecutionAgent).toHaveBeenCalledWith({ agentId: "claude", model: "claude-opus-5" });
  });

  it("testAgent omits model entirely when none is given, rather than sending an empty string", async () => {
    testExecutionAgent.mockResolvedValue({ ok: true, message: "usable" });
    const port = createExecutionPort();

    await port.testAgent?.("codex");

    expect(testExecutionAgent).toHaveBeenCalledWith({ agentId: "codex" });
  });

  it("testAgent REJECTS on a transport failure — the probe could not run at all", async () => {
    testExecutionAgent.mockRejectedValue(new FakeApiError("daemon unreachable", 0));
    const port = createExecutionPort();

    await expect(port.testAgent?.("claude")).rejects.toThrow("daemon unreachable");
  });

  it("testAgent resolves {ok:false} as a VALUE when the CLI ran and reported it is not usable", async () => {
    testExecutionAgent.mockResolvedValue({ ok: false, message: "not installed" });
    const port = createExecutionPort();

    const result = await port.testAgent?.("claude");

    expect(result).toEqual({ ok: false, message: "not installed" });
  });

  it("a rejection settling after a newer detection has already replaced it in the cache does not clear the newer one", async () => {
    let rejectFirst!: (error: unknown) => void;
    detectExecutionAgents.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFirst = reject; }),
    );
    const port = createExecutionPort();
    const firstCall = port.detectLocalAgents().catch(() => {}); // starts the first (never-yet-settled) probe

    // A rescan starts a NEW in-flight promise and becomes the cache's current entry before the
    // first one has settled — `cacheDetection`'s own `if (cachedDetection === inFlight)` guard is
    // what this test pins: the stale rejection below must not stomp the newer promise out.
    detectExecutionAgents.mockResolvedValueOnce({ data: [{ id: "claude", label: "Claude Code", installed: true }] });
    const rescanned = port.rescanLocalAgents?.();

    rejectFirst(new FakeApiError("stale network blip", 0));
    await firstCall;
    await rescanned;

    expect(await port.detectLocalAgents()).toEqual([{ id: "claude", label: "Claude Code", installed: true }]);
    expect(detectExecutionAgents).toHaveBeenCalledTimes(2); // the rescan, not a third re-probe
  });
});
