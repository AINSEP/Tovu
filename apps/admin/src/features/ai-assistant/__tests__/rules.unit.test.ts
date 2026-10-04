import { describe, expect, it } from "vitest";
import type { ByokConfig } from "@jini-ai/ui";
import { ApiError, type SiteAssistantCredential } from "@/lib/api";
import {
  configuredPresetIds,
  describeApiError,
  hasStoredCredential,
  hydrateVisitorCredentialConfig,
  isPresetSuppliedEndpoint,
} from "../rules";

// Author Checklist: literal outcomes, real rules and provider library, no I/O or shared state.
// F4.3/F6.2: non-default providers distinguish protocol, endpoint and nullish fallback branches.
function config(overrides: Partial<ByokConfig> = {}): ByokConfig {
  return {
    protocol: "google", providerId: "google-gemini", apiKey: "typed-secret",
    baseUrl: "https://generativelanguage.googleapis.com", model: "current-model", ...overrides,
  };
}

function stored(overrides: Partial<SiteAssistantCredential> = {}): SiteAssistantCredential {
  return { isSet: true, masked: "••••abcd", provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "stored-model", updatedAt: null, ...overrides };
}

describe("assistant error copy", () => {
  // Removing any code-specific override must fail its literal assertion (F1.2/F4.4).
  it("names the assistant setting on forbidden writes", () => {
    expect(describeApiError(new ApiError("raw denial", 403, "FORBIDDEN"), "fallback"))
      .toBe("You do not have permission to change the AI assistant's settings.");
  });

  it.each(["ASSISTANT_SETTINGS_VALIDATION_ERROR", "SITE_CREDENTIAL_VALIDATION_ERROR"])("preserves %s details and supplies its empty-message fallback", (code) => {
    expect(describeApiError(new ApiError("Model is unavailable", 400, code), "generic fallback")).toBe("Model is unavailable");
    expect(describeApiError(new ApiError("", 400, code), "generic fallback")).toBe("That value was rejected.");
  });

  it("explains an unconfigured secret store without blaming the pasted key", () => {
    expect(describeApiError(new ApiError("operator-only detail", 503, "SECRET_STORE_UNCONFIGURED"), "fallback"))
      .toBe("The server can't store keys yet: it has no site key. Set TOVU_SITE_KEY (hex) and restart. Your key was not saved.");
  });

  it("delegates unrelated API, ordinary Error and non-Error failures", () => {
    expect(describeApiError(new ApiError("Conflict detail", 409, "CONFLICT"), "fallback")).toBe("Conflict detail");
    expect(describeApiError(new ApiError("", 500, "OTHER"), "fallback")).toBe("fallback");
    expect(describeApiError(new Error("offline"), "fallback")).toBe("offline");
    expect(describeApiError({ code: "FORBIDDEN" }, "fallback")).toBe("fallback");
    expect(describeApiError(null, "fallback")).toBe("fallback");
  });
});

describe("stored credential presence", () => {
  it("requires the server's isSet flag, even when other metadata is present", () => {
    expect(hasStoredCredential(null)).toBe(false);
    expect(hasStoredCredential(stored({ isSet: false }))).toBe(false);
    expect(hasStoredCredential(stored())).toBe(true);
  });
});

describe("automatic discovery destination gate", () => {
  // BUG, F4.4/F6.2: Azure's empty URL placeholder is not a preset-supplied destination.
  // Clearing an endpoint must not authorize automatic credential-bearing discovery.
  it.each(["", " \t\n"])("rejects a missing destination %j", (url) => {
    expect(isPresetSuppliedEndpoint(url)).toBe(false);
  });

  // A startsWith comparison would transmit a key to a suffix host or changed path (F4.4).
  it.each([
    "https://api.anthropic.com", "https://api.openai.com/v1",
    "https://generativelanguage.googleapis.com", "https://openrouter.ai/api/v1",
    "http://localhost:11434/v1",
  ])("accepts the exact preset endpoint %s, including surrounding whitespace", (url) => {
    expect(isPresetSuppliedEndpoint(url)).toBe(true);
    expect(isPresetSuppliedEndpoint(` \t${url}\n`)).toBe(true);
  });

  it.each([
    "https://api.anthropic.com.attacker.example", "https://api.openai.com/v1/other",
    "https://api.openai.com/v1/", "http://localhost:11435/v1",
    "https://api.openai.co", "https://custom.example/v1",
  ])("rejects an operator endpoint or incomplete hostname: %s", (url) => {
    expect(isPresetSuppliedEndpoint(url)).toBe(false);
  });
});

describe("configured provider chip identities", () => {
  // Returning all presets or reading the active key for every provider would fail (F1.3/F4.3).
  it("marks only complete provider-specific drafts, including keyless Ollama", () => {
    const draft = config({ model: "", savedByProviderId: {
      anthropic: { apiKey: "ant-key", baseUrl: "https://api.anthropic.com", model: "claude-model" },
      openai: { apiKey: "oai-key", baseUrl: "https://api.openai.com/v1", model: "openai-model" },
      openrouter: { apiKey: "router-key", baseUrl: "https://openrouter.ai/api/v1", model: "  " },
      ollama: { apiKey: "", baseUrl: "http://localhost:11434/v1", model: "local-model" },
    } });
    expect([...configuredPresetIds(draft)].sort()).toEqual(["anthropic", "ollama", "openai"]);
    expect(draft.model).toBe("");
  });

  it("does not mark other providers from the current provider's credentials", () => {
    expect([...configuredPresetIds(config())]).toEqual(["google-gemini"]);
  });
});

describe("visitor credential hydration", () => {
  it.each([
    ["anthropic", "https://api.anthropic.com", "anthropic"],
    ["openai", "https://openrouter.ai/api/v1", "openrouter"],
    ["azure", "https://tenant.openai.azure.com", "azure-openai"],
    ["openai", "https://unlisted.example/v1", null],
  ] as const)("restores %s / %s with the correct preset identity", (protocol, baseUrl, providerId) => {
    const current = Object.freeze(config());
    expect(hydrateVisitorCredentialConfig(current, stored({ provider: protocol, baseUrl }))).toEqual({
      protocol, providerId, apiKey: "typed-secret", baseUrl, model: "stored-model",
    });
    expect(current.protocol).toBe("google");
    expect(current.model).toBe("current-model");
  });

  it("keeps the protocol and preset for an unknown server provider while hydrating its values", () => {
    expect(hydrateVisitorCredentialConfig(config({ protocol: "anthropic", providerId: "anthropic" }), stored({ provider: "future-provider", baseUrl: "https://future.example", model: "future-model" })))
      .toEqual({ protocol: "anthropic", providerId: "anthropic", apiKey: "typed-secret", baseUrl: "https://future.example", model: "future-model" });
  });

  it("preserves current values for null stored fields but respects explicit empty strings", () => {
    expect(hydrateVisitorCredentialConfig(config({ baseUrl: "https://local.example/v1", model: "draft-model" }), stored({ provider: "google", baseUrl: null, model: null })))
      .toEqual({ protocol: "google", providerId: null, apiKey: "typed-secret", baseUrl: "https://local.example/v1", model: "draft-model" });
    expect(hydrateVisitorCredentialConfig(config(), stored({ provider: "google", baseUrl: "", model: "" })))
      .toEqual({ protocol: "google", providerId: null, apiKey: "typed-secret", baseUrl: "", model: "" });
  });
});
