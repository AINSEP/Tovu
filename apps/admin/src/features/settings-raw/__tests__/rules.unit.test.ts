import { describe, expect, it } from "vitest";

import { ApiError, type SettingResolvedValue } from "../../../lib/api";
import {
  buildDetail,
  buildNamespaceGroups,
  computeEditableScopes,
  describeApiError,
  formatValue,
  keyOf,
  layerStates,
  parseJsonInput,
  resolveSelectedDetail,
  selectedNamespaceAndKey,
  toSummary,
} from "../rules";

/**
 * @file Pure-logic coverage for `features/settings-raw/rules.ts` (SPEC-007 `ui.spec.md`) — the
 * raw namespace/key ledger browser's key-joining, per-layer detail derivation, permission
 * derivation, and value formatting/parsing. `Settings.unit.test.tsx` covers the two
 * permission-gating regressions at the component level; this file targets the underlying
 * functions directly, including `describeApiError`'s per-code dispatch table (12.1% covered
 * before this pass — none of its branches were reachable through the component test alone).
 */

function row(overrides: Partial<SettingResolvedValue> = {}): SettingResolvedValue {
  return {
    key: "siteName",
    value: "Tovu",
    sourceLayer: "default",
    defVersion: 1,
    ...overrides,
  } as SettingResolvedValue;
}

describe("keyOf", () => {
  it("joins namespace and key with the double-colon separator", () => {
    expect(keyOf("core.presentation", "activeThemeId")).toBe("core.presentation::activeThemeId");
  });
});

describe("toSummary", () => {
  it("builds a SettingSummary from a namespace + effective row", () => {
    const summary = toSummary({ namespace: "core.presentation", row: row({ key: "activeThemeId", value: "signal", sourceLayer: "workspace", defVersion: 3 }) });
    expect(summary).toEqual({
      namespace: "core.presentation",
      key: "activeThemeId",
      effectiveValue: "signal",
      sourceLayer: "workspace",
      status: "active",
      defVersion: 3,
    });
  });
});

describe("selectedNamespaceAndKey", () => {
  it("returns null when nothing is selected", () => {
    expect(selectedNamespaceAndKey(null)).toBeNull();
  });

  it("splits a keyOf-joined string back into its parts", () => {
    expect(selectedNamespaceAndKey("core.presentation::activeThemeId")).toEqual({
      namespace: "core.presentation",
      key: "activeThemeId",
    });
  });
});

describe("buildNamespaceGroups", () => {
  it("pairs each namespace with its loaded settings", () => {
    const groups = buildNamespaceGroups(["core.presentation", "core.language"], {
      "core.presentation": [toSummary({ namespace: "core.presentation", row: row() })],
    });
    expect(groups).toEqual([
      { namespace: "core.presentation", settings: [toSummary({ namespace: "core.presentation", row: row() })] },
      { namespace: "core.language", settings: [] },
    ]);
  });

  it("renders a namespace with no rows loaded yet as an empty group, not omitted", () => {
    const groups = buildNamespaceGroups(["core.language"], {});
    expect(groups).toEqual([{ namespace: "core.language", settings: [] }]);
  });
});

