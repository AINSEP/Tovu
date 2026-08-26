import { describe, expect, it } from "vitest";

import {
  areAnySlicesLoading,
  buildExternalMcpFieldSpecs,
  describeSaveStatus,
  resolveDialogDataTheme,
  resolveExternalMcpEffectiveAuthMode,
  resolveExternalMcpEffectiveTransport,
  validateExternalMcpOAuthIdentity,
  type SliceLoadState,
} from "../rules";
import type { SaveState } from "../../../hooks/use-settings-slice.hooks";
import { firstLoadError } from "../rules";

/**
 * @file Pure-logic coverage for `features/settings/rules.ts` — the "everything resolved" gate,
 * the first-error picker, the save-status label, and the dialog-theme mapping `SettingsUi.tsx`
 * derives from its six mounted slices. No React involved; see `SettingsUi.unit.test.tsx` for the
 * component-level tests (including the `InstructionsTab` fallback landmine).
 */

function slice(value: unknown, loadError: string | null = null): SliceLoadState {
  return { value, loadError };
}

describe("areAnySlicesLoading", () => {
  it("is false for an empty slice set", () => {
    expect(areAnySlicesLoading([])).toBe(false);
  });

  it("is false once every slice has settled (non-null value)", () => {
    expect(areAnySlicesLoading([slice("a"), slice({ theme: "dark" }), slice(0)])).toBe(false);
  });

  it("is true while any single slice is still null, regardless of position", () => {
    expect(areAnySlicesLoading([slice(null), slice("a")])).toBe(true);
    expect(areAnySlicesLoading([slice("a"), slice(null)])).toBe(true);
  });
});

describe("firstLoadError", () => {
  it("is null when no slice reports an error", () => {
    expect(firstLoadError([slice("a"), slice("b")])).toBeNull();
  });

  it("returns the first error in slice order, ignoring later ones", () => {
    const result = firstLoadError([slice("a"), slice(null, "first failure"), slice(null, "second failure")]);
    expect(result).toBe("first failure");
  });

  it("is null for an empty slice set", () => {
    expect(firstLoadError([])).toBeNull();
  });
});

describe("describeSaveStatus", () => {
  it.each<[SaveState, string]>([
    [{ status: "saving" }, "Saving…"],
    [{ status: "saved" }, "Saved"],
    [{ status: "error", message: "network down" }, "network down"],
    [{ status: "idle" }, ""],
  ])("renders %o as %j", (save, expected) => {
    expect(describeSaveStatus(save)).toBe(expected);
  });
});

describe("resolveDialogDataTheme", () => {
  it('maps "system" to undefined, so the CSS falls back to prefers-color-scheme', () => {
    expect(resolveDialogDataTheme("system")).toBeUndefined();
  });

  it("passes any concrete theme through unchanged", () => {
    expect(resolveDialogDataTheme("light")).toBe("light");
    expect(resolveDialogDataTheme("dark")).toBe("dark");
  });
});

describe("resolveExternalMcpEffectiveTransport", () => {
  it("defaults a blank/missing/unknown transport to stdio, matching the server's own default", () => {
    expect(resolveExternalMcpEffectiveTransport({})).toBe("stdio");
    expect(resolveExternalMcpEffectiveTransport({ transport: "" })).toBe("stdio");
    expect(resolveExternalMcpEffectiveTransport({ transport: "carrier-pigeon" })).toBe("stdio");
  });

  it("recognizes streamable_http", () => {
    expect(resolveExternalMcpEffectiveTransport({ transport: "streamable_http" })).toBe("streamable_http");
  });
});

describe("resolveExternalMcpEffectiveAuthMode", () => {
  it("defaults a blank/missing/unknown auth mode to static_env, matching the server's own default", () => {
    expect(resolveExternalMcpEffectiveAuthMode({})).toBe("static_env");
    expect(resolveExternalMcpEffectiveAuthMode({ authMode: "" })).toBe("static_env");
    expect(resolveExternalMcpEffectiveAuthMode({ authMode: "smoke-signal" })).toBe("static_env");
  });

  it("recognizes none and oauth", () => {
    expect(resolveExternalMcpEffectiveAuthMode({ authMode: "none" })).toBe("none");
    expect(resolveExternalMcpEffectiveAuthMode({ authMode: "oauth" })).toBe("oauth");
  });
});

