import { describe, expect, it, vi } from "vitest";

/**
 * @file The shared read/diff-write machinery every settings-dialog tab adapter
 * (`settings-tabs.ts`) builds on. Three behaviors this file exists to pin,
 * per this module's own header:
 *
 * 1. Cold-start 404 tolerance: a namespace 404 yields an EMPTY map, never an
 *    error — but every OTHER failure (wrong status, non-`ApiError`, network)
 *    still propagates. Laundering a real failure into "no settings" would
 *    silently show defaults and then overwrite real saved values on the next
 *    keystroke.
 * 2. Field-level diffing + write ORDER: only changed keys are written, in
 *    order, sequentially (not in parallel) — `setSetting` opens the settings
 *    write chokepoint's transaction, and concurrent openers throw.
 * 3. Typed reads with per-field fallback, including `readNumber`'s deliberate
 *    rejection of `NaN`/`Infinity` (both survive a `typeof value === "number"`
 *    check but must not reach a caller as a real value).
 */

const { setSetting, getSettingsEffective, FakeApiError } = vi.hoisted(() => {
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
    FakeApiError,
  };
});

vi.mock("../api", () => ({
  api: { getSettingsEffective, setSetting },
  ApiError: FakeApiError,
}));

import { loadNamespaceValues, readBoolean, readNumber, readString, saveChangedEntries, type LedgerCandidate } from "../ledger-slice";

describe("loadNamespaceValues", () => {
  it("returns an empty Map on a cold-start 404, not an error", async () => {
    getSettingsEffective.mockRejectedValue(new FakeApiError("not found", 404));
    const values = await loadNamespaceValues("core.privacy");
    expect(values).toBeInstanceOf(Map);
    expect(values.size).toBe(0);
  });

  it("re-throws a non-404 ApiError rather than defaulting", async () => {
    getSettingsEffective.mockRejectedValue(new FakeApiError("server exploded", 500));
    await expect(loadNamespaceValues("core.privacy")).rejects.toThrow("server exploded");
  });

  it("re-throws an error that is not an ApiError at all (e.g. a network failure)", async () => {
    getSettingsEffective.mockRejectedValue(new TypeError("fetch failed"));
    await expect(loadNamespaceValues("core.privacy")).rejects.toThrow("fetch failed");
  });

  it("builds the map keyed by row.key with row.value, preserving multiple entries", async () => {
    getSettingsEffective.mockResolvedValue({
      data: [
        { key: "soundEnabled", value: true, sourceLayer: "user", defVersion: 1 },
        { key: "successSoundId", value: "chime", sourceLayer: "user", defVersion: 1 },
        { key: "decisionAt", value: 0, sourceLayer: "workspace", defVersion: 1 },
      ],
    });
    const values = await loadNamespaceValues("core.notifications");
    expect(values.size).toBe(3);
    expect(values.get("soundEnabled")).toBe(true);
    expect(values.get("successSoundId")).toBe("chime");
    expect(values.get("decisionAt")).toBe(0);
  });

  it("passes the namespace through to api.getSettingsEffective", async () => {
    getSettingsEffective.mockResolvedValue({ data: [] });
    await loadNamespaceValues("core.instructions");
    expect(getSettingsEffective).toHaveBeenCalledWith({ namespace: "core.instructions" });
  });
});