describe("buildDetail", () => {
  it("user-sourced effective value, falling through to a default: user set, workspace known-absent, default shown", () => {
    const detail = buildDetail({
      withUser: row({ value: "user-value", sourceLayer: "user", defVersion: 2 }),
      withoutUser: row({ value: "default-value", sourceLayer: "default", defVersion: 2 }),
    });
    expect(detail).toEqual({
      effective: "user-value",
      global: null,
      workspace: null,
      user: "user-value",
      default: "default-value",
      defVersion: 2,
      knownAbsent: ["workspace"],
      masked: [],
    });
  });

  it("workspace-sourced effective value (no user override): workspace set, global+default masked", () => {
    const detail = buildDetail({
      withUser: row({ value: "ws-value", sourceLayer: "workspace" }),
      withoutUser: row({ value: "ws-value", sourceLayer: "workspace" }),
    });
    expect(detail.workspace).toBe("ws-value");
    expect(detail.knownAbsent).toEqual(["user"]);
    expect(detail.masked).toEqual(["global", "default"]);
  });

  it("global-sourced effective value: global set, workspace known-absent, default masked", () => {
    const detail = buildDetail({
      withUser: row({ value: "global-value", sourceLayer: "global" }),
      withoutUser: row({ value: "global-value", sourceLayer: "global" }),
    });
    expect(detail.global).toBe("global-value");
    expect(detail.knownAbsent).toEqual(["user", "workspace"]);
    expect(detail.masked).toEqual(["default"]);
  });

  it("default-sourced effective value: only default set, nothing masked", () => {
    const detail = buildDetail({
      withUser: row({ value: "fallback", sourceLayer: "default" }),
      withoutUser: row({ value: "fallback", sourceLayer: "default" }),
    });
    expect(detail.default).toBe("fallback");
    expect(detail.global).toBeNull();
    expect(detail.workspace).toBeNull();
    expect(detail.knownAbsent).toEqual(["user", "workspace"]);
    expect(detail.masked).toEqual([]);
  });
});

describe("resolveSelectedDetail", () => {
  const rawByNamespace = {
    "core.presentation": {
      withUser: [row({ key: "activeThemeId", sourceLayer: "user", value: "signal" })],
      withoutUser: [row({ key: "activeThemeId", sourceLayer: "default", value: "column" })],
    },
  };

  it("returns null when nothing is selected", () => {
    expect(resolveSelectedDetail({ sel: null, rawByNamespace })).toBeNull();
  });

  it("returns null when the namespace hasn't loaded yet", () => {
    expect(
      resolveSelectedDetail({ sel: { namespace: "core.unloaded", key: "x" }, rawByNamespace }),
    ).toBeNull();
  });

  it("returns null when the key isn't in either read (mid-switch race)", () => {
    expect(
      resolveSelectedDetail({ sel: { namespace: "core.presentation", key: "missingKey" }, rawByNamespace }),
    ).toBeNull();
  });

  it("builds the detail once both rows are present", () => {
    const detail = resolveSelectedDetail({
      sel: { namespace: "core.presentation", key: "activeThemeId" },
      rawByNamespace,
    });
    expect(detail?.effective).toBe("signal");
    expect(detail?.user).toBe("signal");
  });
});

describe("layerStates", () => {
  it("marks a masked layer as hidden even when it would otherwise be not-set", () => {
    const detail = buildDetail({
      withUser: row({ sourceLayer: "workspace" }),
      withoutUser: row({ sourceLayer: "workspace" }),
    });
    expect(layerStates(detail)).toEqual({
      user: "not-set",
      workspace: "set",
      global: "hidden",
      default: "hidden",
    });
  });

  it("marks an unmasked, absent layer as not-set; a layer never pushed to knownAbsent/masked reads as set", () => {
    const detail = buildDetail({
      withUser: row({ sourceLayer: "user" }),
      withoutUser: row({ sourceLayer: "default" }),
    });
    // `global` is never explicitly recorded absent for this branch (see rules.ts's own comment on
    // why) — it reads as "set" here, matching the function's documented behavior, not a claim that
    // a global value literally exists.
    expect(layerStates(detail)).toEqual({
      user: "set",
      workspace: "not-set",
      global: "set",
      default: "set",
    });
  });
});

describe("computeEditableScopes", () => {
  it("includes every scope the caller can write when writing their own user layer", () => {
    expect(
      computeEditableScopes({
        canWriteScopes: { global: true, workspace: true, userSelf: true, userOther: false },
        hasTargetPrincipal: false,
      }),
    ).toEqual(["global", "workspace", "user"]);
  });

  it("follows userOther instead of userSelf once a target principal is set", () => {
    expect(
      computeEditableScopes({
        canWriteScopes: { global: false, workspace: false, userSelf: true, userOther: false },
        hasTargetPrincipal: true,
      }),
    ).toEqual([]);
  });

  it("omits scopes the caller cannot write", () => {
    expect(
      computeEditableScopes({
        canWriteScopes: { global: false, workspace: false, userSelf: false, userOther: false },
        hasTargetPrincipal: false,
      }),
    ).toEqual([]);
  });
});

