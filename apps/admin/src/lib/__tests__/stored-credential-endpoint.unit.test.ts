import { describe, expect, it } from "vitest";

import { ApiError, type AdminExecutionCredential } from "../api";
import {
  STORED_KEY_NO_ENDPOINT_COPY,
  STORED_KEY_OTHER_PROVIDER_COPY,
  describeProbeError,
  hasUsableKey,
  storedKeyBlocksProbe,
  storedKeyIsForOtherEndpoint,
} from "../stored-credential-endpoint";

/**
 * @file The stored-key endpoint rules, shared by the visitor key screen and the admin's own key screen.
 * The visitor screen's behavior through these rules is covered in
 * `features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts`. This file pins the rules
 * against the ADMIN credential's view shape, the second caller, and the server's exact admin-branch text.
 */

const GOOGLE = "https://generativelanguage.googleapis.com";
const OPENAI = "https://api.openai.com/v1";

function adminView(overrides: Partial<AdminExecutionCredential> = {}): AdminExecutionCredential {
  return {
    isSet: true,
    masked: "••••mw4w",
    protocol: "google",
    providerId: "google",
    baseUrl: GOOGLE,
    model: "gemini-flash-latest",
    maxTokens: null,
    updatedAt: "2026-09-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("storedKeyIsForOtherEndpoint — admin credential view", () => {
  it("is true only when a key is stored for a different endpoint than the form's", () => {
    expect(storedKeyIsForOtherEndpoint(adminView(), OPENAI)).toBe(true);
    expect(storedKeyIsForOtherEndpoint(adminView(), GOOGLE)).toBe(false);
    expect(storedKeyIsForOtherEndpoint(adminView({ isSet: false }), OPENAI)).toBe(false);
    expect(storedKeyIsForOtherEndpoint(null, OPENAI)).toBe(false);
  });

  it("treats an unknown stored endpoint as not provably another one", () => {
    expect(storedKeyIsForOtherEndpoint(adminView({ baseUrl: null }), OPENAI)).toBe(false);
    expect(storedKeyIsForOtherEndpoint(adminView({ baseUrl: "   " }), OPENAI)).toBe(false);
  });
});

describe("storedKeyBlocksProbe", () => {
  it.each([
    { name: "nothing typed, key stored for another endpoint", apiKey: "", stored: adminView(), baseUrl: OPENAI, blocked: true },
    { name: "whitespace typed counts as nothing", apiKey: "   ", stored: adminView(), baseUrl: OPENAI, blocked: true },
    { name: "a typed key goes to the form's endpoint", apiKey: "sk-typed", stored: adminView(), baseUrl: OPENAI, blocked: false },
    { name: "the stored key at its own endpoint", apiKey: "", stored: adminView(), baseUrl: GOOGLE, blocked: false },
    { name: "nothing stored", apiKey: "", stored: adminView({ isSet: false }), baseUrl: OPENAI, blocked: false },
    { name: "stored key with no saved endpoint (the server answers)", apiKey: "", stored: adminView({ baseUrl: null }), baseUrl: OPENAI, blocked: false },
    { name: "not hydrated yet (the server answers)", apiKey: "", stored: null, baseUrl: OPENAI, blocked: false },
  ])("$name -> blocked=$blocked", ({ apiKey, stored, baseUrl, blocked }) => {
    expect(storedKeyBlocksProbe(apiKey, stored, baseUrl)).toBe(blocked);
  });

  it("is exactly the case hasUsableKey rules out for a stored key", () => {
    // The two must never both say "go": a blocked probe has no usable key.
    expect(storedKeyBlocksProbe("", adminView(), OPENAI)).toBe(true);
    expect(hasUsableKey("", adminView(), OPENAI)).toBe(false);
    expect(hasUsableKey("", adminView(), GOOGLE)).toBe(true);
  });
});

describe("describeProbeError — the admin branch's endpoint-pin text", () => {
  it("replaces the server's MISMATCH refusal (owner screenshot 29) with the plain ask", () => {
    const refusal = new ApiError(
      `the admin execution credential is saved for '${GOOGLE}' and cannot be probed against '${OPENAI}' — save the new endpoint first, or supply an apiKey for it in this request`,
      400,
      "STORED_CREDENTIAL_ENDPOINT_MISMATCH",
    );
    expect(describeProbeError(refusal, "fallback")).toBe(STORED_KEY_OTHER_PROVIDER_COPY);
  });

  it("replaces the server's UNSET refusal with plain language", () => {
    const refusal = new ApiError(
      "the admin execution credential has no saved endpoint, so this probe has no approved destination — save a base URL for the credential first, or supply an apiKey in this request",
      400,
      "STORED_CREDENTIAL_ENDPOINT_UNSET",
    );
    expect(describeProbeError(refusal, "fallback")).toBe(STORED_KEY_NO_ENDPOINT_COPY);
  });

  it("keeps any other error's own message, and the fallback for a non-Error", () => {
    expect(describeProbeError(new Error("API key not valid"), "fallback")).toBe("API key not valid");
    expect(describeProbeError("boom", "fallback")).toBe("fallback");
  });
});