describe("buildExternalMcpFieldSpecs — the reactive show/hide + required contract", () => {
  function keysOf(values: Record<string, string>): string[] {
    return buildExternalMcpFieldSpecs(values).map((spec) => spec.key);
  }
  function requiredOf(values: Record<string, string>, key: string): boolean {
    return Boolean(buildExternalMcpFieldSpecs(values).find((spec) => spec.key === key)?.required);
  }

  it("a fresh (blank) draft shows the stdio + static_env field set, with command required and url absent", () => {
    const keys = keysOf({});
    expect(keys).toContain("command");
    expect(keys).not.toContain("url");
    expect(keys).not.toContain("oauthClientId");
    expect(requiredOf({}, "command")).toBe(true);
  });

  it("switching to streamable_http hides command/args/env and requires url instead", () => {
    const values = { transport: "streamable_http" };
    const keys = keysOf(values);
    expect(keys).not.toContain("command");
    expect(keys).not.toContain("args");
    expect(keys).not.toContain("env");
    expect(keys).toContain("url");
    expect(requiredOf(values, "url")).toBe(true);
  });

  it("switching authMode to oauth reveals the OAuth fields, with grant/clientId required", () => {
    const values = { authMode: "oauth" };
    const keys = keysOf(values);
    expect(keys).toEqual(
      expect.arrayContaining([
        "oauthProviderId",
        "oauthGrant",
        "oauthClientId",
        "oauthClientSecret",
        "oauthScopes",
        "oauthAuthorizationEndpoint",
        "oauthTokenEndpoint",
        "oauthDeviceAuthorizationEndpoint",
      ]),
    );
    expect(requiredOf(values, "oauthGrant")).toBe(true);
    expect(requiredOf(values, "oauthClientId")).toBe(true);
    // Not required — a public/PKCE client legitimately has none, and the server never demands one.
    expect(requiredOf(values, "oauthClientSecret")).toBe(false);
  });

  it("the OAuth access-token env var is only required for stdio + oauth, never for a hosted transport", () => {
    expect(keysOf({ transport: "stdio", authMode: "oauth" })).toContain("oauthTokenEnvName");
    expect(requiredOf({ transport: "stdio", authMode: "oauth" }, "oauthTokenEnvName")).toBe(true);
    expect(keysOf({ transport: "streamable_http", authMode: "oauth" })).not.toContain("oauthTokenEnvName");
  });

  it("authMode static_env or none never shows any oauth-prefixed field", () => {
    for (const authMode of ["static_env", "none"]) {
      const keys = keysOf({ authMode });
      expect(keys.some((key) => key.startsWith("oauth"))).toBe(false);
    }
  });
});

describe("validateExternalMcpOAuthIdentity", () => {
  it("is null when authMode isn't oauth, regardless of what providerId/tokenEndpoint hold", () => {
    expect(validateExternalMcpOAuthIdentity({ authMode: "static_env" })).toBeNull();
    expect(validateExternalMcpOAuthIdentity({})).toBeNull();
  });

  it("flags an oauth draft with neither a provider id nor a token endpoint", () => {
    expect(validateExternalMcpOAuthIdentity({ authMode: "oauth" })).toBe(
      "Enter a Provider ID, or fill in this connection's own Token endpoint.",
    );
    expect(validateExternalMcpOAuthIdentity({ authMode: "oauth", oauthProviderId: "   " })).not.toBeNull();
  });

  it("accepts either a provider id alone or a token endpoint alone — this is an OR, not an AND", () => {
    expect(validateExternalMcpOAuthIdentity({ authMode: "oauth", oauthProviderId: "example-oidc" })).toBeNull();
    expect(validateExternalMcpOAuthIdentity({ authMode: "oauth", oauthTokenEndpoint: "https://x.example/token" })).toBeNull();
  });
});