describe("formatValue", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    ["already a string", "already a string"],
    [42, "42"],
    [true, "true"],
    [{ a: 1 }, '{"a":1}'],
    [[1, 2], "[1,2]"],
  ])("formats %j as %j", (value, expected) => {
    expect(formatValue(value)).toBe(expected);
  });
});

describe("parseJsonInput", () => {
  it("rejects a blank/whitespace-only input with a dedicated message", () => {
    expect(parseJsonInput("   ")).toEqual({
      ok: false,
      error: 'Enter a JSON value (e.g. "text", 42, true, null).',
    });
  });

  it("parses valid JSON", () => {
    expect(parseJsonInput('"hello"')).toEqual({ ok: true, value: "hello" });
    expect(parseJsonInput("42")).toEqual({ ok: true, value: 42 });
    expect(parseJsonInput("true")).toEqual({ ok: true, value: true });
    expect(parseJsonInput("null")).toEqual({ ok: true, value: null });
    expect(parseJsonInput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects malformed JSON with a dedicated message", () => {
    expect(parseJsonInput("{not json")).toEqual({
      ok: false,
      error: 'Not valid JSON — try "text", 42, true, false, or null.',
    });
  });
});

describe("describeApiError", () => {
  it.each([
    ["FORBIDDEN", "You do not have permission to do that."],
    ["PRINCIPAL_NOT_FOUND", "That principal was not found in this workspace."],
    ["SCOPE_NOT_ALLOWED", "This setting cannot be edited at that scope."],
    ["DEFINITION_TOMBSTONED", "This setting has been retired."],
    ["DEFINITION_NOT_FOUND", "This setting definition no longer exists."],
  ])("overrides code %s with a fixed message", (code, expected) => {
    expect(describeApiError(new ApiError("raw", 400, code), "fallback")).toBe(expected);
  });

  it("VALUE_VALIDATION_FAILED prefers the server's own message, falling back when blank", () => {
    expect(describeApiError(new ApiError("must be a number", 409, "VALUE_VALIDATION_FAILED"), "fallback")).toBe(
      "must be a number",
    );
    expect(describeApiError(new ApiError("", 409, "VALUE_VALIDATION_FAILED"), "fallback")).toBe(
      "That value did not validate.",
    );
  });

  it("an unrecognized code falls through to the shared default (message or fallback)", () => {
    expect(describeApiError(new ApiError("some other failure", 500, "SOMETHING_ELSE"), "fallback")).toBe(
      "some other failure",
    );
    expect(describeApiError(new ApiError("", 500, "SOMETHING_ELSE"), "fallback")).toBe("fallback");
  });

  /**
   * Regression guard for the if-chain-to-lookup-table conversion. The chain this table replaced
   * compared `e.code === "FORBIDDEN"` and friends, and comparing an absent code to a string is
   * simply false, so a code-less `ApiError` fell through to the shared default. A lookup table
   * *indexes* instead, and `ApiError.code` is declared `code?: string` — which both broke the
   * build (TS2538) and, once guarded, moved the no-code case onto a branch nothing asserted.
   */
  it("an ApiError carrying no code at all falls through to the shared default", () => {
    expect(describeApiError(new ApiError("server exploded", 500), "fallback")).toBe("server exploded");
    expect(describeApiError(new ApiError("", 500), "fallback")).toBe("fallback");
  });

  it("a non-ApiError value falls through to the shared default", () => {
    expect(describeApiError(new Error("plain error"), "fallback")).toBe("plain error");
    expect(describeApiError("not an error at all", "fallback")).toBe("fallback");
  });
});