describe("saveChangedEntries", () => {
  it("writes nothing and returns [] when no candidate changed", async () => {
    const candidates: LedgerCandidate[] = [
      { key: "a", valueJson: 1, changed: false },
      { key: "b", valueJson: 2, changed: false },
    ];
    const written = await saveChangedEntries("core.privacy", "workspace", candidates);
    expect(setSetting).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it("writes only the changed subset and returns exactly those keys", async () => {
    const candidates: LedgerCandidate[] = [
      { key: "a", valueJson: 1, changed: false },
      { key: "b", valueJson: 2, changed: true },
      { key: "c", valueJson: 3, changed: true },
    ];
    const written = await saveChangedEntries("core.privacy", "workspace", candidates);
    expect(setSetting).toHaveBeenCalledTimes(2);
    expect(written).toEqual(["b", "c"]);
  });

  it("passes namespace, scope, key, and valueJson through to api.setSetting for each write", async () => {
    const candidates: LedgerCandidate[] = [{ key: "installationId", valueJson: "abc-123", changed: true }];
    await saveChangedEntries("core.privacy", "user", candidates);
    expect(setSetting).toHaveBeenCalledWith({
      namespace: "core.privacy",
      key: "installationId",
      scope: "user",
      valueJson: "abc-123",
    });
  });

  it("writes changed entries in array order", async () => {
    const order: string[] = [];
    setSetting.mockImplementation(async (input: { key: string }) => {
      order.push(input.key);
      return { key: input.key, scope: "workspace" as const, value: null, revisionSeq: 1 };
    });
    const candidates: LedgerCandidate[] = [
      { key: "first", valueJson: 1, changed: true },
      { key: "second", valueJson: 2, changed: true },
      { key: "third", valueJson: 3, changed: true },
    ];
    await saveChangedEntries("core.privacy", "workspace", candidates);
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("writes sequentially, not in parallel — the second write does not start until the first resolves", async () => {
    const started: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    setSetting.mockImplementation(async (input: { key: string }) => {
      started.push(input.key);
      if (input.key === "a") await gate;
      return { key: input.key, scope: "workspace" as const, value: null, revisionSeq: 1 };
    });
    const candidates: LedgerCandidate[] = [
      { key: "a", valueJson: 1, changed: true },
      { key: "b", valueJson: 2, changed: true },
    ];
    const promise = saveChangedEntries("core.privacy", "workspace", candidates);

    // Give the microtask queue every chance to start "b" early if the
    // implementation were parallel (e.g. Promise.all) — it must not have.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(["a"]);

    releaseFirst?.();
    await promise;
    expect(started).toEqual(["a", "b"]);
  });
});

describe("readString", () => {
  it("returns the value when present and a string", () => {
    expect(readString(new Map([["k", "hello"]]), "k", "fallback")).toBe("hello");
  });

  it("returns the fallback when the key is absent", () => {
    expect(readString(new Map(), "k", "fallback")).toBe("fallback");
  });

  it("returns the fallback when the stored value is a different type", () => {
    expect(readString(new Map([["k", 42]]), "k", "fallback")).toBe("fallback");
  });

  it("returns an empty string verbatim rather than treating it as absent", () => {
    expect(readString(new Map([["k", ""]]), "k", "fallback")).toBe("");
  });
});

describe("readBoolean", () => {
  it("returns the value when present and a boolean, including false", () => {
    expect(readBoolean(new Map([["k", true]]), "k", false)).toBe(true);
    expect(readBoolean(new Map([["k", false]]), "k", true)).toBe(false);
  });

  it("returns the fallback when the key is absent", () => {
    expect(readBoolean(new Map(), "k", true)).toBe(true);
  });

  it("returns the fallback when the stored value is a different type (e.g. the string \"true\")", () => {
    expect(readBoolean(new Map([["k", "true"]]), "k", false)).toBe(false);
  });
});

describe("readNumber", () => {
  it("returns the value when present and a finite number, including 0", () => {
    expect(readNumber(new Map([["k", 1_700_000_000_000]]), "k", -1)).toBe(1_700_000_000_000);
    expect(readNumber(new Map([["k", 0]]), "k", -1)).toBe(0);
    expect(readNumber(new Map([["k", -5]]), "k", 0)).toBe(-5);
  });

  it("returns the fallback when the key is absent", () => {
    expect(readNumber(new Map(), "k", 7)).toBe(7);
  });

  it("returns the fallback when the stored value is a different type", () => {
    expect(readNumber(new Map([["k", "42"]]), "k", 7)).toBe(7);
  });

  it("rejects NaN despite typeof === \"number\", falling back instead", () => {
    expect(readNumber(new Map([["k", NaN]]), "k", 7)).toBe(7);
  });

  it("rejects +Infinity and -Infinity, falling back instead", () => {
    expect(readNumber(new Map([["k", Infinity]]), "k", 7)).toBe(7);
    expect(readNumber(new Map([["k", -Infinity]]), "k", 7)).toBe(7);
  });
});
